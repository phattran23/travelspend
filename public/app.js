'use strict';
/* TravelSpend front-end — vanilla JS single-page app. */

const CATS = {
  lodging:    { label: 'Lodging',    icon: '🏨', color: '#6366f1' },
  food:       { label: 'Food',       icon: '🍜', color: '#f59e0b' },
  transport:  { label: 'Transport',  icon: '🚕', color: '#0ea5e9' },
  flights:    { label: 'Flights',    icon: '✈️', color: '#8b5cf6' },
  activities: { label: 'Activities', icon: '🎟️', color: '#10b981' },
  shopping:   { label: 'Shopping',   icon: '🛍️', color: '#ec4899' },
  health:     { label: 'Health',     icon: '💊', color: '#ef4444' },
  other:      { label: 'Other',      icon: '📌', color: '#94a3b8' },
};
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, "Segoe UI", Roboto, sans-serif';
const AVATARS = ['#0e8f7e', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#10b981', '#ef4444'];

const state = { user: null, trips: [], detail: null, tab: 'dashboard', filters: { q: '', cat: '', payer: '', sort: 'newest', group: 'day' }, authMode: 'login', lastPayer: null };
let charts = [];

/* ---------- utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => `${n < 0 ? '-' : ''}₫${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const pct = (n) => `${(Math.round(n * 10) / 10).toLocaleString('en-US')}%`;
const today = () => new Date().toLocaleDateString('sv');
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const initials = (n) => n.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
const avatarColor = (n) => AVATARS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];
const avatar = (n) => `<span class="avatar" style="background:${avatarColor(n)}" aria-hidden="true">${esc(initials(n))}</span>`;
const dateRange = (t) => (t.start_date ? `${dmy(t.start_date)}${t.end_date ? ' – ' + dmy(t.end_date) : ''}` : 'No dates set');
const barClass = (p) => (p > 100 ? 'over' : p >= 85 ? 'warn' : '');
const tripEmoji = (t) => {
  const x = `${t.name} ${t.destination || ''}`.toLowerCase();
  const map = [[/phú quốc|phu quoc|côn đảo|nha trang|vũng tàu|beach|biển|island|đảo|bali|phuket/, '🏝️'], [/đà nẵng|da nang|hội an|hoi an|quy nhơn|mũi né/, '🏖️'],
    [/sa pa|sapa|đà lạt|da lat|hà giang|ha giang|mountain|núi|fansipan|trek|đồi/, '⛰️'], [/hà nội|ha noi|hanoi|huế|hue|kyoto|temple/, '🏯'],
    [/hồ chí minh|ho chi minh|sài gòn|saigon|bangkok|singapore|tokyo|seoul|city/, '🌆'], [/hạ long|ha long|ninh bình|ninh binh|bay|vịnh/, '🛶'],
    [/paris|london|europe|châu âu|rome|swiss/, '🗼'], [/camp|cắm trại|picnic/, '🏕️']];
  return (map.find(([re]) => re.test(x)) || [0, '✈️'])[1];
};
function tripStatus(t) {
  const n = today();
  if (!t.start_date) return { k: 'plan', l: 'Planning' };
  if (n < t.start_date) { const d = Math.round((Date.parse(t.start_date) - Date.parse(n)) / 864e5); return { k: 'soon', l: `In ${d} day${d === 1 ? '' : 's'}` }; }
  if (t.end_date && n > t.end_date) return { k: 'done', l: 'Completed' };
  return { k: 'live', l: 'Happening now' };
}
function health(s, t) {
  if (!s.budget) return { e: '🧭', t: 'Set a budget to unlock smart insights', k: 'ok' };
  if (s.util > 100) return { e: '🚨', t: `Over budget by ${vnd(-s.remaining)} — time to trim`, k: 'bad' };
  const n = today();
  if (t.start_date && t.end_date && n >= t.start_date && n <= t.end_date) {
    const total = Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 864e5) + 1;
    const el = Math.round((Date.parse(n) - Date.parse(t.start_date)) / 864e5) + 1;
    if (s.util > (el / total) * 100 + 15) return { e: '⚡', t: 'Spending faster than your plan', k: 'warn' };
    return { e: '🌴', t: 'You are on track — enjoy the trip', k: 'ok' };
  }
  if (s.util >= 85) return { e: '⚠️', t: 'Almost at your limit', k: 'warn' };
  if (s.util === 0) return { e: '✨', t: 'Fresh start — log your first expense', k: 'ok' };
  return { e: s.util < 50 ? '😌' : '👍', t: s.util < 50 ? 'Plenty of room left' : 'Looking healthy', k: 'ok' };
}
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bits = ['🎉', '✨', '💸', '🌴', '🧳', '🪙', '🌟'];
  for (let i = 0; i < 26; i++) {
    const el = document.createElement('span');
    el.className = 'confetti'; el.textContent = bits[i % bits.length];
    el.style.cssText = `left:${10 + Math.random() * 80}%;--dx:${(Math.random() - .5) * 220}px;--r:${(Math.random() - .5) * 720}deg;animation-delay:${Math.random() * 250}ms;font-size:${14 + Math.random() * 14}px`;
    document.body.append(el); setTimeout(() => el.remove(), 2200);
  }
}
const hue = (n) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const ring = (p, size = 96, stroke = 10, cls = '') => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, p) / 100);
  const col = p > 100 ? 'var(--danger)' : p >= 85 ? 'var(--warn)' : 'var(--ring)';
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(p)}% of budget used">
    <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${col}" stroke-linecap="round"
      stroke-dasharray="${c}" style="--c:${c};--o:${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-t" font-size="${size * 0.24}">${Math.round(p)}%</text></svg>`;
};
const skeleton = () => '<div class="skel" style="height:230px;margin-bottom:16px"></div><div class="grid insights"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
function countUp(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count), t0 = performance.now(), dur = 700;
    if (!to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = vnd(to * e);
      if (k < 1) requestAnimationFrame(step); else el.textContent = vnd(to);
    };
    requestAnimationFrame(step);
  });
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}
async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && state.user && !url.startsWith('/api/auth/')) { state.user = null; render(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

/* ---------- calculations ---------- */
function compute(d) {
  const { trip, travelers, expenses } = d;
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = {};
  const paid = Object.fromEntries(travelers.map((t) => [t.id, 0]));
  const share = Object.fromEntries(travelers.map((t) => [t.id, 0]));
  const byDay = {};
  for (const e of expenses) {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    byDay[e.date] = (byDay[e.date] || 0) + e.amount;
    if (e.paid_by in paid) paid[e.paid_by] += e.amount;
    const ids = [...e.split_among].sort((a, b) => a - b);
    const base = Math.floor(e.amount / ids.length);
    let rem = e.amount - base * ids.length;
    for (const id of ids) { if (id in share) share[id] += base + (rem-- > 0 ? 1 : 0); }
  }
  const balance = Object.fromEntries(travelers.map((t) => [t.id, paid[t.id] - share[t.id]]));
  const cred = travelers.filter((t) => balance[t.id] > 0).map((t) => ({ id: t.id, amt: balance[t.id] })).sort((a, b) => b.amt - a.amt);
  const debt = travelers.filter((t) => balance[t.id] < 0).map((t) => ({ id: t.id, amt: -balance[t.id] })).sort((a, b) => b.amt - a.amt);
  const transfers = [];
  for (let i = 0, j = 0; i < debt.length && j < cred.length;) {
    const x = Math.min(debt[i].amt, cred[j].amt);
    if (x > 0) transfers.push({ from: debt[i].id, to: cred[j].id, amount: x });
    debt[i].amt -= x; cred[j].amt -= x;
    if (debt[i].amt <= 0) i++;
    if (cred[j].amt <= 0) j++;
  }
  const budget = trip.budget;
  return { spent, budget, remaining: budget - spent, util: budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0), byCat, byDay, paid, share, balance, transfers };
}
const tName = (d, id) => d.travelers.find((t) => t.id === id)?.name ?? 'Unknown';

