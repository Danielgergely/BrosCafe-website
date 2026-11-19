# Bros Cafe: project status
Phase: 4 Build: design "Üveg" LIVE on new.broscafe.hu (prod d7544968) and the preview (e4272b8f) 2026-11-17, online booking off on prod (BOOKINGS_OPEN); next: Daniel tests on iPhone, prices/products for After Hours + Delivery, then switch broscafe.hu before 2026-12-01 per docs/migration-checklist.md
Preview: https://broscafe.gracelabs.dev (a copy of the real data; no emails, Wallet or Fruitsys from there)
Portal: https://portal.gracelabs.dev/p/broscafe
Domain: broscafe.hu (registrar unchanged; DNS moves to Cloudflare on switch night; owner: HungBros Kft.)
Contact: David and Benjamin (portal), Daniel is co-owner

Two tracks run together: the move of the live site to Cloudflare (docs/cloudflare-migration.md, code in worker/) and
the design test with the client (variants/). Bros Cafe is Daniel's own company, used to test the full client path.

## Done
- 0 Setup: portal project created by Daniel (Free + care plan 5 000 Ft/month, forints) and David and Benjamin invited (2026-11-13)
- 1 Content: the live site is the content (texts in frontend/src/i18n/hu.js, menu in backend/data/catalog.json, 12 photos)
- 2 Variants built 2026-11-14 with the café's own photos and reel loops: `/` = A Mai (the current app), `/b/` = B Pult
  (menu board), `/c/` = C Mesekönyv (3D storybook, polished by Fable), `/d/` = D Mozi (cinematic 3D film, Fable);
  switcher in variants/preview.js. B Napló (editorial) was built and dropped (archived in the session scratchpad)
- Port: the whole backend runs as a Cloudflare Worker (worker/), deployed to the preview with a copy of the data (2026-11-14)

## Open
- [x] 2026-11-17 independent review fixed (review notes removed in the 2026-11-17 cleanup); deployed to the preview /d/ (version 814f2e0f);
      portal: choice accepted, step "Készül a weboldal" active, status line updated (no notification)
- [ ] waiting for Daniel's inspection of the preview
- [ ] later in phase 4: port game, /account + magic link, privacy/help, real scanner/admin into D; After Hours + Delivery
      backends (Stripe, Számlázz.hu, D1); move D to / and remove variants A–C + preview.js
- [ ] news content stale (newest 10 Sept); unverified claims to confirm with the brothers (reply within a day, Bros tipp facts)
- [ ] build D (2026-11-16 plan): 1 shell (light palette, one header + phone bottom bar, view transitions; SHELL.md) →
      2 in parallel: home (short 3D opener, then ~5 snapping light photo/video scenes, tappable details, hub at the end)
      and subpages; staff scanner + admin restyled and wired to the real API later in this phase
- [ ] media: Instagram reels + Photos library footage gathered into iCloud media/; brothers will film more clips later
- [ ] live site shows old hours (Coolify env CAFE_HOURS_*): real hours Mon–Fri 7:30–18:00, Sat 8:30–17:00, Sun closed;
      fixed in D, worker/wrangler.jsonc and backend defaults (not committed); live fix needs Daniel's OK
- [x] 2026-11-16 shell done (variants/d/shell.css, shell.js, SHELL.md): light theme, one nav config, phone tab bar, view transitions
- [ ] Bros After Hours: spec agreed in docs/after-hours.md; page + admin mock-up being built (mock data); backend later
      (needs Stripe + Számlázz.hu accounts, final prices, cancellation terms; accountant answered 2026-11-18)
- [x] 2026-11-16 Bros After Hours page + admin mock-up built (variants/d/after-hours/, admin/after-hours/, docs/after-hours-api.md);
      2026-11-16 changed: 2.5 h slot 18:00–20:30, flat 24 900 Ft up to 6 + 2 990/extra (draft), bookable from 2026-12-01,
      cancel via email button/email/admin; page being updated
- [x] 2026-11-16 subpages rebuilt (étlap, kártya, újdonságok, kapcsolat, játék; pult/admin restyled mock-ups);
      sign-up + contact wired to the real API (preview data). Still on the old app: /auth/verify, /account, /game,
      /privacy, /help, staff login, real scanner/admin. Test member minta.dpages.*@example.com left in preview data
