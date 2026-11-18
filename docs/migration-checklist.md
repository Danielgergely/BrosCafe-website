# broscafe.hu → Cloudflare: migration checklist

Written 17 Nov 2026 from the code, the preview and public DNS. Deadline: switched and stable before **1 Dec 2026**
(Rackforest VPS is no longer paid from December). Plan and loyalty contract: `docs/cloudflare-migration.md`.

## Summary

The API port is complete: all 72 routes exist in `worker/` with the same paths, auth and response shapes, and the
preview answers public GETs like the live site. What is left is mostly operational (DNS move, production secrets,
Wallet artwork and photos to R2, a real Apple Wallet test, Fruitsys from Cloudflare) plus the new frontend: design D
covers the public pages but has no signed-in state, no scanner, no admin and no game. The recommendation is **two
switches instead of one**: (A) move the API and the *current* React site to Cloudflare on **Sat 21 Nov** after
closing, which leaves nine days with the VPS as a way back; (B) put D at `/` as a frontend-only deploy on
**Fri 27 Nov**, keeping the React pages for account, card, scanner, admin and game behind D's header. After Hours
and Delivery stay "coming soon" until their backends exist.

## At risk for the deadline

| Risk | Why | What reduces it | When we know |
|---|---|---|---|
| Nameserver move for a `.hu` domain | NS is at dns24.hu today; the change goes through the registrar and the .hu registry's check. Until the zone is on Cloudflare the Worker cannot serve broscafe.hu | Start 18 Nov; site keeps pointing at the VPS meanwhile | 19–20 Nov |
| Apple Wallet never ran end to end on the Worker | Signing (node-forge), PEM secrets and 26,520 artwork files in R2 are untested with a real phone | Test with Daniel's own card on a temporary production address before switch A | 20 Nov |
| Fruitsys may block Cloudflare | Never called from a Worker (shared IPs, no User-Agent) | Test from the preview on 18 Nov; fallback: live sales off for a few days, loyalty unaffected | 18 Nov |
| Mail for hello@broscafe.hu | iCloud MX, SPF, DKIM and Resend records must be copied by hand | Export the full zone from dns24, compare record by record before the NS change | 19 Nov |
| D is not a complete site | No account, card, scanner, admin, game, privacy, help, tracking | Keep those as React routes (below); port only the small ones | 26 Nov |
| Rollback window is short | VPS goes on 30 Nov; the plan assumed two weeks | Switch A on 21 Nov gives 9 days; or pay one more month (Daniel) | decision 18 Nov |
| Rackforest notice period unknown | Cancelling on 30 Nov may be too late to avoid December | Check the contract on 18 Nov | 18 Nov |
| `worker/` and `variants/` are not in git | One bad delete loses the port and the new site | Commit on a branch (not `main`: a push to `main` redeploys the live site) | 18 Nov |
| After Hours says "bookable from 1 Dec" | Its API is a mock: a customer could "book" and nothing happens | Ship as "coming soon" with an email request, or hide | decision 18 Nov |

## Decisions (Daniel, 2026-11-17)

1. Two steps, timing still open. Goal: the old and the new site run side by side before the old one is switched off.
2. **No hybrid: rebuild everything in D** (account, card, verify, scanner, admin, game, privacy/help). Brief:
   `docs/rebuild-brief.md`; five agents started 17 Nov. The React-restyle items below are obsolete.
3. After Hours and Delivery go live by December **with real backends** (Stripe, Számlázz.hu, D1).
4. Rackforest is monthly; Daniel checks the cancellation terms. Not blocking.
5. Registrar: **Rackhost** (DNS at dns24.hu).
6. Leave the live site as it is (no hours fix there).
7. `BREAK_EVEN_NET_FT` = **65 000** (set in `wrangler.jsonc` and the Worker default, 17 Nov).
8. Fruitsys from the preview: yes (secrets set on the preview 17 Nov).

---

