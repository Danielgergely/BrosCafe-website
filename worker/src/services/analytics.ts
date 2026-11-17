// Analytics aggregation. Port of backend/app/services/analytics.py.
//
// The rows are read with SQL that extracts only the fields each function uses (in the collection's natural order,
// as Mongo's unsorted find returned them), and the counting runs here exactly as the Python did. Timestamps are
// handled to the microsecond, and days/hours are bucketed in UTC like the Python (whose datetimes are UTC-aware).
import type { Doc } from '../db';
import type { App } from '../http';
import * as appSettings from './app_settings';
import { fsum } from './forecasts';

export const TRACKED_EVENTS = new Set(['qr_scan', 'page_view', 'registration_started', 'registration_completed', 'wallet_added']);

/** A parsed timestamp: microseconds since the epoch, plus the date and hour as written (datetime.date()/.hour). */
interface Ts { us: number; date: string; hour: number }

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,6}))?)?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** datetime.fromisoformat, or null when it would raise. */
function parseTs(value: unknown): Ts | null {
  if (typeof value !== 'string') return null;
  const m = ISO.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', frac = '', off] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (Number.isNaN(ms) || Number(mo) > 12 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  let offsetMin = 0;
  if (off && off !== 'Z') {
    const digits = off.slice(1).replace(':', '');
    offsetMin = (off[0] === '-' ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
  }
  const us = (ms - offsetMin * 60_000) * 1000 + Number(frac.padEnd(6, '0'));
  return { us, date: `${y}-${mo}-${d}`, hour: Number(h) };
}

const nowUs = () => Date.now() * 1000;
const since = (days: number) => nowUs() - days * 86_400_000_000;
function todayStart(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) * 1000;
}

/** Python's round(x, digits): exact decimal value of the double, ties to even. */
function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  const scale = 10 ** digits;
  const fixed = Number(x.toFixed(digits)); // exact; ties go away from zero
  // detect an exact tie: x * 10^digits is an odd multiple of 1/2
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigUint64(0);
  const exp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & ((1n << 52n) - 1n);
  if (exp) mant |= 1n << 52n;
  const e2 = (exp || 1) - 1075; // x = ±mant * 2^e2
  if (e2 >= 0) return fixed; // an integer: no tie
  const num = mant * BigInt(scale) * 2n;
  const den = 1n << BigInt(-e2);
  if (num % den !== 0n || ((num / den) & 1n) === 0n) return fixed;
  const lower = Math.floor(Math.abs(x) * scale);
  const even = lower % 2 === 0 ? lower : lower + 1;
  return (x < 0 ? -even : even) / scale;
}

const pct = (n: number, d: number) => (d ? pyRound((n / d) * 100, 1) : 0.0);

export function parseUserAgent(ua: string | null | undefined): [string, string] {
  const s = (ua || '').toLowerCase();
  let device: string;
  if (s.includes('ipad') || s.includes('tablet')) device = 'tablet';
  else if (s.includes('mobi') || s.includes('iphone') || s.includes('android')) device = 'mobile';
  else device = 'desktop';
  for (const [needle, name] of [['edg', 'Edge'], ['chrome', 'Chrome'], ['crios', 'Chrome'], ['firefox', 'Firefox'], ['safari', 'Safari']]) {
    if (s.includes(needle)) return [device, name];
  }
  return [device, 'Other'];
}

async function rows(app: App, table: string, fields: string[]): Promise<Doc[]> {
  const cols = fields.map((f) => `json_extract(doc, '$.${f}') AS ${f}`).join(', ');
  const { results } = await app.db.d1.prepare(`SELECT ${cols} FROM ${table} ORDER BY _id LIMIT 100000`).all<Doc>();
  return results;
}

/** The three collections, with just the fields the dashboard reads. Booleans come back from json_extract as 1/0. */
async function load(app: App): Promise<[Doc[], Doc[], Doc[]]> {
  const txs = await rows(app, 'transactions', ['type', 'code', 'at', 'drink']);
  const members = (await rows(app, 'members', ['code', 'name', 'created_at', 'total_coffees', 'rewards_redeemed', 'reward_ready', 'stamps']))
    .map((m) => ({ ...m, reward_ready: m.reward_ready === 1 ? true : m.reward_ready === 0 ? false : m.reward_ready }));
  const events = await rows(app, 'analytics_events', ['type', 'session_id', 'code', 'at']);
  return [txs, members, events];
}

/** code → coffee timestamps (Python's defaultdict keeps first-seen order; a Map does too). */
function coffeeDatesByCode(txs: Doc[]): Map<string, Ts[]> {
  const by = new Map<string, Ts[]>();
  for (const t of txs) {
    if (t.type === 'coffee_added') {
      const dt = parseTs(t.at);
      if (dt) {
        if (!by.has(t.code)) by.set(t.code, []);
        by.get(t.code)!.push(dt);
      }
    }
  }
  return by;
}

