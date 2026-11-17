-- Bros After Hours: optional cake request + voucher code (discount comes off the base fee; amount_huf is what was charged).
ALTER TABLE ah_bookings ADD COLUMN cake INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ah_bookings ADD COLUMN voucher_code TEXT;
ALTER TABLE ah_bookings ADD COLUMN discount_huf INTEGER NOT NULL DEFAULT 0;
