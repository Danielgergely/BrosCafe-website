// Forecasting the day's takings, and keeping score of how well it went. Port of backend/app/services/forecasts.py
// (the method is explained there). Pure functions only.
//
// The numbers must come out exactly as in Python, so this file also holds the few Python semantics they rely on:
// round() (half to even, on the exact binary value), statistics.mean (exact, then rounded once) and sum() of
// floats (Neumaier-compensated since Python 3.12).
import { HOLIDAY, MIN_HOLIDAYS, NORMAL, WORKDAY_SATURDAY } from './daytypes';

// ---- Python numerics ----

/** round(x) with no digits: half to even, an int. Like Python, NaN and infinities are errors. */
export function pyRound(x: number): number;
/** round(x, digits) with digits >= 1: the double nearest the decimal rounded half to even from x's exact value. */
export function pyRound(x: number, digits: number): number;
export function pyRound(x: number, digits?: number): number {
  if (!Number.isFinite(x)) {
    if (digits === undefined) throw new Error(Number.isNaN(x) ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer');
    return x;
  }
  if (!digits) {
    const f = Math.floor(x);
    const d = x - f; // exact
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f === 0 ? 0 : f;
    return f % 2 === 0 ? f : f + 1;
  }
  if (Math.abs(x) >= 1e21) return x;
  const neg = x < 0;
  // toFixed is exact on the binary value (up to 100 digits, which covers every value used here)
  const [ip, fp] = Math.abs(x).toFixed(100).split('.');
  const rest = fp.slice(digits);
  let n = BigInt(ip + fp.slice(0, digits));
  const first = rest[0];
  if (first > '5' || (first === '5' && (/[1-9]/.test(rest.slice(1)) || n % 2n === 1n))) n += 1n;
  const ds = n.toString().padStart(digits + 1, '0');
  const r = Number(`${ds.slice(0, -digits)}.${ds.slice(-digits)}`);
  return neg ? -r : r;
}

/** A finite double as m * 2^e, exactly. */
function exact(x: number): [bigint, number] {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x);
  const hi = v.getUint32(0), lo = v.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e = -1074;
  if (exp) {
    m |= 1n << 52n;
    e = exp - 1075;
  }
  return [hi >>> 31 ? -m : m, e];
}

const bitLength = (n: bigint) => n.toString(2).length;

/** num / den correctly rounded to the nearest double (ties to even), as Python's int / int. */
function divide(num: bigint, den: bigint): number {
  if (num === 0n) return 0;
  const neg = num < 0n !== den < 0n;
  let a = num < 0n ? -num : num;
  let b = den < 0n ? -den : den;
  const s = 55 - (bitLength(a) - bitLength(b));
  if (s >= 0) a <<= BigInt(s);
  else b <<= BigInt(-s);
  let q = a / b;
  const sticky = a % b !== 0n;
  const extra = bitLength(q) - 53;
  const low = q & ((1n << BigInt(extra)) - 1n);
  const half = 1n << BigInt(extra - 1);
  q >>= BigInt(extra);
  if (low > half || (low === half && (sticky || (q & 1n) === 1n))) q += 1n;
  const scale = extra - s;
  const r = Number(q) * 2 ** Math.trunc(scale / 2) * 2 ** (scale - Math.trunc(scale / 2));
  return neg ? -r : r;
}

/** statistics.mean: the exact mean of the values, rounded once. */
export function mean(values: Iterable<number>): number {
  const list = [...values];
  if (!list.length) throw new Error('mean requires at least one data point');
  if (list.every((v) => Number.isSafeInteger(v))) {
    const total = list.reduce((s, v) => s + BigInt(v), 0n);
    return divide(total, BigInt(list.length));
  }
  const parts = list.map(exact);
  const e = Math.min(...parts.map(([, x]) => x));
  const total = parts.reduce((s, [m, x]) => s + (m << BigInt(x - e)), 0n);
  return e >= 0 ? divide(total << BigInt(e), BigInt(list.length)) : divide(total, BigInt(list.length) << BigInt(-e));
}

