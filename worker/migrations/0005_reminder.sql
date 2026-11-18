-- After Hours reminder email the day before (Daniel 2026-11-18); 'skip' when booked the day before or later.
ALTER TABLE ah_bookings ADD COLUMN reminder_sent_at TEXT;