## Inventory and parity

Verified by reading both code bases and by public GETs on live and preview (17 Nov). "Worker" = `worker/src`.

### API (72 routes on both sides, none missing)

| Area (routes) | Live code | Worker | In D | Left to do |
|---|---|---|---|---|
| Meta: `/api/`, `/api/cafe` (2) | `routers/meta.py` | same; preview already has the right hours, address, Instagram | used by kapcsolat | – |
| Staff login, staff users (4) | `staff_auth.py` | same, bcrypt hashes copied | none | React `/login` kept |
| Magic link, verify, `/customer/me`, change email (4) | `customer_auth.py` | same; same `JWT_SECRET` keeps everyone signed in | sign-up form only | React `/auth/verify`, `/account` kept |
| Members: create, find card, card by code (3) | `members.py` | same | none | React `/card/:code` kept (linked from every pass) |
| Scanner: drinks, lookup, stamp, redeem, free coffee, undo, opening gift (8) | `scan.py` | same incl. wallet push and reward email | mock (`pult/`) | React `/staff` kept |
| Live sales: widget, dashboard, unusual days, posts (6) | `live_sales.py` | same; cron every 15 min | none | Fruitsys test from Cloudflare |
| Track (1) | `track.py` | same | not called | add to D with consent banner |
| Content: products, what's new (3) | `content.py` | same; products identical live vs preview (66) | wired | – |
| Contact (1) | `contact.py` | same (5 per hour, honeypot) | wired | – |
| Game: start, finish, leaderboard, me (4) | `game.py`, `game/runner.py` | same; 3,000 replay cases matched the browser sim | leaderboard only | React `/game` kept |
| Media (1 public + 3 admin) | `/data/media` | R2 `MEDIA` | – | upload the files (no script yet) |
| Wallet: Apple pass, Google link, PassKit web service, hero image (8) | `wallet/` | same code; artwork pre-rendered in R2 | none | artwork upload + real phone test |
| Admin: members, transactions, settings, 7 analytics, products, what's new, media, wallet status (27) | `admin.py` | same | mock (`admin/`) | React `/admin` kept |

Small differences found (none blocks the switch): timestamps that Mongo stored as dates now end in `+00:00`
(`edited_at`, `uploaded_at`); an empty body on all-optional PUTs is 200 instead of 422; a Fruitsys timeout on
`?fresh=1` is a 500 instead of `refresh_failed`; missing static files return the home page with 200 instead of 404.

### Frontend (live React routes)

| Route | What it does | In D today | Plan for the switch |
|---|---|---|---|
| `/` | home | `index.html`, wired to products | D |
| `/menu`, `/menu/:section`, `/product/:id` | menu, product modal, favourites | `etlap/` (no favourites, no day planner) | D + redirects |
| `/whats-new`, `/journal/:id` | posts | `ujdonsagok/` | D + redirects |
| `/contact` | address, hours, form | `kapcsolat/` | D + redirect |
| `/shop` | merch (archived) | – | redirect to `/etlap/` |
| `/loyalty` (`?ref=`, `?welcome=1`) | sign-up; member view | `husegkartya/` sign-up only | D; signed-in visitors go to `/account` |
| `/auth/verify` | magic link → token | – | React kept (linked from emails) |
| `/account` | stamps, tier, invite, Wallet buttons, change email, logout | – | React kept, restyled |
| `/card/:code` | card with QR, Wallet buttons | – | React kept for good (inside every pass) |
| `/login`, `/staff` | staff login, camera scanner (html5-qrcode), manual code | mock `pult/` | React kept, restyled |
| `/admin?tab=` | 14 tabs: live sales, products, journal, photos, 7 analytics, transactions, members, wallet; settings, staff users | mock `admin/` | React kept (the sales widget opens `/admin?tab=live`) |
| `/game` | Coffee Runner, server-scored | `jatek/` teaser + leaderboard, links to `/game` | React kept, restyled |
| `/privacy`, `/help` | legal text, help form | footer links to React | port into D |
| language switch (`bros-lang`) | HU default, EN | same key | – |
| consent banner + `/api/track` | menu/contact page views, wallet_added | missing | port into D |
| 404 | none (home is shown) | none | add a D 404 page |
| PWA manifest (`start_url: /loyalty`) | home-screen icon | no manifest link | keep file, point at `/account` |
| `robots.txt`, `sitemap.xml`, OG image, canonical | none exist today (live `/robots.txt` is 404) | all D pages are `noindex` | see SEO |

