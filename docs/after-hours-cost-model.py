"""After Hours platter cost model. Net HUF. Invoice prices from 2026-10-08_alapanyagok_fruitsys / 2026-11-16 analysis;
E = estimate (not bought yet). One 'large platter' portion per guest, whatever the number of platters."""
I = {  # Ft per g / ml / db (net)
    'flour': .144, 'milk': .465, 'butter': 2.14, 'egg': 59, 'sugar': .232, 'bpowder': 1.386, 'salt': .254,
    'cream_spray': 3.746, 'choc_sauce': 1.57, 'hazel_cream': 1.885, 'almond': 3.195, 'berries_frozen': 1.395, 'banana': .55,
    'puff_dough': .859, 'mozz_block': 1.78, 'salami': 3.535, 'ham': 1.772, 'prosciutto': 4.718, 'gouda': 2.128,
    'camembert': 2.818, 'cheddar': 1.92, 'cherry_tom': 2.126, 'salad': 3.932, 'mayo': .818, 'ketchup': .708, 'mustard': .516,
    'pesto': 2.565, 'cheese_spread': 1.305, 'sandwich_bread': 174.927, 'ciabatta': 113,
    # estimates
    'passata': .6, 'oregano_oil': 1.0, 'fresh_fruit_mix': 1.6, 'veg_mix': 1.1, 'dip': 1.4, 'slider_bun': 95,
    'minced_beef': 3.6, 'onion_pickle': 1.2, 'crackers': 2.2, 'grapes': 1.5, 'nuts_olives': 3.2, 'jam_honey': 1.4,
}
E_MARK = {'passata', 'oregano_oil', 'fresh_fruit_mix', 'veg_mix', 'dip', 'slider_bun', 'minced_beef', 'onion_pickle', 'crackers', 'grapes', 'nuts_olives', 'jam_honey'}
waffle_batter = {'flour': 80, 'milk': 100, 'butter': 20, 'egg': .5, 'sugar': 20, 'bpowder': 5, 'salt': 3}  # the café's own recipe = 1 waffle
P = {  # per guest, a generous share
    'Waffle board': {**waffle_batter, 'berries_frozen': 40, 'banana': 40, 'choc_sauce': 20, 'hazel_cream': 20, 'cream_spray': 25, 'almond': 3},
    'Mini pizza bites': {'puff_dough': 110, 'passata': 35, 'mozz_block': 45, 'salami': 15, 'ham': 15, 'oregano_oil': 5},
    'Fresh fruit & veggie board': {'fresh_fruit_mix': 130, 'veg_mix': 100, 'cherry_tom': 25, 'dip': 40},
    'Mini burger sliders': {'slider_bun': 2, 'minced_beef': 110, 'cheddar': 25, 'salad': 8, 'cherry_tom': 15, 'onion_pickle': 10, 'mayo': 8, 'ketchup': 8, 'mustard': 4},
    'Mini sandwich selection': {'sandwich_bread': 1, 'ham': 20, 'prosciutto': 10, 'gouda': 20, 'cheese_spread': 20, 'butter': 8, 'pesto': 8, 'salad': 6, 'cherry_tom': 15},
    'Cheese & charcuterie board': {'gouda': 25, 'camembert': 20, 'cheddar': 15, 'prosciutto': 20, 'salami': 25, 'crackers': 30, 'grapes': 40, 'nuts_olives': 15, 'jam_honey': 10},
}
BUFFER = 1.10      # make a little more than eaten + trim/waste
DRINK = 300        # welcome drink: café drink mix ~190-250 material, specials up to ~550 (espresso tonic)
WAGE_H = 2100      # loaded hourly cost: 322 800 gross + 13 % szocho / ~174 h (Dávid)
PREP_MIN = lambda guests: 12 + 1.0 * guests  # per platter: set-up + plating minutes
FOOD_VAT, ROOM_VAT, CARD, HIPA = .05, .27, .016, .02

cost = {k: round(sum(I[i] * q for i, q in v.items()) * BUFFER) for k, v in P.items()}
est_share = {k: sum(I[i] * q for i, q in v.items() if i in E_MARK) / sum(I[i] * q for i, q in v.items()) for k, v in P.items()}


def evening(guests, platters, extras, ladder, extra_price, hours=2, overtime=1.0, mix='avg'):
    """Contribution of one evening, net HUF. ladder = gross per person for 1/2/3 platters; extras priced extra_price each."""
    avg = sum(cost.values()) / 6
    pc = {'avg': avg, 'worst': max(cost.values())}[mix]
    food_cost = guests * (DRINK + pc * (platters + extras))
    food_gross = guests * (ladder[platters - 1] + extras * extra_price)
    room_gross = 12900 + 5900 * (hours - 2)
    net = food_gross / (1 + FOOD_VAT) + room_gross / (1 + ROOM_VAT)
    # staff: 2 people for the evening + 30 min set-up and 45 min clean-down for one; plating time per platter
    labour = WAGE_H * overtime * (2 * hours + 1.25 + (platters + extras) * PREP_MIN(guests) / 60)
    energy = 900 * hours / 2 + 400  # lights, heat, dishwasher
    fees = net * CARD + (net - food_cost) * HIPA
    profit = net - food_cost - labour - energy - fees
    return round(net), round(food_cost), round(labour), round(profit)


if __name__ == '__main__':
    for k, v in cost.items():
        print(f'{k:28s} {v:5d} Ft/fő  (estimated inputs {est_share[k]:.0%})')
    print('avg', round(sum(cost.values()) / 6), 'worst', max(cost.values()))
    OPTS = {
        'now':    ([2500, 3200, 3900], 1700),
        'low':    ([2500, 3600, 4700], 1700),
        'middle': ([2900, 4400, 5900], 2000),
        'high':   ([3500, 5300, 7100], 2400),
    }
    CASES = [(2, 1, 0), (4, 1, 0), (4, 2, 0), (6, 3, 0), (8, 3, 1), (12, 3, 0)]
    for name, (lad, ex) in OPTS.items():
        print(f'\n== {name}: per person {lad}, extra {ex}')
        for g, p, e in CASES:
            net, fc, lab, pr = evening(g, p, e, lad, ex)
            _, _, _, prw = evening(g, p, e, lad, ex, mix='worst')
            _, _, _, pro = evening(g, p, e, lad, ex, overtime=1.5)
            gross_total = 12900 + g * (lad[p - 1] + e * ex)
            print(f'{g:2d} fő {p} tál +{e}: guest pays {gross_total:6d}  net {net:6d} food {fc:6d} staff {lab:6d}  profit {pr:6d}  (worst-mix {prw:6d}, overtime×1.5 {pro:6d})')
        # marginal: what one more platter per guest earns vs costs
        step = (lad[1] - lad[0]) / (1 + FOOD_VAT)
        avg = sum(cost.values()) / 6
        print(f'  2nd platter: +{lad[1]-lad[0]} gross = {step:.0f} net vs food {avg:.0f} avg / {max(cost.values())} worst per guest; food cost % at 3 platters: {(DRINK + 3*avg)/(lad[2]/(1+FOOD_VAT)):.0%}')
