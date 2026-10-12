'use strict';
/* Travel Wallet front end — vanilla JS single-page app. */

const CATS = {
  lodging: { label: 'Lodging', icon: '🏨', color: '#6b5b95' }, food: { label: 'Food', icon: '🍜', color: '#c9a45c' },
  transport: { label: 'Transport', icon: '🚕', color: '#3f6c8f' }, flights: { label: 'Flights', icon: '✈️', color: '#8d5a7a' },
  activities: { label: 'Activities', icon: '🎟️', color: '#4f8a6a' }, shopping: { label: 'Shopping', icon: '🛍️', color: '#b4584f' },
  health: { label: 'Health', icon: '💊', color: '#a33b3b' }, other: { label: 'Other', icon: '📌', color: '#8a8378' },
};
const AVATARS = ['#3f6c8f', '#6b5b95', '#b08d57', '#8d5a7a', '#4f8a6a', '#b4584f', '#5b7c8a', '#7d6b57'];
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, "Segoe UI", sans-serif';

const state = { user: undefined, d: null, tab: 'overview', filter: 'all', q: '', mode: 'login' };
let charts = [];

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => `${n < 0 ? '-' : ''}₫${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const today = () => new Date().toLocaleDateString('sv');
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const initials = (n) => n.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
const color = (n) => AVATARS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];
const avatar = (n) => `<span class="avatar" style="background:${color(n)}">${esc(initials(n))}</span>`;
const dates = (t) => (t.start_date ? `${dmy(t.start_date)}${t.end_date ? ' – ' + dmy(t.end_date) : ''}` : '');
const fileSafe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'trip';
const parseMoney = (v) => Number(String(v).replace(/\D/g, '')) || 0;
const shortMoney = (v) => (v >= 1e6 ? `${v / 1e6}M` : `${v / 1e3}k`);
const themeIcon = () => (document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3000);
}
async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && state.user && !url.startsWith('/api/auth/')) { state.user = null; render(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

/* ---------- the ledger: who put in, who owes, who receives ---------- */
function ledger(d) {
  const W = d.wallet_id;
  const contributed = {}, share = {}, paid = {};
  d.travelers.forEach((p) => { contributed[p.id] = 0; share[p.id] = 0; paid[p.id] = 0; });
  let collected = 0, spent = 0, fromWallet = 0;
  for (const c of d.contributions) { collected += c.amount; if (c.traveler_id in contributed) contributed[c.traveler_id] += c.amount; }
  for (const e of d.expenses) {
    spent += e.amount;
    if (e.paid_by === W) fromWallet += e.amount; else if (e.paid_by in paid) paid[e.paid_by] += e.amount;
    const ids = [...e.split_among].sort((a, b) => a - b);
    const base = Math.floor(e.amount / ids.length);
    let rem = e.amount - base * ids.length;
    for (const id of ids) if (id in share) share[id] += base + (rem-- > 0 ? 1 : 0);
  }
  const net = Object.fromEntries(d.travelers.map((p) => [p.id, contributed[p.id] + paid[p.id] - share[p.id]]));
  const balance = collected - fromWallet; // cash left in the wallet
  // the wallet takes part in settlement: it pays out its remaining cash (or, if overdrawn, is owed the shortfall)
  const nodes = [...d.travelers.map((p) => ({ id: p.id, b: net[p.id] })), { id: 'wallet', b: -balance }];
  const debtors = nodes.filter((n) => n.b < 0).map((n) => ({ id: n.id, a: -n.b })).sort((x, y) => y.a - x.a);
  const creditors = nodes.filter((n) => n.b > 0).map((n) => ({ id: n.id, a: n.b })).sort((x, y) => y.a - x.a);
  const transfers = [];
  for (let i = 0, j = 0; i < debtors.length && j < creditors.length;) {
    const x = Math.min(debtors[i].a, creditors[j].a);
    if (x > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: x });
    debtors[i].a -= x; creditors[j].a -= x;
    if (debtors[i].a <= 0) i++;
    if (creditors[j].a <= 0) j++;
  }
  return { contributed, share, paid, net, collected, spent, fromWallet, balance, transfers };
}
const nameOf = (d, id) => (id === 'wallet' || id === d.wallet_id ? 'Wallet' : d.travelers.find((t) => t.id === id)?.name ?? 'Unknown');
const isPersonal = (d, e) => e.split_among.length === 1 && d.travelers.length > 1;

/* ---------- modal & menus ---------- */
function openModal(html) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('mousedown', (e) => { if (e.target === o) closeModal(); });
  document.body.append(o);
  $('input:not([type=hidden]):not([type=file]), textarea', o)?.focus();
  return o;
}
const closeModal = () => $('#overlay')?.remove();
const closeMenus = () => document.querySelectorAll('.menu').forEach((m) => m.remove());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeMenus(); } });
function confirmBox(title, text, ok = 'Delete') {
  return new Promise((resolve) => {
    const o = openModal(`<h2>${esc(title)}</h2><p class="muted" style="margin-bottom:18px">${esc(text)}</p>
      <div class="actions"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">${esc(ok)}</button></div>`);
    o.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) { closeModal(); resolve(b.dataset.x === 'yes'); } });
  });
}

