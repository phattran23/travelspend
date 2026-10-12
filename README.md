# Travel Wallet

Track group trip funds, shared expenses and personal payments in one place — then settle up in the fewest payments. Amounts are in Vietnamese Dong (₫).

- **Shared wallet** — everyone's contributions go in; expenses can be paid from the wallet or out of someone's pocket
- **Per traveler** — how much they put in, their share of spending, what they paid personally, and whether they owe or should receive
- **End of trip** — remaining wallet balance and the simplest settlement plan (copy it, or export PDF / Excel)
- Shared and personal expenses, receipts, category and per-day charts, light / dark mode, responsive

## Run locally
Requires Node.js 22.5+ (built-in `node:sqlite`). No `npm install` needed.

```bash
node server.js          # http://localhost:3000   (data in ./data)
```

## Deploy to Cloudflare (Workers + D1 + R2)
```bash
npm install
npx wrangler login
npm run cf:setup        # creates D1 (+ R2 if enabled), applies the schema, deploys
npm run cf:deploy       # later updates
```

## Layout
| Path | What |
|---|---|
| `worker/index.js` | The whole API (auth, trips, wallet, expenses). Runs on Cloudflare **and** locally |
| `worker/schema.sql` | Database schema |
| `server.js` | Local Node adapter: SQLite + files behind the same API |
| `public/` | Front end: `app.js`, `styles.css`, `index.html`, bundled `vendor/` libraries |
| `scripts/cf-setup.mjs` | One-command Cloudflare setup |

## Docs
[Hướng dẫn sử dụng & bảo trì (Tiếng Việt)](docs/HUONG_DAN.md)