/** Python 3.12+ sum() of floats: Neumaier-compensated. */
export function fsum(values: number[]): number {
  let f = 0;
  let c = 0;
  for (const x of values) {
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
    else c += x - t + f;
    f = t;
  }
  if (c && Number.isFinite(c)) f += c;
  return f;
}

// ---- the forecasts ----

export const SATURDAY = 5;

export const CHECKPOINTS = [9, 12, 15] as const;
export const DEFAULT_WEIGHTS: Record<number, number> = { 9: 0.3, 12: 0.6, 15: 0.85 };
export const DEFAULT_SPREAD: Record<number, number> = { 9: 0.25, 12: 0.15, 15: 0.1 };
export const MIN_DAYS_TO_CALIBRATE = 8;
export const MIN_DAYS_FOR_SPREAD = 5;
export const LEVEL_WINDOW = 10;

export type Hours = Record<string, number>;
export type Day = Record<string, any>;
export interface Calibration {
  weights: Record<number, number>;
  spreads: Record<number, number>;
  levels: Record<number, number>;
  days: Record<number, number>;
}

/** int(h) on a stored hour key (Python's int() accepts surrounding spaces and a sign). */
function hourOf(key: string): number {
  const t = String(key).trim();
  if (!/^[+-]?\d+(_\d+)*$/.test(t)) throw new Error(`invalid literal for int() with base 10: '${key}'`);
  return Number(t.replace(/_/g, ''));
}

export function takenBy(hours: Hours, hour: number, minute = 0): number {
  const byHour = new Map<number, number>();
  for (const [h, v] of Object.entries(hours)) byHour.set(hourOf(h), v);
  let before = 0;
  for (const [h, v] of byHour) if (h < hour) before += v;
  return before + ((byHour.get(hour) ?? 0) * minute) / 60;
}

const isNormal = (day: Day) => (day.kind ?? NORMAL) === NORMAL;

export function referenceDays(history: Day[], weekday: number, kind: string = NORMAL): [Day[], string] {
  const normal = history.filter(isNormal);
  if (kind === HOLIDAY) {
    const earlier = history.filter((d) => d.kind === HOLIDAY);
    if (earlier.length >= MIN_HOLIDAYS) return [earlier, 'holidays'];
    const saturdays = normal.filter((d) => d.weekday === SATURDAY);
    if (saturdays.length) return [saturdays, 'saturdays'];
  } else if (kind === WORKDAY_SATURDAY) {
    const weekdays = normal.filter((d) => d.weekday < SATURDAY);
    if (weekdays.length) return [weekdays, 'weekdays'];
  } else {
    const same = normal.filter((d) => d.weekday === weekday);
    if (same.length) return [same, 'weekday'];
  }
  return normal.length ? [normal, 'all'] : [history, 'all'];
}

export function estimate(soFar: number, hour: number, minute: number, reference: Day[], weight: number, spread: number, level = 1.0): Record<string, any> | null {
  if (!reference.length) return null;
  const usualDay = mean(reference.map((d) => d.total));
  const usualBy = mean(reference.map((d) => takenBy(d.hours, hour, minute)));
  const pace = usualBy >= usualDay * 0.05 ? (soFar * usualDay) / usualBy : null;
  const expected = usualDay * level;
  const value = pace === null ? expected : weight * pace + (1 - weight) * expected;
  return {
    value: pyRound(value),
    low: pyRound(value * (1 - spread)),
    high: pyRound(value * (1 + spread)),
    pace: pace !== null ? pyRound(pace) : null,
    average: pyRound(usualDay),
    expected: pyRound(expected),
    weight: pyRound(weight, 2),
    level: pyRound(level, 3),
    so_far: pyRound(soFar),
  };
}

function interpolate(hour: number, points: [number, number][]): number {
  if (hour <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [h0, v0] = points[i];
    const [h1, v1] = points[i + 1];
    if (hour <= h1) return v0 + ((v1 - v0) * (hour - h0)) / (h1 - h0);
  }
  return points[points.length - 1][1];
}