/* ---------- theme ---------- */
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ts_theme', next); } catch { /* ignore */ }
  const btn = $('[data-act="theme"]'); if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  drawCharts();
}
const themeIcon = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙');

/* ---------- modal ---------- */
function openModal(html) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('mousedown', (e) => { if (e.target === o) closeModal(); });
  document.body.append(o);
  const first = $('input:not([type=hidden]), select, textarea', o); if (first) first.focus();
  return o;
}
function closeModal() { $('#overlay')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeMenus(); } });
function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const o = openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="actions"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes" style="background:var(--danger);box-shadow:none">${esc(okLabel)}</button></div>`);
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      closeModal(); resolve(b.dataset.x === 'yes');
    });
  });
}
function closeMenus() { document.querySelectorAll('.menu-list').forEach((m) => m.remove()); }

/* ---------- views ---------- */
function render() {
  destroyCharts();
  const app = $('#app');
  if (state.user === undefined) { app.innerHTML = '<div class="spinner"></div>'; return; }
  if (!state.user) return renderAuth(app);
  const m = location.hash.match(/^#\/trip\/(\d+)/);
  app.innerHTML = `${topbar()}<main><div class="container" id="view">${skeleton()}</div></main>`;
  if (m) loadTrip(Number(m[1])); else loadTrips();
}
function topbar() {
  return `<header class="topbar"><div class="container">
    <button class="brand" data-act="home" aria-label="TravelSpend home"><span class="logo">₫</span>TravelSpend</button>
    <div class="top-actions">
      <span class="muted sm hide-sm">${esc(state.user.name)}</span>
      <button class="btn icon ghost" data-act="theme" aria-label="Toggle light and dark mode">${themeIcon()}</button>
      <button class="btn sm" data-act="logout">Sign out</button>
    </div></div></header>`;
}

function renderAuth(app) {
  const reg = state.authMode === 'register';
  app.innerHTML = `<div class="auth">
    <section class="auth-hero">
      <span class="brand" style="color:#fff"><span class="logo" style="background:rgba(255,255,255,.18);box-shadow:none">₫</span>TravelSpend</span>
      <div><h1>Know where every đồng goes.</h1>
        <p>Plan trip budgets in VND, log who paid for what, split costs fairly and see the full picture at a glance.</p>
        <ul><li>Budgets and expenses in ₫</li><li>Group splitting &amp; who-owes-whom</li><li>Receipts, charts, PDF &amp; Excel reports</li></ul></div>
      <div class="mock" aria-hidden="true">
        <div class="mock-card m1"><span class="mi">🍜</span><div><b>Phở Hà Nội</b><small>Paid by Linh · 4 people</small></div><em>₫340,000</em></div>
        <div class="mock-card m2"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="18" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="5"/><circle cx="23" cy="23" r="18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="113" stroke-dashoffset="36" transform="rotate(-90 23 23)"/></svg><div><b>68% used</b><small>₫6.4M left</small></div></div>
        <div class="mock-card m3"><span class="mi">🤝</span><div><b>Minh pays Linh</b><small>Settle up</small></div><em>₫215,000</em></div>
      </div>
      <span class="sm" style="opacity:.7">Your data is private and stored in your own account.</span>
    </section>
    <section class="auth-form">
      <button class="btn icon ghost theme" data-act="theme" aria-label="Toggle light and dark mode">${themeIcon()}</button>
      <form class="box" id="auth-form" novalidate>
        <h2>${reg ? 'Create your account' : 'Welcome back'}</h2>
        <p class="muted" style="margin:0 0 22px">${reg ? 'Start tracking your next trip in a minute.' : 'Sign in to see your trips.'}</p>
        ${reg ? '<div class="field"><label for="a-name">Full name</label><input class="input" id="a-name" autocomplete="name" required maxlength="80"></div>' : ''}
        <div class="field"><label for="a-email">Email</label><input class="input" id="a-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8">
          ${reg ? '<span class="hint">At least 8 characters.</span>' : ''}</div>
        <p class="err" id="a-err" role="alert"></p>
        <button class="btn primary" style="width:100%;padding:12px" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
        <p class="muted sm" style="text-align:center;margin-top:18px">${reg ? 'Already have an account?' : 'New to TravelSpend?'}
          <button type="button" class="link" data-act="auth-mode">${reg ? 'Sign in' : 'Create an account'}</button></p>
      </form></section></div>`;
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#a-err'); err.textContent = '';
    const btn = $('button[type=submit]', e.target); btn.disabled = true;
    try {
      const body = { email: $('#a-email').value, password: $('#a-pass').value };
      if (reg) body.name = $('#a-name').value;
      const r = await api('POST', reg ? '/api/auth/register' : '/api/auth/login', body);
      state.user = r.user; location.hash = ''; render();
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
}

async function loadTrips() {
  const { trips } = await api('GET', '/api/trips').catch((e) => { toast(e.message); return { trips: [] }; });
  state.trips = trips; state.detail = null;
  const view = $('#view'); if (!view) return;
  const cards = trips.map((t, i) => {
    const p = t.budget > 0 ? (t.spent / t.budget) * 100 : 0, h = hue(t.name);
    return `<button class="card trip-card rise" style="--h:${h};animation-delay:${i * 50}ms" data-act="open-trip" data-id="${t.id}">
      <div class="cover"><span class="cover-emoji">${tripEmoji(t)}</span><span class="cover-pin">📍 ${esc(t.destination || 'Trip')}</span><span class="status ${tripStatus(t).k}">${tripStatus(t).l}</span></div>
      <div class="trip-body">
        <div class="trip-main"><h3>${esc(t.name)}</h3><div class="meta">${esc(dateRange(t))}</div>
          <div class="amounts"><b class="num">${vnd(t.spent)}</b><span class="muted sm">of ${vnd(t.budget)}</span></div></div>
        ${ring(p, 64, 7)}
      </div>
      <div class="foot"><span class="chip">👥 ${t.traveler_count}</span><span class="chip">🧾 ${t.expense_count}</span>
        <span class="${p > 100 ? 'neg-t' : 'faint'}" style="margin-left:auto">${t.budget ? (t.budget - t.spent >= 0 ? `${vnd(t.budget - t.spent)} left` : `${vnd(t.spent - t.budget)} over`) : 'No budget'}</span></div>
    </button>`;
  }).join('');
  const tb = trips.reduce((a, t) => a + t.budget, 0), ts = trips.reduce((a, t) => a + t.spent, 0);
  const live = trips.filter((t) => tripStatus(t).k === 'live').length, under = trips.filter((t) => t.budget && t.spent <= t.budget).length;
  const overview = trips.length ? `<div class="grid insights" style="margin-bottom:22px">${[
    ['🧳', 'Trips', String(trips.length), live ? `${live} happening now` : 'all planned'], ['💰', 'Total budget', vnd(tb), 'across all trips'],
    ['💸', 'Total spent', vnd(ts), tb ? `${pct((ts / tb) * 100)} of budget` : ''], ['🎯', 'Within budget', `${under}/${trips.length}`, 'trips on or under']]
    .map(([i, l, v, sub], k) => `<div class="card insight rise" style="animation-delay:${k * 50}ms"><span class="ins-ico">${i}</span><div><small>${l}</small><b>${v}</b><em>${sub}</em></div></div>`).join('')}</div>` : '';
  view.innerHTML = `<div class="page-head"><div><p class="eyebrow">${greeting()}</p><h1>${esc(state.user.name.split(' ')[0])}, where to next?</h1></div>
      <button class="btn primary" data-act="new-trip">＋ New trip</button></div>
    ${overview}
    ${trips.length ? `<div class="grid trips">${cards}</div>` : `<div class="empty"><div class="big">🧳</div><h3>Plan your first trip</h3>
      <p>Create a trip, set a budget in ₫ and start logging expenses — or explore with a sample trip.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="new-trip">Create a trip</button><button class="btn" data-act="demo">Load sample trip</button></div></div>`}`;
}

async function loadTrip(id, keepTab = false) {
  try { state.detail = await api('GET', `/api/trips/${id}`); } catch (e) { toast(e.message); location.hash = ''; return; }
  if (!keepTab) { state.tab = 'dashboard'; state.filters = { q: '', cat: '', payer: '', sort: 'newest', group: 'day' }; }
  renderTrip();
}
function renderTrip() {
  destroyCharts();
  const d = state.detail, s = compute(d), view = $('#view'); if (!view) return;
  const t = d.trip;
  let alert = '';
  if (t.budget > 0 && s.spent > t.budget) alert = `<div class="alert over">⚠️ Over budget by ${vnd(s.spent - t.budget)}.</div>`;
  else if (t.budget > 0 && s.util >= 85) alert = `<div class="alert warn">Heads up — ${pct(s.util)} of your budget is used. ${vnd(s.remaining)} left.</div>`;
  const n = d.travelers.length;
  view.innerHTML = `
    <section class="hero rise" style="--h:${hue(t.name)}">
      <div class="hero-bar"><button class="btn glass sm" data-act="home">← Trips</button>
        <div class="top-actions">
          <div class="menu"><button class="btn glass sm" data-act="export-menu">⬇ Export</button></div>
          <button class="btn glass sm icon" data-act="edit-trip" aria-label="Edit trip">✏️</button>
          <button class="btn glass sm icon" data-act="delete-trip" aria-label="Delete trip">🗑️</button>
        </div></div>
      <div class="hero-main">
        <div class="hero-text"><span class="status ${tripStatus(t).k} inline">${tripStatus(t).l}</span><h1><span class="hero-emoji">${tripEmoji(t)}</span> ${esc(t.name)}</h1>
          <p>📍 ${esc(t.destination || 'No destination')} &nbsp;·&nbsp; 🗓 ${esc(dateRange(t))} &nbsp;·&nbsp; 👥 ${n}</p>
          <div class="health ${health(s, t).k}"><span>${health(s, t).e}</span>${esc(health(s, t).t)}</div>
          <button class="btn hero-cta" data-act="add-expense">＋ Add expense <kbd>N</kbd></button></div>
        <div class="hero-ring">${ring(s.util, 132, 13, 'big')}<span>Budget used</span></div>
      </div>
      <div class="hero-stats">
        <div><small>Total budget</small><b>${vnd(s.budget)}</b><em>${s.budget && n > 1 ? vnd(s.budget / n) + ' each' : '&nbsp;'}</em></div>
        <div><small>Total spent</small><b data-count="${s.spent}">${vnd(s.spent)}</b><em>${d.expenses.length} expense${d.expenses.length === 1 ? '' : 's'}</em></div>
        <div><small>Remaining</small><b class="${s.remaining < 0 ? 'neg-h' : ''}" data-count="${s.remaining}">${vnd(s.remaining)}</b><em>${s.remaining < 0 ? 'Over budget' : 'Still available'}</em></div>
      </div>
    </section>
    ${alert ? `<div style="margin-top:16px">${alert}</div>` : ''}
    <div class="tabs" role="tablist">${['dashboard', 'expenses', 'travelers'].map((k) =>
      `<button class="tab" role="tab" data-act="tab" data-tab="${k}" aria-selected="${state.tab === k}">${{ dashboard: 'Dashboard', expenses: 'Expenses', travelers: 'Travelers & splits' }[k]}</button>`).join('')}</div>
    <div id="tab-body"></div>
    <nav class="tabbar" aria-label="Trip sections">
      ${[['dashboard', '📊', 'Dashboard'], ['expenses', '🧾', 'Expenses']].map(([k, i, l]) => `<button data-act="tab" data-tab="${k}" aria-selected="${state.tab === k}"><span>${i}</span>${l}</button>`).join('')}
      <button class="tabbar-add" data-act="add-expense" aria-label="Add expense">＋</button>
      <button data-act="tab" data-tab="travelers" aria-selected="${state.tab === 'travelers'}"><span>👥</span>Travelers</button>
      <button data-act="export-menu" data-bar="1"><span>⬇</span>Export</button>
    </nav>`;
  renderTab(); countUp(view);
}
function renderTab() {
  document.querySelectorAll('[data-act="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  destroyCharts();
  const body = $('#tab-body'); if (!body) return;
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  if (state.tab === 'dashboard') renderDashboard(body);
  else if (state.tab === 'expenses') renderExpenses(body);
  else renderTravelers(body);
}

function trendDays(d, s) {
  const dates = Object.keys(s.byDay).sort();
  let from = d.trip.start_date && d.trip.start_date < dates[0] ? d.trip.start_date : dates[0];
  let to = d.trip.end_date && d.trip.end_date > dates[dates.length - 1] ? d.trip.end_date : dates[dates.length - 1];
  const dayMs = 864e5;
  if ((Date.parse(to) - Date.parse(from)) / dayMs > 120) { from = dates[0]; to = dates[dates.length - 1]; }
  const days = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && days.length < 400; t += dayMs) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}
const shortMoney = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));
// average daily spend so far and projected trip total (only while the trip is in progress)
function forecast(d, s) {
  const t = d.trip, now = today();
  if (!t.start_date || !t.end_date || now < t.start_date || now >= t.end_date || !s.spent) return null;
  const total = Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 864e5) + 1;
  const elapsed = Math.round((Date.parse(now) - Date.parse(t.start_date)) / 864e5) + 1;
  const avg = s.spent / elapsed;
  return { avg, projected: Math.round(avg * total), elapsed, total };
}

