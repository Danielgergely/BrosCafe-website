-- Accountant 2026-11-18: After Hours final invoice (végszámla) dated the evening; correcting invoice (helyesbítő) after a partial refund.
ALTER TABLE ah_bookings ADD COLUMN final_no TEXT;
ALTER TABLE ah_bookings ADD COLUMN final_error TEXT;
ALTER TABLE ah_bookings ADD COLUMN final_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ah_bookings ADD COLUMN correction_no TEXT;
ALTER TABLE ah_bookings ADD COLUMN correction_error TEXT;
ALTER TABLE ah_bookings ADD COLUMN correction_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dl_payers ADD COLUMN correction_no TEXT;
ALTER TABLE dl_payers ADD COLUMN correction_error TEXT;
ALTER TABLE dl_payers ADD COLUMN correction_tries INTEGER NOT NULL DEFAULT 0;
