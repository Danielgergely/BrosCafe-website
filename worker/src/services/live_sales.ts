// Today's takings against an ordinary day like it: the phone widget and the live sales dashboard in /admin.
// Port of backend/app/services/live_sales.py (explained there). The polling loop is the cron job in src/jobs.ts.
//
// The Python process kept three things in memory: a lock, the time of the last refresh and today's weather. Here
// the lock and the weather cache live per isolate, and the last refresh is also read from the stored summary's
// updated_at, so the once-a-minute limit on fresh fetches holds across isolates.
import { settings } from '../config';
import type { Doc } from '../db';
import type { App } from '../http';
import { localParts } from '../util';
import * as daytypes from './daytypes';
import { addDays, utcOffsetMinutes, weekdayOf } from './daytypes';
import * as forecasts from './forecasts';
import { mean, pyRound, takenBy, truthy } from './forecasts';
import { Fruitsys, isExpectedError, priceKey } from './fruitsys';
import * as posts from './posts';
import * as weather from './weather';

const POLL_FROM = 6;
const POLL_UNTIL = 20;
const CLOSED_WEEKDAYS = new Set([6]); // Sunday
const BACKFILL_MONTHS = 24;
const FRESH_AFTER_SECONDS = 60;
const HISTORY_DAYS = 30;
const WEATHER_EVERY_SECONDS = 3600;

let lock: Promise<unknown> = Promise.resolve();
let lastRefresh = -Infinity; // ms, this isolate
const weatherToday: { at: number; date: string | null; summary: Doc | null } = { at: -Infinity, date: null, summary: null };

/** async with _lock: one refresh at a time (in this isolate). */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

// ---- local time (datetime.now(CAFE_TZ)) ----

const pad = (n: number) => String(n).padStart(2, '0');
interface Now { at: Date; date: string; hour: number; minute: number; second: number; weekday: number; offset: number }

function cafeNow(app: App, at = new Date()): Now {
  const tz = settings(app.env).cafe_tz;
  const p = localParts(at, tz);
  return { at, date: p.date, hour: p.hour, minute: p.minute, second: p.second, weekday: p.weekday, offset: utcOffsetMinutes(at, tz) };
}

