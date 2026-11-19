# Bros Delivery — backend contract (built 2026-11-17; see "As built" at the end)

Spec: `docs/delivery.md`. The pages talk to the backend only through `api` in
`site/delivery/delivery.js`. A Cloudflare Worker on the site's origin under `/api/delivery/*`, with D1. The drinks come from the
existing `GET /api/products`.

Every number that the spec leaves open is one value in `CONFIG` at the top of `delivery.js` (draft defaults, see
the end of this file). On the server the same values live in `dl_settings` and worker config; **prices, the fee and
capacity are always computed on the server**, never taken from the request.

## Tables (D1)

```sql
CREATE TABLE dl_settings (               -- one row, edited in the admin
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  rush_until    TEXT,                    -- rush is on while now < rush_until; NULL = off
  days          TEXT NOT NULL DEFAULT '[1,2,3,4,5]',  -- delivery weekdays, 0 = Sunday
  free_from     INTEGER NOT NULL DEFAULT 5,
  fee_huf       INTEGER NOT NULL DEFAULT 490,
  rush_max      INTEGER NOT NULL DEFAULT 8,
  rush_eta_min  INTEGER NOT NULL DEFAULT 30,
  updated_at    TEXT NOT NULL
);

CREATE TABLE dl_slots (                  -- the recurring daily slots
  id          TEXT PRIMARY KEY,          -- 's0900'
  time        TEXT NOT NULL,             -- 'HH:MM', Europe/Budapest
  cutoff_min  INTEGER NOT NULL,          -- order cutoff, minutes before `time`
  capacity    INTEGER NOT NULL,          -- max drinks per slot per day
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE dl_day_slots (              -- per-day exceptions: a slot closed for one day
  date     TEXT NOT NULL,                -- 'YYYY-MM-DD'
  slot_id  TEXT NOT NULL,
  closed   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (date, slot_id)
);

CREATE TABLE dl_orders (                 -- one delivery: a company order or a whole group order
  id            TEXT PRIMARY KEY,        -- 'BD-0001'
  kind          TEXT NOT NULL,           -- company | group
  group_code    TEXT UNIQUE,             -- share code, group orders only
  date          TEXT NOT NULL,
  slot_id       TEXT,                    -- NULL for rush
  rush          INTEGER NOT NULL DEFAULT 0,
  slot_time     TEXT, cutoff_at TEXT,    -- copied at creation, so later slot edits don't move it
  status        TEXT NOT NULL,           -- pending | open | new | making | out | delivered | cancelled | expired
  company TEXT NOT NULL, street TEXT NOT NULL, floor TEXT NOT NULL, note TEXT,
  contact_name TEXT NOT NULL, contact_email TEXT NOT NULL, contact_phone TEXT NOT NULL,
  fee_huf       INTEGER NOT NULL DEFAULT 0,
  recurring_id  TEXT,
  lang          TEXT NOT NULL DEFAULT 'hu',
  created_at TEXT NOT NULL, locked_at TEXT, delivered_at TEXT
);

CREATE TABLE dl_payers (                 -- who pays: one row for a company order, one per participant in a group
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES dl_orders(id),
  name TEXT NOT NULL, email TEXT NOT NULL,
  loyalty_email TEXT,                    -- group only; stamps go to this card
  inv_name TEXT, tax_number TEXT, zip TEXT, city TEXT, inv_street TEXT,  -- company invoice
  status        TEXT NOT NULL,           -- pending | paid | expired | refunded
  hold_expires  TEXT,
  amount_huf    INTEGER NOT NULL,        -- drinks (+ the fee where this payer carries it)
  stripe_session TEXT, stripe_payment_intent TEXT,
  invoice_no    TEXT,                    -- Számlázz.hu
  stamps        INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, paid_at TEXT
);

CREATE TABLE dl_items (                  -- one row per cup
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES dl_orders(id),
  payer_id    TEXT NOT NULL REFERENCES dl_payers(id),
  product_id  TEXT NOT NULL, cat TEXT NOT NULL,
  label       TEXT NOT NULL,             -- 'Latte · Zabtej', frozen at order time
  who         TEXT,                      -- name on the cup
  milk TEXT, size INTEGER, iced INTEGER,
  price_huf   INTEGER NOT NULL
);

CREATE TABLE dl_recurring (
  id TEXT PRIMARY KEY, source_order TEXT NOT NULL REFERENCES dl_orders(id),
  rule TEXT NOT NULL,                    -- 'weekdays' | '0'..'6' (weekday)
  slot_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
```

