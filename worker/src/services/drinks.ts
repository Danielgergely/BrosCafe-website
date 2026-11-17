// Which drink a stamp was for. Port of backend/app/services/drinks.py.
import type { App } from '../http';
import type { Doc, Filter } from '../db';
import { COFFEE_ADDED, REWARD_REDEEMED } from './members';

// Only coffees earn a stamp (owners, 2026-11-17): the coffee group plus the coffee-based specials. Matcha, hot
// chocolate, tea, smoothies and bottled drinks don't. A new coffee special must be added to COFFEE_SPECIALS.
export const COFFEE_SPECIALS = ['pistachio-latte', 'caramel-latte', 'pumpkin-spice-latte', 'espresso-tonic'];
const STAMPED = { $or: [{ cat: 'coffee' }, { id: { $in: COFFEE_SPECIALS } }] };
export const earnsStamp = (id: string, cat: string) => cat === 'coffee' || COFFEE_SPECIALS.includes(id);

export async function choices(app: App): Promise<Doc[]> {
  return app.db.products.find(
    { active: { $ne: false }, ...STAMPED },
    { projection: { _id: 0, id: 1, name: 1, cat: 1 }, sort: [['order', 1]], limit: 50 },
  );
}

/** Archived drinks still pass: a stamp mid-shift shouldn't fail because someone tidied the menu. */
export async function known(app: App, drink: string | null): Promise<boolean> {
  if (drink === null) return true;
  return (await app.db.products.countDocuments({ id: drink, ...STAMPED })) > 0;
}

/** The drink they've had most since their last free coffee; a tie goes to the most recent. */
export async function usual(app: App, code: string): Promise<Doc | null> {
  const last = await app.db.transactions.findOne({ code, type: REWARD_REDEEMED }, { sort: [['at', -1]] });
  const query: Filter = { code, type: COFFEE_ADDED, drink: { $ne: null } };
  if (last) query.at = { $gt: last.at };

  const rows = await app.db.transactions.find(query, { projection: { _id: 0, drink: 1, at: 1 }, limit: 500 });
  if (!rows.length) return null;

  const counts = new Map<string, number>();
  const latest = new Map<string, string>();
  for (const row of rows) {
    counts.set(row.drink, (counts.get(row.drink) ?? 0) + 1);
    const prev = latest.get(row.drink) ?? '';
    latest.set(row.drink, row.at > prev ? row.at : prev);
  }

  // max(counts, key=(count, latest)): the first maximal key in insertion order wins a full tie
  let drink = '';
  let first = true;
  for (const [d, n] of counts) {
    const best = counts.get(drink) ?? 0;
    if (first || n > best || (n === best && latest.get(d)! > latest.get(drink)!)) drink = d;
    first = false;
  }
  return { drink, count: counts.get(drink), of: rows.length };
}