- [ ] /api/cafe data is stale (hours, @broscafe, "4.b"); fix in worker vars at deploy; live site left alone (Daniel)
- [ ] Bros Delivery: spec in docs/delivery.md (quiz 2026-11-16); proposal (docs/delivery-proposal.md) and page/group
      order/admin mock-up being built overnight
- [ ] media: Photos library blocked by macOS privacy (grant Full Disk Access to rerun); IG only gave 12 public reels,
      all portrait; no clean latte-art clip yet; landscape footage to be shot by the brothers
- [ ] ours: switch night for the move (needs Daniel: date after closing, production secrets, DNS to Cloudflare)
- [ ] ours: upload the Wallet artwork to R2 before switch night (worker/scripts/render_wallet_art.py)
- [ ] before launch: remove preview.js and the unused variants; variants are never deployed to production
- [ ] delete the customer-data export in the scratchpad after the switch

- 2026-11-14: portal step 3 done, step 4 "Te választasz" active; choice question posted; message to David and Benjamin with one email (Daniel asked for it)
- 2026-11-14: subpages (étlap, hűségkártya, újdonságok, kapcsolat, játék, pult and admin as sample-data mock-ups) built for C, D and E

- 2026-11-14: variants renamed A–D (Daniel); HU/EN switch on every page of B, C, D (shared bros-lang setting with the app); portal question and a note updated, no email

## Decisions
- 2026-11-16 (client, via Daniel): **D Mozi**, with changes. Words, brother 1: "Nagyon különleges mindegyik de nekem talán az D
  tetszik a legjobban, tetszik hogy kép van a háttérben meg az is ami a legalján van hogy ki lehet választani hogy játszani
  akarsz vagy megnézni mit tudsz vásárolni, viszont így színbe nem annyira illik oda. Meg lehet egy-két helyen más képeket
  tennék a háttérbe. Vagy az is lehetne hogy ilyen 10 másodperces video menne a háttérben a kávézótól vagy hogy öntjük a
  latte art-ot. Meg a nyitva tartás nem stimmel." Brother 2: "Nagyon jó a négyes verzió. Tisztább kell legyenek a
  menüpontok hogy ne vesszen el az ember. Több élet (igazi képek a helyszínről meg KÁVÉK). Túl sokat kell görgetni. Adj
  több kontrollt, hogy ne csak görgessen, hanem rá tudjon kattintani, megnézni infókat. Könnyedén át tudjon menni egyik
  oldalról a másikra, hogy látszódjon, hogy nem tűnt el, csak most ebben az ablakban van. Saját fotók, videók, social
  media videók. Kicsit sötét a D, rossz kedvű, a színek nem olyan puhák és boldogok, mint a kávézónk."
- 2026-11-16 (Daniel): too much scrolling to reach the next part; top menu inconsistent (hamburger vs list, not quite
  visible on some phones). Old site stays live until the new one is final. Two new products need room on the site:
  after-hours table booking (evening with service, drinks, small buffet) and coffee delivery to nearby offices; build
  them later, plan space now.
- 2026-11-13 (Daniel): full move to Workers + D1 (approach 1); loyalty must carry over without hiccups
- 2026-11-13 (Daniel): Daniel runs the client onboarding himself (portal project, invitations, payment)
- 2026-11-14 (Daniel): three variants like the other clients, plus at least one fun 3D variant; the brothers get the portal messages and email
- 2026-11-14 (Daniel): use Bros Cafe's own photos (now in iCloud Grace Labs/Clients/broscafe/media), no empty rooms, no team-silly
- 2026-11-14 (Daniel): keep the four best variants; subpages, admin and game page in each variant's design
- 2026-11-14 (Claude, on that instruction): dropped B Napló: the most conventional and closest to A (cream, serif, editorial)