### Jobs, scripts, emails, data, DNS

| Item | Today | On Cloudflare | Left |
|---|---|---|---|
| Fruitsys poll (every 15 min, Mon–Sat 06–20) | loop in the API process | cron `*/15` | test from Cloudflare |
| Forecast snapshots 9/12/15, weather, post effects | inside the poll | ported | – |
| TTL cleanup (magic links, contact log, wallet registrations) | Mongo TTL indexes | cron every 15 min | – |
| Startup: admin sync, seed from `catalog.json` / `whats_new.json` | every boot | once per deployed version, up to 15 min after deploy | – |
| `python -m app.seed --force / --prices` | by hand on the server | **no equivalent** | small admin-only tool, after cut-over |
| Nightly `mongodump` 03:30 | on the VPS | **no equivalent** | D1 export routine |
| Widget `widget/bros-live-sales.js` | `broscafe.hu/api/live-sales` + key | works unchanged with the same `LIVE_SALES_KEY` | – |
| `yarn runner:check` | browser sim vs Python | does not cover the TS replay | point it at the TS, after cut-over |
| Emails via Resend (4): magic link, reward ready, referral earned, contact message | `services/email.py` | same subjects and payload | `RESEND_API_KEY` secret, one real send |
| Data (13 Nov): 97 members, 597 transactions, 86 wallet registrations, 97 products, 44 sales days, 399 game runs, 264 events, 2 staff; 36 MB photos | MongoDB 4.4, `/data/media` | D1 (19 tables = 19 collections), R2 | final import |
| Certificates | `/srv/broscafe/certs` (PEM files) | mTLS cert uploaded; signing needs PEM **secrets** | convert and set |
| DNS (public lookup 17 Nov) | NS dns24.hu; A apex + `www` + `coolify` → 92.119.123.141; MX iCloud ×2; TXT SPF `include:icloud.com`; TXT `apple-domain=…`; CNAME `sig1._domainkey` (iCloud DKIM); TXT `_dmarc` `p=none`; TXT `resend._domainkey`; CNAME `send` → `send.forge.rmta.net`; no AAAA, CAA or DNSSEC | same records on Cloudflare | get the full zone from dns24: a lookup cannot list everything |
| `www.broscafe.hu` | serves the site (200, no redirect) | 301 to the apex | redirect rule |
| Deploy | push to `main` → Coolify | `wrangler deploy` by hand | remove the Coolify webhook after the switch |

---

## Checklist

**CP** = critical path. Owner in brackets. Dates are targets.

### Inventory / parity

