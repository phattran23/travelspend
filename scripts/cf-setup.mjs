// One-command Cloudflare setup: login check → D1 database → R2 bucket → schema → deploy.
// Usage: npm run cf:setup
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DB_NAME = 'travelspend';
const BUCKET = 'travelspend-receipts';
const CONFIG = 'wrangler.jsonc';

function wrangler(args, { inherit = false } = {}) {
  const r = spawnSync('npx', ['wrangler', ...args], { shell: true, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const step = (m) => console.log(`\n▶ ${m}`);
const fail = (m, out) => { console.error(`\n✖ ${m}${out ? `\n${out.trim()}` : ''}`); process.exit(1); };

step('Checking Cloudflare login');
if (wrangler(['whoami']).out.includes('not authenticated') || wrangler(['whoami']).code !== 0) {
  console.log('Opening browser to log in…');
  if (wrangler(['login'], { inherit: true }).code !== 0) fail('Login failed. Run "npx wrangler login" and retry.');
}

step(`Finding or creating D1 database "${DB_NAME}"`);
let id;
const list = wrangler(['d1', 'list', '--json']);
if (list.code === 0) {
  try {
    const arr = JSON.parse(list.out.slice(list.out.indexOf('[')));
    id = arr.find((d) => d.name === DB_NAME)?.uuid;
  } catch { /* fall through to create */ }
}
if (!id) {
  const c = wrangler(['d1', 'create', DB_NAME]);
  id = c.out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) fail('Could not create the D1 database. Is your Cloudflare account verified?', c.out);
}
console.log(`  database_id = ${id}`);

const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
cfg.d1_databases[0].database_id = id;

step(`Creating R2 bucket "${BUCKET}" (for receipt uploads)`);
const b = wrangler(['r2', 'bucket', 'create', BUCKET]);
if (b.code === 0 || /already exists|10004/i.test(b.out)) {
  cfg.r2_buckets = [{ binding: 'RECEIPTS', bucket_name: BUCKET }];
} else {
  delete cfg.r2_buckets;
  console.log('  ! R2 is not enabled on this account, so the app will deploy WITHOUT receipt uploads.');
  console.log('    To add them later: Cloudflare dashboard → R2 → enable (free tier), then run "npm run cf:setup" again.');
}
writeFileSync(CONFIG, `${JSON.stringify(cfg, null, 2)}\n`);

step('Creating database tables');
const s = wrangler(['d1', 'execute', DB_NAME, '--remote', '--yes', '--file=worker/schema.sql']);
if (s.code !== 0) fail('Schema creation failed.', s.out);

step('Deploying');
const d = wrangler(['deploy'], { inherit: true });
if (d.code !== 0) fail('Deploy failed — see the message above.');
console.log('\n✔ Done. Commit the updated wrangler.jsonc (database_id is not a secret) so Git-based deploys work too.');