function renderDashboard(body) {
  const d = state.detail, s = compute(d);
  if (!d.expenses.length) {
    body.innerHTML = `<div class="empty"><div class="big">📊</div><h3>No expenses yet</h3><p>Add your first expense to see category breakdowns, daily trends and who paid what.</p>
      <button class="btn primary" data-act="add-expense">＋ Add expense</button></div>`;
    return;
  }
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const t = d.trip, now = today();
  let span = Object.keys(s.byDay).length;
  if (t.start_date) {
    const end = t.end_date && now > t.end_date ? t.end_date : now;
    span = Math.max(span, Math.round((Date.parse(end) - Date.parse(t.start_date)) / 864e5) + 1);
  }
  const from = t.start_date && now < t.start_date ? t.start_date : now;
  const left = t.end_date && now <= t.end_date ? Math.round((Date.parse(t.end_date) - Date.parse(from)) / 864e5) + 1 : 0;
  const big = [...d.expenses].sort((a, b) => b.amount - a.amount)[0];
  const fc = forecast(d, s);
  const busiest = Object.entries(s.byDay).sort((x, y) => y[1] - x[1])[0];
  const withReceipt = d.expenses.filter((e) => e.has_receipt).length;
  const insights = [
    ['📆', 'Daily average', vnd(s.spent / Math.max(1, span)), `over ${span} day${span === 1 ? '' : 's'}`],
    ['👤', 'Per person', vnd(s.spent / Math.max(1, d.travelers.length)), `${d.travelers.length} traveler${d.travelers.length === 1 ? '' : 's'}`],
    ['🏆', 'Top category', `${CATS[cats[0][0]].icon} ${CATS[cats[0][0]].label}`, `${vnd(cats[0][1])} · ${pct((cats[0][1] / s.spent) * 100)}`],
    left && s.budget ? ['🎯', 'Safe daily spend', vnd(Math.max(0, s.remaining) / left), `${left} day${left === 1 ? '' : 's'} left`]
      : ['💎', 'Biggest expense', vnd(big.amount), esc(big.title || CATS[big.category].label)],
    fc ? ['🔮', 'Projected total', vnd(fc.projected), s.budget ? (fc.projected > s.budget ? `${vnd(fc.projected - s.budget)} over budget` : `${vnd(s.budget - fc.projected)} under budget`) : `at ${vnd(fc.avg)}/day`]
      : ['💎', 'Biggest expense', vnd(big.amount), esc(big.title || CATS[big.category].label)],
    ['🔥', 'Busiest day', vnd(busiest[1]), dmy(busiest[0])],
  ];
  // de-duplicate if both slots fell back to "Biggest expense"
  const seen = new Set(); const uniq = insights.filter((x) => !seen.has(x[1]) && seen.add(x[1]));
  uniq.push(['🧾', 'Receipts', `${withReceipt}/${d.expenses.length}`, 'expenses with a receipt']);
  const trendDaysList = trendDays(d, s);
  const maxDay = Math.max(...Object.values(s.byDay));
  const wd = (new Date(trendDaysList[0] + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  const heat = `<div class="heat">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="heat-h">${x}</span>`).join('')}
    ${'<i class="heat-pad"></i>'.repeat(wd)}${trendDaysList.map((day) => {
      const v = s.byDay[day] || 0, k = v ? Math.max(0.18, v / maxDay) : 0;
      return `<div class="heat-c${v ? '' : ' empty'}" style="--k:${(k * 100).toFixed(0)}%" title="${dmy(day)} · ${vnd(v)}"><small>${day.slice(8)}</small>${v ? `<b>${shortMoney(v)}</b>` : ''}</div>`;
    }).join('')}</div>`;
  const budgets = Object.entries(d.trip.cat_budgets || {}).filter(([, v]) => v > 0);
  const budgetCard = budgets.length ? `<div class="card" style="margin-top:16px"><h3>Category budgets</h3><div class="cbars">${budgets.map(([k, lim]) => {
      const sp = s.byCat[k] || 0, p = (sp / lim) * 100;
      return `<div class="cbar"><div class="cbar-h"><span>${CATS[k].icon} ${CATS[k].label}</span><span class="${sp > lim ? 'neg-t' : ''}"><b>${vnd(sp)}</b> <span class="faint">/ ${vnd(lim)}</span></span></div>
        <div class="bar ${barClass(p)}"><i style="width:${Math.min(100, p)}%;${p < 85 ? `background:${CATS[k].color}` : ''}"></i></div>
        <div class="cbar-f faint sm">${sp > lim ? `${vnd(sp - lim)} over limit` : `${vnd(lim - sp)} left`} · ${pct(p)}</div></div>`;
    }).join('')}</div></div>`
    : `<div class="card tip-card" style="margin-top:16px"><div><b>Set category budgets</b><p class="muted sm" style="margin:2px 0 0">Give lodging, food or flights their own limit and track each one here.</p></div><button class="btn" data-act="edit-trip">Set budgets</button></div>`;
  const top5 = [...d.expenses].sort((x, y) => y.amount - x.amount).slice(0, 5);
  body.innerHTML = `
    <div class="grid insights">${uniq.map(([i, l, v, sub], k) => `<div class="card insight rise" style="animation-delay:${k * 50}ms"><span class="ins-ico">${i}</span><div><small>${l}</small><b>${v}</b><em>${sub}</em></div></div>`).join('')}</div>
    <div class="grid charts">
      <div class="card"><h3>Spending by category</h3><div class="chart-box" style="height:220px"><canvas id="c-cat" aria-label="Spending by category doughnut chart" role="img"></canvas></div>
        <div class="legend">${cats.map(([k, v]) => `<div><i style="background:${CATS[k].color}"></i>${CATS[k].icon} ${CATS[k].label}<b>${vnd(v)}</b><span class="faint sm" style="width:52px;text-align:right">${pct((v / s.spent) * 100)}</span></div>`).join('')}</div></div>
      <div class="card"><h3>Spending trend${fc ? ' &amp; forecast' : ''}</h3><div class="chart-box" style="height:330px"><canvas id="c-trend" aria-label="Daily and cumulative spending chart" role="img"></canvas></div></div>
    </div>
    ${budgetCard}
    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Daily spend by category</h3><div class="chart-box" style="height:280px"><canvas id="c-stack" aria-label="Daily spending stacked by category" role="img"></canvas></div></div>
      <div class="card"><h3>Spending calendar</h3>${heat}<div class="heat-key faint sm"><span>Less</span><i style="--k:18%"></i><i style="--k:45%"></i><i style="--k:70%"></i><i style="--k:100%"></i><span>More</span></div></div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Spending by traveler</h3>
        <div class="chart-box" style="height:${Math.max(200, d.travelers.length * 62)}px"><canvas id="c-trav" aria-label="Amount paid versus fair share per traveler" role="img"></canvas></div></div>
      <div class="card"><h3>Biggest expenses</h3>${top5.map((e, i) => `<div class="top-row"><span class="rank">${i + 1}</span><span class="cat-ico sm" style="background:${CATS[e.category].color}22">${CATS[e.category].icon}</span>
        <div style="flex:1;min-width:0"><div class="t" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title || CATS[e.category].label)}</div>
          <div class="bar" style="height:5px;margin-top:6px"><i style="width:${(e.amount / top5[0].amount) * 100}%;background:${CATS[e.category].color}"></i></div></div>
        <b class="num">${vnd(e.amount)}</b></div>`).join('')}</div>
    </div>`;
  drawCharts();
}

function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function drawCharts() {
  destroyCharts();
  if (!state.detail || state.tab !== 'dashboard' || !$('#c-cat')) return;
  const d = state.detail, s = compute(d);
  const ink2 = cssVar('--ink-2'), grid = cssVar('--border'), surface = cssVar('--surface'), accent = cssVar('--accent'), accent2 = cssVar('--accent-2');
  Chart.defaults.font.family = FONT;
  Chart.defaults.color = ink2;
  const tip = { callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${vnd(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } };
  const axisMoney = (v) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : v);

  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  charts.push(new Chart($('#c-cat'), {
    type: 'doughnut',
    data: { labels: cats.map(([k]) => CATS[k].label), datasets: [{ data: cats.map(([, v]) => v), backgroundColor: cats.map(([k]) => CATS[k].color), borderColor: surface, borderWidth: 3, hoverOffset: 6 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${vnd(c.parsed)}` } } } },
  }));

  const days = trendDays(d, s);
  let run = 0;
  const daily = days.map((x) => s.byDay[x] || 0);
  const cum = daily.map((v) => (run += v));
  const datasets = [
    { type: 'bar', label: 'Daily', data: daily, backgroundColor: accent + '66', hoverBackgroundColor: accent, borderRadius: 6, yAxisID: 'y', order: 2 },
    { type: 'line', label: 'Cumulative', data: cum, borderColor: accent2, backgroundColor: accent2, tension: .35, pointRadius: days.length > 31 ? 0 : 3, borderWidth: 2.5, yAxisID: 'y1', order: 1 },
  ];
  const fc = forecast(d, s);
  if (fc) {
    const nowIdx = days.indexOf(today());
    if (nowIdx >= 0 && nowIdx < days.length - 1) {
      datasets.push({ type: 'line', label: 'Forecast', data: days.map((_, i) => (i < nowIdx ? null : cum[nowIdx] + fc.avg * (i - nowIdx))),
        borderColor: accent2, borderDash: [2, 5], borderWidth: 2, pointRadius: 0, yAxisID: 'y1', order: 1 });
    }
  }
  if (d.trip.budget > 0) datasets.push({ type: 'line', label: 'Budget', data: days.map(() => d.trip.budget), borderColor: cssVar('--danger'), borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1', order: 0 });
  charts.push(new Chart($('#c-trend'), {
    data: { labels: days.map((x) => dmy(x).slice(0, 5)), datasets },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: tip },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: grid }, ticks: { callback: axisMoney }, beginAtZero: true, position: 'left' },
        y1: { grid: { display: false }, ticks: { callback: axisMoney }, beginAtZero: true, position: 'right' },
      },
    },
  }));

  const used = Object.keys(s.byCat);
  const perCat = {};
  d.expenses.forEach((e) => { (perCat[e.category] ||= {})[e.date] = (perCat[e.category][e.date] || 0) + e.amount; });
  charts.push(new Chart($('#c-stack'), {
    type: 'bar',
    data: { labels: days.map((x) => dmy(x).slice(0, 5)), datasets: Object.keys(CATS).filter((k) => used.includes(k)).map((k) => (
      { label: CATS[k].label, data: days.map((x) => perCat[k]?.[x] || 0), backgroundColor: CATS[k].color, borderRadius: 3, borderSkipped: false })) },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (c) => (c.parsed.y ? ` ${c.dataset.label}: ${vnd(c.parsed.y)}` : null) } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { stacked: true, grid: { color: grid }, ticks: { callback: axisMoney }, beginAtZero: true } },
    },
  }));

  const names = d.travelers.map((t) => t.name);
  charts.push(new Chart($('#c-trav'), {
    type: 'bar',
    data: { labels: names, datasets: [
      { label: 'Paid', data: d.travelers.map((t) => s.paid[t.id]), backgroundColor: accent, borderRadius: 6 },
      { label: 'Fair share', data: d.travelers.map((t) => s.share[t.id]), backgroundColor: accent2 + '77', borderRadius: 6 },
    ] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${vnd(c.parsed.x)}` } } },
      scales: { x: { grid: { color: grid }, ticks: { callback: axisMoney }, beginAtZero: true }, y: { grid: { display: false } } },
    },
  }));
}

function renderExpenses(body) {
  const d = state.detail, f = state.filters;
  body.innerHTML = `<div class="card">
    <div class="filters">
      <input class="input grow" id="f-q" type="search" placeholder="Search title or notes…" value="${esc(f.q)}" aria-label="Search expenses">
      <select class="input" id="f-cat" aria-label="Filter by category"><option value="">All categories</option>${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}</select>
      <select class="input" id="f-payer" aria-label="Filter by payer"><option value="">Anyone paid</option>${d.travelers.map((t) => `<option value="${t.id}" ${String(t.id) === f.payer ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select class="input" id="f-sort" aria-label="Sort expenses">${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['high', 'Highest amount'], ['low', 'Lowest amount']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" id="f-group" aria-label="Group expenses">${[['day', 'Group by day'], ['category', 'Group by category'], ['none', 'No grouping']].map(([v, l]) => `<option value="${v}" ${f.group === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div><div id="exp-sum" class="exp-sum"></div><div id="exp-list"></div></div>`;
  drawExpenseList();
}
function drawExpenseList() {
  const d = state.detail, f = state.filters, box = $('#exp-list'); if (!box) return;
  const q = f.q.trim().toLowerCase();
  const list = d.expenses.filter((e) => (!f.cat || e.category === f.cat) && (!f.payer || String(e.paid_by) === f.payer)
    && (!q || `${e.title} ${e.notes} ${CATS[e.category].label}`.toLowerCase().includes(q)));
  if (!list.length) {
    box.innerHTML = d.expenses.length ? '<p class="muted" style="text-align:center;padding:30px 0">No expenses match your filters.</p>'
      : '<div class="empty" style="border:0"><div class="big">🧾</div><h3>Nothing logged yet</h3><p>Record meals, tickets and hotels as you go.</p><button class="btn primary" data-act="add-expense">＋ Add expense</button></div>';
    return;
  }
  const cmp = { newest: (x, y) => y.date.localeCompare(x.date) || y.id - x.id, oldest: (x, y) => x.date.localeCompare(y.date) || x.id - y.id,
    high: (x, y) => y.amount - x.amount, low: (x, y) => x.amount - y.amount }[f.sort];
  const groups = new Map();
  for (const e of [...list].sort(cmp)) {
    const key = f.group === 'day' ? e.date : f.group === 'category' ? e.category : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let entries = [...groups.entries()].map(([k, items]) => ({ k, items, total: items.reduce((a, e) => a + e.amount, 0) }));
  if (f.group === 'day') entries.sort((x, y) => (f.sort === 'oldest' ? x.k.localeCompare(y.k) : y.k.localeCompare(x.k)));
  if (f.group === 'category') entries.sort((x, y) => y.total - x.total);
  const sum = $('#exp-sum');
  if (sum) sum.innerHTML = `<span>${list.length} expense${list.length === 1 ? '' : 's'}${list.length !== d.expenses.length ? ` of ${d.expenses.length}` : ''}</span><b>${vnd(list.reduce((a, e) => a + e.amount, 0))}</b>`;
  let html = '';
  for (const g of entries) {
    if (f.group !== 'none') html += `<div class="day-head"><span>${f.group === 'day' ? dmy(g.k) : `${CATS[g.k].icon} ${CATS[g.k].label}`}</span><span>${vnd(g.total)}</span></div>`;
    for (const e of g.items) {
      const c = CATS[e.category];
      const all = e.split_among.length === d.travelers.length;
      html += `<div class="exp">
      <div class="cat-ico" style="background:${c.color}22">${c.icon}</div>
      <div><div class="t">${esc(e.title || c.label)}</div>
        <div class="s">${f.group === 'category' ? `<span class="chip">${dmy(e.date)}</span>` : `<span class="chip">${c.label}</span>${f.group === 'none' ? `<span>${dmy(e.date)}</span>` : ''}`}<span>Paid by <b>${esc(tName(d, e.paid_by))}</b></span>
          <span>${all ? 'Split equally' : `Split · ${e.split_among.map((i) => esc(tName(d, i))).join(', ')}`}</span></div>
        ${e.notes ? `<div class="s">${esc(e.notes)}</div>` : ''}</div>
      <div class="amt">${vnd(e.amount)}</div>
      <div class="exp-actions">
        ${e.has_receipt ? `<button class="btn icon ghost sm" data-act="receipt" data-id="${e.id}" aria-label="View receipt">📎</button>` : ''}
        <button class="btn icon ghost sm" data-act="dup-expense" data-id="${e.id}" aria-label="Duplicate expense" title="Duplicate">⧉</button>
        <button class="btn icon ghost sm" data-act="edit-expense" data-id="${e.id}" aria-label="Edit expense">✏️</button>
        <button class="btn icon ghost sm" data-act="delete-expense" data-id="${e.id}" aria-label="Delete expense">🗑️</button>
      </div></div>`;
    }
  }
  box.innerHTML = html;
}

function renderTravelers(body) {
  const d = state.detail, s = compute(d);
  body.innerHTML = `
    <div class="grid travelers">${d.travelers.map((t) => {
      const b = s.balance[t.id];
      return `<div class="card"><div class="person">${avatar(t.name)}<div style="flex:1;min-width:0"><div class="n">${esc(t.name)}</div>
          <div class="sm ${b > 0 ? 'value pos' : b < 0 ? 'value neg' : 'muted'}" style="font-size:13px;margin:0;font-weight:600">${b > 0 ? `Gets back ${vnd(b)}` : b < 0 ? `Owes ${vnd(-b)}` : 'All settled'}</div></div>
          <button class="btn icon ghost sm" data-act="rename-traveler" data-id="${t.id}" aria-label="Rename ${esc(t.name)}">✏️</button>
          <button class="btn icon ghost sm" data-act="remove-traveler" data-id="${t.id}" aria-label="Remove ${esc(t.name)}">✕</button></div>
        <div class="kv"><span>Paid</span><b>${vnd(s.paid[t.id])}</b></div>
        <div class="kv"><span>Fair share</span><b>${vnd(s.share[t.id])}</b></div></div>`;
    }).join('')}
      <button class="card" data-act="add-traveler" style="border-style:dashed;display:grid;place-items:center;min-height:130px;color:var(--ink-2);font-weight:600;background:transparent">＋ Add traveler</button>
    </div>
    <div class="card" style="margin-top:16px"><h3>Settle up</h3>
      ${s.transfers.length ? s.transfers.map((x) => `<div class="settle">${avatar(tName(d, x.from))}<span><b>${esc(tName(d, x.from))}</b> pays <b>${esc(tName(d, x.to))}</b></span><span class="amt">${vnd(x.amount)}</span></div>`).join('')
        : '<p class="muted" style="margin:0">Everyone is square — no payments needed. 🎉</p>'}
      <p class="hint" style="margin:12px 0 0">Based on equal splits among the people sharing each expense. Minimum number of payments.</p></div>`;
}

/* ---------- forms ---------- */
const parseMoney = (v) => Number(String(v).replace(/\D/g, '')) || 0;
function bindMoney(input) {
  input.addEventListener('input', () => {
    const n = parseMoney(input.value);
    input.value = n ? n.toLocaleString('en-US') : '';
  });
}
function tripForm(trip) {
  const edit = !!trip;
  const o = openModal(`<h2>${edit ? 'Edit trip' : 'New trip'}</h2>
    <form id="trip-form" novalidate>
      <div class="field"><label for="t-name">Trip name</label><input class="input" id="t-name" required maxlength="100" placeholder="e.g. Đà Lạt weekend" value="${esc(trip?.name)}"></div>
      <div class="field"><label for="t-dest">Destination</label><input class="input" id="t-dest" maxlength="100" placeholder="City or country" value="${esc(trip?.destination)}"></div>
      <div class="field"><label for="t-budget">Budget</label><div class="money-wrap"><input class="input" id="t-budget" inputmode="numeric" placeholder="15,000,000" value="${trip ? trip.budget.toLocaleString('en-US') : ''}"></div></div>
      <div class="row"><div class="field"><label for="t-start">Start date</label><input class="input" id="t-start" type="date" value="${trip?.start_date || ''}"></div>
        <div class="field"><label for="t-end">End date</label><input class="input" id="t-end" type="date" value="${trip?.end_date || ''}"></div></div>
      <details class="cb-box" ${trip && Object.keys(trip.cat_budgets || {}).length ? 'open' : ''}><summary>Category budgets <span class="faint">(optional)</span></summary>
        <div class="cb-grid">${Object.entries(CATS).map(([k, c]) => `<label class="cb-item"><span>${c.icon} ${c.label}</span><span class="money-wrap"><input class="input cb-in" data-cat="${k}" inputmode="numeric" placeholder="—" value="${trip?.cat_budgets?.[k] ? trip.cat_budgets[k].toLocaleString('en-US') : ''}"></span></label>`).join('')}</div></details>
      ${edit ? '' : `<div class="field"><label for="t-trav">Travelers</label><input class="input" id="t-trav" placeholder="Separate names with commas — you're included" value="${esc(state.user.name)}">
        <span class="hint">e.g. ${esc(state.user.name.split(' ')[0])}, Linh, Minh. You can change this later.</span></div>`}
      <p class="err" id="t-err" role="alert"></p>
      <div class="actions"><button type="button" class="btn" data-x="cancel">Cancel</button><button class="btn primary" type="submit">${edit ? 'Save changes' : 'Create trip'}</button></div>
    </form>`);
  bindMoney($('#t-budget', o)); o.querySelectorAll('.cb-in').forEach(bindMoney);
  $('[data-x=cancel]', o).onclick = closeModal;
  $('#trip-form', o).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: $('#t-name').value, destination: $('#t-dest').value, budget: parseMoney($('#t-budget').value), start_date: $('#t-start').value, end_date: $('#t-end').value,
      cat_budgets: Object.fromEntries([...o.querySelectorAll('.cb-in')].map((i) => [i.dataset.cat, parseMoney(i.value)]).filter(([, v]) => v > 0)) };
    if (!edit) body.travelers = $('#t-trav').value.split(',').map((x) => x.trim()).filter(Boolean);
    try {
      const r = edit ? await api('PUT', `/api/trips/${trip.id}`, body) : await api('POST', '/api/trips', body);
      closeModal();
      if (edit) { state.detail = r; renderTrip(); toast('Trip updated'); } else { location.hash = `#/trip/${r.trip.id}`; toast('Trip created'); }
    } catch (ex) { $('#t-err').textContent = ex.message; }
  });
}

function expenseForm(expense, dup = false) {
  const d = state.detail, edit = !!expense && !dup;
  let cat = expense?.category || 'food';
  const split = new Set(expense?.split_among || d.travelers.map((t) => t.id));
  let receipt; // undefined = unchanged, null = removed, object = new file
  const payer = expense?.paid_by ?? (d.travelers.some((t) => t.id === state.lastPayer) ? state.lastPayer : d.travelers[0].id);
  const defDate = (edit && expense.date) || (d.trip.end_date && today() > d.trip.end_date ? d.trip.end_date : d.trip.start_date && today() < d.trip.start_date ? d.trip.start_date : today());
  const o = openModal(`<h2>${edit ? 'Edit expense' : dup ? 'Duplicate expense' : 'Add expense'}</h2>
    <form id="exp-form" novalidate>
      <div class="field"><label for="e-amt">Amount</label><div class="money-wrap"><input class="input" id="e-amt" inputmode="numeric" placeholder="0" value="${expense ? expense.amount.toLocaleString('en-US') : ''}" required></div>
        <div class="quick">${[50000, 100000, 500000, 1000000].map((v) => `<button type="button" class="qchip" data-add="${v}">+${v >= 1e6 ? v / 1e6 + 'M' : v / 1e3 + 'k'}</button>`).join('')}<button type="button" class="qchip" data-add="0">Clear</button></div></div>
      <div class="field"><span class="label">Category</span><div class="cats">${Object.entries(CATS).map(([k, c]) =>
        `<button type="button" class="cat-opt" data-cat="${k}" aria-pressed="${k === cat}"><span>${c.icon}</span>${c.label}</button>`).join('')}</div></div>
      <div class="field"><label for="e-title">What was it for?</label><input class="input" id="e-title" maxlength="120" placeholder="e.g. Dinner at Bún Chả Hương Liên" value="${esc(expense?.title)}"></div>
      <div class="row"><div class="field"><label for="e-date">Date <button type="button" class="link sm" data-day="0">Today</button> · <button type="button" class="link sm" data-day="-1">Yesterday</button></label><input class="input" id="e-date" type="date" value="${defDate}" required></div>
        <div class="field"><label for="e-payer">Paid by</label><select class="input" id="e-payer">${d.travelers.map((t) => `<option value="${t.id}" ${t.id === payer ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
      <div class="field"><span class="label">Split between <button type="button" class="link sm" id="e-all" style="margin-left:6px">Everyone</button></span>
        <div class="pills" id="e-split">${d.travelers.map((t) => `<button type="button" class="pill" data-id="${t.id}" aria-pressed="${split.has(t.id)}">${esc(t.name)}</button>`).join('')}</div>
        <span class="hint" id="e-each"></span></div>
      <div class="field"><label for="e-notes">Notes</label><textarea class="input" id="e-notes" maxlength="1000" placeholder="Optional">${esc(expense?.notes)}</textarea></div>
      <div class="field"><label for="e-file">Receipt</label>
        <div id="e-rec-cur" ${edit && expense?.has_receipt ? '' : 'hidden'} class="sm muted">📎 <span>${esc(expense?.receipt_name)}</span> <button type="button" class="link sm" id="e-rec-rm">Remove</button></div>
        <input class="input" id="e-file" type="file" accept="image/*,application/pdf"><span class="hint">JPG, PNG, WebP, GIF or PDF · up to 5 MB</span></div>
      <p class="err" id="e-err" role="alert"></p>
      <div class="actions"><button type="button" class="btn" data-x="cancel">Cancel</button><button class="btn primary" type="submit">${edit ? 'Save changes' : 'Add expense'}</button></div>
    </form>`);
  const each = () => {
    const amt = parseMoney($('#e-amt').value);
    $('#e-each').textContent = split.size && amt ? `≈ ${vnd(amt / split.size)} each across ${split.size} ${split.size === 1 ? 'person' : 'people'}` : '';
  };
  bindMoney($('#e-amt', o)); $('#e-amt', o).addEventListener('input', each); each();
  o.querySelectorAll('.cat-opt').forEach((b) => b.addEventListener('click', () => {
    cat = b.dataset.cat; o.querySelectorAll('.cat-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  o.querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id);
    if (split.has(id)) split.delete(id); else split.add(id);
    b.setAttribute('aria-pressed', String(split.has(id))); each();
  }));
  $('#e-all', o).onclick = () => {
    d.travelers.forEach((t) => split.add(t.id));
    o.querySelectorAll('.pill').forEach((b) => b.setAttribute('aria-pressed', 'true')); each();
  };
  $('#e-rec-rm', o).onclick = () => { receipt = null; $('#e-rec-cur').hidden = true; };
  $('#e-file', o).addEventListener('change', async (ev) => {
    const file = ev.target.files[0]; if (!file) { receipt = undefined; return; }
    const err = $('#e-err'); err.textContent = '';
    if (file.size > 5 * 1024 * 1024) { err.textContent = 'Receipt must be smaller than 5 MB'; ev.target.value = ''; return; }
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    receipt = { name: file.name, type: file.type, data };
    $('#e-rec-cur').hidden = true;
  });
  o.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const inp = $('#e-amt'), v = Number(b.dataset.add);
    inp.value = v ? (parseMoney(inp.value) + v).toLocaleString('en-US') : ''; each(); inp.focus();
  }));
  o.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const dt = new Date(); dt.setDate(dt.getDate() + Number(b.dataset.day)); $('#e-date').value = dt.toLocaleDateString('sv');
  }));
  $('[data-x=cancel]', o).onclick = closeModal;
  $('#exp-form', o).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { amount: parseMoney($('#e-amt').value), category: cat, title: $('#e-title').value, date: $('#e-date').value,
      paid_by: Number($('#e-payer').value), split_among: [...split], notes: $('#e-notes').value };
    if (receipt !== undefined) body.receipt = receipt;
    const btn = $('button[type=submit]', e.target); btn.disabled = true;
    try {
      if (edit) await api('PUT', `/api/expenses/${expense.id}`, body); else await api('POST', `/api/trips/${d.trip.id}/expenses`, body);
      state.lastPayer = body.paid_by;
      closeModal(); await loadTrip(d.trip.id, true); toast(edit ? 'Expense updated' : 'Expense added ✓');
      if (!edit) confetti();
    } catch (ex) { $('#e-err').textContent = ex.message; btn.disabled = false; }
  });
}

function nameForm(title, value, onSave) {
  const o = openModal(`<h2>${esc(title)}</h2><form id="n-form"><div class="field"><input class="input" id="n-name" maxlength="60" required aria-label="Name" value="${esc(value)}"></div>
    <p class="err" id="n-err" role="alert"></p><div class="actions"><button type="button" class="btn" data-x="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  $('[data-x=cancel]', o).onclick = closeModal;
  $('#n-form', o).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await onSave($('#n-name').value); closeModal(); } catch (ex) { $('#n-err').textContent = ex.message; }
  });
}

/* ---------- exports ---------- */
const fileSafe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'trip';
function exportExcel() {
  const d = state.detail, s = compute(d), t = d.trip, X = XLSX;
  const wb = X.utils.book_new();
  const sheet = (rows, widths, moneyCols = []) => {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const range = X.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= range.e.r; r++) for (const c of moneyCols) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = '"₫"#,##0';
    }
    return ws;
  };
  const summary = [['Trip', t.name], ['Destination', t.destination], ['Dates', dateRange(t)], [],
    ['Total budget (VND)', s.budget], ['Total spent (VND)', s.spent], ['Remaining (VND)', s.remaining], ['Budget utilization (%)', Math.round(s.util * 10) / 10]];
  const ws0 = X.utils.aoa_to_sheet(summary); ws0['!cols'] = [{ wch: 26 }, { wch: 28 }];
  [4, 5, 6].forEach((r) => { ws0[X.utils.encode_cell({ r, c: 1 })].z = '"₫"#,##0'; });
  X.utils.book_append_sheet(wb, ws0, 'Summary');
  const exp = [['Date', 'Title', 'Category', 'Amount (VND)', 'Paid by', 'Split between', 'Notes', 'Receipt']];
  [...d.expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) =>
    exp.push([e.date, e.title, CATS[e.category].label, e.amount, tName(d, e.paid_by), e.split_among.map((i) => tName(d, i)).join(', '), e.notes, e.receipt_name || '']));
  X.utils.book_append_sheet(wb, sheet(exp, [12, 32, 14, 16, 16, 28, 36, 20], [3]), 'Expenses');
  const cat = [['Category', 'Amount (VND)', '% of spend', 'Budget (VND)', 'Remaining (VND)']];
  const cb = d.trip.cat_budgets || {};
  Object.keys(CATS).filter((k) => s.byCat[k] || cb[k]).sort((a, b) => (s.byCat[b] || 0) - (s.byCat[a] || 0)).forEach((k) => {
    const v = s.byCat[k] || 0;
    cat.push([CATS[k].label, v, s.spent ? Math.round((v / s.spent) * 1000) / 10 : 0, cb[k] || '', cb[k] ? cb[k] - v : '']);
  });
  X.utils.book_append_sheet(wb, sheet(cat, [18, 16, 12, 16, 16], [1, 3, 4]), 'By category');
  const trav = [['Traveler', 'Paid (VND)', 'Fair share (VND)', 'Balance (VND)']];
  d.travelers.forEach((tr) => trav.push([tr.name, s.paid[tr.id], s.share[tr.id], s.balance[tr.id]]));
  X.utils.book_append_sheet(wb, sheet(trav, [22, 16, 18, 16], [1, 2, 3]), 'By traveler');
  const set = [['From', 'To', 'Amount (VND)']];
  s.transfers.forEach((x) => set.push([tName(d, x.from), tName(d, x.to), x.amount]));
  X.utils.book_append_sheet(wb, sheet(set, [20, 20, 16], [2]), 'Settlement');
  X.writeFile(wb, `${fileSafe(t.name)}_report.xlsx`);
}

