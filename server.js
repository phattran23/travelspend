'use strict';
// TravelSpend server — zero npm dependencies (Node 22+: built-in node:sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const RECEIPT_DIR = path.join(DATA_DIR, 'receipts');
const SESSION_DAYS = 30;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_RECEIPT = 5 * 1024 * 1024;
const CATEGORIES = ['lodging', 'food', 'transport', 'flights', 'activities', 'shopping', 'health', 'other'];
const RECEIPT_TYPES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf',
};

fs.mkdirSync(RECEIPT_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'travelspend.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, destination TEXT NOT NULL DEFAULT '', budget INTEGER NOT NULL DEFAULT 0,
  start_date TEXT, end_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS travelers (
  id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL, category TEXT NOT NULL, date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '', paid_by INTEGER NOT NULL REFERENCES travelers(id),
  receipt_file TEXT, receipt_name TEXT, receipt_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  traveler_id INTEGER NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, traveler_id));
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_trip ON expenses(trip_id);
`);
try { db.exec('ALTER TABLE trips ADD COLUMN cat_budgets TEXT'); } catch { /* column already exists */ }

/* ---------- helpers ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};
const str = (v, { max = 200, min = 0, field = 'value' } = {}) => {
  if (typeof v !== 'string') throw bad(`${field} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${field} must be ${min}-${max} characters`);
  return s;
};
const money = (v, field, { allowZero = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > 1e12) {
    throw bad(`${field} must be a whole number of VND${allowZero ? '' : ' greater than 0'}`);
  }
  return n;
};
const isoDate = (v, field, optional = false) => {
  if ((v === '' || v == null) && optional) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${field} must be a valid date`);
  return v;
};

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`));
  });
}
function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt' || !saltHex || !hashHex) return resolve(false);
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      const expected = Buffer.from(hashHex, 'hex');
      resolve(!err && key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

const attempts = new Map(); // key -> {count, reset}
function throttle(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) { a = { count: 0, reset: now + windowMs }; attempts.set(key, a); }
  if (a.count >= limit) throw new HttpError(429, 'Too many attempts. Please try again later.');
  return () => { a.count++; };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}, 10 * 60 * 1000).unref();

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires);
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie', `ts_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}
function currentUser(req) {
  const token = parseCookies(req).ts_session;
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now()) || null;
}
const requireUser = (req) => { const u = currentUser(req); if (!u) throw new HttpError(401, 'Please sign in'); return u; };

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'Expected JSON'));
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(bad('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

/* ---------- domain ---------- */
const getTrip = (req, id) => {
  const u = requireUser(req);
  const t = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(Number(id), u.id);
  if (!t) throw new HttpError(404, 'Trip not found');
  return t;
};
function tripDetail(trip) {
  const travelers = db.prepare('SELECT id, name FROM travelers WHERE trip_id = ? ORDER BY id').all(trip.id);
  const splits = db.prepare(`SELECT s.expense_id, s.traveler_id FROM expense_splits s
    JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?`).all(trip.id);
  const by = new Map();
  for (const s of splits) { if (!by.has(s.expense_id)) by.set(s.expense_id, []); by.get(s.expense_id).push(s.traveler_id); }
  const expenses = db.prepare(`SELECT id, title, amount, category, date, notes, paid_by, receipt_name, receipt_type,
      receipt_file IS NOT NULL AS has_receipt FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC`).all(trip.id)
    .map((e) => ({ ...e, has_receipt: !!e.has_receipt, split_among: by.get(e.id) || [] }));
  let catBudgets = {};
  try { catBudgets = JSON.parse(trip.cat_budgets || '{}'); } catch { /* ignore corrupt value */ }
  return { trip: { ...trip, user_id: undefined, cat_budgets: catBudgets }, travelers, expenses };
}
function saveReceipt(r) {
  if (!r || typeof r !== 'object') throw bad('Invalid receipt');
  const ext = RECEIPT_TYPES[r.type];
  if (!ext) throw bad('Receipt must be an image (JPG, PNG, WebP, GIF) or PDF');
  if (typeof r.data !== 'string') throw bad('Invalid receipt data');
  const buf = Buffer.from(r.data, 'base64');
  if (!buf.length || buf.length > MAX_RECEIPT) throw bad('Receipt must be smaller than 5 MB');
  const file = crypto.randomUUID() + ext;
  fs.writeFileSync(path.join(RECEIPT_DIR, file), buf);
  return { file, name: str(String(r.name || 'receipt'), { max: 120, min: 1, field: 'receipt name' }), type: r.type };
}
const removeReceiptFile = (file) => { if (file) fs.rm(path.join(RECEIPT_DIR, path.basename(file)), { force: true }, () => {}); };

function expenseFields(body, tripId) {
  const travelerIds = new Set(db.prepare('SELECT id FROM travelers WHERE trip_id = ?').all(tripId).map((r) => r.id));
  const paidBy = Number(body.paid_by);
  if (!travelerIds.has(paidBy)) throw bad('Choose who paid');
  const split = Array.isArray(body.split_among) ? [...new Set(body.split_among.map(Number))] : [];
  if (!split.length || !split.every((i) => travelerIds.has(i))) throw bad('Choose who shares this expense');
  const category = String(body.category);
  if (!CATEGORIES.includes(category)) throw bad('Invalid category');
  return {
    title: str(body.title ?? '', { max: 120, field: 'title' }),
    amount: money(body.amount, 'Amount'),
    category, date: isoDate(body.date, 'Date'),
    notes: str(body.notes ?? '', { max: 1000, field: 'notes' }),
    paidBy, split,
  };
}
function setSplits(expenseId, split) {
  db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(expenseId);
  const ins = db.prepare('INSERT INTO expense_splits (expense_id, traveler_id) VALUES (?,?)');
  for (const t of split) ins.run(expenseId, t);
}
function getExpense(req, id) {
  const u = requireUser(req);
  const e = db.prepare(`SELECT e.* FROM expenses e JOIN trips t ON t.id = e.trip_id
    WHERE e.id = ? AND t.user_id = ?`).get(Number(id), u.id);
  if (!e) throw new HttpError(404, 'Expense not found');
  return e;
}
const expenseOut = (id) => tripDetail(db.prepare('SELECT t.* FROM trips t JOIN expenses e ON e.trip_id = t.id WHERE e.id = ?').get(id))
  .expenses.find((e) => e.id === id);

function seedDemo(userId, userName) {
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() - 10 + o); return d.toISOString().slice(0, 10); };
  return tx(() => {
    const t = db.prepare('INSERT INTO trips (user_id,name,destination,budget,start_date,end_date) VALUES (?,?,?,?,?,?)')
      .run(userId, 'Đà Nẵng & Hội An', 'Đà Nẵng, Việt Nam', 20000000, day(0), day(5));
    const tid = Number(t.lastInsertRowid);
    db.prepare('UPDATE trips SET cat_budgets = ? WHERE id = ?').run(JSON.stringify({ flights: 7000000, lodging: 5000000, food: 3500000, activities: 3500000, transport: 1000000, shopping: 1000000 }), tid);
    const ids = [userName.split(' ')[0] || 'Me', 'Linh', 'Minh', 'Hà'].map((n) =>
      Number(db.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').run(tid, n).lastInsertRowid));
    const rows = [
      ['Round-trip flights', 6400000, 'flights', 0, 0], ['Beachfront hotel (3 nights)', 4800000, 'lodging', 0, 1],
      ['Airport taxi', 350000, 'transport', 0, 2], ['Mì Quảng lunch', 280000, 'food', 1, 3],
      ['Seafood dinner at Mỹ Khê', 1250000, 'food', 1, 1], ['Bà Nà Hills tickets', 3000000, 'activities', 2, 2],
      ['Hội An lantern boat', 400000, 'activities', 3, 3], ['Lanterns & souvenirs', 920000, 'shopping', 3, 0],
      ['Grab rides', 480000, 'transport', 4, 1], ['Cà phê muối & bánh mì', 190000, 'food', 4, 2],
      ['Pharmacy', 150000, 'health', 4, 3], ['Farewell dinner', 1450000, 'food', 5, 0],
    ];
    for (const [title, amount, category, off, payer] of rows) {
      const e = db.prepare('INSERT INTO expenses (trip_id,title,amount,category,date,paid_by) VALUES (?,?,?,?,?,?)')
        .run(tid, title, amount, category, day(off), ids[payer]);
      setSplits(Number(e.lastInsertRowid), ids);
    }
    return tid;
  });
}

/* ---------- routes ---------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });
const ctx = (req, body, params) => ({ req, body, params });

route('POST', '/api/auth/register', async (c, res) => {
  const ip = c.req.socket.remoteAddress;
  const hit = throttle(`reg:${ip}`, 10, 60 * 60 * 1000);
  const name = str(c.body.name, { min: 1, max: 80, field: 'Name' });
  const email = str(c.body.email, { min: 3, max: 254, field: 'Email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address');
  const password = str(c.body.password, { min: 8, max: 200, field: 'Password' });
  hit();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists');
  const r = db.prepare('INSERT INTO users (name,email,pass_hash) VALUES (?,?,?)').run(name, email, await hashPassword(password));
  const id = Number(r.lastInsertRowid);
  setSession(c.req, res, id);
  return { user: { id, name, email } };
});
route('POST', '/api/auth/login', async (c, res) => {
  const email = String(c.body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(c.body.password || '').slice(0, 200);
  const key = `login:${c.req.socket.remoteAddress}:${email}`;
  const hit = throttle(key);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Always run scrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, u ? u.pass_hash : 'scrypt$00$00');
  if (!u || !ok) { hit(); throw new HttpError(401, 'Incorrect email or password'); }
  attempts.delete(key);
  setSession(c.req, res, u.id);
  return { user: { id: u.id, name: u.name, email: u.email } };
});
route('POST', '/api/auth/logout', (c, res) => {
  const token = parseCookies(c.req).ts_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.setHeader('Set-Cookie', 'ts_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return { ok: true };
});
route('GET', '/api/auth/me', (c) => ({ user: currentUser(c.req) }));

route('GET', '/api/trips', (c) => {
  const u = requireUser(c.req);
  return { trips: db.prepare(`SELECT t.id, t.name, t.destination, t.budget, t.start_date, t.end_date,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE trip_id = t.id), 0) AS spent,
      (SELECT COUNT(*) FROM expenses WHERE trip_id = t.id) AS expense_count,
      (SELECT COUNT(*) FROM travelers WHERE trip_id = t.id) AS traveler_count
    FROM trips t WHERE t.user_id = ? ORDER BY COALESCE(t.start_date, t.created_at) DESC, t.id DESC`).all(u.id) };
});
function catBudgets(input) {
  const out = {};
  if (input && typeof input === 'object') {
    for (const k of CATEGORIES) { if (Number(input[k]) > 0) out[k] = money(input[k], `${k} budget`); }
  }
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
route('POST', '/api/trips', (c) => {
  const u = requireUser(c.req);
  const f = tripFields(c.body);
  const names = (Array.isArray(c.body.travelers) ? c.body.travelers : []).map((n) => str(String(n), { min: 1, max: 60, field: 'Traveler name' }));
  if (names.length > 30) throw bad('Up to 30 travelers per trip');
  if (!names.length) names.push(u.name);
  const id = tx(() => {
    const r = db.prepare('INSERT INTO trips (user_id,name,destination,budget,start_date,end_date,cat_budgets) VALUES (?,?,?,?,?,?,?)')
      .run(u.id, f.name, f.destination, f.budget, f.start, f.end, f.catBudgets);
    const tid = Number(r.lastInsertRowid);
    for (const n of names) db.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').run(tid, n);
    return tid;
  });
  return tripDetail(getTrip(c.req, id));
});
route('POST', '/api/demo', (c) => {
  const u = requireUser(c.req);
  return tripDetail(getTrip(c.req, seedDemo(u.id, u.name)));
});
route('GET', '/api/trips/(\\d+)', (c) => tripDetail(getTrip(c.req, c.params[0])));
route('PUT', '/api/trips/(\\d+)', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const f = tripFields(c.body);
  db.prepare('UPDATE trips SET name=?, destination=?, budget=?, start_date=?, end_date=?, cat_budgets=? WHERE id=?')
    .run(f.name, f.destination, f.budget, f.start, f.end, f.catBudgets, t.id);
  return tripDetail(getTrip(c.req, t.id));
});
route('DELETE', '/api/trips/(\\d+)', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const files = db.prepare('SELECT receipt_file FROM expenses WHERE trip_id = ? AND receipt_file IS NOT NULL').all(t.id);
  db.prepare('DELETE FROM trips WHERE id = ?').run(t.id);
  files.forEach((f) => removeReceiptFile(f.receipt_file));
  return { ok: true };
});

route('POST', '/api/trips/(\\d+)/travelers', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const name = str(c.body.name, { min: 1, max: 60, field: 'Name' });
  if (db.prepare('SELECT COUNT(*) n FROM travelers WHERE trip_id = ?').get(t.id).n >= 30) throw bad('Up to 30 travelers per trip');
  const r = db.prepare('INSERT INTO travelers (trip_id,name) VALUES (?,?)').run(t.id, name);
  return { traveler: { id: Number(r.lastInsertRowid), name } };
});
route('PUT', '/api/trips/(\\d+)/travelers/(\\d+)', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const name = str(c.body.name, { min: 1, max: 60, field: 'Name' });
  const r = db.prepare('UPDATE travelers SET name = ? WHERE id = ? AND trip_id = ?').run(name, Number(c.params[1]), t.id);
  if (!r.changes) throw new HttpError(404, 'Traveler not found');
  return { ok: true };
});
route('DELETE', '/api/trips/(\\d+)/travelers/(\\d+)', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const tid = Number(c.params[1]);
  if (db.prepare('SELECT COUNT(*) n FROM travelers WHERE trip_id = ?').get(t.id).n <= 1) throw bad('A trip needs at least one traveler');
  if (db.prepare('SELECT 1 FROM expenses WHERE trip_id = ? AND paid_by = ?').get(t.id, tid)) {
    throw new HttpError(409, 'This traveler paid for expenses. Reassign or delete those expenses first.');
  }
  tx(() => {
    // Expenses that were split only with this person would be left with no sharers.
    const orphans = db.prepare(`SELECT s.expense_id FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.trip_id = ? GROUP BY s.expense_id HAVING COUNT(*) = 1 AND MAX(s.traveler_id = ?) = 1`).all(t.id, tid);
    if (orphans.length) throw new HttpError(409, 'Some expenses are shared only by this traveler. Edit those expenses first.');
    db.prepare('DELETE FROM travelers WHERE id = ? AND trip_id = ?').run(tid, t.id);
  });
  return { ok: true };
});

route('POST', '/api/trips/(\\d+)/expenses', (c) => {
  const t = getTrip(c.req, c.params[0]);
  const f = expenseFields(c.body, t.id);
  const rec = c.body.receipt ? saveReceipt(c.body.receipt) : null;
  try {
    const id = tx(() => {
      const r = db.prepare(`INSERT INTO expenses (trip_id,title,amount,category,date,notes,paid_by,receipt_file,receipt_name,receipt_type)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(t.id, f.title, f.amount, f.category, f.date, f.notes, f.paidBy,
        rec?.file ?? null, rec?.name ?? null, rec?.type ?? null);
      setSplits(Number(r.lastInsertRowid), f.split);
      return Number(r.lastInsertRowid);
    });
    return { expense: expenseOut(id) };
  } catch (e) { if (rec) removeReceiptFile(rec.file); throw e; }
});
route('PUT', '/api/expenses/(\\d+)', (c) => {
  const old = getExpense(c.req, c.params[0]);
  const f = expenseFields(c.body, old.trip_id);
  let rec = null;
  if (c.body.receipt) rec = saveReceipt(c.body.receipt);
  const removeOld = c.body.receipt !== undefined; // object replaces, null removes, undefined keeps
  try {
    tx(() => {
      let { receipt_file: file, receipt_name: name, receipt_type: type } = old;
      if (removeOld) { file = rec?.file ?? null; name = rec?.name ?? null; type = rec?.type ?? null; }
      db.prepare(`UPDATE expenses SET title=?, amount=?, category=?, date=?, notes=?, paid_by=?,
        receipt_file=?, receipt_name=?, receipt_type=? WHERE id=?`)
        .run(f.title, f.amount, f.category, f.date, f.notes, f.paidBy, file, name, type, old.id);
      setSplits(old.id, f.split);
    });
  } catch (e) { if (rec) removeReceiptFile(rec.file); throw e; }
  if (removeOld) removeReceiptFile(old.receipt_file);
  return { expense: expenseOut(old.id) };
});
route('DELETE', '/api/expenses/(\\d+)', (c) => {
  const e = getExpense(c.req, c.params[0]);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(e.id);
  removeReceiptFile(e.receipt_file);
  return { ok: true };
});
route('GET', '/api/expenses/(\\d+)/receipt', (c, res) => {
  const e = getExpense(c.req, c.params[0]);
  if (!e.receipt_file) throw new HttpError(404, 'No receipt');
  const file = path.join(RECEIPT_DIR, path.basename(e.receipt_file));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Receipt file missing');
  const safeName = encodeURIComponent(e.receipt_name || 'receipt');
  res.writeHead(200, {
    'Content-Type': e.receipt_type, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
  return undefined;
});

/* ---------- static + dispatch ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'self'",
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
  if (path.basename(file).startsWith('_')) return send(res, 404, { error: 'Not found' }); // Cloudflare config files (_headers)
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      ...SECURITY, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}vendor${path.sep}`) ? 'public, max-age=604800' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, url.pathname);
    }
    Object.entries(SECURITY).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { // CSRF defence in depth on top of SameSite=Strict
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
      const out = await r.handler(ctx(req, body, m.slice(1)), res);
      if (out !== undefined) send(res, 200, out);
      return;
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Something went wrong' });
  }
}).listen(PORT, () => console.log(`TravelSpend running at http://localhost:${PORT}`));