/* ---------- routing ---------- */
function render() {
  destroyCharts();
  const app = $('#app');
  if (state.user === undefined) { app.innerHTML = '<div class="auth"><div class="skel" style="width:200px"></div></div>'; return; }
  if (!state.user) return renderAuth(app);
  app.innerHTML = `<header class="topbar"><div class="wrap">
      <button class="brand" data-act="home"><span class="logo">₫</span>Travel Wallet</button>
      <div class="bar-actions"><button class="btn icon ghost" data-act="theme" aria-label="Toggle theme">${themeIcon()}</button>
        <button class="btn sm" data-act="logout">Sign out</button></div></div></header>
    <main><div class="wrap" id="view"><div class="stack"><div class="skel"></div><div class="skel"></div></div></div></main>`;
  const m = location.hash.match(/^#\/trip\/(\d+)/);
  if (m) loadTrip(Number(m[1])); else loadHome();
}

function renderAuth(app) {
  const reg = state.mode === 'register';
  app.innerHTML = `<div class="auth"><div class="auth-box">
    <div class="logo">₫</div><h1>Travel Wallet</h1>
    <p class="lead">Group trip money, simply settled.</p>
    <form id="auth" novalidate>
      ${reg ? '<div class="field"><label for="a-name">Name</label><input class="input" id="a-name" autocomplete="name" maxlength="80"></div>' : ''}
      <div class="field"><label for="a-email">Email</label><input class="input" id="a-email" type="email" autocomplete="email"></div>
      <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}">
        ${reg ? '<span class="hint">At least 8 characters</span>' : ''}</div>
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary block" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="switch">${reg ? 'Have an account?' : 'New here?'} <button class="link" data-act="mode">${reg ? 'Sign in' : 'Create an account'}</button></p>
  </div></div>`;
  $('#auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target); btn.disabled = true; $('#a-err').textContent = '';
    try {
      const body = { email: $('#a-email').value, password: $('#a-pass').value };
      if (reg) body.name = $('#a-name').value;
      state.user = (await api('POST', reg ? '/api/auth/register' : '/api/auth/login', body)).user;
      location.hash = ''; render();
    } catch (ex) { $('#a-err').textContent = ex.message; btn.disabled = false; }
  });
}

/* ---------- home ---------- */
async function loadHome() {
  state.d = null;
  const { trips } = await api('GET', '/api/trips').catch((e) => { toast(e.message); return { trips: [] }; });
  const view = $('#view'); if (!view) return;
  view.innerHTML = `<div class="page-title"><h1>Trips</h1><button class="btn primary" data-act="new-trip">＋ New trip</button></div>
    ${trips.length ? `<div class="trips">${trips.map((t) => {
      const bal = t.collected - t.from_wallet, used = t.collected ? (t.from_wallet / t.collected) * 100 : 0;
      return `<button class="trip" data-act="open" data-id="${t.id}">
        <div class="trip-top"><div><h3>${esc(t.name)}</h3><p class="muted sm">${esc([t.destination, dates(t)].filter(Boolean).join(' · ') || 'No details yet')}</p></div>
          <div><div class="bal num ${bal < 0 ? 'neg' : ''}">${vnd(bal)}</div><div class="faint sm" style="text-align:right">in wallet</div></div></div>
        <div class="bar ${used > 100 ? 'over' : ''}"><i style="width:${Math.min(100, used)}%"></i></div>
        <div class="trip-foot"><span>${t.traveler_count} traveler${t.traveler_count === 1 ? '' : 's'}</span><span>${vnd(t.spent)} spent</span></div></button>`;
    }).join('')}</div>` : `<div class="card empty"><div class="big">👛</div><h3>Start your first trip wallet</h3>
      <p>Collect money from the group, log what you spend, and settle up in the fewest payments.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="new-trip">Create a trip</button><button class="btn" data-act="demo">Try a sample trip</button></div></div>`}`;
}

