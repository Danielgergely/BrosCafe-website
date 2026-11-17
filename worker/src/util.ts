// Helpers that keep stored values in the exact shape the Python backend wrote them.

/**
 * datetime.now(timezone.utc).isoformat(): "2026-11-13T21:40:12.123000+00:00". Stored timestamps are compared as
 * strings, so every timestamp written anywhere must come from here (or isoAt) to keep that ordering correct.
 */
export const isoAt = (d: Date) => d.toISOString().replace(/\.(\d{3})Z$/, '.$1000+00:00');
export const nowIso = () => isoAt(new Date());

/** uuid.uuid4().hex and str(uuid.uuid4()). */
export const uuidHex = () => crypto.randomUUID().replace(/-/g, '');
export const uuid4 = () => crypto.randomUUID();

/** secrets.token_urlsafe(n): n random bytes, base64url without padding. */
export function tokenUrlsafe(n = 32) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Python's datetime.fromisoformat on our stored strings (with or without offset, Z or +00:00). */
export function parseIso(v: string): Date {
  const s = v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v) ? v : `${v}+00:00`;
  return new Date(s.replace(/(\.\d{3})\d+/, '$1'));
}

/** Local date/time parts in the café's time zone (CAFE_TIMEZONE), like datetime.now(CAFE_TZ). */
export function localParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`, // ISO date in the café's zone
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday), // Python's weekday(): Monday = 0
  };
}
