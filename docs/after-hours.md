# Bros After Hours — spec (agreed with Daniel 2026-11-16, goes live with the new site)

Private evening: a group books the whole café. **Evenings run 18:00–22:00** (Daniel 2026-11-17: don't advertise
"18:00–20:30"). The base price covers **2 hours**; guests choose a start (18:00–20:00, half-hourly) and a length
(2, 3 or 4 h), ending by 22:00. Bookable from 2026-12-01, or from the publish day if that is later.

## Offer (Daniel 2026-11-17: stick to ~14 900 and work with extras)
- Group: 2–12 people. One booking per evening.
- **Base 14 900 Ft:** the café for 2–6 people, 2 hours, the basic food package (snack plate), unlimited regular
  drinks (coffee, tea), one of the team serving. This sentence goes into the terms (ÁSZF) as well.
- **Surcharges (DRAFT amounts, to confirm):** +1 990 Ft per extra person (7–12); +5 900 Ft per extra hour (max 2,
  until 22:00). Examples: 6 p/2 h → 14 900; 8 p/2 h → 18 880; 6 p/3 h → 20 800; 12 p/4 h → 38 640.
- Cost check (estimate, 2026-11-17): at 6 people/2 h ≈ staff 3 h incl. setup 7 800 + ingredients ~5 400 + light/heat
  ~1 200 ≈ 14 400 Ft, so the base roughly breaks even at 6; the margin comes from extras, extra hours and small
  groups. Refine with the /broscafe-analysis Numbers costs before publishing.
- Welcome drink / specialty drinks moved to the extras (not in the base any more).
- Add-on packages, per person, prices TBD: buffet (sandwiches, croissants, sweets), dessert/cake, specialty drinks.
  Shop products can be bought individually on the evening.
- History: 24 900 flat up to 6 + 2 990/extra (16 Nov) dropped; 9 900 + 3 490/person dropped.

## Booking
- Calendar picker: guests see only days the café has opened. Admin opens/blocks single days (Mon–Sat default
  candidates, Sundays only if enabled). Booking window: up to 3 months ahead, at least 3 days' notice, never before 2026-12-01 (or the publish day). Booked evenings stay visible as "már foglalt".
- Instant booking with an online deposit = base fee + surcharges (people, hours). Packages and extras are paid on the evening (Fruitsys, card/cash).
- Cancellation (agreed by Daniel 2026-11-16, ÁSZF wording pending): full refund ≥ 7 days before, 50 % until 48 h, none after. Leisure services
  for a specific date have no 14-day withdrawal right in HU, so these terms apply.
- Cancellation channels: a cancel button in the confirmation email (signed link, shows the refund amount before
  confirming), reply by email, or staff cancel in the admin; refund per the rule above, automatic via Stripe.
- Form: name, email, phone, billing address (Hungary only) (needed for the invoice), optional company name + tax number, occasion,
  free note (allergies etc.), group size, chosen packages (indicative, paid on site), accept terms.

## Payment and invoice
- Stripe Checkout (card, Apple/Google Pay), payout to the Gránit account. Online only for the deposit.
- Fruitsys can't invoice online payments → Számlázz.hu via API, issued and emailed when the payment succeeds.
  Accountant to confirm: advance invoice (előlegszámla) vs final invoice, VAT rate for the room fee.

## Notifications and admin
- Email to hello@broscafe.hu per booking (details + payment status); confirmation email to the guest.
- Admin tab "Bros After Hours": calendar (open/block days), bookings list, cancel + refund.

## Open (needs Daniel / the brothers / accountant)
- Final prices (draft estimate above), packages; tiers or not.
- ÁSZF wording and who signs it off. Package contents (the brothers are still working on them).
- Confirm the surcharge amounts (extra person, extra hour) and whether the welcome drink stays out of the base.
- Stripe account for HungBros Kft.; Számlázz.hu account + API key.
- Accountant: invoice type and VAT.