/* ---------- trip ---------- */
async function loadTrip(id, keep = false) {
  try { state.d = await api('GET', `/api/trips/${id}`); } catch (e) { toast(e.message); location.hash = ''; return; }
  if (!keep) { state.tab = 'overview'; state.filter = 'all'; state.q = ''; }
  renderTrip();
}
function renderTrip() {
  destroyCharts();
  const d = state.d, L = ledger(d), t = d.trip, view = $('#view'); if (!view) return;
  const used = L.collected ? (L.fromWallet / L.collected) * 100 : 0;
  const meta = [t.destination, dates(t), `${d.travelers.length} traveler${d.travelers.length === 1 ? '' : 's'}`,
    t.budget ? `Budget ${vnd(t.budget)} · ${Math.round((L.spent / t.budget) * 100)}% used` : ''].filter(Boolean).join(' · ');
  view.innerHTML = `
    <button class="btn ghost sm back" data-act="home">‹ Trips</button>
    <div class="trip-head"><div><h1>${esc(t.name)}</h1><p class="muted sm" style="margin-top:4px">${esc(meta)}</p></div>
      <div class="bar-actions" style="position:relative"><button class="btn icon" data-act="help" aria-label="How it works">?</button><button class="btn icon" data-act="menu" aria-label="More options">⋯</button></div></div>
    <section class="wallet">
      <div class="w-top"><span class="w-brand">TRAVEL WALLET</span><span class="w-chip"></span></div>
      <small>Wallet balance</small>
      <div class="big ${L.balance < 0 ? 'neg' : ''}">${vnd(L.balance)}</div>
      <small>${L.balance < 0 ? 'Overdrawn — add money or record who paid' : 'Left in the shared wallet'}</small>
      <div class="bar ${used > 100 ? 'over' : ''}"><i style="width:${Math.min(100, used)}%"></i></div>
      <div class="wallet-stats">
        <div><small>Collected</small><b>${vnd(L.collected)}</b></div>
        <div><small>Paid from wallet</small><b>${vnd(L.fromWallet)}</b></div>
        <div><small>Total trip spend</small><b>${vnd(L.spent)}</b></div></div>
      <div class="wallet-actions"><button class="btn primary" data-act="add-expense">＋ Expense</button><button class="btn" data-act="add-money">＋ Add money</button></div>
    </section>
    <div class="tabs"><div class="seg full" role="tablist">${[['overview', 'Overview'], ['activity', 'Activity'], ['settle', 'Settle up']].map(([k, l]) =>
      `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}</div></div>
    <div id="tab-body" class="stack"></div>`;
  renderTab();
}
function renderTab() {
  document.querySelectorAll('[data-act="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  destroyCharts();
  const body = $('#tab-body'); if (!body) return;
  ({ overview: renderOverview, activity: renderActivity, settle: renderSettle })[state.tab](body);
}

function resultPill(n) {
  return n > 0 ? `<span class="pill pos">To be refunded ${vnd(n)}</span>` : n < 0 ? `<span class="pill neg">To pay ${vnd(-n)}</span>` : '<span class="pill">Settled</span>';
}
const guideSteps = `<ol class="guide">
  <li><b>Add money</b><span>Everyone puts funds into the shared wallet.</span></li>
  <li><b>Add expenses</b><span>Pay from the wallet or from a pocket. Mark each as shared or personal.</span></li>
  <li><b>Settle up</b><span>See who is <em class="pos">to be refunded</em> and who is <em class="neg">to pay</em>.</span></li></ol>
  <p class="hint">Result = put in + paid out of pocket − your share of expenses.</p>`;
const tipSeen = () => { try { return localStorage.getItem('tw_tip') === '1'; } catch { return false; } };
function renderOverview(body) {
  const d = state.d, L = ledger(d);
  body.innerHTML = `${tipSeen() ? '' : `<div class="card tip"><div class="card-head"><h3>How it works</h3><button class="link" data-act="tip-hide">Got it</button></div>${guideSteps}</div>`}
    <div class="card"><div class="card-head"><h3>Travelers</h3><button class="link" data-act="add-traveler">＋ Add</button></div>
      <div class="list">${d.travelers.map((p) => `
        <div class="member" data-act="member" data-id="${p.id}" style="cursor:pointer">${avatar(p.name)}
          <div><div class="name">${esc(p.name)}</div>
            <div class="sub"><span>Put in ${vnd(L.contributed[p.id])}</span><span>Share ${vnd(L.share[p.id])}</span>${L.paid[p.id] ? `<span>Paid ${vnd(L.paid[p.id])} out of pocket</span>` : ''}</div></div>
          <div class="res">${resultPill(L.net[p.id])}</div></div>`).join('')}</div>
      <p class="hint" style="margin-top:6px"><b class="pos">To be refunded</b> = put in more than their share · <b class="neg">To pay</b> = share is more than they put in</p></div>
    ${d.expenses.length ? `<div class="two">
      <div class="card"><div class="card-head"><h3>By category</h3></div><div class="chart"><canvas id="c-cat" role="img" aria-label="Spending by category"></canvas></div><div class="legend" id="legend"></div></div>
      <div class="card"><div class="card-head"><h3>Per day</h3></div><div class="chart" style="height:260px"><canvas id="c-day" role="img" aria-label="Spending per day"></canvas></div></div></div>` : ''}`;
  if (d.expenses.length) drawCharts();
}

function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function drawCharts() {
  destroyCharts();
  const d = state.d; if (!d || !$('#c-cat')) return;
  Chart.defaults.font.family = FONT; Chart.defaults.color = cssVar('--ink-2');
  const byCat = {}, byDay = {};
  d.expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; byDay[e.date] = (byDay[e.date] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), total = cats.reduce((a, [, v]) => a + v, 0);
  charts.push(new Chart($('#c-cat'), { type: 'doughnut',
    data: { labels: cats.map(([k]) => CATS[k].label), datasets: [{ data: cats.map(([, v]) => v), backgroundColor: cats.map(([k]) => CATS[k].color), borderColor: cssVar('--surface'), borderWidth: 3 }] },
    options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${vnd(c.parsed)}` } } } } }));
  $('#legend').innerHTML = cats.map(([k, v]) => `<div><i style="background:${CATS[k].color}"></i>${CATS[k].label}<b>${vnd(v)}</b><span class="faint sm" style="width:40px;text-align:right">${Math.round((v / total) * 100)}%</span></div>`).join('');
  const days = Object.keys(byDay).sort();
  const axis = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : v);
  charts.push(new Chart($('#c-day'), { type: 'bar',
    data: { labels: days.map((x) => dmy(x).slice(0, 5)), datasets: [{ data: days.map((x) => byDay[x]), backgroundColor: cssVar('--accent'), borderRadius: 6, maxBarThickness: 36 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${vnd(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: cssVar('--line') }, border: { display: false }, ticks: { callback: axis }, beginAtZero: true } } } }));
}

