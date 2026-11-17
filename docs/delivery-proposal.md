# Bros Delivery — proposal (for decision, 2026-11-17)

Answers every open question in `docs/delivery.md`. Figures marked **(file)** come from the October margin file
(`2026-11-16_termek_koltseg_arres.numbers`, read-only); **(est.)** = my estimate, to be timed or priced; **(OSM)** =
OpenStreetMap data, not checked on the street. Legal/tax points are research notes **to confirm with the accountant**,
not advice.

## 1. Summary

**The offer**
- Coffee on foot to ~14 office buildings within 500 m (1–6 min walk), Mon–Fri, three slots: 9:00 / 10:30 / 14:00.
- Menu prices as in the café; delivery free from 5 drinks, 490 Ft below. Order closes 45 min before the slot.
- Pay online by card: one company payment, or a group link where everyone pays their own drink.
- Every payer gets an e-invoice; own-paid drinks earn loyalty stamps.
- Capacity is capped (12 drinks per slot) so the counter is never alone for more than ~20 min.

**The five decisions** (full list in §10)
1. Start a 4-week pilot with 5 named buildings — yes/no.
2. Keep 490 Ft / free from 5 — recommended yes; it works even for a single drink.
3. VAT: ask the accountant now whether delivered drinks are 27 % (not 5 %). It moves the net price by ~215 Ft per drink.
4. Group orders: the organiser carries the 490 Ft if the group ends below 5 — recommended.
5. Coffee box and reusable cups: phase 2, not in the pilot — recommended.

## 2. Delivery zone

Walking distance from Csanády u. 4/b, routed on the OSM footpath network; minutes at 4.5 km/h, door to door, without
lifts or reception. Names and tenants are as tagged in OSM and **unverified** — walk the list once before launch.

| # | Building | Address | Walk | Min | Notes |
|---|---|---|---|---|---|
| 1 | Generali office building | Váci út 36–38 | 60 m | 1 | tenant per OSM |
| 2 | Quadra office building | Váci út 30 | 150 m | 2 | OSM lists IFRC Europe, WHO Budapest Centre, Alef, eOS, Fornax, a law firm |
| 3 | Office building (Cartographia) | Visegrádi u. 31 | 170 m | 2 | 4 floors |
| 4 | Commercial building | Váci út 40 | 190 m | 3 | tenants unknown |
| 5 | Office building | Victor Hugo u. 3 | 190 m | 3 | 4 floors, tenants unknown |
| 6 | "Sóház" | Váci út (number unclear) | 220 m | 3 | OSM address tag looks wrong — verify |
| 7 | KöBE insurance office | east side of Váci út | 260 m | 4 | crossing Váci út |
| 8 | Alpha Group Irodaház | Visegrádi u. / Victor Hugo u. corner | 280 m | 4 | 6 floors; an unnamed 8-floor office next door (340 m) |
| 9 | West End Business Center | Váci út 22–24 | 310 m | 4 | Regus coworking listed here; Groupama (Váci út 20–26) |
| 10 | NAV Észak-budapesti igazgatóság | Váci út 48 C–D | 330 m | 4 | government office |
| 11 | WestPoint Business Center | Váci út (number not in OSM) | 335 m | 5 | 9 floors |
| 12 | EY | Váci út 20 | 345 m | 5 | tenant per OSM |
| 13 | Victor Hugo Irodaház | Victor Hugo u. | 390 m | 5 | NaxoNet per OSM |
| 14 | Office building | Kresz Géza u. 13–15 | 405 m | 5 | 7 floors |
| 15 | Pension-insurance office | Visegrádi u. (north) | 465 m | 6 | OSM name outdated — verify |

**Second ring (550–750 m, 7–10 min) — not in the pilot:** WestEnd Offices (Váci út 1–3, ~560 m, approximate),
Díjbeszedő (590 m), Medimpex (Lehel u. 11, 670 m), Pannónia Center (690 m), V17 (Váci út 17, 690 m), UNHCR
(Ipoly u. 5, 705 m), Dévai Center (725 m).

**Findings**
- The realistic zone is the Váci út stretch between Nyugati and Lehel tér, plus Victor Hugo / Visegrádi utca.
- Nothing office-sized lies within 500 m towards the Danube (nearest: KUBIK Rakpart coworking, ~890 m). Váci Greens is ~2 km — out.
- **Recommended zone model:** a building list, not a map polygon. The customer picks a building from a dropdown;
  "my building is missing" sends a request to hello@broscafe.hu. Admin can add/remove buildings.
