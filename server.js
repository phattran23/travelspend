// Local Node server for Travel Wallet.
// It runs the exact same API as Cloudflare (worker/index.js) on top of SQLite files, so there is one backend to maintain.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const RECEIPT_DIR = path.join(DATA_DIR, 'receipts');
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

/* ---- database ---- */
const sqlite = new DatabaseSync(path.join(DATA_DIR, 'travelspend.db'));
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'worker', 'schema.sql'), 'utf8'));
try { sqlite.exec('ALTER TABLE travelers ADD COLUMN is_wallet INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }

// minimal D1-compatible wrapper over node:sqlite
const isRead = (sql) => /^\s*(select|with|pragma)/i.test(sql);
const stmt = (sql, args = []) => ({
  sql,
  bind: (...a) => stmt(sql, a),
  run: async () => {
    const r = sqlite.prepare(sql).run(...args);
    return { results: [], success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
  },
  first: async () => { const r = sqlite.prepare(sql).get(...args); return r ? { ...r } : null; },
  all: async () => ({ results: sqlite.prepare(sql).all(...args).map((r) => ({ ...r })), success: true, meta: {} }),
});
const DB = {
  prepare: (sql) => stmt(sql),
  batch: async (list) => {
    sqlite.exec('BEGIN');
    try {
      const out = [];
      for (const s of list) out.push(isRead(s.sql) ? await s.all() : await s.run());
      sqlite.exec('COMMIT');
      return out;
    } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};

/* ---- receipts (R2 stand-in) ---- */
const rfile = (k) => path.join(RECEIPT_DIR, path.basename(k));
const RECEIPTS = {
  put: async (key, bytes) => fs.writeFileSync(rfile(key), bytes),
  get: async (key) => (fs.existsSync(rfile(key)) ? { body: fs.readFileSync(rfile(key)) } : null),
  delete: async (key) => fs.rmSync(rfile(key), { force: true }),
};

/* ---- static assets ---- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
// reuse the header rules of the "/*" block in public/_headers
const SECURITY = {};
for (const line of fs.readFileSync(path.join(PUBLIC_DIR, '_headers'), 'utf8').split(/\r?\n/).slice(1)) {
  if (!/^\s/.test(line)) break;
  const i = line.indexOf(':');
  SECURITY[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const ASSETS = {
  fetch: async (req) => {
    let rel = decodeURIComponent(new URL(req.url).pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    const ok = file.startsWith(PUBLIC_DIR + path.sep) && !path.basename(file).startsWith('_') && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(file), {
      headers: { ...SECURITY, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' },
    });
  },
};

/* ---- Node http <-> fetch adapter ---- */
const env = { DB, RECEIPTS, ASSETS };
http.createServer(async (req, res) => {
  try {
    const init = { method: req.method, headers: req.headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = Readable.toWeb(req); init.duplex = 'half'; }
    const r = await worker.fetch(new Request(`http://${req.headers.host}${req.url}`, init), env);
    const headers = {};
    r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Something went wrong"}');
  }
}).listen(PORT, () => console.log(`Travel Wallet running at http://localhost:${PORT}`));