function countSince(items: Doc[], key: string, cutoff: number, match: Doc = {}): number {
  let n = 0;
  for (const it of items) {
    const dt = parseTs(it[key]);
    if (dt && dt.us >= cutoff && Object.entries(match).every(([k, v]) => (it[k] ?? null) === v)) n += 1;
  }
  return n;
}

const reached = (members: Doc[], n: number) => members.filter((m) => m.total_coffees >= n).length;

function hoursToReward(txs: Doc[], members: Doc[]): number[] {
  const registered = new Map<string, Ts | null>(members.map((m) => [m.code, parseTs(m.created_at)]));
  const out: number[] = [];
  for (const t of txs) {
    if (t.type !== 'reward_earned') continue;
    const earned = parseTs(t.at);
    const start = registered.get(t.code);
    if (earned && start) out.push((earned.us - start.us) / 1e6 / 3600);
  }
  return out;
}

function mean(values: number[], digits = 1): number {
  if (!values.length) return 0;
  return pyRound(fsum(values) / values.length, digits);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const anyAtOrAfter = (dates: Ts[], cutoff: number) => dates.some((d) => d.us >= cutoff);
const distinctDays = (dates: Ts[]) => new Set(dates.map((d) => d.date)).size;

export async function overview(app: App) {
  const [txs, members, events] = await load(app);
  const cfg = await appSettings.read(app);

  const block = (cutoff: number) => ({
    qr_scans: countSince(events, 'at', cutoff, { type: 'qr_scan' }),
    new_customers: countSince(members, 'created_at', cutoff),
    coffees: countSince(txs, 'at', cutoff, { type: 'coffee_added' }),
    rewards_earned: countSince(txs, 'at', cutoff, { type: 'reward_earned' }),
    rewards_redeemed: countSince(txs, 'at', cutoff, { type: 'reward_redeemed' }),
  });

  const activeCutoff = since(cfg.active_days);
  const active = [...coffeeDatesByCode(txs).values()].filter((dates) => anyAtOrAfter(dates, activeCutoff)).length;
  return {
    today: block(todayStart()),
    week: block(since(7)),
    month: block(since(30)),
    totals: {
      total_customers: members.length,
      active_customers: active,
      total_coffees: sum(members.map((m) => m.total_coffees)),
      total_rewards_redeemed: sum(members.map((m) => m.rewards_redeemed)),
    },
  };
}

export async function funnel(app: App) {
  const [, members, events] = await load(app);
  const uniqueSessions = (kind: string) => new Set(events.filter((e) => e.type === kind).map((e) => e.session_id ?? null)).size;

  const stages: [string, number][] = [
    ['QR Scanned', events.filter((e) => e.type === 'qr_scan').length],
    ['Loyalty Page Viewed', uniqueSessions('page_view')],
    ['Registration Started', uniqueSessions('registration_started')],
    ['Registration Completed', members.length],
    ['Wallet Card Added', new Set(events.filter((e) => e.type === 'wallet_added' && e.code).map((e) => e.code)).size],
    ...[1, 2, 3, 4].map((n): [string, number] => [`Coffee #${n}`, reached(members, n)]),
    ['Free Coffee Redeemed', members.filter((m) => m.rewards_redeemed >= 1).length],
  ];
  const top = Math.max(...stages.map(([, c]) => c)) || 1;
  return stages.map(([stage, count]) => ({ stage, count, pct: pct(count, top) }));
}

export async function customers(app: App) {
  const [txs, members] = await load(app);
  const cfg = await appSettings.read(app);
  const byCode = coffeeDatesByCode(txs);
  const total = members.length;

  const gaps: number[] = [];
  for (const dates of byCode.values()) {
    const ordered = [...dates].sort((a, b) => a.us - b.us);
    for (let i = 1; i < ordered.length; i++) gaps.push((ordered[i].us - ordered[i - 1].us) / 1e6 / 3600);
  }

  const activeCutoff = since(cfg.active_days);
  const active = [...byCode.values()].filter((d) => anyAtOrAfter(d, activeCutoff)).length;
  const earned = txs.filter((t) => t.type === 'reward_earned').length;
  const redeemed = txs.filter((t) => t.type === 'reward_redeemed').length;
  const totalCoffees = sum(members.map((m) => m.total_coffees));
  const totalVisits = sum([...byCode.values()].map((d) => d.length));

  return {
    total,
    new: countSince(members, 'created_at', since(cfg.new_days)),
    returning: [...byCode.values()].filter((d) => distinctDays(d) > 1).length,
    active,
    inactive: total - active,
    avg_coffees_per_customer: total ? pyRound(totalCoffees / total, 1) : 0,
    avg_visits: total ? pyRound(totalVisits / total, 1) : 0,
    avg_hours_between_purchases: mean(gaps),
    avg_hours_to_reward: mean(hoursToReward(txs, members)),
    reward_redemption_rate: pct(redeemed, earned),
  };
}

export async function coffee(app: App) {
  const [txs, members] = await load(app);
  const poured = txs.filter((t) => t.type === 'coffee_added');
  const dates = poured.map((t) => parseTs(t.at)).filter((d): d is Ts => !!d);
  const now = Date.now();

  const daily: { date: string; count: number }[] = [];
  for (let offset = 13; offset >= 0; offset--) {
    const day = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date: day.slice(5), count: dates.filter((d) => d.date === day).length });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const d of dates) hourly[d.hour].count += 1;

  // sorted(..., reverse=True) is stable, like Array.prototype.sort
  const top = [...members].sort((a, b) => b.total_coffees - a.total_coffees).slice(0, 5);

  const products = await app.db.products.find({}, { projection: { id: 1, name: 1 }, limit: 500 });
  const names = new Map<unknown, unknown>(products.map((p) => [p.id, p.name]));

  const mix = (list: Doc[]) => {
    const counts = new Map<unknown, number>();
    for (const r of list) {
      const drink = r.drink ?? null;
      counts.set(drink, (counts.get(drink) ?? 0) + 1);
    }
    const total = sum([...counts.values()]);
    // Counter.most_common(): by count, ties in first-seen order
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([drink, n]) => ({ id: drink || 'unrecorded', name: names.get(drink) ?? null, count: n, share: pct(n, total) }));
  };
  const pouredSince = (cutoff: number) => poured.filter((t) => {
    const d = parseTs(t.at);
    return d && d.us >= cutoff;
  });

  const today = todayStart();
  const week = since(7), month = since(30), year = since(365);
  return {
    total: poured.length,
    today: dates.filter((d) => d.us >= today).length,
    week: dates.filter((d) => d.us >= week).length,
    month: dates.filter((d) => d.us >= month).length,
    year: dates.filter((d) => d.us >= year).length,
    avg_per_customer: members.length ? pyRound(poured.length / members.length, 1) : 0,
    most_active: top.filter((m) => m.total_coffees > 0).map((m) => ({ code: m.code, name: m.name, coffees: m.total_coffees })),
    trend_daily: daily,
    trend_hourly: hourly,
    drink_mix: { week: mix(pouredSince(since(7))), month: mix(pouredSince(since(30))), all: mix(poured) },
    free_mix: mix(txs.filter((t) => t.type === 'reward_redeemed')),
  };
}