## Feedback log
- 2026-11-19 Order page fixes (Daniel): nothing pre-selected in "Hova kéritek?" (address and "Ki fizet?" appear after
  Kiszállítás), steps never fold by themselves, Fizetés is always active and on a tap lists and highlights what is missing
  (the grey button could not be clicked: shell.css pointer-events none), the bag stays visible except next to the basket card,
  company name optional so private persons can order (emails/board fall back to the person's name), no texts about how we deliver.
- 2026-11-19 3D zone map on /delivery/ ("Hova visszük?"): OSM buildings in 3D, olive = delivered, grey = outside, landmarks
  (Lehel Piac, Westend, Nyugati, Vígszínház, Skála, Olimpia park). Tap a building → "Ide kérem" fills the order address. Zone is now
  whole street blocks (Daniel: follow streets, never cut a building), nothing across the railway out of Nyugati; the server
  check uses the same outline. Self-hosted
  (MapLibre in site/shared/vendor, data in site/delivery/map/zone.json); rebuild with worker/scripts/build_zone_map.py.
- 2026-11-19 Simpler order page (Daniel, Starbucks/McDonald's model): "Hova kéritek?" first (delivery or pickup + address check
  before any drink; outside the zone one tap to "Elvitelre kérem"), full menu per category, basket on the right with cup names,
  earliest free time pre-selected, details last. Milk, decaf, whipped cream and a note per cup in a "Testreszabás" sheet (also on the
  group page). Pickup: no fee, invoice optional, no rush, not for groups. DRAFT: decaf on every espresso drink, cream on hot chocolate, both free.
- 2026-11-19 Organiser closes a group early (handoff item 5): "Mindenki rendelt? · Rendelés küldése" on the group page, only with the
  organiser's signed link (Stripe return / confirmation email); same lock as the cutoff; refused while nothing is paid.
- 2026-11-19 Name on every cup required for company and group-organiser orders (handoff item 4), form + server.
- 2026-11-19 Admin: round back arrow bottom left, olive QR scan button bottom right; the scanner opens as a popup.
- 2026-11-18 Rush = request (handoff item 3): card authorised only, board beeps, staff accept 15/20/30 min or a time
  (capture → invoice/till, ETA email) or "Most nem megy"; 10 min unanswered → released. Migration 0006. ÁSZF sentence added.
- 2026-11-18 Signed-in guests (handoff item 2): "Rendeléseim" on /fiok/ (Delivery + After Hours by email, change/cancel
  links for evenings), "Újra rendelem" (everything but date/time; also from /fiok/), last details pre-filled only when
  signed in, group stamps automatic. Privacy text says so.
- 2026-11-18 Delivery zone (handoff item 1): Photon (OpenStreetMap) address suggestions on the order form and the
  "Hova visszük?" check, straight-line 700 m from Csanády u. 4/b (`DELIVERY_RADIUS_M`); outside → refused, not found →
  "írj nekünk", never blocked. Privacy names Photon (komoot GmbH); ÁSZF 500 → 700 m. Not deployed.
- 2026-11-18 After Hours: optional unlimited drinks (drinks we make) +2 500 Ft/person, whole group; bottled drinks not included.
  Steps now: guests · platters · drinks (unlimited, optional) · cake · evening · details; "Az árban" line above step 1
  (café 2 h, welcome drink, 1 platter); home hero chip always After Hours; occasion is an optional
  dropdown next to the note (8 occasions incl. Game night). Server quote line `drinks`. Costing in docs/after-hours-costs.md.
- 2026-11-18 After Hours booking rebuilt (Daniel: explained twice, messy "what is in it" block, keep all six options as in
  his phone screenshots, no "menü"/"fogás" wording): steps 1 guests · 2 the six platters as photo cards (placeholders,
  `photo` per dish) · 3 occasion chips + cake · 4 date/time (hour buttons show the café fee) · 5 details. Price ladder per
  person: welcome drink + 1 tál 2 500, every further tál +1 500 (2 → 4 000, 3 → 5 500, 4th on stored as extras) (costing: docs/after-hours-costs.md) (tiers
  alap/duo/menu, server quote updated). Headline stays 17 900 Ft-tól. BOOKINGS_OPEN true for production (no Stripe
  keys there: nothing can be paid or saved). Preview c70a3493; production not deployed yet.
- 2026-11-18 Alap 2 400 → 2 500 Ft/person so the headline reads "17 900 Ft-tól" (Daniel); menu stays 3 900. Live on the
  preview (0ba17a98) and new.broscafe.hu (d87e781b).
- 2026-11-18 After Hours dishes = the brothers' six (Waffle board, Mini pizza bites, Fresh fruit & veggie board, Mini burger
  sliders, Mini sandwich selection, Cheese & charcuterie board; English titles, Hungarian descriptions); Alap board = waffle
  or fruit & veggie; welcome drink = any drink from the menu; VAT café/hours 27 %, package/extras 5 % (AH_FOOD_VAT).
  Deployed: preview 54b3e43d, production new.broscafe.hu 5f6e7de4 (booking closed there). Not committed yet.
