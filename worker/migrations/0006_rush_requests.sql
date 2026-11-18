-- Delivery rush orders are requests (2026-11-18): the card is authorised, staff accept with an ETA or decline.
-- dl_orders.status gains 'requested' and 'declined'; dl_payers.status gains 'authorised' and 'released'.
ALTER TABLE dl_orders ADD COLUMN answer_by TEXT;
ALTER TABLE dl_orders ADD COLUMN eta_at TEXT;
