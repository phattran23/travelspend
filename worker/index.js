// TravelSpend — Cloudflare Worker backend (D1 database + R2 receipts + static assets).
// Same REST API as server.js, so the front end in public/ works unchanged.

const SESSION_DAYS = 30;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_RECEIPT = 5 * 1024 * 1024;
const PBKDF2_ITER = 100000; // Workers' maximum
const CATEGORIES = ['lodging', 'food', 'transport', 'flights', 'activities', 'shopping', 'health', 'other'];
const RECEIPT_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/* ---------- validation ---------- */
const str = (v, { max = 200, min = 0, field = 'value' } = {}) => {
  if (typeof v !== 'string') throw bad(`${field} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${field} must be ${min}-${max} characters`);
  return s;
};
const money = (v, field, { allowZero = false } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > 1e12) {
    throw bad(`${field} must be a whole number of VND${allowZero ? '' : ' greater than 0'}`);
  }
  return n;
};
const isoDate = (v, field, optional = false) => {
  if ((v === '' || v == null) && optional) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${field} must be a valid date`);
  return v;
};

/* ---------- passwords & sessions ---------- */
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${toHex(await derive(password, salt, PBKDF2_ITER))}`;
}
async function verifyPassword(password, stored) {
  const [alg, iter, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'pbkdf2' || !iter || !saltHex || !hashHex) { await derive(password, new Uint8Array(16), PBKDF2_ITER); return false; }
  const got = await derive(password, fromHex(saltHex), Number(iter));
  const want = fromHex(hashHex);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0;
}
function cookiesOf(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
async function startSession(c, userId) {
  const token = randomHex(32);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 864e5).run();
  c.cookies.push(`ts_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}
async function currentUser(c) {
  const token = cookiesOf(c.req).ts_session;
  if (!token) return null;
  return (await c.env.DB.prepare(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), Date.now()).first()) || null;
}
async function requireUser(c) {
  const u = await currentUser(c);
  if (!u) throw new HttpError(401, 'Please sign in');
  return u;
}

/* rate limiting backed by D1 (isolates don't share memory) */
async function throttleCheck(env, key, limit) {
  const row = await env.DB.prepare('SELECT count, reset FROM attempts WHERE key = ?').bind(key).first();
  if (row && row.reset > Date.now() && row.count >= limit) throw new HttpError(429, 'Too many attempts. Please try again later.');
}
async function throttleHit(env, key, windowMs) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO attempts (key, count, reset) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset < ? THEN 1 ELSE count + 1 END,
      reset = CASE WHEN reset < ? THEN ? ELSE reset END`).bind(key, now + windowMs, now, now, now + windowMs).run();
}

/* ---------- domain ---------- */
async function getTrip(c, id) {
  const u = await requireUser(c);
  const t = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').bind(Number(id), u.id).first();
  if (!t) throw new HttpError(404, 'Trip not found');
  return t;
}
async function getExpense(c, id) {
  const u = await requireUser(c);
  const e = await c.env.DB.prepare(`SELECT e.* FROM expenses e JOIN trips t ON t.id = e.trip_id
    WHERE e.id = ? AND t.user_id = ?`).bind(Number(id), u.id).first();
  if (!e) throw new HttpError(404, 'Expense not found');
  return e;
}
async function tripDetail(env, trip) {
  const [tr, sp, ex] = await env.DB.batch([
    env.DB.prepare('SELECT id, name FROM travelers WHERE trip_id = ? ORDER BY id').bind(trip.id),
    env.DB.prepare(`SELECT s.expense_id, s.traveler_id FROM expense_splits s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?`).bind(trip.id),
    env.DB.prepare(`SELECT id, title, amount, category, date, notes, paid_by, receipt_name, receipt_type,
      receipt_file IS NOT NULL AS has_receipt FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC`).bind(trip.id),
  ]);
  const by = new Map();
  for (const s of sp.results) { if (!by.has(s.expense_id)) by.set(s.expense_id, []); by.get(s.expense_id).push(s.traveler_id); }
  let cat = {};
  try { cat = JSON.parse(trip.cat_budgets || '{}'); } catch { /* ignore corrupt value */ }
  return {
    trip: { ...trip, user_id: undefined, cat_budgets: cat },
    travelers: tr.results,
    expenses: ex.results.map((e) => ({ ...e, has_receipt: !!e.has_receipt, split_among: by.get(e.id) || [] })),
  };
}
const detailById = async (c, id) => tripDetail(c.env, await getTrip(c, id));