- [ ] **CP** 18 Nov [Daniel] Answer the eight decisions above.
- [ ] **CP** 18 Nov [agent stages, Daniel commits] Put `worker/`, `variants/`, `docs/` and `PROJECT.md` in git on a branch. Not `main`: a push there rebuilds the live site.
- [ ] 18 Nov [agent] Delete the stray root files `1440`, `375`, `768` (after Daniel's OK).
- [ ] 19 Nov [Daniel] List what points at broscafe.hu outside the code: printed QR codes in the café (which URL?), Instagram bio link, Google Business Profile, Search Console, the brothers' home-screen icons and widget.
- [ ] 20 Nov [agent] Re-run the public GET comparison live vs production Worker after the dry-run import (`/api/cafe`, `/products`, `/whats-new`, `/game/leaderboard`, status codes of the protected routes).

### Worker / API

- [ ] **CP** 18 Nov [agent] Create production D1 `broscafe` and R2 `broscafe-media` (EU); put the real database id in `wrangler.jsonc`.
- [ ] **CP** 19 Nov [Daniel] Set the 12 production secrets: `JWT_SECRET` (same value as Coolify), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `FRUITSYS_USER`, `FRUITSYS_PASSWORD`, `LIVE_SALES_KEY` (same as the widget), `APPLE_CERTIFICATE`, `APPLE_PRIVATE_KEY`, `APPLE_WWDR_CERTIFICATE` (PEM; the WWDR in `backend/certs` is DER and must be converted), `GOOGLE_ISSUER_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
- [ ] 19 Nov [agent] Compare Coolify's environment with `wrangler.jsonc` vars line by line (Daniel exports it); settle `BREAK_EVEN_NET_FT`.
- [ ] **CP** 19 Nov [agent] Deploy production on a temporary address (`broscafe-prod.gracelabs.dev`) with `FRONTEND_URL=https://broscafe.hu`, for the Wallet test and the rehearsal. Remove the address after switch A.
- [ ] **CP** 18 Nov [agent + Daniel] Fruitsys from Cloudflare: one poll from the preview with the read-only login. If blocked: add a User-Agent; if still blocked, switch without live sales and solve it after.
- [ ] 20 Nov [agent] Routes for `broscafe.hu` in `wrangler.jsonc` prepared, not yet deployed; `www` handled by a redirect rule.
- [ ] 24 Nov [agent] Missing static files should be 404, not the home page (`not_found_handling`), together with the D layout change.
- [ ] 25 Nov [agent] Fruitsys body timeout returns `refresh_failed` again instead of a 500 (staff-only, low priority).

### Data

- [ ] **CP** 18 Nov [agent] Fix `worker/scripts/compare.mjs`: database name as an argument; ignore what the cron changes after an import (`deployed_version` row, re-seeded products, admin sync, expired rows, live-sales poll); fail when an export file is missing.
- [ ] **CP** 18 Nov [agent] Write the photo copy: `/data/media` → R2 under the bare filenames, with a count and checksum check.
- [ ] **CP** 19 Nov [Daniel runs the export, agent the rest] Dry run 1: fresh read-only `mongoexport --jsonArray` of all 19 collections + a tar of `/data/media` → import into production D1 → compare. Target: zero differences in members. Time the whole run.
- [ ] 20 Nov [agent] Dry run 2 with the fixed scripts, as a timed script that will be reused unchanged on switch night.
- [ ] 21 Nov [agent] Final import on switch night (see Cut-over).
- [ ] 23 Nov [agent] Backup routine for D1 and R2: nightly `wrangler d1 export` kept off Cloudflare (iCloud folder), D1 Time Travel as the first resort. Write the restore steps down and try one restore into the preview.
- [ ] 30 Nov [Daniel] Delete the customer-data export in the session scratchpad and any export copies outside the final backup.

### Wallet

- [ ] **CP** 19 Nov [agent] Render the artwork (`worker/scripts/render_wallet_art.py`, 26,520 PNGs) and upload to R2 under `wallet-art/…` in both buckets; spot-check 20 files per tier.
- [ ] **CP** 20 Nov [Daniel] Real phone test on the temporary production address: download Daniel's own Apple pass (it must open and replace the existing card), open the Google Wallet link. This is the first real signature from the Worker.
- [ ] 20 Nov [agent] Validate a downloaded `.pkpass` offline (manifest hashes, signature chain to WWDR) and send a push to a fake device (expect `BadDeviceToken`).
- [ ] **CP** 21 Nov [Daniel] After switch A: stamp Daniel's card on the scanner, the Wallet card updates within a minute; a brother repeats it with an Android card.
- [ ] 23 Nov [agent] `GET /api/admin/wallet/status`: the registration count is still about 86 and the error counters stay flat.
- [ ] 30 Nov [agent] Update `docs/apple-pass-certificate-renewal.md` for Cloudflare (mTLS certificate + three secrets; expiry 3 Oct 2027).

### Jobs / scripts

- [ ] 21 Nov [agent] After switch A: the cron log shows startup, cleanup and the first Fruitsys poll; the 9/12/15 snapshots appear on Mon 23 Nov.
- [ ] 21 Nov [brothers] The iPhone widget still shows today's takings (no change needed if the key is the same).
- [ ] 25 Nov [agent] Replacement for `python -m app.seed --force / --prices`: an admin-only action or a local script against D1.
- [ ] 26 Nov [agent] `yarn runner:check` compares the browser sim with the TypeScript replay instead of Python.
- [ ] 30 Nov [agent] Rewrite `DEPLOY.md` and the commands in `CLAUDE.md` for the Worker; remove the Docker files, `nginx.conf` and `backend/` only after Daniel's OK (keep them in git history).
- [ ] Summer 2027 [agent] School breaks and bridge days now also need `gen_daytypes_data.py` re-run.

### Email / DNS

- [ ] **CP** 18 Nov [Daniel] Add broscafe.hu to Cloudflare; export the full zone from the dns24 panel.
- [ ] **CP** 18 Nov [agent] Copy every record and compare with `dig` against both nameserver sets. Mail records DNS-only: MX ×2, SPF, `apple-domain`, `sig1._domainkey`, `_dmarc`, `resend._domainkey`, `send`. Apex and `www` stay on 92.119.123.141, DNS-only, TTL 300.
- [ ] 18 Nov [Daniel] Resend dashboard: is broscafe.hu still "verified"? The `send` record is a CNAME to `send.forge.rmta.net`, which is unusual; copy it exactly as it is.
- [ ] **CP** 19 Nov [Daniel] Change the nameservers at the registrar to Cloudflare's. Nothing visible changes.
- [ ] **CP** 20 Nov [agent] Zone active on Cloudflare; mail test both ways on hello@broscafe.hu; one magic-link email from the live site arrives and passes SPF/DKIM.
- [ ] 21 Nov [agent] `coolify.broscafe.hu` stays until the VPS goes, then delete.
- [ ] 27 Nov [agent] `_dmarc` is `p=none` today; leave it for the move, tighten later.

### Frontend D

Recommendation: **hybrid**. D serves every public page; the React app stays for the signed-in and staff pages,
served from a renamed shell (`app.html`) for a fixed list of paths, with D's fonts, colours and header. Reasons:
the scanner (camera on iOS Safari), the 14-tab admin and the game's integer simulation are the three things that
are risky to rewrite in two weeks, and they already work against the Worker unchanged.

| Function | Port into D | Keep React + restyle | Choice for 27 Nov |
|---|---|---|---|
| Privacy, help | 0.5–1 day, low risk | – | port |
| Consent banner + track | 0.5 day, low | – | port |
| Signed-in state in D's header | 0.5 day, low | – | port |
| Magic-link verify | 0.5 day | 0 (change the redirect) | keep React |
| Account + card with QR + Wallet buttons | 2–3 days, medium (loyalty core) | 0.5–1 day | keep React; port in December |
| Staff login + scanner | 3–4 days, **high** | 0.5 day | keep React |
| Admin, 14 tabs | 8–12 days, **high** | 0.5–1 day | keep React, no plan to port |
| Game | 2–3 days, **high** (sim parity) | 0.5 day | keep React |
| React shell restyle (Tailwind tokens, fonts, D header via `shell.js`) | – | 1.5 days | do |

Total about 6–7 agent days, 18–26 Nov.

- [ ] **CP** 19 Nov [agent] Move D to the root: strip `/d/` from all files (28 in `index.html`, the `NAV` in `shell.js`, each subpage, CSS), drop `/preview.js` and the preview-only CSS, keep `/shared/`.
- [ ] **CP** 20 Nov [agent] Worker layout: React build's `index.html` renamed to `app.html` and served for `/account`, `/auth/verify`, `/card/*`, `/game`, `/login`, `/staff`, `/admin`; remove the preview script injection; new `deploy-preview.sh`. Preview then shows the final layout at `/`.
- [ ] **CP** 21 Nov [agent] Redirects (301, query kept): `/menu*` → `/etlap/`, `/product/:id` → `/etlap/#id`, `/whats-new` → `/ujdonsagok/`, `/journal/:id` → `/ujdonsagok/#id`, `/contact` → `/kapcsolat/`, `/shop` → `/etlap/`, `/loyalty` → `/husegkartya/` (invite links `?ref=` keep working).
- [ ] **CP** 23 Nov [agent] React side: links to home, menu and loyalty become full page loads to D; verify lands on `/account`; logout lands on `/`; React nav and footer replaced by D's shell.
- [ ] 23 Nov [agent] React restyle with D's tokens and fonts (Tailwind config, `index.css`), checked on account, card, scanner, admin, game at 375 px and desktop.
- [ ] 24 Nov [agent] Port privacy and help (HU + EN texts from `frontend/src/i18n`), consent banner and `/api/track` (menu view, contact view), signed-in state in the header (`bros_customer_token` → `/api/customer/me`), 404 page.
- [ ] 24 Nov [agent] `husegkartya/`: a signed-in visitor is sent to `/account`; the footer staff link goes to `/login`.
- [ ] **CP** 24 Nov [agent] Do not publish the mock `pult/` and `admin/` folders or `SHELL.md`; After Hours and Delivery per decision 3 (no fake booking can be completed).
- [ ] 25 Nov [agent] The two blockers of review 2 (EN headline cut off on phones, clipped cards on short phones) and the too-short contact message error.
- [ ] 25 Nov [agent] Remove variants B and C, `variants/preview.js` and the switcher from the repo and the deploy script (after Daniel's OK).
- [ ] **CP** 26 Nov [Daniel + brothers] Test the preview at `/` on their phones: sign-up, magic link, account, card, add to Wallet (Google only on the preview), scanner with camera, stamp, redeem, undo, admin tabs, game run with a score on the leaderboard, language switch, old links.
- [ ] 26 Nov [brothers] Confirm the unverified claims on the site (delivery radius, reply within a day, weekly game prize, tiers) and the news content.

### SEO

- [ ] 24 Nov [agent] Remove `noindex` from the public D pages (keep it on staff pages); production must not send `X-Robots-Tag` (`PREVIEW` unset).
- [ ] 24 Nov [agent] Per page: canonical, `og:title`, `og:description`, `og:image`, `apple-touch-icon`, manifest link, `<html lang>`.
- [ ] 24 Nov [agent] `robots.txt` and `sitemap.xml` (neither exists today); `/logo512.png`, favicons and `manifest.json` stay at the root (`/logo512.png` is the Google Wallet logo).
- [ ] 27 Nov [agent] After switch B: every old URL in the redirect table answers 301 to the right page; `www` → apex; `http` → `https`.
- [ ] 28 Nov [Daniel] Search Console: submit the sitemap; update the Google Business Profile hours and link, the Instagram bio link.

### Side-by-side phase (from 17 Nov)
- [x] Production Worker `broscafe` on **https://new.broscafe.hu** with a copy of the live data (dry run 1, 17 Nov 15:27).
  Temporary settings in `worker/wrangler.jsonc`: FRONTEND_URL/CORS = new.broscafe.hu, APPLE_PASS_CONFIGURED and
  GOOGLE_WALLET_CONFIGURED = "false" (no pass may embed new.broscafe.hu), route new.broscafe.hu only.
- [ ] Switch night, before the DNS/route change: fresh export + import, then FRONTEND_URL/CORS back to
  https://broscafe.hu, both Wallet flags "true", routes broscafe.hu + www.broscafe.hu (remove new.broscafe.hu),
  `sh worker/scripts/deploy-prod.sh`, then the phone checks below.

### Cut-over A: API + current site to Cloudflare (Sat 21 Nov, after 17:00; fallback Tue 24 Nov after 18:00)

- [ ] **CP** 21 Nov morning [agent] Go/no-go: zone active, dry run 2 clean, Wallet phone test passed, secrets set, artwork and photos in R2.
- [ ] **CP** 17:15 [Daniel] Freeze: the café is closed, so no stamps. The old API has no read-only mode: after the export, stop the Coolify app so nothing new is written there (about 15 minutes without a site).
- [ ] **CP** [Daniel + agent] Final `mongodump` (kept as the backup) and `mongoexport`; tar of `/data/media`.
- [ ] **CP** [agent] Import → photos → compare. Every member must match; any difference stops the switch and Coolify is started again.
- [ ] **CP** [agent] Deploy production with the broscafe.hu routes; replace the apex A record with the Worker custom domain; `www` redirect rule. TLS: Cloudflare issues the certificate when the custom domain is added; check it before announcing.
- [ ] **CP** [Daniel] Check on phones: still signed in without logging in again, account shows the right stamps, magic link arrives and works, staff login, scan Daniel's card, stamp, Wallet card updates, redeem, admin dashboard, live sales, game run.
- [ ] [agent] Remove the temporary production address; tell the brothers it is done.
- [ ] Rollback (minutes): remove the custom domain, put the A records back to 92.119.123.141, start the Coolify app. Stamps made on the new system meanwhile are listed by the compare script and replayed by hand. Use it if members are signed out, stamps are wrong, or Wallet cards do not update and the cause is not found within an hour.

### Cut-over B: design D at `/` (Fri 27 Nov evening; fallback Sat 28 Nov after 17:00)

- [ ] **CP** [agent] Production deploy of the build with D at the root. No data or DNS change.
- [ ] **CP** [Daniel] Same phone checks as the 26 Nov test, on broscafe.hu, plus Apple Wallet from `/account`.
- [ ] Rollback (seconds): `wrangler rollback` to the previous version.

### After cut-over

- [ ] First hour [agent]: Worker logs free of 5xx; `/api/wallet/v1/…` calls from phones answer 200/304; a real magic-link email sent; the cron ran once.
- [ ] First hour [agent, Daniel's OK]: in Admin → Újdonságok hide the old "guest-origin" post ("Itt a hónap vendégkávéja"); it was edited in admin on 4 Sept, so seeding keeps it. No guest coffee any more (decision 2026-11-17).
- [ ] First day (Mon 23 Nov) [brothers]: scanner at the counter all day; widget and live sales follow the till; the 9:00 forecast appears.
- [ ] First day [agent]: member, transaction and registration counts against the final export; error counters in the admin wallet tab.
- [ ] 23–26 Nov [agent]: a daily look at the logs; note every difference the brothers report.
- [ ] 28–30 Nov [agent]: the same after switch B, plus 404s in the logs for old URLs nobody thought of.

### Decommission (Rackforest)

- [ ] 18 Nov [Daniel] Notice period and billing date at Rackforest; what else runs on the VPS.
- [ ] 21 Nov [agent] Disable Coolify's auto-deploy webhook for the repo, so a push to `main` no longer matters.
- [ ] 27 Nov [Daniel] If switch A has been stable since 21 Nov: submit the cancellation for 30 Nov.
- [ ] 29 Nov [Daniel + agent] Final backup off the server: last `mongodump`, `/data/media`, `/srv/broscafe/certs`, the Coolify environment, the nightly backup folder. One encrypted archive in iCloud `Grace Labs/Clients/broscafe/backup/` and one offline copy; it holds customer data, so delete it after 12 months.
- [ ] 30 Nov [Daniel] Stop the VPS; delete the `coolify` DNS record; remove the server's SSH key and deploy key from GitHub.
- [ ] 30 Nov [agent] `PROJECT.md` and `docs/cloudflare-migration.md` marked done.

### Bookings go live: Stripe + Számlázz.hu (after cut-over B, before the first bookable evening 1 Dec)

The code is done and tested on the preview and on new.broscafe.hu (`PROJECT.md`, 2026-11-18). Until the switch, **both**
the preview and production run on the Stripe **sandbox** (production has its own sandbox webhook to new.broscafe.hu) and
on the Számlázz.hu account in **test mode** (same Agent key on both). Order matters: step 1 must happen before test
mode goes off, or test bookings become real invoices reported to NAV.

- [ ] **CP** 1. [agent] Cut both Workers off the test-mode key: `npx wrangler secret delete SZAMLAZZ_AGENT_KEY --env preview` and `npx wrangler secret delete SZAMLAZZ_AGENT_KEY --env=""` (the preview then issues no invoices; a separate test account can be added later).
- [ ] **CP** 2. [Daniel] Számlázz.hu: Vezérlőpult → switch test mode off. Check the test invoices (E-HNG-2026-1…) are gone or marked as test, and where real numbering starts. If they stay, their order numbers (AH-0001…, BD-…) would block production's: then allow order-number repetition in Beállítások.
- [ ] **CP** 2b. [agent] Remove the test bookings from the production D1 (`TESZT` names, `hello@broscafe.hu`, 18 Nov onwards: `ah_bookings`, `dl_orders`/`dl_payers`/`dl_items`), so their evenings are free again. Keep `bk_seq` as it is (numbers already used in the test account must not repeat).
- [ ] **CP** 3. [Daniel] Számlázz.hu: NAV connection (Online Számla technical user) set up; Számla Agent switched on (#free, upgrade to #start if Agent e-invoices are refused); Bros Cafe logo uploaded; accountant has access (invited 18 Nov).
- [ ] **CP** 4. [Daniel] Generate a **new** Agent key (after test mode is off) and set it on production only: copy it, then `cd worker && pbpaste | npx wrangler secret put SZAMLAZZ_AGENT_KEY`.
- [ ] **CP** 5. [Daniel] Stripe live mode: account activated; live secret key (replaces the sandbox one) → `pbpaste | npx wrangler secret put STRIPE_SECRET_KEY --env=""`; webhook endpoint `https://broscafe.hu/api/stripe/webhook` with `checkout.session.completed` + `checkout.session.expired`, its signing secret → `STRIPE_WEBHOOK_SECRET --env=""` (the sandbox endpoint to new.broscafe.hu can then be deleted); Apple Pay domain `broscafe.hu` verified; card, Apple Pay, Google Pay on; adaptive pricing off (always HUF).
- [ ] 6. [agent] Production vars: no `SZAMLAZZ_PROFORMA` / `SZAMLAZZ_OFF`, `BOOKINGS_OPEN` true, `AH_LAUNCH_DATE` 2026-12-01; `payments_ready: true` from `/api/after-hours/availability`.
- [ ] **CP** 7. [Daniel + agent] One real test with a real card: a single-drink Delivery company order → real invoice in Számlázz.hu (proves Agent e-invoices work on the package), then cancel + refund it in the admin → storno. Then a small After Hours booking with a 50 % refund → correcting invoice with the 3 % fee line.
- [ ] 8. [Daniel] Accountant answers before the first real cancellation: does a kept cancellation (50 % / 0 %) need a végszámla; ÁFA rate of the 3 % fee (`AH_CANCEL_FEE_VAT`, now 27); one read of the ÁSZF (`/aszf/`).
- [ ] 9. [Daniel] NTAK answer on online sales outside the till (email draft in the 18 Nov session).
- [ ] Dec [agent] Port account and card into D; decide on the scanner after a month of use.