async function exportPdf() {
  const d = state.detail, s = compute(d), t = d.trip;
  toast('Preparing PDF…');
  const root = document.createElement('div'); root.className = 'rpt';
  const blocks = [];
  const kp = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  blocks.push(`<h1>${esc(t.name)}</h1><div style="color:#64748b">${esc(t.destination || '')}${t.destination ? ' · ' : ''}${esc(dateRange(t))} · ${d.travelers.length} traveler${d.travelers.length === 1 ? '' : 's'}</div>
    <div class="kp">${kp('Budget', vnd(s.budget))}${kp('Spent', vnd(s.spent))}${kp('Remaining', vnd(s.remaining))}${kp('Utilization', pct(s.util))}</div>
    <div class="rbar"><i style="width:${Math.min(100, s.util)}%;${s.util > 100 ? 'background:#e5484d' : ''}"></i></div>`);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) blocks.push(`<h2>Spending by category</h2><table><tr><th>Category</th><th style="width:40%"></th><th class="r">Amount</th><th class="r">Share</th></tr>${cats.map(([k, v]) =>
    `<tr><td>${CATS[k].icon} ${CATS[k].label}</td><td><div class="rbar"><i style="width:${(v / s.spent) * 100}%;background:${CATS[k].color}"></i></div></td><td class="r">${vnd(v)}</td><td class="r">${pct((v / s.spent) * 100)}</td></tr>`).join('')}</table>`);
  blocks.push(`<h2>Travelers</h2><table><tr><th>Name</th><th class="r">Paid</th><th class="r">Fair share</th><th class="r">Balance</th></tr>${d.travelers.map((tr) =>
    `<tr><td>${esc(tr.name)}</td><td class="r">${vnd(s.paid[tr.id])}</td><td class="r">${vnd(s.share[tr.id])}</td><td class="r" style="color:${s.balance[tr.id] < 0 ? '#e5484d' : '#0e8f7e'}">${vnd(s.balance[tr.id])}</td></tr>`).join('')}</table>`);
  if (s.transfers.length) blocks.push(`<h2>Settle up</h2><table>${s.transfers.map((x) => `<tr><td><b>${esc(tName(d, x.from))}</b> pays <b>${esc(tName(d, x.to))}</b></td><td class="r">${vnd(x.amount)}</td></tr>`).join('')}</table>`);
  const sorted = [...d.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  for (let i = 0; i < sorted.length; i += 14) {
    blocks.push(`${i === 0 ? '<h2>All expenses</h2>' : ''}<table><tr><th style="width:68px">Date</th><th>Description</th><th>Paid by</th><th class="r">Amount</th></tr>${sorted.slice(i, i + 14).map((e) =>
      `<tr><td>${dmy(e.date)}</td><td><b>${esc(e.title || CATS[e.category].label)}</b><div style="color:#64748b;font-size:10px">${CATS[e.category].label}${e.notes ? ' · ' + esc(e.notes) : ''}</div></td><td>${esc(tName(d, e.paid_by))}</td><td class="r">${vnd(e.amount)}</td></tr>`).join('')}</table>`);
  }
  root.innerHTML = blocks.map((b) => `<div class="rb">${b}</div>`).join('');
  document.body.append(root);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 12, CW = W - M * 2;
    let y = M;
    for (const el of root.children) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
      const h = (canvas.height / canvas.width) * CW;
      if (y + h > H - M && y > M) { pdf.addPage(); y = M; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', M, y, CW, h);
      y += h + 3;
    }
    const pages = pdf.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(140);
      pdf.text(`TravelSpend · ${new Date().toLocaleDateString('en-GB')} · Page ${p}/${pages}`, W / 2, H - 6, { align: 'center' });
    }
    pdf.save(`${fileSafe(t.name)}_report.pdf`);
  } finally { root.remove(); }
}