- 2026-11-17 (night) After Hours new pricing built (docs/after-hours.md "Offer"): café 12 900 Ft/2 h + Alap 2 400 Ft/person
  (üdvözlőital + Gofri or Gyümölcstál) or Fingerfood menü 3 900 Ft/person (üdvözlőital + 3 of: Mini pizzás csomag, Gofri,
  Sajtos hidegtál, Húsos hidegtál, Gyümölcstál); extras +1 500/+2 000 per person; +5 900 Ft/hour; AFTER25 on the café fee;
  everything prepaid except the cake; headline 17 700 Ft-tól. New POST /api/after-hours/quote. Preview 792cb333: totals
  verified, real Stripe test payment AH-0005 = 50 975 Ft paid (2027-02-11, preview only; cancel it in the preview admin to
  test the refund). Superseded on 2026-11-18 (six dishes, deployed to production).
- 2026-11-17 (late night) code cleanup: glass.css/glass-staff.css merged into the base CSS (one Üveg system, SHELL.md
  rewritten), mock modes + 200 dead i18n keys + duplicate helpers removed from site JS (shell.js now exposes esc/toast/
  preview/guard), worker dead code/exports trimmed (API responses identical), 8.8 MB unused media + Emergent leftovers
  removed, CLAUDE.md rewritten, runnerSim.js in site/jatek is the one copy. Verified: 72 screenshots identical to before
  (except time-dependent After Hours/news clips), 109 API calls identical, flows + language switch retested.
- 2026-11-17 (night) full QA by parallel agents: every guest/staff page, flows (sign-up, magic link, card, game score
  replay, scanner, 16 admin tabs, AH/Delivery up to payment), HU/EN, copy, privacy (cleanup job services/retention.ts:
  2 y inactive members via members.erase, analytics > 14 months, daily after 03:00), staff skin, game
  canvas restyled (drawing only). Open: scanner undo leaves total_coffees + coffee_added row (stats count undone
  coffees, server change); AH admin calendar shows 17–30 Nov as open though guests can book from 1 Dec; rush can be
  switched on after closing; guest cancel with a valid token and real Stripe payment untested; game track small on
  phones (fixed 960x300 world); Safari/iPhone untested (glass bars during page changes, white flash leaving home);
  bean bag names ("Specialty szemes kávé" = Brazilian?) and claims (low acidity/heavy body, croissant layered by
  hand, grind to your machine) to confirm; news content stale (only the new Brazilian–Colombian post is fresh);
  old React app frontend/ still has the old copy (unused after the switch). Local QA test members exist only in the
  local D1.
- 2026-11-17 (Daniel): online booking for After Hours + Delivery OFF on production until prices/products are final
  (switch BOOKINGS_OPEN); After Hours food selections (in the deposit or paid on the evening) and all pricing to be
  discussed when everything else is ready. Stamps: only coffees + coffee specials (drinks.ts COFFEE_SPECIALS). No guest
  coffee; two roasts (Brazilian, Brazilian–Colombian, lighter/fruitier) from a Hungarian roaster, never named. "A higher
  calling" stays English. Privacy: automatic cleanup (2 y inactive members, 14 months analytics) + legal basis/8-year
  invoice retention + US transfer safeguards.
