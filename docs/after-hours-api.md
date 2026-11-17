# Bros After Hours — backend contract (built 2026-11-17; see "As built" at the end)

Spec: `docs/after-hours.md`. The page talks to the backend only through `api` in
`variants/d/after-hours/after-hours.js` (real API by default; `?mock=1` switches a browser to the mock data for local work, `?mock=0` back). A Cloudflare Worker on the site's origin under `/api/after-hours/*`, with D1.

## Tables (D1)

```sql
CREATE TABLE ah_days (
  date        TEXT PRIMARY KEY,           -- 'YYYY-MM-DD', Europe/Budapest
  open        INTEGER NOT NULL,           -- 1 open, 0 blocked; no row = default (Mon–Sat open; Sun and CLOSED_DAYS blocked)
  updated_at  TEXT NOT NULL
);

CREATE TABLE ah_bookings (
  id            TEXT PRIMARY KEY,         -- 'AH-0001'
  date          TEXT NOT NULL,
  status        TEXT NOT NULL,            -- pending | paid | cancelled | refunded | expired
  hold_expires  TEXT,                     -- set while pending
  start_time    TEXT NOT NULL,            -- 'HH:MM' Budapest time: 18:00, 18:30 … 20:00
  hours         INTEGER NOT NULL,         -- 2, 3 or 4; start_time + hours must not pass 22:00
  guests        INTEGER NOT NULL,         -- 2–12
  tier          TEXT NOT NULL DEFAULT 'base',
  amount_huf    INTEGER NOT NULL,         -- computed on the server with the price formula below, never taken from the request
  cancel_token  TEXT NOT NULL,            -- random, for the signed cancel link
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  zip TEXT NOT NULL, city TEXT NOT NULL, street TEXT NOT NULL,
  company TEXT, tax_number TEXT,
  occasion TEXT, note TEXT,
  packages      TEXT NOT NULL DEFAULT '[]', -- JSON array of ids, indicative only
  lang          TEXT NOT NULL DEFAULT 'hu',
  stripe_session TEXT, stripe_payment_intent TEXT,
  invoice_no    TEXT,                     -- Számlázz.hu
  refund_huf    INTEGER,
  created_at TEXT NOT NULL, paid_at TEXT, cancelled_at TEXT
);

-- one live booking per evening: the database enforces it, not the code
CREATE UNIQUE INDEX ah_one_per_day ON ah_bookings(date) WHERE status IN ('pending', 'paid');
```

The offer (`CONFIG` in `after-hours.js` mirrors it), `LAUNCH_DATE` / `NOTICE_DAYS` / `CLOSED_DAYS` (24, 25, 26, 31 Dec
and 1 Jan: blocked every year unless the admin opens the day) live in worker config, never in the request.

## Time and price (Daniel 2026-11-17)

- The evening is 18:00–22:00. A booking is a **start time** (18:00, 18:30, 19:00, 19:30 or 20:00) plus **hours**
  (2, 3 or 4) with `start_time + hours <= 22:00`; anything else is `400 invalid`. Still one booking per evening.
- **Price formula** (the online deposit; packages are indicative and paid on the evening):

  ```
  amount_huf = BASE + EXTRA_GUEST * max(0, guests - 6) + EXTRA_HOUR * max(0, hours - 2)
  BASE = 14 900        -- 2–6 people, 2 hours, basic food package (snack plate), unlimited coffee and tea, one of the team serving
  EXTRA_GUEST = 1 990  -- DRAFT amount, per person 7–12
  EXTRA_HOUR = 5 900   -- DRAFT amount, per hour above 2
  ```

  Checks: 6 p/2 h → 14 900 · 8 p/2 h → 18 880 · 6 p/3 h → 20 800 · 12 p/4 h → 38 640.
- The welcome drink is not in the base; it belongs to the "specialty drinks" add-on package.

