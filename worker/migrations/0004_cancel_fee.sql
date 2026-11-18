-- 3 % handling fee (kezelési költség) kept on guest cancellations (Daniel 2026-11-18).
ALTER TABLE ah_bookings ADD COLUMN cancel_fee_huf INTEGER NOT NULL DEFAULT 0;