/** now.isoformat(timespec=...): "2026-11-13T10:20:05+01:00". */
function isoformat(now: Now, timespec: 'seconds' | 'minutes') {
  const sign = now.offset < 0 ? '-' : '+';
  const off = Math.abs(now.offset);
  const time = timespec === 'seconds' ? `${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)}` : `${pad(now.hour)}:${pad(now.minute)}`;
  return `${now.date}T${time}${sign}${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
}

function* monthsBack(today: string, count: number): Generator<[number, number]> {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  for (let i = 0; i < count; i++) {
    yield [year, month];
    month -= 1;
    if (month === 0) {
      year -= 1;
      month = 12;
    }
  }
}

function dailyTarget(app: App): number | null {
  const s = settings(app.env);
  const target = pyRound(s.break_even_net_ft * s.gross_per_net);
  return target > 0 ? target : null;
}

async function syncPastDays(app: App, client: Fruitsys, today: string): Promise<void> {
  const known = new Map<string, Doc>();
  for (const d of await app.db.sales_days.find({}, { projection: { date: 1, workday_id: 1, receipts: 1 } })) known.set(d.date, d);
  const months = known.size ? 2 : BACKFILL_MONTHS;
  for (const [year, month] of monthsBack(today, months)) {
    const workdays = await client.workdays(year, month);
    if (!workdays.length && !known.size) break;
    for (const workday of workdays) {
      const day = workday.opened_at.slice(0, 10);
      if (day >= today || known.has(day)) continue;
      const hours = await client.hourly(workday.id);
      const set = {
        date: day,
        weekday: weekdayOf(day),
        workday_id: workday.id,
        hours: Object.fromEntries([...hours].map(([h, v]) => [String(h), v])),
        total: [...hours.values()].reduce((a, b) => a + b, 0),
        receipts: await client.receipts(workday.id),
      };
      await app.db.sales_days.updateOne({ date: day }, { $set: set }, { upsert: true });
      known.set(day, {});
    }
  }
  for (const [day, doc] of known) {
    if (truthy(doc.workday_id) && !('receipts' in doc)) {
      await app.db.sales_days.updateOne({ date: day }, { $set: { receipts: await client.receipts(doc.workday_id) } });
    }
  }
}

/** Store the weather for every stored day without it, and return today's (fetched again at most hourly). */
async function syncWeather(app: App, today: string): Promise<Doc | null> {
  const missing = (await app.db.sales_days.find({ weather: { $exists: false } }, { projection: { date: 1 } })).map((d) => d.date as string);
  const fresh = weatherToday.date === today && Date.now() - weatherToday.at < WEATHER_EVERY_SECONDS * 1000;
  if (fresh && !missing.length) return weatherToday.summary;
  let days: Record<string, weather.WeatherDay>;
  try {
    for (const day of missing) if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new SyntaxError(`Invalid isoformat string: '${day}'`);
    const start = [...missing, today].reduce((a, b) => (b < a ? b : a));
    days = await weather.hourly(app, start, today);
  } catch (e) {
    if (!isExpectedError(e)) throw e;
    console.warn(`weather fetch failed: ${(e as Error).message}`);
    return weatherToday.date === today ? weatherToday.summary : null;
  }
  for (const day of missing) {
    const summary = weather.summarise(days[day] || {});
    if (summary) await app.db.sales_days.updateOne({ date: day }, { $set: { weather: summary } });
  }
  weatherToday.at = Date.now();
  weatherToday.date = today;
  weatherToday.summary = weather.summarise(days[today] || {});
  return weatherToday.summary;
}

/** Days marked unusual in the dashboard: {date: note}. */
async function unusualDays(app: App): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const doc of await app.db.special_days.find({})) out.set(doc.date, doc.note || '');
  return out;
}

/** Mark a day unusual (note given) or ordinary again (null). */
export async function markUnusual(app: App, day: string, note: string | null): Promise<void> {
  if (note === null) await app.db.special_days.deleteOne({ date: day });
  else await app.db.special_days.updateOne({ date: day }, { $set: { date: day, note } }, { upsert: true });
}

/** Flag an Instagram post on a day (one per day), or remove the flag. */
export async function markPost(app: App, day: string, timeOfDay: string | null, note: string | null, remove = false): Promise<void> {
  if (remove) await app.db.social_posts.deleteOne({ date: day });
  else await app.db.social_posts.updateOne({ date: day }, { $set: { date: day, time: timeOfDay, note: note || '' } }, { upsert: true });
}

async function postEffects(app: App, summary: Doc | null, unusual: Map<string, string>) {
  const flagged = await app.db.social_posts.find({});
  if (!flagged.length) return { posts: [], average_lift_pct: null, finished: 0 };
  const days: Record<string, { hours: Record<string, number>; kind: string }> = {};
  for (const d of await app.db.sales_days.find({}, { projection: { date: 1, hours: 1 } })) {
    days[d.date] = { hours: d.hours, kind: daytypes.dayInfo(d.date, unusual).kind };
  }
  if (summary && truthy(summary.hours)) days[summary.date] = { hours: summary.hours, kind: (summary.day ?? {}).kind ?? 'normal' };
  return posts.effects(flagged, days);
}

type Product = { count: number; gross: number };

async function fetchToday(client: Fruitsys, today: string) {
  const hours = new Map<number, number>();
  let sold: { name: string; unit: string; count: number; gross: number }[] = [];
  const receipts: Record<'count' | 'gross' | 'net', number> = { count: 0, gross: 0, net: 0 };
  for (const workday of await client.workdays(Number(today.slice(0, 4)), Number(today.slice(5, 7)))) {
    if (workday.opened_at.slice(0, 10) !== today) continue;
    for (const [hour, amount] of await client.hourly(workday.id)) hours.set(hour, (hours.get(hour) ?? 0) + amount);
    sold = sold.concat(await client.products(workday.id));
    const r = await client.receipts(workday.id);
    for (const key of Object.keys(r) as (keyof typeof r)[]) receipts[key] += r[key];
  }
  // Some Fruitsys users get the counts but not the amounts: then revenue is the count at the till's list price.
  const estimated = sold.some((p) => p.count) && !sold.some((p) => p.gross);
  if (estimated) {
    const prices = await client.prices();
    for (const p of sold) p.gross = p.count * (prices.get(priceKey(p.name, p.unit)) ?? 0);
  }
  const products = new Map<string, Product>();
  for (const p of sold) {
    const entry = products.get(p.name) ?? { count: 0, gross: 0 };
    products.set(p.name, entry);
    entry.count += p.count;
    entry.gross += p.gross;
  }
  return { hours, products, receipts, products_estimated: estimated };
}

async function refresh(app: App): Promise<Doc> {
  const s = settings(app.env);
  const now = cafeNow(app);
  const today = now.date;
  const client = await Fruitsys.open(s.fruitsys_user, s.fruitsys_password);
  await syncPastDays(app, client, today);
  const fetched = await fetchToday(client, today);

  const todayWeather = await syncWeather(app, today);
  const unusual = await unusualDays(app);
  const history = await app.db.sales_days.find({ date: { $lt: today } }, { sort: [['date', 1]] });
  for (const day of history) day.kind = daytypes.dayInfo(day.date, unusual).kind;
  const dayInfo = daytypes.dayInfo(today, unusual);
  const [past, basis] = forecasts.referenceDays(history.filter((d) => !CLOSED_WEEKDAYS.has(d.weekday)), now.weekday, dayInfo.kind);
  const previous = (await app.db.live_sales.findOne({})) ?? {};
  const { hours, products, receipts } = fetched;
  const total = [...hours.values()].reduce((a, b) => a + b, 0);

  const summary: Doc = {
    date: today,
    updated_at: isoformat(now, 'seconds'),
    total,
    hours: Object.fromEntries([...hours].sort((a, b) => a[0] - b[0]).map(([h, v]) => [String(h), v])),
    has_sales: hours.size > 0,
    compared_days: past.length,
    day: { ...dayInfo, basis },
    context: daytypes.context(today, s.cafe_tz),
    weather: todayWeather,
    ...comparison(past, total, now),
    ...target(app, total, now, past, previous),
    ...records(past, history, total),
    ...baskets(receipts, past),
    top_product: (top(products, 1)[0] ?? null),
    top_products: top(products, 3),
    products: top(products, 5),
    products_estimated: fetched.products_estimated,
    week: week(history, today, total),
    month: month(app, history, today, total),
    ...(await forecastsFor(app, history, today, now, hours, total, dayInfo.kind, todayWeather)),
  };
  // The Mongo document had _id "current"; it is the only document in live_sales.
  await app.db.live_sales.replaceOne({}, summary, { upsert: true });
  lastRefresh = Date.now();
  return summary;
}

/** When the last refresh happened: this isolate's, or the stored summary's (another isolate's or the cron's). */
async function lastRefreshAt(app: App): Promise<number> {
  const doc = await app.db.live_sales.findOne({}, { projection: { updated_at: 1 } });
  const stored = doc?.updated_at ? Date.parse(doc.updated_at) : NaN;
  return Number.isFinite(stored) ? Math.max(stored, lastRefresh) : lastRefresh;
}

/** Fetch now unless that happened within maxAge seconds, so a dashboard reloaded over and over can't hammer Fruitsys. */
export async function refreshIfStale(app: App, maxAge: number = FRESH_AFTER_SECONDS): Promise<void> {
  if (Date.now() - (await lastRefreshAt(app)) < maxAge * 1000) return;
  await withLock(async () => {
    if (Date.now() - (await lastRefreshAt(app)) >= maxAge * 1000) await refresh(app);
  });
}

/** One run of the old polling loop, under the lock. */
const refreshLocked = (app: App) => withLock(() => refresh(app));

function comparison(past: Doc[], total: number, now: Now) {
  if (!past.length) return { average_so_far: null, average_day: null, diff_pct: null, average_hours: {} };
  const soFar = mean(past.map((d) => takenBy(d.hours, now.hour, now.minute)));
  const day = mean(past.map((d) => d.total));
  const hours = [...new Set(past.flatMap((d) => Object.keys(d.hours).map((h) => Number.parseInt(h, 10))))].sort((a, b) => a - b);
  return {
    average_so_far: pyRound(soFar),
    average_day: pyRound(day),
    diff_pct: soFar > 0 ? pyRound(((total - soFar) / soFar) * 100, 1) : null,
    average_hours: Object.fromEntries(hours.map((h) => [String(h), pyRound(mean(past.map((d) => d.hours[String(h)] ?? 0)))])),
  };
}

function target(app: App, total: number, now: Now, past: Doc[], previous: Doc) {
  const goal = dailyTarget(app);
  if (!goal) return { target: null, target_progress: null, target_missing: null, target_reached_at: null, target_eta: null, projected_day: null };

  let reachedAt: string | null = null;
  if (total >= goal) {
    const sameDay = previous.date === now.date;
    reachedAt = (sameDay ? previous.target_reached_at : null) || `${pad(now.hour)}:${pad(now.minute)}`;
  }

  let projected: number | null = null;
  let eta: string | null = null;
  if (past.length) {
    const usualBy = (hour: number, minute: number) => mean(past.map((d) => takenBy(d.hours, hour, minute)));
    const day = mean(past.map((d) => d.total));
    const nowShare = usualBy(now.hour, now.minute);
    if (day > 0 && nowShare >= day * 0.1 && total > 0) {
      projected = pyRound((total * day) / nowShare);
      if (reachedAt === null && projected >= goal) {
        for (let step = 5; step < 16 * 60; step += 5) {
          const minutes = now.hour * 60 + now.minute + step;
          if (minutes >= 24 * 60) break;
          if ((total * usualBy(Math.floor(minutes / 60), minutes % 60)) / nowShare >= goal) {
            eta = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
            break;
          }
        }
      }
    }
  }

  return {
    target: goal,
    target_progress: pyRound(Math.min(total / goal, 1.0), 3),
    target_missing: Math.max(goal - total, 0),
    target_reached_at: reachedAt,
    target_eta: eta,
    projected_day: projected,
  };
}

function records(past: Doc[], history: Doc[], total: number) {
  const bestWeekday = past.length ? Math.max(...past.map((d) => d.total)) : null;
  const bestEver = history.length ? Math.max(...history.map((d) => d.total)) : null;
  return {
    best_weekday: bestWeekday,
    record_weekday: bestWeekday !== null && total > bestWeekday,
    best_ever: bestEver,
    record_ever: bestEver !== null && total > bestEver,
  };
}

function baskets(receipts: { count: number; gross: number }, past: Doc[]) {
  const basket = receipts.count ? pyRound(receipts.gross / receipts.count) : null;
  const usual = past.filter((d) => truthy((truthy(d.receipts) ? d.receipts : {}).count)).map((d) => d.receipts.gross / d.receipts.count);
  const withReceipts = past.filter((d) => truthy(d.receipts));
  return {
    receipts: receipts.count,
    basket,
    usual_basket: usual.length ? pyRound(mean(usual)) : null,
    usual_receipts: withReceipts.length ? pyRound(mean(withReceipts.map((d) => d.receipts.count))) : null,
  };
}

function top(products: Map<string, Product>, count: number) {
  const ranked = [...products].sort(([, a], [, b]) => b.count - a.count || b.gross - a.gross);
  return ranked.slice(0, count).filter(([, p]) => p.count > 0).map(([name, p]) => ({ name, count: p.count, gross: p.gross }));
}

function week(history: Doc[], today: string, total: number) {
  const totals = new Map<string, number>(history.map((d) => [d.date, d.total]));
  totals.set(today, total);
  const weekday = weekdayOf(today);
  const monday = addDays(today, -weekday);
  const days: Doc[] = [];
  for (let offset = 0; offset <= weekday; offset++) {
    const day = addDays(monday, offset);
    if (CLOSED_WEEKDAYS.has(weekdayOf(day))) continue;
    days.push({ date: day, weekday: weekdayOf(day), total: totals.get(day) ?? null, last_week: totals.get(addDays(day, -7)) ?? null });
  }
  return {
    days,
    total: days.reduce((s, d) => s + (d.total || 0), 0),
    last_week: days.reduce((s, d) => s + (d.last_week || 0), 0),
  };
}

function month(app: App, history: Doc[], today: string, total: number) {
  const prefix = today.slice(0, 7);
  const days: number[] = history.filter((d) => d.date.startsWith(prefix)).map((d) => d.total).concat(total ? [total] : []);
  const goal = dailyTarget(app);
  return {
    total: days.reduce((a, b) => a + b, 0),
    open_days: days.length,
    average_day: days.length ? pyRound(mean(days)) : null,
    target: goal ? goal * settings(app.env).month_open_days : null,
    target_to_date: goal ? goal * days.length : null,
  };
}

/** Close finished days' forecasts, replay any day that has none, save today's checkpoints as they come due, and forecast from now. */
async function forecastsFor(app: App, history: Doc[], today: string, now: Now, hours: Map<number, number>, total: number, kind: string, todayWeather: Doc | null) {
  const openDays = history.filter((d) => !CLOSED_WEEKDAYS.has(d.weekday));
  const stored = new Map<string, Doc>();
  for (const doc of await app.db.sales_forecasts.find({})) stored.set(doc.date, doc);
  const actual = new Map<string, number>(history.map((d) => [d.date, d.total]));

  const closed: Doc[] = [];
  for (let i = 0; i < openDays.length; i++) {
    const day = openDays[i];
    let doc = stored.get(day.date);
    if (doc === undefined) {
      const calibration = forecasts.calibrate(closed);
      const checkpoints: Doc = {};
      for (const cp of forecasts.CHECKPOINTS) {
        const result = forecasts.checkpoint(day.hours, cp, openDays.slice(0, i), day.weekday, calibration, day.kind);
        if (truthy(result)) checkpoints[String(cp)] = result;
      }
      doc = { date: day.date, weekday: day.weekday, backtest: true, checkpoints };
    }
    if ((doc.actual ?? null) !== actual.get(day.date) || !stored.has(day.date)) {
      doc.actual = actual.get(day.date);
      await app.db.sales_forecasts.replaceOne({ date: doc.date }, doc, { upsert: true });
    }
    closed.push({ ...doc, kind: day.kind });
  }

  const calibration = forecasts.calibrate(closed);
  if (CLOSED_WEEKDAYS.has(now.weekday)) return { forecast: null, checkpoints: {} };

  const todayHours: Record<string, number> = Object.fromEntries([...hours].map(([h, v]) => [String(h), v]));
  const todayDoc: Doc = stored.get(today) ?? { date: today, weekday: now.weekday, backtest: false, checkpoints: {}, actual: null };
  for (const cp of forecasts.CHECKPOINTS) {
    if (now.hour >= cp && !(String(cp) in todayDoc.checkpoints)) {
      const result = forecasts.checkpoint(todayHours, cp, openDays, now.weekday, calibration, kind);
      if (result) {
        result.made_at = isoformat(now, 'minutes');
        if (truthy(todayWeather)) result.weather = Object.fromEntries(Object.entries(todayWeather as Doc).filter(([k]) => k !== 'hours'));
        result.late = now.hour > cp;
        todayDoc.checkpoints[String(cp)] = result;
      }
    }
  }
  await app.db.sales_forecasts.replaceOne({ date: todayDoc.date }, todayDoc, { upsert: true });

  const [reference, basis] = forecasts.referenceDays(openDays, now.weekday, kind);
  const current = forecasts.estimate(
    total, now.hour, now.minute, reference,
    forecasts.weightAt(now.hour, now.minute, calibration.weights),
    forecasts.spreadAt(now.hour, now.minute, calibration.spreads),
    calibration.levels[forecasts.CHECKPOINTS[0]],
  );
  if (current) current.basis = basis;
  return { forecast: current, checkpoints: todayDoc.checkpoints };
}

/** The summary plus the forecast scorecard, for the admin dashboard. */
export async function dashboard(app: App) {
  const tz = settings(app.env).cafe_tz;
  const summary = await app.db.live_sales.findOne({});
  const docs = await app.db.sales_forecasts.find({ actual: { $ne: null } }, { sort: [['date', -1]], limit: HISTORY_DAYS });
  const unusual = await unusualDays(app);
  const posted = new Set((await app.db.social_posts.find({}, { projection: { date: 1 } })).map((d) => d.date));
  const weatherOf = new Map<string, Doc | undefined>();
  for (const d of await app.db.sales_days.find({ date: { $in: docs.map((doc) => doc.date) } }, { projection: { date: 1, weather: 1 } })) {
    weatherOf.set(d.date, d.weather);
  }
  const history: Doc[] = [];
  for (const doc of docs) {
    const weatherDay = weatherOf.get(doc.date);
    history.push({
      date: doc.date,
      weekday: doc.weekday,
      actual: doc.actual,
      replayed: doc.backtest ?? false,
      day: daytypes.dayInfo(doc.date, unusual),
      context: daytypes.context(doc.date, tz),
      posted: posted.has(doc.date),
      weather: truthy(weatherDay) ? Object.fromEntries(Object.entries(weatherDay as Doc).filter(([k]) => k !== 'hours')) : null,
      checkpoints: Object.fromEntries(Object.entries(doc.checkpoints as Doc).map(([cp, c]) => [cp, {
        value: c.value, low: c.low, high: c.high, error_pct: forecasts.errorPct(c.value, doc.actual),
      }])),
    });
  }
  // Holidays and unusual days are shown but not scored.
  const accuracy: Doc = {};
  for (const cp of forecasts.CHECKPOINTS) {
    const scored = history.filter((h) => String(cp) in h.checkpoints && h.day.kind === daytypes.NORMAL);
    const errors: number[] = scored.map((h) => h.checkpoints[String(cp)].error_pct);
    // abs(None) is a TypeError in Python: a day with an actual total of 0 made the dashboard fail
    if (errors.some((e) => e === null)) throw new TypeError("bad operand type for abs(): 'NoneType'");
    const recent = errors.slice(0, 7);
    accuracy[String(cp)] = {
      days: errors.length,
      mean_abs_error: errors.length ? pyRound(mean(errors.map(Math.abs)), 1) : null,
      bias: errors.length ? pyRound(mean(errors), 1) : null,
      last_week_abs_error: recent.length ? pyRound(mean(recent.map(Math.abs)), 1) : null,
      within_range: scored.filter((h) => h.checkpoints[String(cp)].low <= h.actual && h.actual <= h.checkpoints[String(cp)].high).length,
    };
  }
  return { summary, forecast_history: history, accuracy, posts: await postEffects(app, summary, unusual) };
}

function pollingTime(now: Now): boolean {
  return !CLOSED_WEEKDAYS.has(now.weekday) && POLL_FROM <= now.hour && now.hour < POLL_UNTIL;
}

/** One iteration of run_forever: a failed run is logged, never thrown. `first` ignores the opening hours. */
export async function runOnce(app: App, first: boolean): Promise<void> {
  if (!(first || pollingTime(cafeNow(app)))) return;
  try {
    const summary = await refreshLocked(app);
    console.info(`live sales: ${summary.total} Ft, ${summary.diff_pct ?? 'None'}% vs ${summary.compared_days} earlier days`);
  } catch (e) {
    if (isExpectedError(e)) console.warn(`live sales refresh failed: ${(e as Error).message}`);
    else console.error('live sales refresh crashed', e);
  }
}