- **Address fields:** building (dropdown), company, floor/door, contact name + mobile, handover (default "reception / lobby —
  we call when we arrive"; option "bring it up to floor X"), free note.

## 3. Operations

**Time per delivery (est. — time three dry runs before launch)**

| Step | 4 drinks, 150 m | 12 drinks, 400 m |
|---|---|---|
| Prep (two people at the bar, ~1 min/drink) | 4 min | 10–12 min |
| Lids, names on cups, carriers, bag | 2 min | 3 min |
| Walk there | 2 min | 5–6 min |
| Handover (reception, call, lift) | 2–3 min | 3–4 min |
| Walk back | 2 min | 5–6 min |
| **Counter alone** | **~7 min** | **~15 min** |

**Rules that follow**
- One runner, one at the counter, always. Only one person on shift → delivery is off that day (one admin switch).
- **Max 12 drinks and max 3 orders per slot**; 9:00 slot max 8. One person carries 8 in one thermal bag (two carriers), 12 with a second bag.
- **Cutoff 45 min** before the slot (keep the default). Prep starts at T−20, runner leaves at T−8.
- Longest allowed absence 20 min. A slot that would need two trips is full.

**Are the default slots quiet? No — two of three sit in strong hours (file, Oct average Mon–Fri, net Ft/hour)**

| Hour | 8–9 | 9–10 | 10–11 | 11–12 | 12–13 | 13–14 | 14–15 | 15–16 |
|---|---|---|---|---|---|---|---|---|
| Takings | 8 193 | 9 814 | 8 735 | 6 932 | 10 051 | 7 155 | 3 269 | 5 076 |

- 14:00 is the quietest hour of the day — ideal. 9:00 and 10:30 are when offices want coffee and when the café is busiest.
- "Busiest" is still about 8–9 items an hour (9 814 Ft ÷ 1 079 Ft average net item, file). One person can hold the counter for 15 min.
- **Recommendation:** launch all three slots, 9:00 capped at 8 drinks; review after two weeks.
- **Pull from the admin "Live sales" tab before deciding:** takings per hour by weekday for 8–11 and 13–15 over the last
  4 weeks (October had only 4–5 days per weekday), and the outliers: Tue 9–10 (13 772), Mon 10–11 (12 565), Thu 12–13 (13 746).
  If a weekday's 9–10 stays above ~12 000 Ft, close the 9:00 slot on that weekday.

**Rush ("amint lehet")**
- Staff switch it on only when: two on shift, no queue, no timed slot within the next 30 min.
- One rush order at a time, max 8 drinks, promise "within 30 minutes". Same fee rule.
- Switches itself off after 45 min, when a rush order arrives, and 30 min before each slot.

**Busy day**
- Close single slots or the whole day in the admin (already in the spec). Counter customers come first.
- Running late: one tap sends "kb. 10 perc késés" to the order's contact.
- Cannot deliver at all: cancel before prep, full refund including the fee, apology email.

**How orders reach the counter**
- **Admin tab "Delivery"** on the staff phone/tablet: today's slots, drinks per slot against the cap, rush switch.
- **Sound + banner** on every new order and at each cutoff ("10:30 closed — 9 drinks, 2 addresses").
- **Prep list at cutoff:** drinks grouped by type with milk choice and the name for each cup, then by address.
- **Email** to hello@broscafe.hu per order as backup (same as After Hours).
- **No ticket printer in v1** — names go on the cups by marker from the prep list. Add a label printer if volume passes ~20 drinks/day.

## 4. Products & packaging

**What travels ≤ 10 min (recommendation — confirm with a dry run: lid on, 10 min in the bag, taste)**

| Deliver | Deliver, with care | Café only |
|---|---|---|
| Americano, latte, flat white | Cappuccino (foam settles) | Espresso, double espresso, macchiato, cortado (cold in 3 min) |
| Pistachio / caramel / pumpkin spice latte | Strawberry / mango matcha (less ice) | Espresso tonic, matcha tonic (fizz + ice) |
| Matcha latte, Belgian hot chocolate | Smoothies | Hot sandwiches, waffles, sundae |
| Green / fruit tea, bottled drinks | | |

- Cold pastries and cookies as add-ons: phase 2 (needs bags and a second hand).

**Packaging per delivered drink**

| Item | Cost (net) | Source |
|---|---|---|
| 330 ml cup + lid | 36.6 Ft | file (Sanitech prices); 66 % of this is already inside the drink cost |
| 4-cup carrier | ~13 Ft per drink (~52 Ft each) | retail listing, unconfirmed — ask Sanitech |
| Sugar, napkin, stirrer | ~10 Ft | file (sugar 6.0, napkin 3.8) |
| Marker / name label | ~5 Ft | est. |
| **Extra vs a café sale** | **~45 Ft per drink** | est., used in §5 |

- One-off: 2 insulated bags that hold two carriers flat (~8 000–10 000 Ft each, est.), umbrella/rain cover.

**Coffee box — phase 2**
- **Content:** 2.5 l filter coffee (10–12 cups of 2 dl), 12 cups + lids, 0.5 l milk, 0.25 l oat drink, sugar, stirrers, napkins.
- **Price:** **9 900 Ft** (12 americanos would be 10 680 Ft).
- **Cost (est.):** ~3 400 Ft — coffee 150 g Honduras filter 1 364 Ft (file), cups 334 Ft (file), milk 368 Ft (file), sundries 180 Ft, insulated disposable box ~1 200 Ft (est., no supplier price found).
- **Margin:** ~4 100 Ft at 27 % VAT, ~5 750 Ft at 5 %, before labour.
- **Equipment:** the café has a Hario 1–4 cup filter (file), which means four hand brews (~16 min) per box. Fine for a
  pre-ordered box at 14:00, not for daily use. A batch brewer + pump thermos is ~130 000–150 000 Ft (est.).
- **Recommendation:** not in the pilot. Until then a "meeting" is simply 8–12 individual drinks. Add the box, order by
  16:00 the day before, max one per slot, once three offices have asked; buy the brewer at two boxes a week.

**Reusable cups — phase 2**
- Only for offices ordering 3+ times a week. Office "cup pool" of 10 Bros cups.
- **Deposit 1 500 Ft per cup** (est. above replacement cost), charged once on the first order, refunded when the pool is returned.
- Collection: the runner brings full cups and takes back the previous delivery's rinsed empties; the café washes them. A missing cup = its deposit.
- Open: dishwasher capacity, hygiene routine for returned cups, VAT treatment of the deposit (accountant).

## 5. Pricing & economics

**Inputs**
- Average drink in the deliverable mix: **1 303 Ft gross**, **236 Ft ingredient cost** (file, October units; includes 66 % of cup + lid).
- Packaging extra 45 Ft/drink (est.). Staff 2 600 Ft/h (est.) = 43 Ft/min; time = 1 min per drink + 2 min packing + 12 min round trip (est.).
- Stripe, Hungarian account: **1.5 % + 85 Ft** standard EEA cards; 2.8 % + 85 Ft premium (most company cards); 3.15 % + 85 Ft non-EEA; dispute 7 000 Ft. [1]
- Számlázz.hu: #start **1 990 Ft + VAT/month** (1 690 on annual billing). The Számla Agent API is listed as "extra cost";
  the price is not on the public page — ask. Shared with After Hours. [2]

**Margin per order (Ft; one payer, standard card)**

| Drinks | Customer pays | Net at 27 % VAT | Ingredients + packaging | Stripe | Staff | **Left at 27 %** | **Left at 5 %** |
|---|---|---|---|---|---|---|---|
| 1 | 1 793 (incl. 490) | 1 412 | 281 | 112 | 650 | **369** | 665 |
| 3 | 4 399 (incl. 490) | 3 464 | 843 | 151 | 737 | **1 733** | 2 459 |
| 5 | 6 515 | 5 130 | 1 405 | 183 | 823 | **2 719** | 3 794 |
| 10 | 13 030 | 10 260 | 2 810 | 280 | 1 040 | **6 129** | 8 279 |

- **Group orders cost more in card fees:** 85 Ft per payment. Ten people paying separately = 1 045 Ft Stripe instead of 280 Ft (about 100 Ft per drink). Still clearly positive (5 364 Ft left at 27 %).
- Premium card on a 10-drink order: +170 Ft.

**VAT is the biggest unknown**
- The October file shows made drinks at ~95 % net of menu price, i.e. booked at 5 %. NAV guidance treats take-away and
  delivery as a sale of goods at the product's own rate, and NAV communication says 27 % (§7).
- At 27 % a delivered drink brings **~215 Ft less net** than the same drink booked at 5 %. Menu prices can stay; the table shows it still works.

**Break-even**
- Fixed cost is tiny: ~2 000–5 000 Ft/month for invoicing (est., Agent fee unknown) + ~25 000 Ft one-off equipment. **Two orders a month cover it.**
- If a third person is ever hired for delivery (3 h/day ≈ 7 800 Ft): **~11 drinks a day** at 27 % VAT, ~9 at 5 %.
- Scale: October averaged 68 747 Ft net per open day against a break-even of 63 962 Ft (file). Ten delivered drinks a day
  add ~10 300 Ft net and ~6 100 Ft after all costs — more than the current daily surplus.

**Is 490 Ft right? Yes.**
- It covers 60–75 % of the trip's staff time, and even a single drink leaves money at 27 % VAT.
- The real limit is capacity, not margin — the per-slot cap handles that. No minimum order needed.
- Do not drop it: without the fee a one-drink order only breaks even at 27 % VAT.

## 6. Group orders

**Flow**
1. Organiser picks building, slot and their own drink, pays, gets a share link.
2. Colleagues open the link, add their name and drink, pay. A drink is on the order only once it is paid.
3. Everyone sees the live list and the countdown to the cutoff.
4. At the cutoff the order locks, the café gets the prep list, invoices go out.

**Recommended rules**

| Question | Recommendation | Why |
|---|---|---|
| Below 5 drinks at cutoff | **Organiser pays the 490 Ft.** They pay it with their own drink when opening; refunded automatically if the group reaches 5. | Simple, one person responsible, no charging colleagues afterwards. A partial refund costs the café ~7 Ft. |
| Unpaid at cutoff | **Not on the order.** No reminders by the café; the organiser sees who has paid. Only paid drinks count towards 5. | No debts, no chasing. |
| Customer cancels | Free until the cutoff via a link in the email (full refund). After the cutoff: no cancellation. | After the cutoff the drink is being made. |
| Café cancels | Full refund including the fee, always. | — |
| Wrong / cold / spilled drink | Remake on the next slot or refund that drink, staff decide the same day in the admin. | Cheaper than a card dispute (7 000 Ft). |
| Late (> 15 min) | Refund the delivery fee if one was paid. | — |
| Slot cap reached | The link shows "full for this slot"; nobody can pay for a drink that cannot be made. | — |

- **Invoices at the lock, not at payment** — the order is final then (fee, cancellations), so no correcting invoices. Accountant to confirm the dating.
- Each cancellation refund costs the café the original card fee (~105 Ft per drink); acceptable in a pilot.

**Recurring orders: repeat button, not a subscription**
- "Rendeld újra" on any past order, plus an optional standing order: the day before at 15:00 the organiser gets an email "Holnap 10:30 — megerősíted?" with one click to pay.
- No saved cards or automatic charges in v1. Revisit a real subscription (saved card, monthly summary invoice) when one office orders 3+ times a week for three weeks.

## 7. Payment, invoices, loyalty

**Payment and invoices**
- **Company pays:** one Stripe Checkout payment; company name, tax number and address are required; one invoice.
- **Each pays:** one Checkout payment and one e-invoice per payer (name + address; company details optional).
- Invoices via Számlázz.hu Számla Agent, one account and API key with After Hours. Not Fruitsys.
- Delivery fee as its own invoice line.

**Loyalty**
- A stamp per stampable drink (coffee, specialty, tea, smoothie — same as the café; bottled never) for a payer who is
  logged in or whose email has a loyalty card.
- **Credited when staff mark the order "delivered"**, not at payment — a cancelled order earns nothing.
- Company-paid orders: no stamps. Free-drink redemption stays in the café for now.

**Legal / tax — all to confirm with the accountant**

| Topic | What the research suggests | Ask |
|---|---|---|
| VAT rate | 5 % applies to on-premises catering service only (Áfa tv. Annex 3, Part II, pt 3; TESZOR 56.10). NAV 2023/7 lists take-away and delivery of food and on-site-made soft drinks as a sale of goods "at the product's own rate"; NAV press material says 27 %. [3][4] | Is delivered coffee 27 %? How does the till split eat-in vs take-away today (the file shows ~5 % on made drinks)? |
| Delivery fee VAT | Sources disagree on whether it follows the drinks or is taxed separately. [4] | Rate and invoice line for the 490 Ft. |
| Receipt vs invoice | An invoice may be issued instead of a till receipt (Áfa tv. 166. §), so online-paid orders may not need to go through the cash register. Not confirmed for this exact case; cash-register rules changed in 2025. [5] | Is a Számlázz.hu invoice per payer enough, with nothing entered in Fruitsys? |
| NAV Online Számla | Számlázz.hu states NAV-compatible invoicing on every plan; invoices to private persons are reported too. [2] | Confirm the account's NAV connection is set up. |
| Invoice date | Payment precedes delivery by hours or a day. | Invoice at lock with the delivery day as fulfilment date — acceptable? Any advance-invoice issue for next-day orders? |
| ÁSZF / consumer rules | 45/2014. (II. 26.) Korm. rendelet: pre-contract information, "order with obligation to pay" button; perishable goods are an exception to the 14-day withdrawal right. [6] | Reuse the After Hours ÁSZF structure; add a delivery chapter; update the privacy notice (name, office address, phone). |
| Allergens | The menu already holds allergens and milk options. | Show them at ordering (distance-selling food information rules). |
| Food hygiene | NÉBIH's catering good-hygiene guide has a transport chapter; rules under 62/2011. (VI. 30.) VM rendelet: closed containers, clean food-only carrier, temperature kept, the business is responsible during transport. [7] | Add delivery to the HACCP file. Does delivery need to be notified to the district licensing office as a new form of sale? |
| Reusable-cup deposit | — | VAT and bookkeeping of the deposit. |

## 8. Rollout

**Pilot: 4 weeks, 5 buildings, starting when the page is live**
- Buildings 1, 2, 3, 8 and 9 from §2 (all ≤ 4 min).
- Week 0: dry runs (timing, taste after 10 min), walk the zone and correct the building list, accountant answers on VAT and invoicing.
- Weeks 1–2: slots 10:30 and 14:00 only, cap 8. Weeks 3–4: add 9:00, cap 12, switch rush on when quiet.

**Getting the first offices (drafts — nothing has been sent)**
- **Reception visit** with five free tasting cups and a card with a QR code:
  *"Sziasztok, a Bros Cafe-ból jöttünk, itt vagyunk a Csanády utcában. Mostantól gyalog áthozzuk a kávét az irodába — hoztunk kóstolót."*
- **Flyer / lift poster:**
  *"Kávé az irodába, gyalog. Bros Cafe, Csanády u. 4/b. Rendelj 9:00-ra, 10:30-ra vagy 14:00-ra — 5 italtól ingyen hozzuk. broscafe.hu/delivery"*
- **LinkedIn post (Daniel's profile):**
  *"Szeptemberben nyitottunk a Csanády utcában. Novembertől a környék irodáiba gyalog visszük a kávét: csoportos rendelés egy linkkel, mindenki fizeti a sajátját, számlával. Az első öt irodaházat keressük — ha a Váci út 20–40. környékén dolgozol, írj."*
- A card with the QR code in every take-away bag; regulars who work nearby are the best first organisers.

**Success after 4 weeks (proposed targets)**

| Metric | Target |
|---|---|
| Orders per week (week 4) | ≥ 15 |
| Drinks per order | ≥ 4 |
| Delivered within ±5 min of the slot | ≥ 90 % |
| Offices that ordered again | ≥ 3 |
| Refunds / remakes | ≤ 3 % of drinks |
| Counter takings in slot hours vs the four weeks before | no drop |

- Stop or rethink if week 4 has fewer than 5 orders, or if the counter visibly suffers.

**Build first**
- Building list, three slots with cutoff and caps, day/slot close, rush switch.
- Company order and group order with the fee rule, Stripe Checkout, Számlázz.hu invoice at lock, cancel link.
- Admin "Delivery" tab with sound, prep list, "delivered" button → stamps. Order emails.

**Later**
- Repeat button and standing order; coffee box; reusable cups; pastry add-ons; label printer; authorise-then-capture
  payments (no refunds needed); second-ring buildings; monthly invoice for regular offices.

## 9. Risks

| Risk | What happens | Mitigation |
|---|---|---|
| Staff | One person ill → no delivery; counter queue while the runner is out | "Delivery off today" switch; 20-min absence limit; caps |
| Weather | Rain, ice: slower, spills | Zipped bag, rain cover, close slots on bad days |
| Quality | Lukewarm or flat drinks hurt the brand in exactly the offices it wants | Short menu, 500 m limit, dry runs, remake/refund rule |
| Payment disputes | 7 000 Ft per chargeback | Quick refunds; clear ÁSZF; receipt email with what was delivered |
| Group-order friction | Colleagues pay late, order ends below 5 | Live list and countdown; organiser fee rule shown up front |
| VAT | 27 % instead of 5 % cuts ~215 Ft net per drink | Decide with the accountant before launch; numbers in §5 already assume 27 % |
| Legal | Missing ÁSZF/privacy text, hygiene file not updated | Checklist in §7 before go-live |
| Building access | Reception will not let a runner up | Default handover in the lobby with a phone call |
| Demand | Too few orders to justify the build | Small pilot, stop rule in §8 |

## 10. Decisions for Daniel

| # | Question | Recommendation |
|---|---|---|
| 1 | Run a 4-week pilot? | **Yes** |
| 2 | Pilot buildings | **§2 no. 1, 2, 3, 8, 9** |
| 3 | Zone model: building list or map polygon | **Building list** |
| 4 | Slots | **9:00 / 10:30 / 14:00**, weeks 1–2 without 9:00 |
| 5 | Cutoff | **45 min** |
| 6 | Cap per slot | **12 drinks, 3 orders; 9:00 slot 8 drinks** |
| 7 | Fee | **490 Ft below 5 drinks, free from 5, no minimum order** |
| 8 | Group below 5 at cutoff: organiser / split / cancel | **Organiser pays, refunded at 5** |
| 9 | Unpaid at cutoff | **Dropped; only paid drinks count** |
| 10 | Cancellation | **Free until cutoff, none after; café cancellation = full refund** |
| 11 | Menu for delivery | **§4 list: no espresso-size drinks, no tonics** |
| 12 | Coffee box in the pilot? | **No — phase 2 at 9 900 Ft / 2.5 l** |
| 13 | Reusable cups in the pilot? | **No — phase 2, 1 500 Ft deposit per cup** |
| 14 | Recurring: repeat button or subscription | **Repeat button + day-before confirmation** |
| 15 | Stamps credited at payment or at delivery | **At delivery** |
| 16 | Orders at the counter | **Admin tab + sound + email; no printer** |
| 17 | Rush in the pilot? | **From week 3, rules in §3** |
| 18 | Send the §7 questions to the accountant this week? | **Yes — VAT rate first** |

## Sources

1. Stripe pricing, Hungary — https://stripe.com/en-hu/pricing (read 2026-11-16)
2. Számlázz.hu prices — https://www.szamlazz.hu/arak/ (read 2026-11-16); Számla Agent — https://docs.szamlazz.hu/agent/
3. NAV, 2023/7. Adózási kérdés (5 % catering rate) — https://nav.gov.hu/ado/adozasi_kerdes/2023-7_-_Az_etkeztetesi_vendeglato_szolgaltatasok_nyujtasa_soran_alkalmazando_5_-os_adomertek
4. NAV press item on eat-in vs take-away/delivery rates — https://nav.gov.hu/sajtoszoba/hirek/Az_ettermi_szoftver_nem_hazudik ; Adózóna on the delivery fee — https://adozona.hu/afa/Ettermi_szolgaltatas_helyett_etelkiszallita_B7P6CD (search summaries only, pages not opened)
5. 48/2013. (XI. 15.) NGM rendelet (cash registers) — https://net.jogtar.hu/jogszabaly?docid=a1300048.ngm (search summary only)
6. 45/2014. (II. 26.) Korm. rendelet — https://net.jogtar.hu/jogszabaly?docid=a1400045.kor ; Budapest conciliation board recommendation on food orders — https://bekeltet.bkik.hu/sites/bekeltet/files/document/2019-05/BBT-1-2019.-Ajanlas-Etelrendeles-2019.05.22.pdf (search summaries only)
7. NÉBIH catering good-hygiene guide — https://portal.nebih.gov.hu/-/vendeglatas-ghp (search summary only)
8. Buildings and walking distances — OpenStreetMap (Overpass) and the OSM foot router, queried 2026-11-16
9. Café figures — `2026-11-16_termek_koltseg_arres.numbers` (October 2026: Termékek, Órák, Alapanyagok, Rezsi sheets)
