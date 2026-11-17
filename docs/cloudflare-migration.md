# Moving broscafe.hu to Cloudflare

Status: **plan, waiting for Daniel's OK** (13 Nov 2026). Nothing has changed on the live site.

Goal: Bros Cafe runs on Cloudflare like Daniel's other projects (66, the portal), the Rackforest VPS can be
retired, and **the loyalty programme carries over without a single customer noticing**: same stamps, same tiers,
still signed in, Wallet cards on phones keep updating, staff scanner keeps working.

## What exists today

- `frontend/`: React (Create React App), served by nginx. About 13,000 lines.
- `backend/`: Python FastAPI, about 5,800 lines, 70 routes under `/api`, MongoDB 4.4. Runs in Coolify on the
  Rackforest VPS (92.119.123.141). Nightly backup 03:30.
- A background loop in the API process pulls live sales from Fruitsys every few minutes.
- Data (13 Nov): 97 members, 597 transactions, 86 Wallet device registrations, 97 products, 44 sales days and
  forecasts, 399 game runs, 264 analytics events, 2 staff users; photos 36 MB in `/data`.
- Apple pass certificate `pass.hu.broscafe.loyalty`, valid until 3 Oct 2027. Google Wallet via a service account.

## Target

| Today | On Cloudflare |
|---|---|
| nginx serving the React build | Workers static assets (same build) |
| FastAPI (Python) | One Worker in TypeScript, **same routes, same request and response shapes** |
| MongoDB | D1 (SQLite), one table per collection |
| Photos in `/data` | R2 bucket (EU) |
| Fruitsys loop every few minutes | Cron trigger (same interval) |
| Apple pass signing (`cryptography`) | Signed in the Worker (PKCS#7 with the pass key as a secret) |
| APNs push (httpx, HTTP/2, client certificate) | `fetch` through an mTLS binding. **Tested 13 Nov: works** (Apple answered `BadDeviceToken` to a fake device with the certificate, `MissingProviderToken` without) |
| Pass strip artwork drawn with Pillow | Rendered once for every tier × stamp count and served as static images |
| Resend emails, Google Wallet REST | Same calls from the Worker |

The certificate is uploaded to Cloudflare as mTLS certificate `broscafe-wallet`
(id `78002d82-1c8c-47ab-a894-289ea2105cff`).

## What must not change (the loyalty contract)

1. **Domain and paths.** Every pass on a phone contains `webServiceURL` (built from `FRONTEND_URL`) and Apple calls
   `/api/wallet/v1/...` on it. The domain stays `https://broscafe.hu` and every `/api/...` path stays identical.
2. **Customer sessions.** Tokens are JWTs signed with `JWT_SECRET`, valid a year. The new Worker uses the same
   secret and algorithm, so nobody is signed out.
3. **Staff logins.** bcrypt hashes are copied as they are; the Worker checks them with a bcrypt library.
4. **Member codes, serial numbers and pass authentication tokens** (`wallet_auth_token`, voided-pass tombstones)
   are copied unchanged. They are what the QR codes, Apple and Google identify a card by.
5. **Device registrations** (`wallet_registrations`): copied, so pushes keep reaching the 86 registered phones.
6. **Google Wallet** object ids are `<issuer>.<member code>`: same issuer, same codes, same class.
7. **Loyalty rules** (10 stamps, 5 welcome stamps, tiers 50/150/300, diamond admin-only, grants only promote,
   opening-week reveals) are ported line by line. There is no test suite to carry over, so the check is the
   side-by-side run: the same actions on the old and the new system with a copy of the same data must give the
   same members afterwards (step 3).

## Steps

1. **Port** the backend to `worker/` in this repo, route by route, keeping the Python as the reference.
   Data access goes through one small module so D1 queries live in one place.
2. **Export and import**: a read-only `mongoexport` of every collection from the live server; a script turns it
   into D1 rows and copies `/data` to R2. Re-runnable, so it can be repeated on switch night.
3. **Compare**: a script that checks the new against the old for every member: code, email, stamps, lifetime
   purchases, tier, free coffees, wallet token, and the number of registrations. Every row must match; any
   difference stops the switch.
4. **Rehearsal** on a preview address (`broscafe.gracelabs.dev`, which works before broscafe.hu's DNS moves) with
   a copy of real data: staff scanner, stamp,
   redeem, sign-in link, new sign-up, admin dashboard, live sales, Google pass. Daniel and his brothers test it on
   their phones. **Apple passes stay off on the preview** (`APPLE_PASS_CONFIGURED=false`, the repo's rule: a pass
   issued there would point at the preview address forever). Pass building, signing and push are checked instead
   by downloading the `.pkpass` and validating it, and by a push to a fake device; the first real Apple card on the
   new system is tested on switch night with Daniel's own card.
5. **DNS**: add broscafe.hu to Cloudflare and copy every existing record (including mail). The registrar stays;
   only the nameservers change, with the site still pointing at the VPS. Nothing visible changes.
6. **Switch night** (after closing):
   1. Put the old API in read-only mode (no new stamps or sign-ups) and stop the Fruitsys loop.
   2. Final export → import → compare. Must be 100% equal.
   3. Point broscafe.hu at the Worker.
   4. Check: sign in, scan a test card, add a stamp, see the Wallet card update on a phone.
7. **Way back**: the VPS stays untouched for two weeks. Switching back = pointing the domain at the VPS again
   (minutes). Anything stamped on the new system in between is listed by the compare script so it can be replayed.
8. **Afterwards**: retire the Coolify app and, once 66's old container is also gone, the VPS. Move the repo into
   the `gracelabs-dev` GitHub organisation (optional).

## Risks and answers

| Risk | Answer |
|---|---|
| A customer is signed out or loses stamps | Same JWT secret; per-member compare before the switch; way back in minutes |
| Wallet cards stop updating | Same domain, paths, serials, tokens and registrations; push tested from a Worker |
| A route behaves slightly differently and the app breaks | Same request/response shapes, checked by running the existing frontend against the Worker in the rehearsal |
| Fruitsys blocks Cloudflare's IP addresses | Tested early in step 1; fallback: keep only that job on a tiny box until solved |
| Mail records lost when DNS moves | Copy and compare every record before changing nameservers |

## Cost

Workers Paid (USD 5/month) is already paid for 66 and covers this. D1, R2 and cron for this size: free tier.
