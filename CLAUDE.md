# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Bros Cafe website and loyalty programme: a React SPA (`frontend/`), a FastAPI + MongoDB API (`backend/`), deployed as one Docker Compose stack. `DEPLOY.md` is the authoritative operations guide.

## Commands

Frontend (yarn 1, CRA via craco; run from `frontend/`):

```bash
yarn start          # dev server on 0.0.0.0:3000, proxies /api to API_TARGET (default http://127.0.0.1:8001)
yarn build
yarn lint           # eslint src scripts — linting is NOT run by the dev server/build
yarn i18n:check     # en.js/hu.js key parity, unresolved t() keys, dead keys, placeholder mismatches
yarn runner:check   # JS vs Python Coffee Runner simulation parity (needs backend/.venv)
```

Backend (from `backend/`, expects a venv at `backend/.venv`, which `runner:check` also uses):

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8001
python -m app.seed [--products|--content|--force]
python -m app.seed --prices # only prices from catalog.json, even on admin-edited items
pytest                      # pytest.ini forces `-n 2 --dist loadscope` (xdist)
pytest -n 0 path::test      # run serially / a single test (do NOT use -p no:xdist; do not edit addopts)
black / isort / flake8      # available via requirements-dev
```

Full stack: `docker compose --env-file .env.prod -p broscafe-prod up -d --build` (see `.env.deploy.example`). Coolify uses `docker-compose.coolify.yml` (identical but publishes no ports).

## Architecture

- **Single origin is load-bearing.** nginx (`frontend/nginx.conf`) serves the SPA and proxies `/api/` to `backend:8001`; the dev server mirrors this with its proxy, so `REACT_APP_BACKEND_URL` is normally empty. Apple Wallet passes embed `<FRONTEND_URL>/api/wallet`, so `FRONTEND_URL` must never change for an environment once passes are issued, and real passes are never issued from staging (`APPLE_PASS_CONFIGURED=false`).
- **Production only, deployed on push.** A push to `main` rebuilds broscafe.hu via Coolify. There is no staging site, so verify locally before pushing.
- **Backend config:** `backend/app/config.py` is the only place that reads `os.environ`. New settings go there and in `.env.example` / `docker-compose.yml`. `backend/server.py` is just a shim re-exporting `app.main:app`.
- **Backend layout:** `app/main.py` mounts every `app/routers/*` module under `/api`; business logic is in `app/services/`, Mongo collection handles and indexes in `app/db.py`, Wallet pass generation in `app/wallet/` (Apple `.pkpass` + Google Wallet). On startup it ensures indexes, syncs the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, and (if `SEED_ON_STARTUP=true`) seeds content.
- **Content has two sources of truth.** `backend/data/catalog.json` (products, prices as integer HUF) and `backend/data/whats_new.json` are upserted by `id` by `app/seed.py`; items no longer listed are archived, not deleted. Anything saved through the admin dashboard gets `edited_at`, and the seeder skips those items unless `--force` is passed. The dashboard's "Revert to the file version" (`POST /admin/{products|whats-new}/{id}/reset`) hands a single item back to the files.
- **Products have two groupings.** `cat` (fine-grained, e.g. `smoothie`, `bottled`) drives behaviour: `app/services/drinks.py` uses it to decide which drinks earn a loyalty stamp, and bottled drinks are deliberately excluded. `section` (`coffee`/`cold`/`savoury`/`sweet`) is only how the site groups the menu: one homepage row (`MenuRows.jsx`) and one `/menu/:section` tab each. If `section` is unset, `SECTION_OF_CAT` in `config/site.js` derives it. Never merge the two: "cold" mixes stampable smoothies with non-stampable bottles. Menu prices come from the Fruitsys till ("Termék árak"), not the margin spreadsheet, which only has average net prices after discounts.
- **Live sales widget.** `services/live_sales.py` polls Fruitsys (read-only, via `services/fruitsys.py`, plain HTTP — no browser) from a background task started in `main.py`, stores a summary in `live_sales`, and `GET /api/live-sales` serves it to the Scriptable script in `widget/`. Off unless `FRUITSYS_USER`, `FRUITSYS_PASSWORD` and `LIVE_SALES_KEY` are set.
- **Coffee Runner game scoring is server-authoritative.** The client sends the issued seed and the input ticks; `backend/app/game/runner.py` replays the run to compute the score. It is mirrored line for line in `frontend/src/features/game/runnerSim.js` using only 32-bit integer arithmetic (no floats). Any change to either must be made in both, then verified with `yarn runner:check`. A mismatch silently rejects honest scores rather than crashing.
- **Frontend layout:** `src/app/AppRoutes.jsx` and `RouteGuards.jsx` handle routing (customer `/account`; staff `/staff` scanner and `/admin` dashboard). Features live in `src/features/{home,loyalty,staff,game,legal}`, shared UI in `src/components`, and auth/UI contexts in `src/state/`. `src/lib/api.js` is the axios client: it attaches the staff token automatically, while customer calls pass `customerAuth()` explicitly. `@/` aliases `src/`.
- **Copy is i18n-only.** All user-facing text goes in `src/i18n/en.js` and `hu.js` (default language `hu`), with both kept in sync, so run `yarn i18n:check`. Non-copy editable values (contact info, fallbacks such as `stampsRequired`) are in `src/config/site.js`. Live values come from `GET /api/cafe`.
- **Customer auth** is passwordless magic link via Resend (`app/services/email.py`). Without `RESEND_API_KEY`, links only appear in the API log. Customer tokens last 365 days and renew on visit.
- **Brand palette** is strictly olive `#66734A`, cream `#F5F0E6` and white (`src/config/palette.js`, `design_guidelines.json`).

## Repo notes

- `broscafe-loyalty` is a gitlink with no `.gitmodules`. Treat it as external.
- `.emergent/`, `test_result.md`, `memory/PRD.md` and `tests/` are leftovers from the Emergent scaffolding. The PRD describes an early "frontend only" scope that no longer applies, and there is currently no committed test suite.
