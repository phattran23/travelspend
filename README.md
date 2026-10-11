# TravelSpend

Travel budget & expense tracker in Vietnamese Dong (₫). Plan trips, log who paid, split costs, and see where the money goes.

## Features
- Secure sign-up / sign-in (scrypt password hashing, HttpOnly session cookies)
- Multiple trips with VND budgets and optional per-category budgets
- Expenses with category, date, notes, receipt upload and paid-by traveler
- Group splitting and "who pays whom" settlement
- Dashboard: budget ring, category doughnut, trend + forecast, stacked daily spend, calendar heatmap, per-traveler chart
- Export to PDF and Excel
- Light / dark mode, responsive, SF-style typography

## Run locally
Requires Node.js 22.5+ (uses the built-in `node:sqlite`). No `npm install` needed.

```bash
node server.js          # http://localhost:3000
```

| Env var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | SQLite DB + receipts location | `./data` |
| `COOKIE_SECURE` | set `1` when served over HTTPS | off |

## Project layout
- `server.js` — HTTP server, REST API, auth, SQLite
- `public/` — single-page front end (`app.js`, `styles.css`, `index.html`)
- `public/vendor/` — bundled Chart.js, SheetJS, jsPDF, html2canvas
- `data/` — created at runtime (git-ignored)

## Deploying
Host on any Node host with a persistent disk (Render, Railway, Fly.io) and set `DATA_DIR` to the mounted volume.

## Deploy to Cloudflare (Workers + D1 + R2)
The `worker/` folder is a Cloudflare port of `server.js` (same API); `public/` is served as static assets.

```bash
npm install
npx wrangler login
npx wrangler d1 create travelspend            # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create travelspend-receipts
npm run cf:db                                  # create tables in D1
npm run cf:deploy                              # → https://travelspend.<your-subdomain>.workers.dev
```

Local Worker dev: `npx wrangler d1 execute travelspend --local --file=worker/schema.sql && npm run cf:dev`.

## Documentation
- [Hướng dẫn sử dụng & bảo trì (Tiếng Việt)](docs/HUONG_DAN.md)