async function saveReceipt(env, r) {
  if (!r || typeof r !== 'object') throw bad('Invalid receipt');
  const ext = RECEIPT_TYPES[r.type];
  if (!ext) throw bad('Receipt must be an image (JPG, PNG, WebP, GIF) or PDF');
  if (typeof r.data !== 'string' || r.data.length * 0.75 > MAX_RECEIPT) throw bad('Receipt must be smaller than 5 MB');
  let bytes;
  try { bytes = Uint8Array.from(atob(r.data), (ch) => ch.charCodeAt(0)); } catch { throw bad('Invalid receipt data'); }
  if (!bytes.length || bytes.length > MAX_RECEIPT) throw bad('Receipt must be smaller than 5 MB');
  const file = crypto.randomUUID() + ext;
  await env.RECEIPTS.put(file, bytes, { httpMetadata: { contentType: r.type } });
  return { file, name: str(String(r.name || 'receipt'), { max: 120, min: 1, field: 'receipt name' }), type: r.type };
}
const removeReceipt = (env, file) => (file ? env.RECEIPTS.delete(file).catch(() => {}) : undefined);

async function expenseFields(env, body, tripId) {
  const { results } = await env.DB.prepare('SELECT id FROM travelers WHERE trip_id = ?').bind(tripId).all();
  const ids = new Set(results.map((r) => r.id));
  const paidBy = Number(body.paid_by);
  if (!ids.has(paidBy)) throw bad('Choose who paid');
  const split = Array.isArray(body.split_among) ? [...new Set(body.split_among.map(Number))] : [];
  if (!split.length || !split.every((i) => ids.has(i))) throw bad('Choose who shares this expense');
  const category = String(body.category);
  if (!CATEGORIES.includes(category)) throw bad('Invalid category');
  return {
    title: str(body.title ?? '', { max: 120, field: 'title' }), amount: money(body.amount, 'Amount'), category,
    date: isoDate(body.date, 'Date'), notes: str(body.notes ?? '', { max: 1000, field: 'notes' }), paidBy, split,
  };
}
const splitStmts = (env, expenseId, split) => split.map((t) =>
  env.DB.prepare('INSERT INTO expense_splits (expense_id, traveler_id) VALUES (?,?)').bind(expenseId, t));

function catBudgets(input) {
  const out = {};
  if (input && typeof input === 'object') for (const k of CATEGORIES) if (Number(input[k]) > 0) out[k] = money(input[k], `${k} budget`);
  return out;
}
function tripFields(body) {
  const start = isoDate(body.start_date, 'Start date', true);
  const end = isoDate(body.end_date, 'End date', true);
  if (start && end && end < start) throw bad('End date must be after the start date');
  return {
    name: str(body.name, { min: 1, max: 100, field: 'Trip name' }),
    destination: str(body.destination ?? '', { max: 100, field: 'Destination' }),
    budget: money(body.budget, 'Budget', { allowZero: true }), start, end, catBudgets: JSON.stringify(catBudgets(body.cat_budgets)),
  };
}

