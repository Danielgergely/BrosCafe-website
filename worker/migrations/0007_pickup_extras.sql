-- Delivery 2026-11-19: pickup at the counter (outside the zone or by choice), and per-cup extras (decaf, whipped cream) + a note.
ALTER TABLE dl_orders ADD COLUMN pickup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dl_items ADD COLUMN extras TEXT;
ALTER TABLE dl_items ADD COLUMN note TEXT;
