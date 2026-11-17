-- Bros After Hours + Bros Delivery (docs/after-hours-api.md, docs/delivery-api.md). Plain tables, not the JSON
-- document collections of schema.sql. Safe to run again. Apply:
--   npx wrangler d1 execute broscafe-preview --env preview --remote --file migrations/0001_bookings.sql

CREATE TABLE IF NOT EXISTS bk_seq (name TEXT PRIMARY KEY, n INTEGER NOT NULL);           -- AH-0001, BD-0001
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, at TEXT NOT NULL);

-- ---- After Hours ----
CREATE TABLE IF NOT EXISTS ah_days (
  date TEXT PRIMARY KEY, open INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ah_bookings (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, status TEXT NOT NULL, hold_expires TEXT,
  start_time TEXT NOT NULL, hours INTEGER NOT NULL, guests INTEGER NOT NULL, tier TEXT NOT NULL DEFAULT 'base',
  amount_huf INTEGER NOT NULL, cancel_token TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  zip TEXT NOT NULL, city TEXT NOT NULL, street TEXT NOT NULL, company TEXT, tax_number TEXT,
  occasion TEXT, note TEXT, packages TEXT NOT NULL DEFAULT '[]',
  lang TEXT NOT NULL DEFAULT 'hu', return_path TEXT NOT NULL DEFAULT '/after-hours/',
  stripe_session TEXT, stripe_payment_intent TEXT,
  invoice_no TEXT, invoice_error TEXT, invoice_tries INTEGER NOT NULL DEFAULT 0, storno_no TEXT,
  refund_huf INTEGER, refund_percent INTEGER,
  created_at TEXT NOT NULL, paid_at TEXT, cancelled_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ah_one_per_day ON ah_bookings(date) WHERE status IN ('pending', 'paid');

-- ---- Delivery ----
CREATE TABLE IF NOT EXISTS dl_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), rush_until TEXT,
  days TEXT NOT NULL DEFAULT '[1,2,3,4,5]', free_from INTEGER NOT NULL DEFAULT 5, fee_huf INTEGER NOT NULL DEFAULT 490,
  rush_max INTEGER NOT NULL DEFAULT 8, rush_eta_min INTEGER NOT NULL DEFAULT 30, updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO dl_settings (id, updated_at) VALUES (1, '2026-11-17T00:00:00.000000+00:00');

CREATE TABLE IF NOT EXISTS dl_slots (
  id TEXT PRIMARY KEY, time TEXT NOT NULL, cutoff_min INTEGER NOT NULL, capacity INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO dl_slots (id, time, cutoff_min, capacity) VALUES ('s0900', '09:00', 45, 8), ('s1030', '10:30', 45, 12), ('s1400', '14:00', 45, 12);

CREATE TABLE IF NOT EXISTS dl_day_slots (
  date TEXT NOT NULL, slot_id TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (date, slot_id)
);
CREATE TABLE IF NOT EXISTS dl_orders (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, group_code TEXT UNIQUE,
  date TEXT NOT NULL, slot_id TEXT, rush INTEGER NOT NULL DEFAULT 0, slot_time TEXT, cutoff_at TEXT,
  status TEXT NOT NULL,                    -- pending | open | new | making | out | delivered | cancelled | expired
  company TEXT NOT NULL, street TEXT NOT NULL, floor TEXT NOT NULL, note TEXT,
  contact_name TEXT NOT NULL, contact_email TEXT NOT NULL, contact_phone TEXT NOT NULL,
  fee_huf INTEGER NOT NULL DEFAULT 0, recurring_id TEXT,
  lang TEXT NOT NULL DEFAULT 'hu', return_path TEXT NOT NULL DEFAULT '/delivery/',
  created_at TEXT NOT NULL, locked_at TEXT, delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS dl_orders_date ON dl_orders(date, slot_id);
CREATE TABLE IF NOT EXISTS dl_payers (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES dl_orders(id),
  name TEXT NOT NULL, email TEXT NOT NULL, loyalty_email TEXT,
  inv_name TEXT, tax_number TEXT, zip TEXT, city TEXT, inv_street TEXT,
  organiser INTEGER NOT NULL DEFAULT 0,    -- the group's organiser (carries the fee)
  status TEXT NOT NULL,                    -- pending | paid | expired | refunded
  hold_expires TEXT,
  amount_huf INTEGER NOT NULL, fee_huf INTEGER NOT NULL DEFAULT 0, refund_huf INTEGER NOT NULL DEFAULT 0,
  stripe_session TEXT, stripe_payment_intent TEXT,
  invoice_no TEXT, invoice_error TEXT, invoice_tries INTEGER NOT NULL DEFAULT 0, storno_no TEXT,
  stamps INTEGER NOT NULL DEFAULT 0, stamped_at TEXT,
  lang TEXT NOT NULL DEFAULT 'hu', return_path TEXT NOT NULL DEFAULT '/delivery/',
  created_at TEXT NOT NULL, paid_at TEXT
);
CREATE INDEX IF NOT EXISTS dl_payers_order ON dl_payers(order_id);
CREATE TABLE IF NOT EXISTS dl_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES dl_orders(id), payer_id TEXT NOT NULL REFERENCES dl_payers(id),
  product_id TEXT NOT NULL, cat TEXT NOT NULL, label TEXT NOT NULL, who TEXT,
  milk TEXT, size INTEGER, iced INTEGER, price_huf INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dl_items_order ON dl_items(order_id);
CREATE INDEX IF NOT EXISTS dl_items_payer ON dl_items(payer_id);
CREATE TABLE IF NOT EXISTS dl_recurring (
  id TEXT PRIMARY KEY, source_order TEXT NOT NULL REFERENCES dl_orders(id),
  rule TEXT NOT NULL, slot_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