export function weightAt(hour: number, minute: number, weights: Record<number, number>): number {
  const points: [number, number][] = [[7, 0.1], ...CHECKPOINTS.map((cp): [number, number] => [cp, weights[cp]]), [19, 1.0]];
  return interpolate(hour + minute / 60, points);
}

export function spreadAt(hour: number, minute: number, spreads: Record<number, number>): number {
  const points: [number, number][] = [
    [7, spreads[CHECKPOINTS[0]] * 1.2],
    ...CHECKPOINTS.map((cp): [number, number] => [cp, spreads[cp]]),
    [19, spreads[CHECKPOINTS[CHECKPOINTS.length - 1]] * 0.4],
  ];
  return interpolate(hour + minute / 60, points);
}

export function errorPct(predicted: number, actual: number): number | null {
  return actual ? pyRound(((predicted - actual) / actual) * 100, 1) : null;
}

/** Python truthiness of a stored value ({} and [] are false). */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return !Number.isNaN(v);
}

export function calibrate(closedDocs: Day[]): Calibration {
  const weights = { ...DEFAULT_WEIGHTS };
  const spreads = { ...DEFAULT_SPREAD };
  const days: Record<number, number> = {};
  const closed = closedDocs.filter(isNormal).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const recentDays = closed
    .filter((doc) => truthy(doc.actual) && truthy((doc.checkpoints || {})[String(CHECKPOINTS[0])]))
    .map((doc): [number, number] => [doc.checkpoints[String(CHECKPOINTS[0])].average, doc.actual])
    .slice(-LEVEL_WINDOW);
  const level = recentDays.length >= MIN_DAYS_FOR_SPREAD ? mean(recentDays.map(([average, actual]) => actual / average)) : 1.0;
  const levels: Record<number, number> = {};
  for (const cp of CHECKPOINTS) levels[cp] = level;
  for (const cp of CHECKPOINTS) {
    const rows = closed
      .filter((doc) => truthy(doc.actual) && truthy((doc.checkpoints || {})[String(cp)]))
      .map((doc): [Day, number] => [doc.checkpoints[String(cp)], doc.actual])
      .filter(([c]) => c.pace !== null && c.pace !== undefined)
      .map(([c, actual]): [number, number, number] => [c.pace, c.average, actual]);
    days[cp] = rows.length;
    if (rows.length < MIN_DAYS_FOR_SPREAD) continue;
    const forecast = (w: number, p: number, a: number) => w * p + (1 - w) * a * level;
    if (rows.length >= MIN_DAYS_TO_CALIBRATE) {
      const miss = (w: number) => mean(rows.map(([p, a, actual]) => Math.abs(forecast(w, p, a) - actual) / actual));
      let best = 0;
      let bestMiss = Infinity;
      for (let step = 0; step < 21; step++) {
        const w = step / 20;
        const m = miss(w);
        if (m < bestMiss) {
          best = w;
          bestMiss = m;
        }
      }
      weights[cp] = best;
    }
    const w = weights[cp];
    const errors = rows.slice(-LEVEL_WINDOW).map(([p, a, actual]) => Math.abs(forecast(w, p, a) - actual) / actual).sort((x, y) => x - y);
    spreads[cp] = Math.max(errors[Math.trunc(0.9 * (errors.length - 1))], DEFAULT_SPREAD[cp]);
  }
  return { weights, spreads, levels, days };
}

export function checkpoint(dayHours: Hours, cp: number, history: Day[], weekday: number, calibration: Calibration, kind: string = NORMAL): Record<string, any> | null {
  const [reference, basis] = referenceDays(history, weekday, kind);
  const result = estimate(takenBy(dayHours, cp, 0), cp, 0, reference, calibration.weights[cp], calibration.spreads[cp], calibration.levels?.[cp] ?? 1.0);
  if (result) {
    result.basis = basis;
    result.compared_days = reference.length;
  }
  return result;
}