**Time zone:** every date, the notice period, the booking window and the refund rule are computed in
`Europe/Budapest`, on the server and on the page (never the device's zone). The refund rule counts back from the booking's own
`start_time` on its date; the notice period counts from 18:00, when the evening opens.

## Public endpoints

| Method, path | Does |
|---|---|
| `GET /availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ days: [{ date, status: "open" \| "booked" }] }`. Only opened days inside the window are returned: from max(`LAUNCH_DATE` 2026-12-01, now + 3 full days) to today + 3 months; a pending hold counts as booked. |
| `POST /bookings` | Body as built in `after-hours.js` (`date, start ("HH:MM"), hours, guests, tier, name, email, phone, billing{zip, city, street, company, tax_number}, occasion, note, packages[], terms, lang, return_path`). `start` and `hours` are validated as above and the amount is computed from `guests` and `hours`. Billing is Hungary only: `zip` is 4 digits, `tax_number` is `12345678-1-12`. Validates, inserts a `pending` row with `hold_expires = now + 30 min`, creates a Stripe Checkout session (`expires_at` the same 30 min, booking id in `metadata` and `client_reference_id`), returns `{ checkout_url }`; a `200` without `checkout_url` is treated as a failure by the page. Errors: `400 { error: "invalid", fields }`, `409 { error: "day_taken" }`. |
| `POST /stripe/webhook` | Signature-checked. `checkout.session.completed` → set `paid`, issue the Számlázz.hu invoice (emailed to the guest), send the confirmation email to the guest and the booking email to hello@broscafe.hu. `checkout.session.expired` → set `expired`. Idempotent on the Stripe event id. |

| `GET /cancel/:token` | For the "Foglalás lemondása" button in the confirmation email. `{ booking: { id, date, start, hours, guests, name, amount, status }, refund_percent, refund_huf }`, computed now from the terms. `404` unknown token, `410` already cancelled or evening passed. |
| `POST /cancel/:token` | Cancels: status `cancelled`, Stripe refund of `refund_huf` (skipped at 0), then `refunded`; correcting invoice; emails to the guest and hello@broscafe.hu. Returns the same shape. The amount is recomputed at this moment, not taken from the page. |

The cancel link is `https://broscafe.hu/after-hours/lemondas/?t=<token>`, token = `<booking id>.<HMAC-SHA256(id + cancel_token, secret)>`.
`GET` never changes anything, so mail scanners that follow links cannot cancel. A reply by email is handled by staff
with the admin cancel + refund below.

Stripe returns the guest to `<return_path>?booking=<id>&paid=1` (thank-you state) or `<return_path>?cancelled=1`.
`return_path` is the path of the booking page as sent by the page (`/after-hours/` live, `/d/after-hours/` on the
preview); the worker accepts only paths on its allow-list and builds the absolute URL itself. The page shows both
states and then removes the parameters from the address bar. The cancel link in the email is built from the same base.

## Race condition: two groups, one evening

1. `POST /bookings` first expires stale holds: `UPDATE ah_bookings SET status='expired' WHERE status='pending' AND hold_expires < now`.
2. Then inserts the `pending` row. The unique index rejects the second insert for the same date → `409 day_taken`;
   the page shows "Ezt az estét közben lefoglalták" and reloads the calendar.
3. The Checkout session expires together with the hold (Stripe minimum is 30 minutes), so a payment cannot arrive
   for a released day. If it still does (webhook finds the row `expired` and the day taken), refund it in full
   automatically and email both sides.

## Admin endpoints (staff token, same auth as the loyalty admin)

| Method, path | Does |
|---|---|
| `GET /admin/days?from&to` | `{ days: [{ date, open, booking_id }] }` |
| `PUT /admin/days/:date` | `{ open: true \| false }`. Blocking a day with a live booking → `409`. |
| `GET /admin/bookings` | `{ bookings: [...] }`, all fields (the page reads `start`, `hours` and shows start–end), newest evening first; `?status=` filter. |
| `POST /admin/bookings/:id/cancel` | `paid` → `cancelled`, frees the evening, emails the guest. |
| `POST /admin/bookings/:id/refund` | `{ percent }` (default from the terms, measured at `cancelled_at`, not at the time of the refund: 100 at 7+ days, 50 until 48 h, 0 after). Stripe refund on the payment intent, status `refunded`, `refund_huf` stored, correcting invoice in Számlázz.hu. |

## Needed before building

- Stripe account for HungBros Kft. (keys, webhook secret); Számlázz.hu account + Agent API key.
- Accountant: advance invoice vs final invoice, VAT rate, how a partial refund is invoiced.
- Sender address for the emails (Resend is already used by the loyalty backend).
- Confirm the two surcharge amounts (extra guest, extra hour) and the add-on package prices.

## As built (2026-11-17) — where the code differs from the text above, and why

Code: `worker/src/routers/after_hours.ts`, `worker/src/services/{after_hours,bookings,stripe,szamlazz}.ts`,
tables in `worker/migrations/0001_bookings.sql` (apply it to each D1 before the first deploy).

- **Errors** are `{ "error": code, ... }` as above; auth failures keep the loyalty API's `{ "detail": ... }` (401/403).
- **Not configured:** without `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `POST /bookings`, refunds and the webhook answer
  `503 { error: "payments_not_configured" }`; `GET /availability` adds `payments_ready: false` and the page says so up front.
  Without `SZAMLAZZ_AGENT_KEY` no invoice is issued: the booking keeps `invoice_error = 'not_configured'`, staff are told in
  the booking email, and the cron issues it once the key exists (also retries failures, 6 tries).
- **One Stripe webhook for both modules:** `POST /api/stripe/webhook` (the two documented paths are aliases). Events:
  `checkout.session.completed`, `checkout.session.expired`. The session's `metadata.kind` (`ah` / `dl`) routes it.
  Idempotent through `stripe_events` and through status-guarded updates.
- **Hold** is 33 minutes and the Checkout session 31 (Stripe's minimum is 30; the hold must outlive the session).
- **Stripe amounts:** HUF is sent in fillér (`amount × 100`). Wallets (Apple/Google Pay) come from the dashboard's
  payment-method settings, the code does not list methods.
- **Cancel:** `POST /cancel/:token` also returns `refund_pending: true` when the Stripe refund failed (booking stays
  `cancelled`, staff email says so, the admin refund button finishes it). `410` body is `{ error: "gone" }`.
- **Admin:** all five endpoints need the **admin** role. `GET /admin/bookings` leaves out `expired` holds unless
  `?status=expired`; rows carry `invoice_no`, `invoice_error`, `refund_huf`. `GET /admin/days` adds `held` (a payment in progress).
  `refund` with `percent: 0` just closes the booking as `refunded` with 0 Ft.
- **Invoices (ACCOUNTANT, config in `services/szamlazz.ts`, overridable as worker vars):** `AH_INVOICE_TYPE`
  (`elolegszamla` default, or `szamla`), `AH_VAT` (27). A 100 % refund issues a storno automatically; a **50 % refund
  issues nothing** and the staff email asks for a manual correction until the accountant says how to invoice it.
- **Config** (`offer()` in `services/after_hours.ts`, vars `AH_BASE_HUF`, `AH_EXTRA_GUEST_HUF`, `AH_EXTRA_HOUR_HUF`,
  `AH_LAUNCH_DATE`): the draft amounts above. The signature secret for cancel links is `JWT_SECRET`.
- **Local test hooks:** `STRIPE_API_BASE` and `SZAMLAZZ_API_URL` point the worker at a stub; never set them in production.
- Not built: the final invoice (végszámla) after the evening, add-on package prices.
