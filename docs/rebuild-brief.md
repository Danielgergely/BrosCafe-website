# Rebuild brief (2026-11-17) — every rebuild agent reads this first

## Goal
Daniel decided (2026-11-17): **rebuild every function of the live React site in design D** (no hybrid), and build
the **After Hours + Delivery backends** too. Everything live on Cloudflare **before 2026-12-01**. The old site
(broscafe.hu on Rackforest) is not touched; both run side by side until the DNS switch.

## Where things are
- Live React app (the reference for behaviour): `frontend/src` (routes `app/AppRoutes.jsx`, features
  `features/{home,loyalty,staff,game,legal}`, i18n `i18n/hu.js` + `en.js`, API client `lib/api.js`).
- API: the Cloudflare Worker port in `worker/src` (same 72 routes and shapes as the FastAPI `backend/`).
  Preview: https://broscafe.gracelabs.dev (env `preview`, D1 with real-ish data, noindex). Deploy is done by the
  lead, not you: `sh worker/scripts/deploy-preview.sh`.
- New design D: `variants/d/` served at `/d/` (shared media `/shared/`). Read `variants/d/SHELL.md` (tokens, look,
  motion, NAV, i18n), `docs/media-picks.md`, `~/.agents/skills/apple-design/SKILL.md`.
- Inventory and parity table: `docs/migration-checklist.md` (Frontend section lists every live route/feature).
- Local: serve `variants/` with `python3 -m http.server <port>` (pick a free port; stop it when done). For `/api`,
  either proxy read-only to the preview or test on the preview after the lead deploys.

## URL plan (D moves from `/d/` to `/` at the end; build under `/d/` now, use relative-to-`/d/` paths like the
existing pages so the final move is one mechanical prefix strip)
| Function | New D page (now) | Final path | Old live path (301 later) |
|---|---|---|---|
| Account | `/d/fiok/` | `/fiok/` | `/account` |
| Magic-link landing | `/d/auth/verify/` | `/auth/verify` (exact, emails link here) | same |
| Card page (inside every Wallet pass) | `/d/card/` + Worker maps `/d/card/*` | `/card/<code>` (exact, never change) | same |
| Staff login | `/d/belepes/` | `/belepes/` | `/login` |
| Scanner | `/d/pult/` (replace mock) | `/pult/` | `/staff` |
| Admin (keep `?tab=` — the iPhone widget opens `/admin?tab=live`) | `/d/admin/` (replace mock) | `/admin/` | `/admin` |
| Game | `/d/jatek/` (teaser + leaderboard become the real game) | `/jatek/` | `/game` |
| Privacy / Help | `/d/adatvedelem/`, `/d/segitseg/` | same without `/d` | `/privacy`, `/help` |
| 404 | `/d/404.html` | `/404.html` | – |

## Ownership (parallel agents — never edit another agent's files; ask the lead in your report instead)
| Agent | Owns |
|---|---|
| Customer | `fiok/`, `auth/`, `card/`, `adatvedelem/`, `segitseg/`, `404.html`, `husegkartya/` (signed-in redirect only), consent banner + `/api/track` in `site.js`, header sign-in state in `shell.js` (the only agent allowed to edit `shell.js`), Worker static mapping for `/d/card/*` in `worker/src/index.ts` |
| Staff | `belepes/`, `pult/` (scanner, vendored QR library) |
| Admin | `admin/` except `admin/after-hours/` and `admin/delivery/` |
| Game | `jatek/`, game assets; must keep the simulation identical to `frontend/src/features/game/runnerSim.js` and `worker/src/game/` |
| Bookings backend | `worker/src/routers/after_hours.ts`, `delivery.ts`, their services, D1 migrations, registration in `worker/src/routes.ts`, `after-hours/`, `delivery/`, `admin/after-hours/`, `admin/delivery/`, `docs/*-api.md` |
Shared files: `i18n.js` — add your strings only inside your own marked block (`// ---- <agent> ----`); `pages.css`
— don't edit; put your CSS in your own file. Each page loads `shell.js`, `i18n.js`, `site.js` like the existing pages.

## Rules
- Same behaviour as live, every feature (check the React source and the i18n texts), restyled in D. HU default + EN.
- Same API calls and auth as the React app (customer token `bros_customer_token`, staff token, `lib/api.js`
  conventions). Don't change API request/response shapes except in the bookings backend.
- No third-party requests at runtime: vendor any library into the repo (licence noted). No cookies/analytics beyond
  what the live site does (consent banner + `/api/track`).
- Don't commit, push or deploy. Don't add test files. Don't touch `backend/`, `frontend/` or the live site.
- Never send real email, never complete a real payment; on the preview, staff/admin login uses credentials the lead
  gives you — don't guess passwords.
- Check your pages at 390×844, 375×667 and 1440×900, HU + EN, no console errors, with agent-browser.
- Report ≤15 lines: what works end to end, what you could not test, shared-file requests for the lead.