function renderActivity(body) {
  body.innerHTML = `<div class="card"><div class="tools">
      <div class="seg">${[['all', 'All'], ['in', 'Money in'], ['shared', 'Shared'], ['personal', 'Personal']].map(([k, l]) => `<button data-act="filter" data-f="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</div>
      <input class="input" id="q" type="search" placeholder="Search" value="${esc(state.q)}" aria-label="Search activity"></div>
    <div id="act"></div></div>`;
  drawActivity();
}
function drawActivity() {
  const d = state.d, W = d.wallet_id, box = $('#act'); if (!box) return;
  const q = state.q.trim().toLowerCase();
  let items = [
    ...d.contributions.map((c) => ({ kind: 'in', date: c.date, id: c.id, c })),
    ...d.expenses.map((e) => ({ kind: isPersonal(d, e) ? 'personal' : 'shared', date: e.date, id: e.id, e })),
  ];
  const any = items.length;
  if (state.filter !== 'all') items = items.filter((i) => i.kind === state.filter);
  if (q) items = items.filter((i) => (i.c ? `${nameOf(d, i.c.traveler_id)} ${i.c.note}` : `${i.e.title} ${i.e.notes} ${CATS[i.e.category].label} ${nameOf(d, i.e.paid_by)}`).toLowerCase().includes(q));
  if (!items.length) {
    box.innerHTML = `<div class="empty"><div class="big">🧾</div><h3>${any ? 'Nothing matches' : 'No activity yet'}</h3>
      <p>${any ? 'Try a different filter.' : 'Add money to the wallet or record an expense.'}</p></div>`;
    return;
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const spentOn = {}; items.forEach((i) => { if (i.e) spentOn[i.date] = (spentOn[i.date] || 0) + i.e.amount; });
  let html = '', day = null;
  for (const it of items) {
    if (it.date !== day) {
      day = it.date;
      html += `<div class="day"><span>${dmy(day)}</span><span>${spentOn[day] ? `${vnd(spentOn[day])} spent` : ''}</span></div>`;
    }
    if (it.c) {
      html += `<button class="act" data-act="edit-money" data-id="${it.id}"><span class="tile" style="background:var(--pos-soft)">💰</span>
        <span><div class="t">${esc(nameOf(d, it.c.traveler_id))} added money</div><div class="s">${esc(it.c.note || 'Wallet contribution')}</div></span>
        <span class="a pos">+${vnd(it.c.amount)}</span></button>`;
    } else {
      const e = it.e, c = CATS[e.category];
      const scope = isPersonal(d, e) ? `For ${esc(nameOf(d, e.split_among[0]))}` : e.split_among.length === d.travelers.length ? 'Shared · everyone' : `Shared · ${e.split_among.length} people`;
      html += `<button class="act" data-act="edit-expense" data-id="${e.id}"><span class="tile" style="background:${c.color}26">${c.icon}</span>
        <span><div class="t">${esc(e.title || c.label)}${e.has_receipt ? ' 📎' : ''}</div><div class="s">${e.paid_by === W ? 'Paid from wallet' : `Paid by ${esc(nameOf(d, e.paid_by))}`} · ${scope}</div></span>
        <span class="a">−${vnd(e.amount)}</span></button>`;
    }
  }
  box.innerHTML = html;
}

function planText(d, L) {
  const lines = [`${d.trip.name} — settlement`, `Wallet balance: ${vnd(L.balance)}`, ''];
  if (!L.transfers.length) lines.push('Everyone is settled. No payments needed.');
  L.transfers.forEach((x, i) => lines.push(`${i + 1}. ${nameOf(d, x.from)} pays ${nameOf(d, x.to)} ${vnd(x.amount)}`));
  return lines.join('\n');
}
function renderSettle(body) {
  const d = state.d, L = ledger(d);
  if (!d.expenses.length && !d.contributions.length) {
    body.innerHTML = '<div class="card empty"><div class="big">🤝</div><h3>Nothing to settle yet</h3><p>Once money and expenses are recorded, the simplest payment plan appears here.</p></div>';
    return;
  }
  body.innerHTML = `
    <div class="card"><small class="muted">Remaining wallet balance</small>
      <div class="num ${L.balance < 0 ? 'neg' : ''}" style="font-size:36px;font-weight:700;letter-spacing:-.03em">${vnd(L.balance)}</div>
      <p class="muted sm">${L.balance > 0 ? 'Cash still in the wallet — it is returned to travelers in the plan below.' : L.balance < 0 ? 'The wallet paid more than it collected — the plan below covers the shortfall.' : 'The wallet is exactly used up.'}</p></div>
    <div class="card"><div class="card-head"><h3>Settlement plan</h3><span class="pill">${L.transfers.length} payment${L.transfers.length === 1 ? '' : 's'}</span></div>
      ${L.transfers.length ? `<div class="list">${L.transfers.map((x, i) => `<div class="step"><span class="n">${i + 1}</span>
        <span class="who"><b>${esc(nameOf(d, x.from))}</b> pays <b>${esc(nameOf(d, x.to))}</b></span><span class="amt">${vnd(x.amount)}</span></div>`).join('')}</div>`
        : '<p class="muted">Everyone is square — no payments needed. 🎉</p>'}
      <div class="actions" style="justify-content:flex-start;margin-top:14px"><button class="btn primary" data-act="copy-plan">Copy plan</button>
        <button class="btn" data-act="export-pdf">PDF</button><button class="btn" data-act="export-xlsx">Excel</button></div></div>
    <div class="card"><div class="card-head"><h3>Final balances</h3></div>
      <div class="legend-row"><span class="pill pos">To be refunded</span><span class="muted sm">put in more than their share</span>
        <span class="pill neg">To pay</span><span class="muted sm">share is more than they put in</span></div>
      <div class="result h"><span>Traveler</span><span>Put in</span><span>Share</span><span>Paid</span><span>Result</span></div>
      ${d.travelers.map((p) => `<div class="result"><span>${esc(p.name)}</span><span data-l="Put in">${vnd(L.contributed[p.id])}</span><span data-l="Share">${vnd(L.share[p.id])}</span>
        <span data-l="Paid">${vnd(L.paid[p.id])}</span><span data-l="Result" class="rescell ${L.net[p.id] > 0 ? 'pos' : L.net[p.id] < 0 ? 'neg' : ''}"><b>${L.net[p.id] > 0 ? '+' : ''}${vnd(L.net[p.id])}</b><em>${L.net[p.id] > 0 ? 'To be refunded' : L.net[p.id] < 0 ? 'To pay' : 'Settled'}</em></span></div>`).join('')}
      <p class="hint">Result = put in + paid out of pocket − share of expenses</p></div>`;
}

/* ---------- forms ---------- */
function bindMoney(input) {
  input.addEventListener('input', () => { const n = parseMoney(input.value); input.value = n ? n.toLocaleString('en-US') : ''; });
}
const submitGuard = (form, errSel, fn) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button[type=submit]', form); btn.disabled = true; $(errSel).textContent = '';
  try { await fn(); } catch (ex) { $(errSel).textContent = ex.message; btn.disabled = false; }
});

function tripForm(trip) {
  const o = openModal(`<h2>${trip ? 'Edit trip' : 'New trip'}</h2><form id="f" novalidate>
    <div class="field"><label for="t-name">Trip name</label><input class="input" id="t-name" maxlength="100" placeholder="Đà Lạt weekend" value="${esc(trip?.name)}"></div>
    <div class="field"><label for="t-dest">Destination</label><input class="input" id="t-dest" maxlength="100" value="${esc(trip?.destination)}"></div>
    <div class="row2"><div class="field"><label for="t-s">Start</label><input class="input" id="t-s" type="date" value="${trip?.start_date || ''}"></div>
      <div class="field"><label for="t-e">End</label><input class="input" id="t-e" type="date" value="${trip?.end_date || ''}"></div></div>
    <div class="field"><label for="t-b">Planned budget <span class="faint">(optional)</span></label><div class="money"><input class="input" id="t-b" inputmode="numeric" value="${trip?.budget ? trip.budget.toLocaleString('en-US') : ''}"></div></div>
    ${trip ? '' : `<div class="field"><label for="t-p">Travelers</label><input class="input" id="t-p" value="${esc(state.user.name)}"><span class="hint">Separate names with commas</span></div>`}
    <p class="err" id="err" role="alert"></p>
    <div class="actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit">${trip ? 'Save' : 'Create trip'}</button></div></form>`);
  bindMoney($('#t-b', o));
  submitGuard($('#f', o), '#err', async () => {
    const body = { name: $('#t-name').value, destination: $('#t-dest').value, start_date: $('#t-s').value, end_date: $('#t-e').value, budget: parseMoney($('#t-b').value) };
    if (!trip) body.travelers = $('#t-p').value.split(',').map((x) => x.trim()).filter(Boolean);
    const r = trip ? await api('PUT', `/api/trips/${trip.id}`, body) : await api('POST', '/api/trips', body);
    closeModal();
    if (trip) { state.d = r; renderTrip(); toast('Saved'); } else location.hash = `#/trip/${r.trip.id}`;
  });
}

