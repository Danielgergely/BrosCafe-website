// The coffee plant on the account card (docs/ideas.md §2). It never touches stamps or rewards.
import { settings } from '../config';
import type { Doc } from '../db';
import type { App } from '../http';
import { localParts, nowIso, parseIso } from '../util';
import { addDays, dayInfo, HOLIDAY, weekdayOf } from './daytypes';

/** Total coffees at which each stage starts: seed, sprout, seedling, young bush, flowering, green/red cherries, tree. */
export const STAGES = [1, 5, 15, 35, 70, 140, 280, 500];
/** Past the tree it keeps filling out: one new flush every FLUSH coffees. */
const FLUSH = 25;
export const DROOP = 10, WILT = 20, DEAD = 30; // open days without a coffee
const MAX_SPAN = 400; // calendar days scanned for thirst; anything longer is dead anyway

export function stageOf(growth: number): number {
  let s = 0;
  while (s < STAGES.length && growth >= STAGES[s]) s++;
  return s; // 0 = empty pot, 8 = tree
}

/** Growth counts every coffee since joining, minus what earlier deaths took away. */
const growthOf = (doc: Doc) => Math.max(0, (doc.total_coffees || 0) - (doc.plant?.lost || 0));

const cafeDate = (app: App, at: Date) => localParts(at, settings(app.env).cafe_tz).date;

/** When the plant was last watered: stored on every coffee; older members get it from their history once. */
async function lastCoffee(app: App, doc: Doc): Promise<string | null> {
  if (doc.last_coffee_at) return doc.last_coffee_at;
  if (!doc.total_coffees) return null;
  const t = await app.db.transactions.findOne(
    { code: doc.code, type: { $in: ['coffee_added', 'reward_redeemed', 'free_coffee_redeemed'] } },
    { sort: [['at', -1]], projection: { at: 1 } },
  );
  const at = t?.at || doc.created_at || null;
  if (at) {
    await app.db.members.updateOne({ code: doc.code }, { $set: { last_coffee_at: at } });
    doc.last_coffee_at = at;
  }
  return at;
}

/**
 * Open days after `since` up to and including `today`. Where the till has synced (sales_days) a day counts only if the
 * café actually opened, so a summer break or a closure is free; elsewhere Monday–Saturday minus public holidays.
 */
export async function openDaysSince(app: App, since: string, today: string): Promise<number> {
  if (since >= today) return 0;
  const from = since < addDays(today, -MAX_SPAN) ? addDays(today, -MAX_SPAN) : since;
  const synced = await app.db.sales_days.find({ date: { $gt: from, $lte: today } }, { projection: { date: 1 } });
  const opened = new Set(synced.map((d) => d.date as string));
  const first = await app.db.sales_days.findOne({}, { sort: [['date', 1]], projection: { date: 1 } });
  const last = await app.db.sales_days.findOne({}, { sort: [['date', -1]], projection: { date: 1 } });
  let n = 0;
  for (let d = addDays(from, 1); d <= today; d = addDays(d, 1)) {
    if (first && last && d >= first.date && d <= last.date) n += opened.has(d) ? 1 : 0;
    else n += weekdayOf(d) !== 6 && dayInfo(d).kind !== HOLIDAY ? 1 : 0;
  }
  return n;
}

/** What the account card shows. */
export async function view(app: App, doc: Doc): Promise<Doc> {
  const p = doc.plant || {};
  if (p.on === false) return { on: false };
  const growth = growthOf(doc);
  const last = await lastCoffee(app, doc);
  const thirst = growth && last ? await openDaysSince(app, cafeDate(app, parseIso(last)), cafeDate(app, new Date())) : 0;
  const stage = stageOf(growth);
  const prev = stage === 0 ? 0 : stage < STAGES.length ? STAGES[stage - 1] : STAGES.at(-1)! + Math.floor((growth - STAGES.at(-1)!) / FLUSH) * FLUSH;
  const next = stage < STAGES.length ? STAGES[stage] : prev + FLUSH;
  return {
    on: true,
    name: p.name ?? null,
    growth,
    stage,
    flushes: stage === STAGES.length ? Math.floor((growth - STAGES.at(-1)!) / FLUSH) : 0,
    prev,
    next,
    to_next: next - growth,
    thirst,
    state: !growth ? 'seed' : thirst >= DEAD ? 'dead' : thirst >= WILT ? 'wilted' : thirst >= DROOP ? 'droopy' : 'ok',
    deaths: p.deaths || 0,
  };
}

/**
 * Changes to $set when a coffee is served (call before total_coffees goes up). A dead plant is replanted at half its
 * old growth, so years of loyalty survive a long absence. Works the same with the plant switched off.
 */
export async function water(app: App, doc: Doc): Promise<Doc> {
  const changes: Doc = { last_coffee_at: nowIso() };
  try {
    const growth = growthOf(doc);
    const last = growth ? await lastCoffee(app, doc) : null;
    if (last && (await openDaysSince(app, cafeDate(app, parseIso(last)), cafeDate(app, new Date()))) >= DEAD) {
      const p = doc.plant || {};
      changes.plant = { ...p, lost: (p.lost || 0) + growth - Math.floor(growth / 2), deaths: (p.deaths || 0) + 1 };
    }
  } catch (e) {
    console.warn('plant: replant check failed', e); // never blocks the counter
  }
  return changes;
}
