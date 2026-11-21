# CLAUDE.md

Bros Cafe website and loyalty programme. Status, decisions and open items: `PROJECT.md`. Switch plan:
`docs/migration-checklist.md`.

## Two stacks, until switch night

- **New (this branch, `cloudflare-d`)**: static site in `site/` + Cloudflare Worker API in `worker/` (D1, R2, cron).
  Production Worker at https://new.broscafe.hu (the old preview broscafe.gracelabs.dev is retired and redirects there)
  (side by side; moves to broscafe.hu on switch night).
- **Old (live broscafe.hu until the switch)**: React SPA `frontend/` + FastAPI/Mongo `backend/` on the Rackforest VPS,
  deployed by Coolify on every push to `main`. **Never push to `main`** unless Daniel asks. Never push to the
  `emergent` remote. `frontend/` and `backend/` stay as the rollback path until about a week after the switch;
  `backend/data/catalog.json` and `whats_new.json` are still the seed files the Worker reads.

## Commands

```bash
cd worker
npm run dev                                                    # local: serves site/ live + the API, local D1
curl "localhost:8801/__scheduled?cron=*/15+*+*+*+*"            # run the cron once (syncs the admin from .dev.vars, seeds)
npx tsc --noEmit                                               # must pass
sh scripts/deploy-prod.sh                                      # PRODUCTION: only with Daniel's explicit OK
```

Local staff login: `worker/.dev.vars` (ADMIN_EMAIL / ADMIN_PASSWORD, git-ignored). The local D1 lives in
`worker/.wrangler/state`; copy preview data with `wrangler d1 export … --remote` + `execute … --local --file`, and delete
the export afterwards (it holds customer data).

## Architecture

- **Site** (`site/`): plain HTML pages per folder, vanilla JS, no build. `shell.js` builds the header, phone tab bar,
  sheets and footer from one `NAV` config; `site.js` = guest page logic; `home.js` = home; `customer.js` = card/account;
  page folders carry their own JS/CSS. Design contract and how to add a page: `site/SHELL.md` (design "Üveg").
- **Copy**: Hungarian in the HTML/JS, English in `site/i18n.js` keyed by the exact Hungarian string (or `data-en`);
  `customer-texts.js` holds card/account/privacy texts in both languages. Change a Hungarian string → update its key.
  Guests are addressed with "te"; groups (After Hours/Delivery headlines) with "ti".
- **Worker** (`worker/src/`): `routes.ts` mounts `routers/*`; logic in `services/*`; `db.ts` is a small Mongo-like layer
  over D1 (JSON docs), bookings use raw D1 tables (`migrations/`). Ported line by line from `backend/` (see
  `worker/PORTING.md`): keep routes, status codes and `detail` strings compatible: Wallet passes and the rollback
  React app call them. Cron (`jobs.ts`): live sales, TTL cleanups, startup/seed once per version, daily retention.
- **Facts in code**: hours in `shell.js` (`HOURS`) and worker vars; stamps only for coffees + `COFFEE_SPECIALS`
  (`services/drinks.ts`); online booking for After Hours/Delivery behind `BOOKINGS_OPEN` (off in production).
- **Game**: the server replays every run (`worker/src/game/runner.ts`) and must match `site/jatek/runnerSim.js`
  exactly (32-bit integer maths). Change both or neither.
- **Wallet**: `FRONTEND_URL` is baked into every issued pass; never issue passes while it points anywhere but the
  final domain (`APPLE_PASS_CONFIGURED`/`GOOGLE_WALLET_CONFIGURED` stay "false" until switch night).
- **Brand**: olive #68704B, espresso #25251C, ivory #F3EBDD, champagne #C6A875, taupe #BDAA96 (tokens in CSS only).
