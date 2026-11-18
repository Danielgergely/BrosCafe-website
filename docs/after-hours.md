# Bros After Hours — spec (agreed with Daniel 2026-11-16, goes live with the new site)

Private evening: a group books the whole café. **Evenings run 18:00–22:00** (Daniel 2026-11-17: don't advertise
"18:00–20:30"). The base price covers **2 hours**; guests choose a start (18:00–20:00, half-hourly) and a length
(2, 3 or 4 h), ending by 22:00. Bookable from 2026-12-01, or from the publish day if that is later.

## Offer (Daniel 2026-11-17, evening: mix of his concept and his brother's; to confirm with the brothers)
- Group: 2–12 people, one booking per evening, everything **prepaid online** (brother's idea), food always included so
  the advertised price is the real minimum (Daniel: "we lie if we say it only costs x when they must buy some food").
- **Private café, 2 hours: 12 900 Ft** (flat): the café only for them, setup, staff.
- Plus food on a price ladder (Daniel 2026-11-18, "no menu wording"; opening price as cheap as possible): every guest
  gets a welcome drink (any drink from the menu) and the group picks any of the six dishes, prepared for everyone:
  **1 tál/platter 2 500 Ft/person, every further platter +1 500** (2 tál 4 000 · 3 tál 5 500 · 4 tál 7 000) (Daniel 2026-11-18, after docs/after-hours-costs.md) (Daniel: the general name is tál/platter, never menü or fogás) (tiers `alap`/`duo`/`menu`); from the 4th dish on, each
  is an extra at its own price (below). The page shows one list of six photo cards; each says what ticking it costs.
  - The six dishes (the brothers' list, Daniel 2026-11-18; titles stay English, descriptions Hungarian): Waffle board
    (gofri, gyümölcsök, csokoládé és feltétek) · Mini pizza bites (mini pizzák paradicsomos szósszal és sajttal) · Fresh
    fruit & veggie board (friss gyümölcsök, zöldségek és mártogatósok) · Mini burger sliders (mini hamburgerek sajttal és
    salátával) · Mini sandwich selection (mini szendvicsek változatos töltelékekkel) · Cheese & charcuterie board (sajtok,
    szalámi, kekszek és gyümölcsök).
  - **Extra dishes** (4th dish on, per person): waffle, pizza, fruit & veggie, sandwich
    +1 500 Ft each, like the 2nd and 3rd (Daniel 2026-11-18: keep it simple).
- **VAT** (Daniel 2026-11-18): café fee and extra hours 27 % (room, `AH_VAT`); package and extra dishes 5 % (food and
  drink served in-house, `AH_FOOD_VAT`). The voucher lowers the café line.
- **Extra hour: +5 900 Ft** (max 2, until 22:00; start 18:00–20:00). **Cake** from 10 000 Ft (optional).
- Headline: **"17 900 Ft-tól"** (2 people, 2 hours, drink + food). Examples: 1 tál 2 p 17 900 · 6 p 27 900 · 12 p 42 900; 2 tál 6 p 36 900;
  3 tál 2 p 23 900 · 6 p 45 900 · 12 p 78 900 · 12 p 4 h 90 700 · 6 p + 1 extra 54 900; 1 tál 4 p + AFTER25 19 675. (Daniel's 14 900 base and the brother's 15 000 + 5 900/person = 50 400
  for 6 were the two ends.)
- Voucher **AFTER25**: −25 % of the café fee only (−3 225 Ft), never the food.
- Occasion field: Születésnap / Romantikus este / Baráti összejövetel / Céges / Családi alkalom / Egyéb.
- Rough cost at 6 p (estimate, confirm with the brothers' real dish costs): staff 7 800 + energy 1 200 + Alap ~1 000/p
  → ~15 000 Ft vs 27 900; menu ~1 800 food + 400 drink per person → ~22 200 Ft vs 36 300.
- Accountant: on-site food may be 5 % VAT, the room fee 27 %: the invoice probably needs separate lines.
- History: 24 900 flat up to 6 + 2 990/extra (16 Nov) dropped; 9 900 + 3 490/person dropped.

## Booking
- Calendar picker: guests see only days the café has opened. Admin opens/blocks single days (Mon–Sat default
  candidates, Sundays only if enabled). Booking window: up to 3 months ahead, at least 3 days' notice, never before 2026-12-01 (or the publish day). Booked evenings stay visible as "már foglalt".
- Instant booking, everything prepaid online (café fee, package, extra dishes, extra hours, minus the voucher). Only the cake and anything ordered on the evening is paid on site (Fruitsys, card/cash).
- Cancellation (agreed by Daniel 2026-11-16, ÁSZF wording pending): full refund ≥ 7 days before, 50 % until 48 h, none after; applies to the whole prepaid total (food and drinks included). Leisure services
  for a specific date have no 14-day withdrawal right in HU, so these terms apply.
- Cancellation channels: a cancel button in the confirmation email (signed link, shows the refund amount before
  confirming), reply by email, or staff cancel in the admin; refund per the rule above, automatic via Stripe.
- Form: name, email, phone, billing address (Hungary only) (needed for the invoice), optional company name + tax number, occasion,
  free note (allergies etc.), group size, package (Alap + board / menu + 3 dishes + extras), cake checkbox, optional voucher code, accept terms.

## Payment and invoice
- Stripe Checkout (card, Apple/Google Pay), payout to the Gránit account. One line per price line (voucher taken off the café line).
- Fruitsys can't invoice online payments → Számlázz.hu via API, issued and emailed when the payment succeeds.
  Accountant to confirm: advance invoice (előlegszámla) vs final invoice, VAT rate for the room fee.

## Notifications and admin
- Email to hello@broscafe.hu per booking (details + payment status); confirmation email to the guest.
- Admin tab "Bros After Hours": calendar (open/block days), bookings list, cancel + refund.

## Open (needs Daniel / the brothers / accountant)
- Final prices (draft estimate above); tiers or not.
- ÁSZF wording and who signs it off. Food selection contents and how food is paid (the owners are still working on them).
- Confirm the surcharge amounts (extra person, extra hour). Cost check above predates the free drink per guest: redo it.
- Stripe account for HungBros Kft.; Számlázz.hu account + API key.
- Accountant: invoice type and VAT.