const amountField = (value) => `<div class="field"><label for="m-amt">Amount</label><div class="money"><input class="input" id="m-amt" inputmode="numeric" placeholder="0" value="${value ? value.toLocaleString('en-US') : ''}"></div>
  <div class="quick">${[100000, 500000, 1000000, 5000000].map((v) => `<button type="button" data-add="${v}">+${shortMoney(v)}</button>`).join('')}<button type="button" data-add="0">Clear</button></div></div>`;
function bindAmount(o, onChange = () => {}) {
  const inp = $('#m-amt', o); bindMoney(inp); inp.addEventListener('input', onChange);
  o.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const v = Number(b.dataset.add); inp.value = v ? (parseMoney(inp.value) + v).toLocaleString('en-US') : ''; onChange(); inp.focus();
  }));
}
const dayLinks = '<button type="button" class="link sm" data-day="0">Today</button> · <button type="button" class="link sm" data-day="-1">Yesterday</button>';
function bindDays(o) {
  o.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const t = new Date(); t.setDate(t.getDate() + Number(b.dataset.day)); $('#m-date').value = t.toLocaleDateString('sv');
  }));
}

function moneyForm(c) {
  const d = state.d;
  const o = openModal(`<h2>${c ? 'Edit contribution' : 'Add money to wallet'}</h2><form id="f" novalidate>
    <div class="field"><label for="m-who">From</label><select class="input" id="m-who">${d.travelers.map((p) => `<option value="${p.id}" ${c?.traveler_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    ${amountField(c?.amount)}
    <div class="field"><label for="m-date">Date ${dayLinks}</label><input class="input" id="m-date" type="date" value="${c?.date || today()}"></div>
    <div class="field"><label for="m-note">Note <span class="faint">(optional)</span></label><input class="input" id="m-note" maxlength="200" placeholder="Trip fund" value="${esc(c?.note)}"></div>
    <p class="err" id="err" role="alert"></p>
    <div class="actions">${c ? '<button type="button" class="btn danger spacer" id="del">Delete</button>' : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit">${c ? 'Save' : 'Add money'}</button></div></form>`);
  bindAmount(o); bindDays(o);
  if (c) $('#del', o).addEventListener('click', guard(async () => {
    if (!(await confirmBox('Delete contribution?', 'This changes the wallet balance and the settlement.'))) return;
    await api('DELETE', `/api/contributions/${c.id}`); await loadTrip(d.trip.id, true); toast('Deleted');
  }));
  submitGuard($('#f', o), '#err', async () => {
    const body = { traveler_id: Number($('#m-who').value), amount: parseMoney($('#m-amt').value), date: $('#m-date').value, note: $('#m-note').value };
    if (c) await api('PUT', `/api/contributions/${c.id}`, body); else await api('POST', `/api/trips/${d.trip.id}/contributions`, body);
    closeModal(); await loadTrip(d.trip.id, true); toast(c ? 'Saved' : 'Money added');
  });
}

function expenseForm(e, dup = false) {
  const d = state.d, L = ledger(d), edit = !!e && !dup, W = d.wallet_id;
  let cat = e?.category || 'food';
  let kind = e && isPersonal(d, e) ? 'personal' : 'shared';
  const split = new Set(e && !isPersonal(d, e) ? e.split_among : d.travelers.map((p) => p.id));
  const personFor = e && isPersonal(d, e) ? e.split_among[0] : d.travelers[0].id;
  let receipt; // undefined = keep, null = remove, object = new file
  const payer = e ? (e.paid_by === W ? 'wallet' : e.paid_by) : (L.collected > 0 ? 'wallet' : d.travelers[0].id);
  const o = openModal(`<h2>${edit ? 'Edit expense' : dup ? 'Duplicate expense' : 'Add expense'}</h2><form id="f" novalidate>
    ${amountField(e?.amount)}
    <div class="field"><label for="m-title">What for</label><input class="input" id="m-title" maxlength="120" placeholder="Dinner at Bún Chả Hương Liên" value="${esc(e?.title)}"></div>
    <div class="field"><span class="label">Category</span><div class="cats">${Object.entries(CATS).map(([k, c]) => `<button type="button" class="cat" data-cat="${k}" aria-pressed="${k === cat}"><span>${c.icon}</span>${c.label}</button>`).join('')}</div></div>
    <div class="row2"><div class="field"><label for="m-date">Date ${dayLinks}</label><input class="input" id="m-date" type="date" value="${(edit && e.date) || today()}"></div>
      <div class="field"><label for="m-paid">Paid from</label><select class="input" id="m-paid"><option value="wallet" ${payer === 'wallet' ? 'selected' : ''}>👛 Group wallet</option>
        ${d.travelers.map((p) => `<option value="${p.id}" ${payer === p.id ? 'selected' : ''}>${esc(p.name)} (own pocket)</option>`).join('')}</select></div></div>
    <div class="field"><span class="label">This expense is</span>
      <div class="seg full"><button type="button" data-kind="shared" aria-pressed="${kind === 'shared'}">Shared</button><button type="button" data-kind="personal" aria-pressed="${kind === 'personal'}">Personal</button></div></div>
    <div class="field" id="shared-box"><span class="label">Split between <button type="button" class="link sm" id="all">Everyone</button></span>
      <div class="chips">${d.travelers.map((p) => `<button type="button" class="chip" data-p="${p.id}" aria-pressed="${split.has(p.id)}">${esc(p.name)}</button>`).join('')}</div>
      <span class="hint" id="each"></span></div>
    <div class="field" id="personal-box"><label for="m-for">For</label><select class="input" id="m-for">${d.travelers.map((p) => `<option value="${p.id}" ${p.id === personFor ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="m-notes">Notes <span class="faint">(optional)</span></label><textarea class="input" id="m-notes" maxlength="1000">${esc(e?.notes)}</textarea></div>
    <div class="field"><label for="m-file">Receipt <span class="faint">(optional)</span></label>
      <div id="cur" ${edit && e?.has_receipt ? '' : 'hidden'} class="sm muted">📎 ${esc(e?.receipt_name)} · <button type="button" class="link sm" id="rm">Remove</button></div>
      <input class="input" id="m-file" type="file" accept="image/*,application/pdf"></div>
    <p class="err" id="err" role="alert"></p>
    <div class="actions">${edit ? '<button type="button" class="btn danger spacer" id="del">Delete</button>' : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit">${edit ? 'Save' : 'Add expense'}</button></div></form>`);
  const sync = () => {
    $('#shared-box', o).hidden = kind !== 'shared'; $('#personal-box', o).hidden = kind !== 'personal';
    o.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    const amt = parseMoney($('#m-amt', o).value);
    $('#each', o).textContent = kind === 'shared' && split.size && amt ? `≈ ${vnd(amt / split.size)} each` : '';
  };
  bindAmount(o, sync); bindDays(o); sync();
  o.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    cat = b.dataset.cat; o.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  o.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; sync(); }));
  o.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.p); if (split.has(id)) split.delete(id); else split.add(id);
    b.setAttribute('aria-pressed', String(split.has(id))); sync();
  }));
  $('#all', o).onclick = () => { d.travelers.forEach((p) => split.add(p.id)); o.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', 'true')); sync(); };
  $('#rm', o).onclick = () => { receipt = null; $('#cur', o).hidden = true; };
  $('#m-file', o).addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) { receipt = undefined; return; }
    if (f.size > 5 * 1024 * 1024) { $('#err', o).textContent = 'Receipt must be smaller than 5 MB'; ev.target.value = ''; return; }
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
    receipt = { name: f.name, type: f.type, data }; $('#cur', o).hidden = true;
  });
  if (edit) $('#del', o).addEventListener('click', guard(async () => {
    if (!(await confirmBox('Delete this expense?', 'This cannot be undone.'))) return;
    await api('DELETE', `/api/expenses/${e.id}`); await loadTrip(d.trip.id, true); toast('Deleted');
  }));
  submitGuard($('#f', o), '#err', async () => {
    const paid = $('#m-paid').value;
    const body = { amount: parseMoney($('#m-amt').value), title: $('#m-title').value, category: cat, date: $('#m-date').value,
      paid_by: paid === 'wallet' ? 'wallet' : Number(paid), notes: $('#m-notes').value,
      split_among: kind === 'personal' ? [Number($('#m-for').value)] : [...split] };
    if (receipt !== undefined) body.receipt = receipt;
    if (edit) await api('PUT', `/api/expenses/${e.id}`, body); else await api('POST', `/api/trips/${d.trip.id}/expenses`, body);
    closeModal(); await loadTrip(d.trip.id, true); toast(edit ? 'Saved' : 'Expense added');
  });
}

