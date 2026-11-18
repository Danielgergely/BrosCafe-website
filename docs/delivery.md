# Bros Delivery — spec (quiz with Daniel 2026-11-16; proposal due 2026-11-17 morning)

Coffee delivered on foot to offices within ~700 m (straight line, `DELIVERY_RADIUS_M`) of the café (1132 Budapest, Csanády u. 4/b — Váci út / Lehel /
Dunaparti offices). Delivered by one of the team.

## Order types
- **Timed order:** pick a delivery slot. Default slots 9:00 / 10:30 / 14:00; slots, cutoffs and capacity per slot
  must be editable in the admin (they will change).
- **Rush ("amint lehet"):** only when staff switch it on in the admin ("rush now available"), e.g. when the café is
  quiet. Off by default.
- **Recurring:** an office repeats an order (e.g. every weekday 10:30). Proposal to decide how (repeat button vs real
  subscription).

## Staffing constraint (important)
Today only two people work; a delivery needs both on shift (one stays at the counter). So capacity must be
controllable: slots can be closed per day, a max number of drinks per slot, and rush is a manual switch.

## Products and price
- Every drink on the menu can be ordered, no exclusions (Daniel 2026-11-17; overrides the proposal's "no espresso/tonics"). Individual drinks (named cups) and coffee boxes for meetings (box content/price: proposal).
- Same prices as in the café.
- **Delivery free from 5 drinks; below 5 a 490 Ft delivery fee.**
- Packaging: paper cups + 4-cup carriers, thermal bag; reusable Bros cups with a deposit as an option for regular
  offices (proposal: how deposit and collection work).

## Payment, invoice, loyalty
- **Company pays per order:** one person orders for the team, pays by card online, gets a company invoice (name, tax
  number, address).
- **Group order, each pays:** an organiser opens a group order for a slot and shares a link; colleagues add their
  drink and pay their own; the order locks at the cutoff. A payer who asks gets their own e-invoice; the rest are rung
  into the café till (Fruitsys) by staff, receipt only (accountant 2026-11-18).
- Online payments via Stripe; invoices via Számlázz.hu API (as for Bros After Hours, docs/after-hours.md), not Fruitsys.
- Loyalty: when individuals pay their own drink and have a loyalty card (same email / logged in), the drink earns
  their stamp (stampable categories only, same rules as in the café). Company-paid orders earn no stamps.

## Open — the proposal should recommend answers
- Group order below 5 drinks at cutoff: who pays the 490 Ft fee (split, organiser, or order cancelled)?
- Group order: what if someone hasn't paid at cutoff?
- Coffee box: contents, size, price; batch brew equipment needed?
- Reusable cups: deposit amount, collection.
- Delivery zone: decided 2026-11-18, no building list: Photon address search + straight-line radius (docs/delivery-api.md).
- Order cutoff per slot (default 45 min before) and max drinks per slot.
- How the café sees orders (admin tab, email, a printed ticket/sound at the counter).
- Legal/tax: VAT on delivered drinks vs on-site, invoice per payer, ÁSZF, food-delivery rules (NÉBIH) — flag for the
  accountant, don't assert.