/* ---------- events ---------- */
const actions = {
  home: () => { location.hash = ''; if (!state.detail) render(); },
  theme: toggleTheme,
  'auth-mode': () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; render(); },
  logout: guard(async () => { await api('POST', '/api/auth/logout', {}); state.user = null; state.detail = null; location.hash = ''; render(); }),
  'open-trip': (el) => { location.hash = `#/trip/${el.dataset.id}`; },
  'new-trip': () => tripForm(),
  demo: guard(async () => { const r = await api('POST', '/api/demo', {}); location.hash = `#/trip/${r.trip.id}`; }),
  'edit-trip': () => tripForm(state.detail.trip),
  'delete-trip': guard(async () => {
    if (!(await confirmBox('Delete this trip?', `“${state.detail.trip.name}” and all its expenses and receipts will be permanently removed.`))) return;
    await api('DELETE', `/api/trips/${state.detail.trip.id}`); toast('Trip deleted'); location.hash = '';
  }),
  tab: (el) => { state.tab = el.dataset.tab; renderTab(); },
  'add-expense': () => expenseForm(),
  'dup-expense': (el) => expenseForm(state.detail.expenses.find((e) => e.id === Number(el.dataset.id)), true),
  'edit-expense': (el) => expenseForm(state.detail.expenses.find((e) => e.id === Number(el.dataset.id))),
  'delete-expense': guard(async (el) => {
    if (!(await confirmBox('Delete this expense?', 'This cannot be undone.'))) return;
    await api('DELETE', `/api/expenses/${el.dataset.id}`); await loadTrip(state.detail.trip.id, true); toast('Expense deleted');
  }),
  receipt: (el) => {
    const e = state.detail.expenses.find((x) => x.id === Number(el.dataset.id));
    const url = `/api/expenses/${e.id}/receipt`;
    openModal(`<h2>Receipt</h2><p class="muted sm">${esc(e.receipt_name)}</p>${e.receipt_type === 'application/pdf'
      ? `<a class="btn primary" href="${url}" target="_blank" rel="noopener">Open PDF</a>` : `<img class="receipt-img" src="${url}" alt="Receipt for ${esc(e.title)}">`}
      <div class="actions"><a class="btn" href="${url}" target="_blank" rel="noopener">Open in new tab</a><button class="btn" data-act="close">Close</button></div>`);
  },
  close: closeModal,
  'add-traveler': () => nameForm('Add traveler', '', async (name) => {
    await api('POST', `/api/trips/${state.detail.trip.id}/travelers`, { name }); await loadTrip(state.detail.trip.id, true);
  }),
  'rename-traveler': (el) => {
    const t = state.detail.travelers.find((x) => x.id === Number(el.dataset.id));
    nameForm('Rename traveler', t.name, async (name) => { await api('PUT', `/api/trips/${state.detail.trip.id}/travelers/${t.id}`, { name }); await loadTrip(state.detail.trip.id, true); });
  },
  'remove-traveler': guard(async (el) => {
    const t = state.detail.travelers.find((x) => x.id === Number(el.dataset.id));
    if (!(await confirmBox(`Remove ${t.name}?`, 'They will be taken out of every expense split.', 'Remove'))) return;
    await api('DELETE', `/api/trips/${state.detail.trip.id}/travelers/${t.id}`); await loadTrip(state.detail.trip.id, true);
  }),
  'export-menu': (el) => {
    if (el.dataset.bar) {
      const o = openModal(`<h2>Export report</h2><div class="sheet-list"><button class="btn" data-act="export-pdf">📄 PDF report</button><button class="btn" data-act="export-xlsx">📊 Excel workbook</button></div>`);
      o.addEventListener('click', (ev) => { if (ev.target.closest('[data-act]')) closeModal(); });
      return;
    }
    const open = el.parentElement.querySelector('.menu-list'); closeMenus(); if (open) return;
    const m = document.createElement('div'); m.className = 'menu-list';
    m.innerHTML = '<button data-act="export-pdf">📄 PDF report</button><button data-act="export-xlsx">📊 Excel workbook</button>';
    el.parentElement.append(m);
  },
  'export-pdf': guard(async () => { closeMenus(); await exportPdf(); }),
  'export-xlsx': guard(async () => { closeMenus(); exportExcel(); toast('Excel report downloaded'); }),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (!e.target.closest('.menu')) closeMenus(); return; }
  const fn = actions[el.dataset.act]; if (fn) fn(el);
});
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'f-q') { state.filters.q = e.target.value; drawExpenseList(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'f-cat') { state.filters.cat = e.target.value; drawExpenseList(); }
  if (e.target.id === 'f-payer') { state.filters.payer = e.target.value; drawExpenseList(); }
  if (e.target.id === 'f-sort') { state.filters.sort = e.target.value; drawExpenseList(); }
  if (e.target.id === 'f-group') { state.filters.group = e.target.value; drawExpenseList(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || $('#overlay') || !state.detail) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault(); expenseForm();
});
window.addEventListener('hashchange', () => { closeModal(); if (state.user) render(); });

(async function init() {
  state.user = undefined; render();
  try { state.user = (await api('GET', '/api/auth/me')).user; } catch { state.user = null; }
  render();
})();