function memberForm(p) {
  const d = state.d;
  const o = openModal(`<h2>${p ? 'Traveler' : 'Add traveler'}</h2><form id="f"><div class="field"><input class="input" id="n" maxlength="60" aria-label="Name" value="${esc(p?.name)}"></div>
    <p class="err" id="err" role="alert"></p>
    <div class="actions">${p ? '<button type="button" class="btn danger spacer" id="rm-p">Remove</button>' : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  if (p) $('#rm-p', o).addEventListener('click', async () => {
    if (!(await confirmBox(`Remove ${p.name}?`, 'They will be taken out of the trip.', 'Remove'))) return;
    try { await api('DELETE', `/api/trips/${d.trip.id}/travelers/${p.id}`); await loadTrip(d.trip.id, true); } catch (ex) { toast(ex.message); }
  });
  submitGuard($('#f', o), '#err', async () => {
    if (p) await api('PUT', `/api/trips/${d.trip.id}/travelers/${p.id}`, { name: $('#n').value });
    else await api('POST', `/api/trips/${d.trip.id}/travelers`, { name: $('#n').value });
    closeModal(); await loadTrip(d.trip.id, true);
  });
}

/* ---------- exports ---------- */
function exportExcel() {
  const d = state.d, L = ledger(d), X = XLSX, t = d.trip;
  const wb = X.utils.book_new();
  const add = (name, rows, widths, moneyCols = []) => {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const range = X.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= range.e.r; r++) for (const c of moneyCols) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = '"₫"#,##0';
    }
    X.utils.book_append_sheet(wb, ws, name);
  };
  add('Summary', [['Trip', t.name], ['Destination', t.destination], ['Dates', dates(t)], [], ['Collected (VND)', L.collected], ['Paid from wallet (VND)', L.fromWallet],
    ['Wallet balance (VND)', L.balance], ['Total trip spend (VND)', L.spent]], [26, 28], [1]);
  add('Travelers', [['Traveler', 'Put in (VND)', 'Share (VND)', 'Paid out of pocket (VND)', 'Result (VND)'],
    ...d.travelers.map((p) => [p.name, L.contributed[p.id], L.share[p.id], L.paid[p.id], L.net[p.id]])], [22, 16, 16, 24, 16], [1, 2, 3, 4]);
  add('Settlement', [['From', 'To', 'Amount (VND)'], ...L.transfers.map((x) => [nameOf(d, x.from), nameOf(d, x.to), x.amount])], [22, 22, 16], [2]);
  add('Contributions', [['Date', 'Traveler', 'Amount (VND)', 'Note'],
    ...[...d.contributions].sort((a, b) => a.date.localeCompare(b.date)).map((c) => [c.date, nameOf(d, c.traveler_id), c.amount, c.note])], [12, 22, 16, 30], [2]);
  add('Expenses', [['Date', 'Title', 'Category', 'Amount (VND)', 'Paid from', 'For', 'Notes'],
    ...[...d.expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.title, CATS[e.category].label, e.amount,
      e.paid_by === d.wallet_id ? 'Wallet' : nameOf(d, e.paid_by), e.split_among.map((i) => nameOf(d, i)).join(', '), e.notes])], [12, 32, 14, 16, 18, 28, 32], [3]);
  X.writeFile(wb, `${fileSafe(t.name)}_wallet.xlsx`);
}

async function exportPdf() {
  const d = state.d, L = ledger(d), t = d.trip;
  toast('Preparing PDF…');
  const kp = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  const blocks = [
    `<h1>${esc(t.name)}</h1><div style="color:#6e6e73">${esc([t.destination, dates(t)].filter(Boolean).join(' · '))}</div>
     <div class="kp">${kp('Wallet balance', vnd(L.balance))}${kp('Collected', vnd(L.collected))}${kp('Paid from wallet', vnd(L.fromWallet))}${kp('Trip spend', vnd(L.spent))}</div>`,
    `<h2>Settlement plan</h2><table>${L.transfers.length ? L.transfers.map((x, i) => `<tr><td>${i + 1}. <b>${esc(nameOf(d, x.from))}</b> pays <b>${esc(nameOf(d, x.to))}</b></td><td class="r">${vnd(x.amount)}</td></tr>`).join('')
      : '<tr><td>Everyone is settled — no payments needed.</td></tr>'}</table>`,
    `<h2>Travelers</h2><table><tr><th>Name</th><th class="r">Put in</th><th class="r">Share</th><th class="r">Paid</th><th class="r">Result</th></tr>${d.travelers.map((p) =>
      `<tr><td>${esc(p.name)}</td><td class="r">${vnd(L.contributed[p.id])}</td><td class="r">${vnd(L.share[p.id])}</td><td class="r">${vnd(L.paid[p.id])}</td><td class="r"><b>${vnd(L.net[p.id])}</b></td></tr>`).join('')}</table>`,
  ];
  const rows = [...d.contributions.map((c) => ({ date: c.date, t: `${nameOf(d, c.traveler_id)} added money`, s: c.note, a: `+${vnd(c.amount)}` })),
    ...d.expenses.map((e) => ({ date: e.date, t: e.title || CATS[e.category].label, s: `${e.paid_by === d.wallet_id ? 'Wallet' : nameOf(d, e.paid_by)} · ${CATS[e.category].label}`, a: `−${vnd(e.amount)}` }))]
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < rows.length; i += 14) {
    blocks.push(`${i === 0 ? '<h2>Activity</h2>' : ''}<table><tr><th style="width:70px">Date</th><th>Description</th><th class="r">Amount</th></tr>${rows.slice(i, i + 14).map((r) =>
      `<tr><td>${dmy(r.date)}</td><td><b>${esc(r.t)}</b><div style="color:#6e6e73;font-size:10px">${esc(r.s || '')}</div></td><td class="r">${r.a}</td></tr>`).join('')}</table>`);
  }
  const root = document.createElement('div'); root.className = 'rpt';
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
    const n = pdf.getNumberOfPages();
    for (let p = 1; p <= n; p++) { pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(`Travel Wallet · ${new Date().toLocaleDateString('en-GB')} · ${p}/${n}`, W / 2, H - 6, { align: 'center' }); }
    pdf.save(`${fileSafe(t.name)}_wallet.pdf`);
  } finally { root.remove(); }
}

/* ---------- events ---------- */
const actions = {
  home: () => { if (location.hash) location.hash = ''; else render(); },
  theme: () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ts_theme', next); } catch { /* ignore */ }
    document.querySelectorAll('[data-act="theme"]').forEach((b) => { b.textContent = themeIcon(); });
    if (state.d && state.tab === 'overview') drawCharts();
  },
  mode: () => { state.mode = state.mode === 'login' ? 'register' : 'login'; render(); },
  logout: guard(async () => { await api('POST', '/api/auth/logout', {}); state.user = null; state.d = null; location.hash = ''; render(); }),
  open: (el) => { location.hash = `#/trip/${el.dataset.id}`; },
  'new-trip': () => tripForm(),
  demo: guard(async () => { const r = await api('POST', '/api/demo', {}); location.hash = `#/trip/${r.trip.id}`; }),
  close: closeModal,
  help: () => openModal(`<h2>How it works</h2>${guideSteps}<div class="actions"><button class="btn primary" data-act="close">Got it</button></div>`),
  'tip-hide': () => { try { localStorage.setItem('tw_tip', '1'); } catch { /* ignore */ } if (state.d) renderTab(); },
  tab: (el) => { state.tab = el.dataset.tab; renderTab(); },
  filter: (el) => { state.filter = el.dataset.f; renderActivity($('#tab-body')); },
  'add-expense': () => expenseForm(),
  'add-money': () => moneyForm(),
  'add-traveler': () => memberForm(),
  member: (el) => memberForm(state.d.travelers.find((x) => x.id === Number(el.dataset.id))),
  'edit-expense': (el) => expenseForm(state.d.expenses.find((x) => x.id === Number(el.dataset.id))),
  'edit-money': (el) => moneyForm(state.d.contributions.find((x) => x.id === Number(el.dataset.id))),
  'copy-plan': guard(async () => { await navigator.clipboard.writeText(planText(state.d, ledger(state.d))); toast('Plan copied'); }),
  'export-pdf': guard(async () => { closeMenus(); await exportPdf(); }),
  'export-xlsx': guard(async () => { closeMenus(); exportExcel(); toast('Excel downloaded'); }),
  menu: (el) => {
    const had = $('.menu'); closeMenus(); if (had) return;
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = '<button data-act="edit-trip">Edit trip</button><button data-act="export-pdf">Export PDF</button><button data-act="export-xlsx">Export Excel</button><button class="red" data-act="delete-trip">Delete trip</button>';
    el.parentElement.append(m);
  },
  'edit-trip': () => { closeMenus(); tripForm(state.d.trip); },
  'delete-trip': guard(async () => {
    closeMenus();
    if (!(await confirmBox('Delete this trip?', `"${state.d.trip.name}" and all its money, expenses and receipts will be removed.`))) return;
    await api('DELETE', `/api/trips/${state.d.trip.id}`); toast('Trip deleted'); location.hash = '';
  }),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (!e.target.closest('.menu')) closeMenus(); return; }
  actions[el.dataset.act]?.(el);
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { state.q = e.target.value; drawActivity(); } });
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || $('#overlay') || !state.d) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault(); expenseForm();
});
window.addEventListener('hashchange', () => { closeModal(); if (state.user) render(); });

(async function init() {
  render();
  try { state.user = (await api('GET', '/api/auth/me')).user; } catch { state.user = null; }
  render();
})();