export async function rewards(app: App) {
  const [txs, members] = await load(app);
  const earned = txs.filter((t) => t.type === 'reward_earned').length;
  const redeemed = txs.filter((t) => t.type === 'reward_redeemed').length;
  return {
    earned,
    redeemed,
    waiting: members.filter((m) => m.reward_ready).length,
    redemption_rate: pct(redeemed, earned),
    avg_hours_to_earn: mean(hoursToReward(txs, members)),
  };
}

export async function retention(app: App) {
  const [txs, members] = await load(app);
  const cfg = await appSettings.read(app);
  const byCode = [...coffeeDatesByCode(txs).values()];
  const activeCutoff = since(cfg.active_days);
  return [
    { label: 'New', count: countSince(members, 'created_at', since(cfg.new_days)) },
    { label: 'Returning', count: byCode.filter((d) => distinctDays(d) > 1).length },
    { label: 'Visited Once', count: byCode.filter((d) => d.length === 1).length },
    { label: 'Reached 2', count: reached(members, 2) },
    { label: 'Reached 4', count: reached(members, 4) },
    { label: 'Redeemed', count: members.filter((m) => m.rewards_redeemed >= 1).length },
    { label: 'Churned', count: byCode.filter((d) => d.length && Math.max(...d.map((x) => x.us)) < activeCutoff).length },
  ];
}

const SEGMENT_ORDER = ['New', 'Active', 'Almost Reward', 'Reward Available', 'Inactive', 'Loyal'];

export async function segments(app: App) {
  const [txs, members] = await load(app);
  const cfg = await appSettings.read(app);
  const activeCutoff = since(cfg.active_days);
  const inactiveCutoff = since(cfg.inactive_days);
  const newCutoff = since(cfg.new_days);
  const lastCoffee = new Map<string, number>();
  for (const [c, d] of coffeeDatesByCode(txs)) lastCoffee.set(c, Math.max(...d.map((x) => x.us)));

  const counts: Record<string, number> = {};
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  for (const m of members) {
    const last = lastCoffee.get(m.code);
    const created = parseTs(m.created_at)?.us;
    if (m.reward_ready) inc('Reward Available');
    else if (m.stamps >= cfg.almost_reward_stamps) inc('Almost Reward');
    if (m.rewards_redeemed >= cfg.loyal_cycles) inc('Loyal');
    if (last !== undefined && last >= activeCutoff) inc('Active');
    const lastOrCreated = last ?? created;
    if (lastOrCreated !== undefined && lastOrCreated < inactiveCutoff) inc('Inactive');
    if (created !== undefined && created >= newCutoff && m.total_coffees <= 1) inc('New');
  }
  return SEGMENT_ORDER.map((k) => ({ segment: k, count: counts[k] ?? 0 }));
}
