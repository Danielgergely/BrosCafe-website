// What kind of day a date is, for the sales forecasts. Port of backend/app/services/daytypes.py (explained there).
// The calendar came from the Python `holidays` package; it is generated into daytypes_data.ts by
// worker/scripts/gen_daytypes_data.py for the years it covers.
import { CALENDAR, FIRST_YEAR, LAST_YEAR } from './daytypes_data';

export const NORMAL = 'normal';
export const HOLIDAY = 'holiday';
export const WORKDAY_SATURDAY = 'workday_saturday';
export const UNUSUAL = 'unusual';
export const MIN_HOLIDAYS = 3;

export const SCHOOL_BREAKS: [string, string, string][] = [
  ['2025-10-23', '2025-11-02', 'autumn'],
  ['2025-12-20', '2026-01-04', 'winter'],
  ['2026-04-02', '2026-04-12', 'spring'],
  ['2026-06-20', '2026-08-31', 'summer'],
  ['2026-10-23', '2026-11-01', 'autumn'],
  ['2026-12-19', '2027-01-03', 'winter'],
  ['2027-03-25', '2027-04-04', 'spring'],
  ['2027-06-19', '2027-08-31', 'summer'],
];
export const PAYDAY = 10;

// ---- plain dates as "YYYY-MM-DD" (Python's date) ----

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** date.weekday(): Monday = 0. */
export const weekdayOf = (iso: string) => (utc(iso).getUTCDay() + 6) % 7;
export const addDays = (iso: string, days: number) => new Date(utc(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((utc(a).getTime() - utc(b).getTime()) / 86_400_000);
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const isoDate = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

const warned = new Set<number>();
function calendar(year: number) {
  const c = CALENDAR[String(year)];
  if (!c && !warned.has(year)) {
    warned.add(year);
    console.warn(`daytypes: no holiday data for ${year} (generated ${FIRST_YEAR}-${LAST_YEAR}); rerun worker/scripts/gen_daytypes_data.py`);
  }
  return c ?? { days_off: {}, workdays: {} };
}

export interface DayInfo { kind: string; name: string | null; name_hu: string | null }

export function dayInfo(day: string, unusual?: Record<string, string> | Map<string, string> | null): DayInfo {
  const iso = day;
  const marks = unusual instanceof Map ? unusual : unusual ? new Map(Object.entries(unusual)) : null;
  if (marks && marks.size && marks.has(iso)) {
    const note = marks.get(iso) || '';
    return { kind: UNUSUAL, name: note, name_hu: note };
  }
  const year = Number(iso.slice(0, 4));
  const off = calendar(year).days_off[iso];
  if (off) return { kind: HOLIDAY, ...off };
  for (const y of [year - 1, year, year + 1]) {
    if (iso in calendar(y).workdays) return { kind: WORKDAY_SATURDAY, name: 'Working Saturday', name_hu: 'Áthelyezett munkanap' };
  }
  return { kind: NORMAL, name: null, name_hu: null };
}

function workingDay(day: string): boolean {
  const kind = dayInfo(day).kind;
  return kind === WORKDAY_SATURDAY || (weekdayOf(day) < 5 && kind !== HOLIDAY);
}

export function payday(year: number, month: number): string {
  let day = isoDate(year, month, PAYDAY);
  while (!workingDay(day)) day = addDays(day, -1);
  return day;
}

/** Minutes east of UTC that `tz` is at the instant `at`. */
export function utcOffsetMinutes(at: Date, tz: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant of local wall time y-m-d h:00 in tz (zoneinfo's fold=0 for a time that exists). */
function localInstant(iso: string, hour: number, tz: string): Date {
  const guess = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), hour);
  const first = guess - utcOffsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess - utcOffsetMinutes(new Date(first), tz) * 60_000);
}

/** tzinfo.dst() != 0 at local noon: the offset is above the zone's standard (smaller of January's and July's). */
function summerTime(iso: string, tz: string): boolean {
  const year = Number(iso.slice(0, 4));
  const offset = utcOffsetMinutes(localInstant(iso, 12, tz), tz);
  const standard = Math.min(utcOffsetMinutes(new Date(Date.UTC(year, 0, 1)), tz), utcOffsetMinutes(new Date(Date.UTC(year, 6, 1)), tz));
  return offset > standard;
}

export function context(day: string, tz: string): { school_break: string | null; days_since_payday: number; summer_time: boolean } {
  const iso = day;
  const schoolBreak = SCHOOL_BREAKS.find(([first, last]) => first <= iso && iso <= last)?.[2] ?? null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  let paid = payday(year, month);
  if (paid > iso) {
    const previous = addDays(isoDate(year, month, 1), -1);
    paid = payday(Number(previous.slice(0, 4)), Number(previous.slice(5, 7)));
  }
  return {
    school_break: schoolBreak,
    days_since_payday: daysBetween(iso, paid),
    summer_time: summerTime(iso, tz),
  };
}