**Time zone and days:** every date, slot time and cutoff is `Europe/Budapest`, on the server and on the pages (never
the device's zone). Hungarian public holidays (`HOLIDAYS` in worker config, the same list as `CONFIG.holidays`) are
never delivery days; other closed days are closed per date and slot through `dl_day_slots`.

**Capacity** of a slot on a day = `dl_slots.capacity` − cups of that date and slot whose payer is `paid` or
`pending` with a live hold. Checked inside the same transaction that inserts the hold, so two orders cannot take
the last cups.

## Public endpoints

| Method, path | Does |
|---|---|
| `GET /slots?days=5` | `{ free_from, fee, zone_m, rush: { on, until, max_drinks, eta_min }, days: [{ date, slots: [{ id, time, cutoff_min, cutoff_at, capacity, left, status }] }] }`. The next `days` delivery days that can still be ordered for (no holidays; today is left out once its last cutoff has passed). The pages take `free_from`, `fee` and the zone radius `zone_m` from here, not from their own config. `status`: `open`, `past` (cutoff gone), `full`, `closed` (closed for that day). |
| `GET /address-suggest?q=` | Up to 6 Budapest streets / house numbers from Photon (OpenStreetMap): `{ items: [{ street, postcode, district, house }] }`. Under 3 characters or when Photon is slow (3 s) / down: `{ items: [] }`. |
| `POST /address-check` | `{ address, postcode? }` → `{ status: "in_zone" \| "out_of_zone" \| "confirm", radius_m }`. Straight-line distance from the café against `DELIVERY_RADIUS_M`. `in_zone`/`out_of_zone` only when Photon knows that exact house number on that street (and postcode, if given); a street without a number, an unknown house, Photon down, or the same street name in two districts on both sides of the radius → `confirm` ("write to us", the order is not blocked). |
| `POST /orders` | Company order. Body as built in `delivery.js`: `kind: "company", date, slot_id, rush, items[{ product_id, who, milk, size, iced }], address{ company, street, postcode, floor, note }, contact{ name, email, phone }, invoice{ name, tax_number, zip, city, street }, terms, lang, return_path`. `postcode` comes from a picked address suggestion (empty when typed by hand). Validates, prices the cups from the catalogue, adds the fee below `free_from`, holds the capacity (30 min), creates a Stripe Checkout session, returns `{ checkout_url }` (a `200` without it is treated as a failure by the page). Every cup needs a `who` (also on `POST /groups`; recurring copies are not checked). Errors: `400 { error: "invalid", fields }` (`["who"]` for a cup without a name), `409 { error: "slot_closed" }`, `409 { error: "slot_full", left }`, `409 { error: "rush_off" }`, `409 { error: "out_of_zone", fields: ["street"] }` (only a definite `out_of_zone`, see `/address-check`; also on `POST /groups`). |
| `POST /orders/:id/recurring` | `{ rule, token }` → creates a `dl_recurring` row. Authorised by the signed token `t` from the Stripe return URL or the confirmation email. |
| `POST /groups` | Organiser opens a group order: same body without `invoice`, `kind: "group"`, rush not allowed. The organiser's own drink is required (`items` ≥ 1, else `400 invalid`). Creates the order as `open` with a 6-character `group_code`; returns `{ code, url, checkout_url }`: the organiser pays like any participant. |
| `GET /groups/:code` | `{ code, status: "open" \| "locked", closed_early, date, time, cutoff_at, company, address{ street, floor }, organiser, drinks, free_from, fee, fee_due, fee_rule, participants: [{ name, paid, items: [label] }] }`. `fee` is the configured delivery fee, `fee_due` what applies at the current number of paid drinks (0 from `free_from`). No emails or phone numbers. The page polls it every 8 s. |
| `POST /groups/:code/close` | Organiser closes early: `{ token }` = `sign("org" + order id)`, sent as `o=` in the organiser's Stripe return URL and in the "A csoport oldala" button of their confirmation email (the page keeps it in localStorage `bros_dl_org_<code>`). Runs the cutoff lock (`lockGroup`): unpaid checkouts expired, fee settled, counter + "Készül, visszük" emails; later payments are refunded as after the cutoff. Returns the group view. Errors: `403 forbidden`, `404 not_found`, `409 locked`, `409 nothing_paid` (closing would cancel the order). |
| `POST /groups/:code/participants` | `{ name, email, loyalty_email?, items[...], terms, lang, return_path }` → pending payer + Checkout session, `{ checkout_url }`. Errors: `404 not_found`, `409 locked`, `409 slot_full`. |
| `POST /stripe/webhook` | Signature-checked, idempotent on the Stripe event id. See below. |

Stripe returns the payer to `<return_path>?order=<id>&paid=1&t=<token>` or `<return_path>?g=<code>&paid=1`
(`cancelled=1` instead of `paid=1` when they back out). `return_path` is the path of the page that sent the request
(`/delivery/`, `…/csoport/` for a group); the worker accepts only paths on its
allow-list and builds the absolute URL itself. A group organiser returns to the group page. The pages show these
states and then remove the parameters from the address bar.

## Stripe: one Checkout session per payer

- Each `dl_payers` row gets its own session (`client_reference_id` = payer id, `expires_at` = the hold, 30 minutes,
  or the slot cutoff if that is sooner).
- `checkout.session.completed` → payer `paid`; **Számlázz.hu invoice** to that payer (company data for a company
  order, a private person's e-invoice for a group participant), emailed to them; then:
  - company order → order `new`, confirmation email, counter notification;
  - group order → nothing else until the cutoff.
  - **Stamps:** only for group participants with a `loyalty_email` that matches a loyalty member. One stamp per
    cup that earns a stamp (`earnsStamp` in `worker/src/services/drinks.ts`: coffees + the coffee specials only,
    since 2026-11-17). Granted through the loyalty backend's existing "add coffee" service call, with the delivery
    payer id as idempotency key. Company-paid orders never earn stamps.
- `checkout.session.expired` → payer `expired`, capacity released.
- A payment that lands after the slot filled or locked is refunded in full automatically.

## Group order at the cutoff (a scheduled worker, every minute)

1. Group orders with `cutoff_at <= now` and status `open` → `locked_at = now`.
2. Pending payers are expired; their cups are not made (`CONFIG.group.unpaid = 'dropped'`).
3. No paid cups → order `cancelled`. Otherwise order `new` + counter notification + "it's coming" email to the
   payers.
4. Fewer paid cups than `free_from` → the fee rule (`CONFIG.group.fee`):
   - `organiser` (default): the organiser's Checkout includes the 490 Ft fee up front and it is refunded
     automatically when the group reaches `free_from` paid cups. No card is stored and nobody is charged later.
   - `split`: needs a second charge per payer, so it needs saved cards; not recommended.
   - `cancel`: everything is refunded, with correcting invoices.

## Recurring (`CONFIG.recurring.mode = 'reminder'`)

A scheduled worker creates the next order from `dl_recurring` the evening before (same cups, slot and address,
status `pending`) and emails the contact a Checkout link. Paid before the cutoff → normal order; unpaid → expired.
No stored card, no subscription. A real Stripe subscription is the alternative if the proposal prefers it.

## Counter notification

A new `new` order (company paid, or a group locked) is: (1) on the admin board, which polls
`GET /admin/board` every 20 s and plays a sound for an unseen order; (2) emailed to hello@broscafe.hu with the cup
list as a printable ticket. A printed ticket at the counter is open (see `docs/delivery.md`).

## Admin endpoints (staff token, same auth as the loyalty admin)

| Method, path | Does |
|---|---|
| `GET /admin/board?date=YYYY-MM-DD` | `{ date, rush, rush_until, slots: [{ ...slot, drinks, orders: [{ id, slot_id, type, company, contact, address, note, cups[], drinks, status, answer_by, eta_at }] }] }` plus rush orders (`requested` ones included, with their authorised cups). |
| `POST /admin/orders/:id/answer` | Rush request (staff): `{ minutes: 5–120 }` or `{ time: "HH:MM" }` (today, within 3 h) captures the authorised payment, sets `eta_at`, then invoice, counter email and the guest's "accepted, about HH:MM" email → `{ id, status: "new", eta_at }`. `{ accept: false }` releases the authorisation → `{ id, status: "declined" }`. `409 not_requested` when it was answered or timed out meanwhile; `409 capture_failed` when Stripe refuses the capture (the request is then declined and the guest told). |
| `PUT /admin/orders/:id/status` | `{ status: "new" \| "making" \| "out" \| "delivered" }`. `out` emails "on the way" to the contact. |
| `PUT /admin/rush` | `{ on }` → `{ on, until }`. The big switch. On sets `rush_until = now + 45 min` (`RUSH_AUTO_OFF_MIN`), after which rush is off again by itself; the board shows the minutes left. Turning it off does not touch rush orders already paid. |
| `GET /admin/settings` · `PUT /admin/settings` | `{ slots: [{ id, time, cutoffMin, capacity }], days: [1..5] }`. Removing a slot only deactivates it; orders keep their copied time. `400` for a slot outside the opening hours (7:30–18:00), two slots at the same time, or Sunday as a delivery day. |
| `PUT /admin/days/:date/slots/:slotId` | `{ closed }`. Close one slot for one day (today or any later date; other dates are untouched); `409` when it already has paid cups (staff must cancel or deliver them). |
| `GET /admin/recurring` · `PUT /admin/recurring/:id` | List; `{ active }` to pause or resume. |
| `POST /admin/orders/:id/cancel` | Cancels, refunds every payer in full, correcting invoices. |

## Draft defaults in `CONFIG` (change in one line)

| Open point | Default |
|---|---|
| Slots | 9:00 / 10:30 / 14:00, cutoff 45 min, 8 / 12 / 12 drinks |
| Delivery days | Mon–Fri, no Hungarian public holidays (`CONFIG.holidays`, extend each year) |
| Days offered in the picker | next 5 delivery days |
| Rush | off; when on: up to 8 drinks, switches itself off after 45 min; every rush order is a request (2026-11-18, below) |
| Drinks that travel | every drink: coffee, specialty, tea, smoothie, bottled; no product excluded (Daniel 2026-11-17) |
| Plant milk surcharge | 0 Ft (not in the catalogue) |
| Group fee below 5 at cutoff | organiser pays (up front, refunded at 5) |
| Unpaid at cutoff | the drink is dropped |
| Recurring | reminder email with a payment link, no stored card |
| Zone | 700 m straight line from the café (`DELIVERY_RADIUS_M`), Photon address check (2026-11-18) |
| Coffee box, reusable cups | shown as drafts in the FAQ, not orderable |

## Needed before building

- Stripe account for HungBros Kft. and Számlázz.hu Agent API key (shared with Bros After Hours).
- NÉBIH rules for delivery. (Accountant answered VAT and invoicing on 2026-11-18, see "As built".)
- The exact zone (building list or polygon) and the ÁSZF text.

## As built (2026-11-17) — where the code differs from the text above, and why

Code: `worker/src/routers/delivery.ts`, `worker/src/services/{delivery,bookings,stripe,szamlazz}.ts`, tables in
`worker/migrations/0001_bookings.sql`. Not-configured behaviour, the single webhook (`POST /api/stripe/webhook`), hold
length and HUF amounts are the same as in `docs/after-hours-api.md` ("As built"); `GET /slots` and `GET /groups/:code`
carry `payments_ready`.

- **Capacity** is enforced in SQL: the order (or the participant) is inserted with `INSERT … SELECT … WHERE taken + n <= capacity`
  in one D1 batch with its cups, so two requests cannot both take the last cups (D1 has no interactive transactions).
- **Cutoff worker:** the cron stays at 15 minutes (shared with the loyalty jobs). Locking is also done lazily before
  `GET /slots`, `GET /groups/:code`, `GET /admin/board` and every order request, so a group locks on time whenever
  anyone (or the board, every 20 s) looks; the "it's coming" emails can be up to 15 minutes late when nobody does.
- **Checkout expiry** cannot be shorter than 30 minutes, so a session can outlive the cutoff; a payment that arrives
  after the lock is refunded in full automatically (email to the payer). Unpaid sessions are also expired through the API at the lock.
- **Group fee:** `organiser` only. The organiser's Checkout carries the fee; it is refunded when the paid cups reach
  `free_from` (checked after every payment and at the lock). If the organiser never pays, nobody is charged the fee.
- **Invoices (accountant 2026-11-18):** drinks and delivery fee 27 % (`DL_DRINK_VAT`, `DL_FEE_VAT`). Company orders always
  get an invoice. Group payers (organiser and participants) get one only if they tick "Számlát kérek" (optional
  `invoice{ name, zip, city, street, tax_number? }`); otherwise `invoice_error = 'pos'` and the counter email lists them
  under "Pénztárgépbe ütni" with the amount to ring into Fruitsys (receipt). A refunded group fee on an invoiced organiser
  gets a helyesbítő reversing the fee line (`correction_no`, ref `BD-…-H`); a full refund is a storno.
- **Stamps:** the stamp logic of `POST /scan/:code/add-coffee` is repeated in `services/delivery.ts` (that route needs a
  staff user): one stamp per stampable cup until a reward is ready; transactions are logged with employee `delivery`.
- **Recurring:** rule is `weekdays` or `1`–`6`. From 18:00 the cron prepares tomorrow's orders (`pending`, capacity held)
  and emails a payment link valid until the cutoff. `token` is the `t` of the Stripe return URL (HMAC of the order id).
- **Admin auth:** board, order status, rush, closing a slot and reading settings/recurring need any staff token; saving
  settings, pausing a recurring order and `POST /admin/orders/:id/cancel` need the admin role.
- **Board:** rush orders (and orders of a slot removed since) come as one extra column `{ id: "rush", rush: true }`.
  Open group orders are not listed until they lock; their paid cups count in `drinks`.
- `PUT /admin/settings` also returns `free_from` and `fee` (read-only for now: edit `dl_settings` in D1).
- Rush requests (2026-11-18, migration `0006_rush_requests.sql`): a rush order's Checkout uses `capture_method=manual`.
  On `checkout.session.completed` with `payment_status` other than `paid`, the Worker reads the PaymentIntent and, at
  `requires_capture`, sets the payer `authorised` and the order `requested` with `answer_by = now + 10 min`
  (`RUSH_ANSWER_MIN`); staff get an "AZONNALI kérés" email, the guest a "request received, only held" email. The board
  beeps (after the first tap on the page), marks the tab title and shows a link to the request; it polls every 15 s, also in
  a background tab. Accept/decline: `POST /admin/orders/:id/answer`. Unanswered requests are declined by `sweep`
  (board polls, slot reads, the guest's status poll, the cron) and the hold released (`declined`/`released`); a hold
  that cannot be released lapses within 7 days by itself. Admin "cancel" on a request = decline. The guest's page after
  Checkout polls `GET /orders/:id/status?t=<signed t from the return URL>` → `{ status, rush, answer_by, eta_at }` every
  5 s until it is accepted or declined.
- Signed-in guests (2026-11-18, `services/my_orders.ts`, customer token as for `/api/customer/me`):
  `GET /api/customer/orders` → `{ delivery: [{ id, kind, group_code (organiser only), date, time, rush, company, street,
  drinks, amount, refund, status, upcoming }], after_hours: [{ id, date, time, hours, guests, amount, refund, status,
  upcoming, modify_url, cancel_url }] }`: paid/refunded Delivery payers and paid/cancelled/refunded evenings whose email
  is the account's (case-insensitive), 30 each. `modify_url` until 48 h before, `cancel_url` until the start.
  `GET /api/customer/reorder[?order=BD-…]` → `{ order: { id, kind, items, address, contact, invoice } | null }`, the
  latest (or that) paid order without date/time; a group member's order comes back as `kind: "group"` (they become the
  organiser), contact phone empty. The Delivery page fills the empty fields from the latest order and offers
  "Újra rendelem"; `/fiok/` links `?ujra=<id>`. `POST /groups` and `/groups/:code/participants` with a customer token
  and no `loyalty_email` use the account's email for the stamps.
- Zone (2026-11-18): `services/zone.ts`. Photon is called from the Worker only (the visitor's IP never reaches it),
  generic User-Agent, answers cached a day in the Cloudflare cache. Café point 47.51605, 19.0583. Recurring orders are
  not re-checked. `PHOTON_URL` overrides the base for local tests.
- Not built: `split` / `cancel` fee rules, coffee box, reusable cups, a printed ticket.