- 2026-11-17 (late) Daniel + brothers chose **G · Üveg** (D's structure and motion, his mock-up palette, liquid glass).
  Solidified: `site/glass.css` + `glass.js` on every page, italic fonts in /shared/fonts, theme-color #25251C; looks E/F/G,
  the switcher and the worker /looks/ gate removed (backup: iCloud backup/looks-efg-2026-11-17.tgz). Preview 025b2b17.
  Next: QA of every page/flow/text, then deploy to new.broscafe.hu (his go given).
- 2026-11-17 (night) feedback: Kollázs looks a bit childish → back to choosing. Two premium alternatives built as
  "looks" on the preview (site/looks/e = E · Galéria, light photo book; site/looks/f = F · Bársony, Daniel's dark-luxe
  mock-ups: espresso/olive/ivory/champagne/taupe, serif + real italic). Switcher pill on preview hosts only (?look=d|e|f,
  shell.js); worker 404s /looks/ in production. Deployed to the preview (a2f78921). G · Üveg (site/looks/g, restyles the D home; D motion + mock-up palette + liquid glass) deployed c529584d. Looks E/F/G + their brief: iCloud backup/looks-efg-2026-11-17.tgz.
- 2026-11-17 (later) Daniel likes the new "Kollázs" design; images to keep improving when new footage arrives. Remove
  variants A/B/C + switcher; D becomes the real site with ALL live functions (scripts, admin, scanner, game, account…).
  Deadline: switch broscafe.hu to the Cloudflare version before 2026-12-01 (stop paying Rackforest). Checklist:
  docs/migration-checklist.md (Fable agent writing it).
- 2026-11-17 Daniel on the preview: clearer than the old D but "not as fancy" (wants scroll-driven animation back), image
  choices not the best, "back to a standard everyday website" → visual redesign. After Hours + Delivery too hidden in
  the sub menu: make them prominent without obstructing coffee. After Hours price back to ~14 900 with extras, 2 h
  included, evenings open until 22:00 (docs/after-hours.md updated). Backup before redesign:
  iCloud backup/variants-d-2026-11-17-before-redesign.tgz.

## Rebuild status 2026-11-17 (evening)
All five rebuild parts built in variants/d (customer fiok/auth/card/privacy/help/404, staff belepes/pult, admin 16 tabs,
game jatek with sim parity 400/400, bookings backend in worker + migration 0001 applied to preview D1). Deployed to the
preview (c2eb1212). Fruitsys pull works on the preview. Preview-only admin seeded via ADMIN_EMAIL/PASSWORD secrets
(fixed missing version_metadata in env.preview, so startup reruns per deploy). Smoke test on real preview data passed 2026-11-17
(login, 16 admin tabs, scanner stamp+undo, card, verify, bookings pages); fixes deployed (c538ec51). Not tested: game run +
signed-in account (need a customer magic link → Resend key on preview or Daniel signs in). Next: move D to / with redirects; prod env (D1/R2/secrets), DNS at Rackhost/dns24.
Live React bug found (not fixed, live untouched): RunnerGame.jsx records only ground presses, so boosts never reach the
server replay.

## 2026-11-18: accountant's answers built in (on the preview; production waits for the live Számlázz key)
- After Hours: everything as on-site food/drink, `AH_VAT` 5 % on every line (was 27 % café/hours); előlegszámla on payment,
  végszámla dated the evening (cron, after it ends), 50 % refund → helyesbítő. Delivery: 27 % confirmed; private group
  payers → till (Fruitsys) unless they tick "Számlát kérek"; refunded group fee → helyesbítő. Migration 0003 (final_*,
  correction_*) applied to preview + prod D1. Admin can refund above the terms ("Méltányosságból 50/100 %"); the
  storno/correcting invoice then says so. Tested end to end on the preview against a Számlázz.hu account in test mode
  (E-HNG-2026-1…13): advance, final (advance deducted, 0 Ft due), 50 %/0 %/goodwill cancellations, storno, Delivery
  company/organiser invoices, fee correction, till payer. Fixed: empty szamlaszamElotag made Számlázz reject everything.
- Ask the accountant: when a cancellation keeps money (50 % / 0 %), does the advance invoice need a végszámla?
- 3 % kezelési költség kept on guest cancellations (fee line at AH_CANCEL_FEE_VAT 27 %, ask the accountant); admin
  "Kezelési költség nélkül" when we cancel. ÁSZF at /aszf/ (hu+en, customer-texts.js `terms`, effective 2026-12-01);
  both booking forms only tick the terms through a summary popup (site/shared/terms-dialog.js). After Hours bookable
  from tomorrow (noticeDays 1). Migration 0004 (cancel_fee_huf) applied to the preview only.
- Open: NTAK (ask NTAK whether online sales outside the till must be reported; Delivery till entries go through Fruitsys
  anyway), invite the accountant in Számlázz.hu, Számlázz package with Agent, then drop `SZAMLAZZ_OFF` on the preview.

## 2026-11-17 late: DNS + Stripe
- broscafe.hu DNS moved to Cloudflare (nameservers elliott/gina.ns.cloudflare.com, registry switched in ~12 min). All
  records DNS-only, still pointing at the Rackforest VPS (92.119.123.141); mail test to hello@ arrived. Old dns24 records
  kept at Rackhost as fallback. 66.broscafe.hu dropped (66 runs on 66.gracelabs.dev).
- Stripe: sandbox account for HungBros "BrosCafé sandbox" (acct_1UVFvf3DMS2xRD4z, HU/HUF). Test secret key + webhook
  (/api/stripe/webhook, checkout.session.*) set on the preview. Test payments passed: After Hours 24 780 Ft paid + admin
  refund, Delivery 2 860 Ft paid + refund, declined card not confirmed, Számlázz "not_configured" doesn't block.
  Adaptive pricing switched off (always HUF). Untested: guest cancel link (needs email). Live keys: Daniel puts them in
  himself with wrangler, never via chat. Stripe Tax/Terminal not needed now.
- 2026-11-17: production D1 `broscafe` created (EU, id 9b2d57ec…), schema + 0001_bookings applied, empty; R2
  `broscafe-media` exists; Wallet artwork (26 520 PNG) rendered, upload to prod R2 in retrying chunks. Számlázz.hu
  Agent key set on the preview by Daniel; preview issues díjbekérő only (SZAMLAZZ_PROFORMA) and invoicing is paused
  (SZAMLAZZ_OFF) because the current Számlázz package refuses díjbekérő via the Agent. Decide package/provider after the
  accountants answer. Admin booking dialog doesn't show invoice errors yet (todo). Waiting for Daniel's VPS export.
- 2026-11-17 dry run 1: read-only export from the VPS (root@92.119.123.141, key login) → prod D1: 102 members, 638
  transactions, 90 wallet registrations, 97 products, 406 game runs, 2 users (counts match). 12 media photos → prod R2.
  12 prod secrets set on Worker `broscafe` (same JWT_SECRET, Apple/Google certs, Resend, Fruitsys, LIVE_SALES_KEY,
  admin) — Worker exists but has no code/route yet. Local copies of secrets deleted; data export kept in the session
  scratchpad until the switch. Next: move D to /, deploy prod to a side-by-side address (e.g. new.broscafe.hu).
- 2026-11-17 evening: design D moved to the root (`site/`, was variants/d), redirects for all old React URLs, 404,
  robots/sitemap/OG. Preview = new site at /. Production Worker deployed to **https://new.broscafe.hu** (side by side,
  real data copy, Wallet off, sign-in links to new.broscafe.hu); switch-night steps in docs/migration-checklist.md.
- 2026-11-17: After Hours updated from the owners' flyer (hero lines, included: private café 2 h, 3 food selections,
  1 free drink/guest, optional cake from 10 000 Ft; food group discount 25 % 4–7 / 35 % 8+ shown as info only — how
  food is chosen/paid is undecided by Daniel; voucher AFTER25 = −25 % of the 14 900 base, server-side). Migration 0002
  applied to preview + prod D1. Flyer photos are AI images (not used); flyer's Instagram @broscafe is wrong (@broscafe.co).
  Cost check in docs/after-hours.md needs redoing (free drink per guest).
- 2026-11-17: all 26 520 Wallet artwork PNGs uploaded to prod R2 (spot-checked). Preview bucket has none (Wallet off there).