async function seedDemo(env, user) {
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() - 10 + o); return d.toISOString().slice(0, 10); };
  const cb = JSON.stringify({ flights: 7000000, lodging: 5000000, food: 3500000, activities: 3500000, transport: 1000000, shopping: 1000000 });
  const t = await env.DB.prepare('INSERT INTO trips (user_id,name,destination,budget,start_date,end_date,cat_budgets) VALUES (?,?,?,?,?,?,?)')
    .bind(user.id, 'Đà Nẵng & Hội An', 'Đà Nẵng, Việt Nam', 20000000, day(0), day(5), cb).run();
  const tid = t.meta.last_row_id;
  const names = [user.name.split(' ')[0] || 'Me', 'Linh', 'Minh', 'Hà'];
  const ids = [];
  for (const n of names) ids.push((await env.DB.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').bind(tid, n).run()).meta.last_row_id);
  const rows = [
    ['Round-trip flights', 6400000, 'flights', 0, 0], ['Beachfront hotel (3 nights)', 4800000, 'lodging', 0, 1],
    ['Airport taxi', 350000, 'transport', 0, 2], ['Mì Quảng lunch', 280000, 'food', 1, 3],
    ['Seafood dinner at Mỹ Khê', 1250000, 'food', 1, 1], ['Bà Nà Hills tickets', 3000000, 'activities', 2, 2],
    ['Hội An lantern boat', 400000, 'activities', 3, 3], ['Lanterns & souvenirs', 920000, 'shopping', 3, 0],
    ['Grab rides', 480000, 'transport', 4, 1], ['Cà phê muối & bánh mì', 190000, 'food', 4, 2],
    ['Pharmacy', 150000, 'health', 4, 3], ['Farewell dinner', 1450000, 'food', 5, 0],
  ];
  for (const [title, amount, category, off, payer] of rows) {
    const e = await env.DB.prepare('INSERT INTO expenses (trip_id,title,amount,category,date,paid_by) VALUES (?,?,?,?,?,?)')
      .bind(tid, title, amount, category, day(off), ids[payer]).run();
    await env.DB.batch(splitStmts(env, e.meta.last_row_id, ids));
  }
  return tid;
}

/* ---------- routes ---------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('POST', '/api/auth/register', async (c) => {
  const ip = c.req.headers.get('cf-connecting-ip') || 'x';
  const key = `reg:${ip}`;
  await throttleCheck(c.env, key, 10);
  const name = str(c.body.name, { min: 1, max: 80, field: 'Name' });
  const email = str(c.body.email, { min: 3, max: 254, field: 'Email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address');
  const password = str(c.body.password, { min: 8, max: 200, field: 'Password' });
  await throttleHit(c.env, key, 3600e3);
  if (await c.env.DB.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'An account with this email already exists');
  const r = await c.env.DB.prepare('INSERT INTO users (name,email,pass_hash) VALUES (?,?,?)').bind(name, email, await hashPassword(password)).run();
  const id = r.meta.last_row_id;
  await startSession(c, id);
  return { user: { id, name, email } };
});
route('POST', '/api/auth/login', async (c) => {
  const email = String(c.body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(c.body.password || '').slice(0, 200);
  const key = `login:${c.req.headers.get('cf-connecting-ip') || 'x'}:${email}`;
  await throttleCheck(c.env, key, 10);
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const ok = await verifyPassword(password, u ? u.pass_hash : 'none');
  if (!u || !ok) { await throttleHit(c.env, key, 15 * 60e3); throw new HttpError(401, 'Incorrect email or password'); }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(key),
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
  ]);
  await startSession(c, u.id);
  return { user: { id: u.id, name: u.name, email: u.email } };
});
route('POST', '/api/auth/logout', async (c) => {
  const token = cookiesOf(c.req).ts_session;
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  c.cookies.push('ts_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return { ok: true };
});
route('GET', '/api/auth/me', async (c) => ({ user: await currentUser(c) }));

route('GET', '/api/trips', async (c) => {
  const u = await requireUser(c);
  const { results } = await c.env.DB.prepare(`SELECT t.id, t.name, t.destination, t.budget, t.start_date, t.end_date,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE trip_id = t.id), 0) AS spent,
      (SELECT COUNT(*) FROM expenses WHERE trip_id = t.id) AS expense_count,
      (SELECT COUNT(*) FROM travelers WHERE trip_id = t.id) AS traveler_count
    FROM trips t WHERE t.user_id = ? ORDER BY COALESCE(t.start_date, t.created_at) DESC, t.id DESC`).bind(u.id).all();
  return { trips: results };
});
route('POST', '/api/trips', async (c) => {
  const u = await requireUser(c);
  const f = tripFields(c.body);
  const names = (Array.isArray(c.body.travelers) ? c.body.travelers : []).map((n) => str(String(n), { min: 1, max: 60, field: 'Traveler name' }));
  if (names.length > 30) throw bad('Up to 30 travelers per trip');
  if (!names.length) names.push(u.name);
  const r = await c.env.DB.prepare('INSERT INTO trips (user_id,name,destination,budget,start_date,end_date,cat_budgets) VALUES (?,?,?,?,?,?,?)')
    .bind(u.id, f.name, f.destination, f.budget, f.start, f.end, f.catBudgets).run();
  const tid = r.meta.last_row_id;
  await c.env.DB.batch(names.map((n) => c.env.DB.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').bind(tid, n)));
  return detailById(c, tid);
});
route('POST', '/api/demo', async (c) => {
  const u = await requireUser(c);
  return detailById(c, await seedDemo(c.env, u));
});
route('GET', '/api/trips/(\\d+)', (c) => detailById(c, c.params[0]));
route('PUT', '/api/trips/(\\d+)', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const f = tripFields(c.body);
  await c.env.DB.prepare('UPDATE trips SET name=?, destination=?, budget=?, start_date=?, end_date=?, cat_budgets=? WHERE id=?')
    .bind(f.name, f.destination, f.budget, f.start, f.end, f.catBudgets, t.id).run();
  return detailById(c, t.id);
});
route('DELETE', '/api/trips/(\\d+)', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const { results } = await c.env.DB.prepare('SELECT receipt_file FROM expenses WHERE trip_id = ? AND receipt_file IS NOT NULL').bind(t.id).all();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = ?)').bind(t.id),
    c.env.DB.prepare('DELETE FROM expenses WHERE trip_id = ?').bind(t.id),
    c.env.DB.prepare('DELETE FROM travelers WHERE trip_id = ?').bind(t.id),
    c.env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(t.id),
  ]);
  await Promise.all(results.map((r) => removeReceipt(c.env, r.receipt_file)));
  return { ok: true };
});

route('POST', '/api/trips/(\\d+)/travelers', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const name = str(c.body.name, { min: 1, max: 60, field: 'Name' });
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ?').bind(t.id).first();
  if (n.n >= 30) throw bad('Up to 30 travelers per trip');
  const r = await c.env.DB.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').bind(t.id, name).run();
  return { traveler: { id: r.meta.last_row_id, name } };
});
route('PUT', '/api/trips/(\\d+)/travelers/(\\d+)', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const name = str(c.body.name, { min: 1, max: 60, field: 'Name' });
  const r = await c.env.DB.prepare('UPDATE travelers SET name = ? WHERE id = ? AND trip_id = ?').bind(name, Number(c.params[1]), t.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Traveler not found');
  return { ok: true };
});
route('DELETE', '/api/trips/(\\d+)/travelers/(\\d+)', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const tid = Number(c.params[1]);
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ?').bind(t.id).first();
  if (n.n <= 1) throw bad('A trip needs at least one traveler');
  if (await c.env.DB.prepare('SELECT 1 AS x FROM expenses WHERE trip_id = ? AND paid_by = ?').bind(t.id, tid).first()) {
    throw new HttpError(409, 'This traveler paid for expenses. Reassign or delete those expenses first.');
  }
  const orphans = await c.env.DB.prepare(`SELECT s.expense_id FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
    WHERE e.trip_id = ? GROUP BY s.expense_id HAVING COUNT(*) = 1 AND MAX(s.traveler_id = ?) = 1`).bind(t.id, tid).all();
  if (orphans.results.length) throw new HttpError(409, 'Some expenses are shared only by this traveler. Edit those expenses first.');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM expense_splits WHERE traveler_id = ?').bind(tid),
    c.env.DB.prepare('DELETE FROM travelers WHERE id = ? AND trip_id = ?').bind(tid, t.id),
  ]);
  return { ok: true };
});

async function expenseOut(c, id) {
  const e = await c.env.DB.prepare('SELECT trip_id FROM expenses WHERE id = ?').bind(id).first();
  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(e.trip_id).first();
  return (await tripDetail(c.env, trip)).expenses.find((x) => x.id === id);
}
route('POST', '/api/trips/(\\d+)/expenses', async (c) => {
  const t = await getTrip(c, c.params[0]);
  const f = await expenseFields(c.env, c.body, t.id);
  const rec = c.body.receipt ? await saveReceipt(c.env, c.body.receipt) : null;
  let id;
  try {
    const r = await c.env.DB.prepare(`INSERT INTO expenses (trip_id,title,amount,category,date,notes,paid_by,receipt_file,receipt_name,receipt_type)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(t.id, f.title, f.amount, f.category, f.date, f.notes, f.paidBy, rec?.file ?? null, rec?.name ?? null, rec?.type ?? null).run();
    id = r.meta.last_row_id;
    await c.env.DB.batch(splitStmts(c.env, id, f.split));
  } catch (e) {
    if (id) await c.env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run().catch(() => {});
    await removeReceipt(c.env, rec?.file);
    throw e;
  }
  return { expense: await expenseOut(c, id) };
});
route('PUT', '/api/expenses/(\\d+)', async (c) => {
  const old = await getExpense(c, c.params[0]);
  const f = await expenseFields(c.env, c.body, old.trip_id);
  const rec = c.body.receipt ? await saveReceipt(c.env, c.body.receipt) : null;
  const replace = c.body.receipt !== undefined; // object replaces, null removes, undefined keeps
  const file = replace ? rec?.file ?? null : old.receipt_file;
  const name = replace ? rec?.name ?? null : old.receipt_name;
  const type = replace ? rec?.type ?? null : old.receipt_type;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE expenses SET title=?, amount=?, category=?, date=?, notes=?, paid_by=?,
        receipt_file=?, receipt_name=?, receipt_type=? WHERE id=?`).bind(f.title, f.amount, f.category, f.date, f.notes, f.paidBy, file, name, type, old.id),
      c.env.DB.prepare('DELETE FROM expense_splits WHERE expense_id = ?').bind(old.id),
      ...splitStmts(c.env, old.id, f.split),
    ]);
  } catch (e) { await removeReceipt(c.env, rec?.file); throw e; }
  if (replace) await removeReceipt(c.env, old.receipt_file);
  return { expense: await expenseOut(c, old.id) };
});
route('DELETE', '/api/expenses/(\\d+)', async (c) => {
  const e = await getExpense(c, c.params[0]);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM expense_splits WHERE expense_id = ?').bind(e.id),
    c.env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(e.id),
  ]);
  await removeReceipt(c.env, e.receipt_file);
  return { ok: true };
});
route('GET', '/api/expenses/(\\d+)/receipt', async (c) => {
  const e = await getExpense(c, c.params[0]);
  if (!e.receipt_file) throw new HttpError(404, 'No receipt');
  const obj = await c.env.RECEIPTS.get(e.receipt_file);
  if (!obj) throw new HttpError(404, 'Receipt file missing');
  return new Response(obj.body, {
    headers: {
      'Content-Type': e.receipt_type, 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(e.receipt_name || 'receipt')}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

/* ---------- entry ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const c = { req, env, url, cookies: [], params: [], body: {} };
    try {
      if (req.method !== 'GET') {
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-origin request blocked');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        c.params = m.slice(1);
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          if (!/^application\/json/i.test(req.headers.get('content-type') || '')) throw new HttpError(415, 'Expected JSON');
          if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw new HttpError(413, 'Request too large');
          try { c.body = JSON.parse((await req.text()) || '{}'); } catch { throw bad('Invalid JSON'); }
        }
        const out = await r.handler(c);
        if (out instanceof Response) return out;
        const res = new Response(JSON.stringify(out), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
        c.cookies.forEach((ck) => res.headers.append('Set-Cookie', ck));
        return res;
      }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      const status = e instanceof HttpError ? e.status : 500;
      return new Response(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Something went wrong' }), {
        status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  },
};
