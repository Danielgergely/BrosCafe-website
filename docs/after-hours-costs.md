# After Hours platter costs and price options (2026-11-18)

**Decided (Daniel, 2026-11-18): 1 platter 2 500 Ft per guest, every further platter +1 500 (2 → 4 000, 3 → 5 500).** The brothers work the evenings on their monthly salary, so the café fee is close to pure profit; the staff lines below are the cautious view.

Net HUF, without VAT. Model and inputs: `docs/after-hours-cost-model.py` (run it with python3); ingredient prices come from the café's own invoices (`HungBros/06_Mukodes/Arazas/2026-10-08_alapanyagok_fruitsys.numbers`, recipes in `2026-11-16_termek_koltseg_arres.numbers`).

## Food cost per guest, one large platter portion each (+10 % for trim and leftovers)

| Platter | Portion per guest | Cost | How sure |
|---|---|---|---|
| Waffle board | 1 waffle (café recipe) + 80 g fruit, chocolate, hazelnut cream, cream, almonds | 432 | invoices |
| Mini pizza bites | ~3 pieces: 110 g dough, 45 g mozzarella, 30 g ham/salami, sauce | 308 | mostly invoices |
| Fresh fruit & veggie board | 130 g fruit, 125 g vegetables, 40 g dip | 470 | estimated (winter fruit prices) |
| Mini burger sliders | 2 sliders: 110 g beef, 2 buns, cheddar, salad, sauces | 796 | estimated (beef 3 600 Ft/kg, bun 95 Ft) |
| Mini sandwich selection | ≈ 1 café sandwich in small pieces | 461 | invoices |
| Cheese & charcuterie board | 60 g cheese, 45 g cured meat, crackers, grapes, nuts/olives, jam | 560 | about 1/3 estimated |

Average 504, worst (burgers) 796. Welcome drink: 300 (café drink mix; specials up to ~550).

The café sells the same food for about 1 400–1 500 Ft gross (sandwich, waffle), so a platter per guest is worth that much on the daytime menu.

## Evening costs besides food
- Staff: 2 people for the evening + 1¼ h set-up/clean-down + plating (12 min + 1 min per guest per platter), 2 100 Ft/h loaded (Dávid's wage + 13 % szocho). With an overtime premium (×1.5) every evening costs ~5 000–6 000 Ft more.
- Energy + dishwasher ~1 300 per 2 h; card fee 1.6 % of revenue; local business tax 2 % of margin.
- Café fee 12 900 (27 % VAT) ≈ 10 160 net. It covers staff only in part.

## Today's ladder (2 500 / 3 200 / 3 900): why it loses
A 2nd or 3rd platter brings +700 gross = 667 net per guest, while it costs 504 on average and 796 for burgers, plus plating time. 3 platters run at 49 % food cost. A 2-person evening breaks even at best (−10 Ft).

## Three options (gross per guest; café fee stays 12 900)

| | 1 platter | 2 | 3 | Extra platter (4th+) | Headline | Food cost at 3 |
|---|---|---|---|---|---|---|
| Low | 2 500 | 3 600 | 4 700 | +1 700 (burger, cheese +2 000) | 17 900 Ft-tól | 41 % |
| Middle | 2 900 | 4 400 | 5 900 | +2 000 (burger, cheese +2 400) | 18 700 Ft-tól | 32 % |
| High | 3 500 | 5 300 | 7 100 | +2 400 (burger, cheese +2 800) | 19 900 Ft-tól | 27 % |

Profit per evening (net, after food, staff, energy, fees; average platter mix, no overtime premium; worst mix = burgers/cheese in brackets):

| Evening | Low | Middle | High |
|---|---|---|---|
| 2 guests, 1 platter | −10 (−581) | 725 (154) | 1 827 (1 255) |
| 4 guests, 1 platter | 2 934 | 4 403 | 6 607 |
| 4 guests, 2 platters | 4 436 | 7 374 | 10 679 |
| 6 guests, 3 platters | 10 804 (5 662) | 17 414 (12 272) | 24 024 (18 882) |
| 8 guests, 3 + 1 extra | 23 500 | 34 517 | 46 269 |
| 12 guests, 3 platters | 25 401 | 38 621 | 51 842 |

Middle matches the café's own daytime price per portion (+1 500 per extra platter ≈ one sandwich or waffle), puts food cost at 32 % (usual for restaurants: 28–35 %) and has the 5 900 that was in the brothers' own draft.

## What the prices don't fix
Small groups: at 2 guests with 1 platter, every option earns at most ~1 800 Ft for a whole evening, and all of them lose money if staff get overtime. Options: a minimum of 4 guests, a higher café fee, or running small evenings with one person.

## To confirm with the brothers
Beef, slider buns, crackers and winter fruit prices; the real portion sizes; whether one or two people work an evening; overtime pay.

## Unlimited drinks (2026-11-18): drinks we make only; bottled drinks are bought separately

Material cost per drink from the 2026-10 margin analysis (Termékek sheet, sold units as weights):

| Group | Cost per drink | Range | Avg price (gross, 5 % VAT) |
|---|---|---|---|
| Coffees | 174 | 82–233 | ~1 115 |
| Specialities (flavoured lattes, matcha, hot chocolate, espresso tonic) | 342 | 217–545 | ~1 590 |
| Teas | 77 | 71–90 | ~1 155 |
| Smoothies | 555 | 351–922 | ~1 550 |

Evening mix assumed (fewer espressos, more specialities/tea/smoothies): 35 % coffee, 35 % speciality, 15 % tea,
15 % smoothie → **~285 Ft per drink** with 3 % waste; a heavy speciality/smoothie drinker ~420.

Drinks per guest (the welcome drink, 300 Ft, is already in the platter price; the package replaces it):

| Evening | Drinks per guest | Cost | Extra cost over the welcome drink |
|---|---|---|---|
| 2 h, light | 2 | 570 | 270 |
| 2 h, typical | 3 | 855 | 555 |
| 3 h, typical | 4 | 1 140 | 840 |
| 4 h, typical | 5 | 1 425 | 1 125 |
| 2 h, heavy (smoothies/specialities) | 5 | 2 100 | 1 800 |

Options per guest for the whole evening (gross; net = ÷ 1.05), profit per guest over the welcome drink:

| Price | Typical 2 h | Typical 4 h | Heavy 2 h | Pays off after (extra drinks at 285) |
|---|---|---|---|---|
| 1 500 | +874 | +304 | −371 | 5 |
| **2 500** | **+1 826** | **+1 256** | **+581** | **8** |
| 3 500 | +2 778 | +2 208 | +1 533 | 12 |

2 500 ≈ the price of two café drinks, so "unlimited for the price of two" reads as good value, and it stays profitable
even for heavy drinkers and the longest evening. Suggested rules: whole group or nobody (otherwise glasses get shared);
smoothies 3 dl; bottled drinks (soft drinks, waters, tonics) at the café price on the evening. Staff time is the real
limit: unlimited drinks mean more barista work for the person serving.
