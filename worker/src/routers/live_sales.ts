// Today's takings for the owners' phone widget, and the live sales dashboard. Port of backend/app/routers/live_sales.py.
import { settings } from '../config';
import { HttpError, Invalid, str, type Ctx, type Router } from '../http';
import { requireAdmin } from '../security';
import * as service from '../services/live_sales';
import { isExpectedError } from '../services/fruitsys';

/** hmac.compare_digest on the UTF-8 bytes. */
function compareDigest(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diff |= (x[i % Math.max(x.length, 1)] ?? 0) ^ y[i];
  return diff === 0 && x.length === y.length;
}

/** Pydantic's bool from a query string. */
function queryBool(c: Ctx, name: string, def: boolean): boolean {
  const raw = c.query.get(name);
  if (raw === null) return def;
  const v = raw.toLowerCase();
  if (['1', 'on', 't', 'true', 'y', 'yes'].includes(v)) return true;
  if (['0', 'off', 'f', 'false', 'n', 'no'].includes(v)) return false;
  throw new HttpError(422, [{ type: 'bool_parsing', loc: ['query', name], msg: 'Input should be a valid boolean, unable to interpret input', input: raw }]);
}

const NO_FIGURES = 'No figures yet — the first update runs at startup';

/** date.fromisoformat(day).isoformat() as Python 3.13 parses it (also YYYYMMDD and ISO week dates). */
function validDay(day: string): string {
  const bad = () => new HttpError(400, 'Expected a date as YYYY-MM-DD');
  const DAY = 86_400_000;
  const at = (y: number, month: number, d: number) => {
    const t = new Date(0);
    t.setUTCFullYear(y, month - 1, d); // years below 100 stay as they are
    return t;
  };
  const iso = (t: Date) => `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(day);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > at(y, mo + 1, 0).getUTCDate()) throw bad();
    return iso(at(y, mo, d));
  }
  m = /^(\d{4})-W(\d{2})(?:-(\d))?$/.exec(day) ?? /^(\d{4})W(\d{2})(\d)?$/.exec(day);
  if (m) {
    const [y, w, d] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
    if (y < 1 || w < 1 || d < 1 || d > 7) throw bad();
    const mondayOf = (t: Date) => t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY;
    const week1 = mondayOf(at(y, 1, 4));
    const weeks = Math.round((mondayOf(at(y, 12, 28)) - week1) / DAY / 7) + 1;
    if (w > weeks) throw bad();
    return iso(new Date(week1 + ((w - 1) * 7 + d - 1) * DAY));
  }
  throw bad();
}

/** Today's forecast and comparison follow at once; a failed fetch only means they follow on the next poll. */
async function afterMarking(c: Ctx) {
  try {
    await service.refreshIfStale(c, 0);
  } catch (e) {
    if (!isExpectedError(e)) throw e;
    console.warn(`live sales: refresh after marking a day failed: ${(e as Error).message}`);
  }
}

export function register(api: Router) {
  api.get('/live-sales', async (c) => {
    // 404 rather than 401 when the feature is off or the key is wrong, so the endpoint gives nobody a hint it exists.
    const s = settings(c.env);
    const header = c.req.headers.get('Authorization') ?? '';
    const supplied = (header.startsWith('Bearer ') ? header.slice(7) : header).trim();
    if (!s.live_sales_configured) throw new HttpError(404, 'Not Found');
    if (!compareDigest(supplied, s.live_sales_key)) {
      // Lengths only, never the key.
      console.warn(`live sales: wrong key (got ${supplied.length} characters, expected ${s.live_sales_key.length})`);
      throw new HttpError(404, 'Not Found');
    }
    const summary = await c.db.live_sales.findOne({});
    if (summary === null) throw new HttpError(503, NO_FIGURES);
    return summary;
  });

  api.get('/admin/live-sales', async (c) => {
    await requireAdmin(c);
    const fresh = queryBool(c, 'fresh', false);
    if (!settings(c.env).live_sales_configured) throw new HttpError(404, 'Live sales is not configured on this server');
    let refreshFailed = false;
    if (fresh) {
      try {
        await service.refreshIfStale(c);
      } catch (e) {
        if (!isExpectedError(e)) throw e;
        console.warn(`live sales: fresh fetch failed: ${(e as Error).message}`);
        refreshFailed = true;
      }
    }
    const data = await service.dashboard(c);
    if (data.summary === null) throw new HttpError(503, NO_FIGURES);
    return { ...data, refresh_failed: refreshFailed };
  });

  api.put('/admin/live-sales/unusual/{day}', async (c) => {
    await requireAdmin(c);
    const b = await c.json();
    const inv = new Invalid();
    const note = b.note === undefined ? '' : str(b.note, 'note', inv, { max: 120 });
    inv.throwIfAny();
    await service.markUnusual(c, validDay(c.params.day), note.trim());
    await afterMarking(c);
    return { ok: true };
  });

  api.delete('/admin/live-sales/unusual/{day}', async (c) => {
    await requireAdmin(c);
    await service.markUnusual(c, validDay(c.params.day), null);
    await afterMarking(c);
    return { ok: true };
  });

  api.put('/admin/live-sales/posts/{day}', async (c) => {
    await requireAdmin(c);
    const b = await c.json();
    const inv = new Invalid();
    let time: string | null = null;
    if (b.time !== undefined && b.time !== null) {
      const raw = str(b.time, 'time', inv);
      if (typeof b.time === 'string' && raw !== '') {
        const value = raw.replace(/\./g, ':');
        const at = value.indexOf(':');
        const [hour, minute] = at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)];
        if (!(/^\d+$/.test(hour) && /^\d+$/.test(minute) && Number(hour) <= 23 && Number(minute) <= 59)) inv.add('time', 'Value error, time must be HH:MM');
        else time = `${String(Number(hour)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`;
      }
    }
    const note = b.note === undefined ? '' : str(b.note, 'note', inv, { max: 200 });
    inv.throwIfAny();
    await service.markPost(c, validDay(c.params.day), time, note.trim());
    return { ok: true };
  });

  api.delete('/admin/live-sales/posts/{day}', async (c) => {
    await requireAdmin(c);
    await service.markPost(c, validDay(c.params.day), null, null, true);
    return { ok: true };
  });
}
