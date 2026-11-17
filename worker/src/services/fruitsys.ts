// Read-only client for the Fruitsys back office (cloud.fruitsys.hu). Port of backend/app/services/fruitsys.py.
// Fruitsys has no API: log in with the form, keep the session cookie, call the JSON endpoints its report pages call.
// Nothing here posts to a page that changes data. Figures are gross (VAT included); every number is parsed
// defensively, as what Fruitsys returns is data from outside.
import { pyRound } from './forecasts';

export const BASE = 'https://cloud.fruitsys.hu/raktar/';
export const RESTAURANT_ID = 1;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 20;

export class FruitsysError extends Error {}

/** httpx.HTTPError: a failed request or a non-2xx answer. */
export class HTTPError extends Error {}

/** Python's ValueError (bad JSON, a bad date...): an expected failure, logged rather than crashing. */
export const isExpectedError = (e: unknown) => e instanceof FruitsysError || e instanceof HTTPError || e instanceof SyntaxError;

/** fetch with httpx's behaviour: a timeout, transport failures as HTTPError. */
export async function httpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new HTTPError(`${init.method ?? 'GET'} ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** response.raise_for_status() */
export function raiseForStatus(res: Response, url: string) {
  if (res.status < 200 || res.status > 299) throw new HTTPError(`HTTP ${res.status} for url '${url}'`);
}

/** response.json(): any JSON document; bad JSON throws SyntaxError (Python's ValueError). */
export async function jsonOf(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

/** float(value) as Python parses it; null when Python would raise TypeError/ValueError. */
export function pyFloat(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (/^[+-]?(inf|infinity)$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(t)) return NaN;
  if (!/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/.test(t)) return null;
  return Number(t.replace(/_/g, ''));
}

/** Python truthiness for a JSON value. */
const truthy = (v: unknown) =>
  !(v === null || v === undefined || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Object.keys(v).length));

/** _number: round(float(value or 0)), 0 when it isn't a number. */
export function number(value: unknown): number {
  const f = pyFloat(truthy(value) ? value : 0);
  if (f === null || Number.isNaN(f)) return 0;
  return pyRound(f); // like Python, an infinity is an error
}

/** str(value) for the JSON scalars Fruitsys sends. */
const pyStr = (v: unknown) => (v === null || v === undefined ? 'None' : v === true ? 'True' : v === false ? 'False' : String(v));

/** "name unit" with runs of spaces collapsed: the price list has "tea  3cl" where the product report has "tea", "3cl". */
export function priceKey(...parts: unknown[]): string {
  return parts.map((p) => (truthy(p) ? pyStr(p) : '')).join(' ').split(/\s+/).filter(Boolean).join(' ');
}

type Params = Record<string, string | number>;
const form = (data: Params) => new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)]));

export class Fruitsys {
  private cookies = new Map<string, string>();
  constructor(private user: string, private password: string) {}

  /** async with Fruitsys(...) as client: logs in first. */
  static async open(user: string, password: string) {
    const client = new Fruitsys(user, password);
    await client.login();
    return client;
  }

  private keepCookies(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => {
        const [k, v = ''] = a.split('=').map((x) => x.trim());
        if (k.toLowerCase() === 'max-age') return Number(v) <= 0;
        if (k.toLowerCase() === 'expires') return Date.parse(v) < Date.now();
        return false;
      });
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** One request with the session cookie, following redirects as httpx does (a POST answered 301/302/303 becomes a GET). */
  private async request(method: string, path: string, opts: { params?: Params; data?: Params } = {}): Promise<Response> {
    let url = new URL(path, BASE).toString();
    if (opts.params) url += `?${form(opts.params)}`;
    let body: URLSearchParams | undefined = opts.data ? form(opts.data) : undefined;
    for (let hop = 0; ; hop++) {
      const headers: Record<string, string> = {};
      if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const res = await httpFetch(url, { method, headers, body, redirect: 'manual' });
      this.keepCookies(res);
      const location = res.headers.get('Location');
      if (![301, 302, 303, 307, 308].includes(res.status) || !location) return res;
      if (hop >= MAX_REDIRECTS) throw new HTTPError('Exceeded maximum allowed redirects.');
      await res.body?.cancel();
      url = new URL(location, url).toString();
      if ((res.status === 303 && method !== 'HEAD') || ((res.status === 301 || res.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
    }
  }

  async login(): Promise<void> {
    await (await this.request('GET', 'index.php')).body?.cancel(); // session cookie
    const res = await this.request('POST', 'index.php', { data: { user_name: this.user, user_password: this.password, login: 'Bejelentkezés' } });
    // A failed login answers 200 with the login form again.
    if ((await res.text()).includes('name="user_password"')) throw new FruitsysError('Fruitsys login failed — check FRUITSYS_USER / FRUITSYS_PASSWORD');
  }

  private async json(method: string, path: string, opts: { params?: Params; data?: Params }) {
    const res = await this.request(method, path, opts);
    raiseForStatus(res, path);
    return jsonOf(res);
  }

  /** The workdays opened in a month: [{id, opened_at}], newest first. */
  async workdays(year: number, month: number): Promise<{ id: string; opened_at: string }[]> {
    const data = await this.json('POST', 'munkanapvalasztas_munkanapfeltolt.php', { data: { etteid: RESTAURANT_ID, irany: 0, ev: year, honap: month } });
    const days: any[] = data?.munkanapok || [];
    return days.filter((d) => truthy(d?.munkanapid) && truthy(d?.nyitas_ido)).map((d) => ({ id: pyStr(d.munkanapid), opened_at: pyStr(d.nyitas_ido) }));
  }

  /** Takings per clock hour for one workday, open or closed: Map 7 → 4850, … in the order Fruitsys sent them. */
  async hourly(workdayId: string): Promise<Map<number, number>> {
    const data = await this.json('GET', 'forgalom_ido_master.php', {
      params: {
        idoszak: `-1,${workdayId}`, munka_kezd: '', munka_veg: '', gepszuro: -1, pincerszuro: -1, pultszuro: -1,
        etteremid: RESTAURANT_ID, tipus: 1, pageIndex: 1, size: 50, order: '[]', filter: '{}',
      },
    });
    const hours = new Map<number, number>();
    for (const row of data?.data || []) {
      const hour = number(row?.ora), amount = number(row?.ar);
      if (hour >= 0 && hour <= 23 && amount) hours.set(hour, amount);
    }
    return hours;
  }

  /** Receipts for one workday: {count, gross, net}, read from the table the turnover report embeds in its page. */
  async receipts(workdayId: string): Promise<{ count: number; gross: number; net: number }> {
    const res = await this.request('POST', 'stat_forgalom.php', {
      data: { workday1: workdayId, workday2: workdayId, idoszakkuld: '-1', mnvalasztegyeb: '', tipus: '', asztal: '', munkanaponk: '' },
    });
    raiseForStatus(res, 'stat_forgalom.php');
    const match = /var griddata = (\[.*?\]);/.exec(await res.text());
    const rows: any[] = match ? JSON.parse(match[1]) : [];
    const dicts = rows.filter((r) => r !== null && typeof r === 'object' && !Array.isArray(r));
    const total = (key: string) => dicts.reduce((s, r) => s + number(r[key]), 0);
    return { count: total('nysz'), gross: total('szamla_vegosszeg'), net: total('netto') };
  }

  /** What sold on one workday: [{name, unit, count, gross}]; gross is 0 when Fruitsys withholds amounts from this user. */
  async products(workdayId: string): Promise<{ name: string; unit: string; count: number; gross: number }[]> {
    const data = await this.json('POST', 'stat_termek_master.php', {
      data: {
        etteremid: RESTAURANT_ID, etteremvalaszttipus: 0, valasztottettermek: '[]', idoszak: `-1,${workdayId}`, time1: '', time2: '',
        munkakezd: '', munkaveg: '', counter: 0, waiter: 0, gep: 0, aktarak: 0, aktusertipus: 2, szemelyzet: 0,
      },
    });
    const rows: any[] = ((data?.data || {}).data || []).filter((row: any) => row !== null && typeof row === 'object' && !Array.isArray(row) && truthy(row.nev));
    const products = rows.map((row) => {
      const field = ['teljesar', 'kedvezmenyesbrutto', 'bruttobevet'].find((f) => number(row[f]));
      return {
        name: pyStr(row.nev).trim(),
        unit: (truthy(row.kiszereles) ? pyStr(row.kiszereles) : '').trim(),
        count: number(row.darab),
        gross: field ? number(row[field]) : 0,
      };
    });
    if (products.some((p) => p.count) && !products.some((p) => p.gross)) {
      console.info(`fruitsys: product report has counts but no amounts; fields sent: ${JSON.stringify(Object.keys(rows[0]).sort())}`);
    }
    return products;
  }

  /** The till's list price per product, keyed "name unit". */
  async prices(): Promise<Map<string, number>> {
    const data = await this.json('GET', 'termekar_query.php', { params: { order: '[]', filter: '{}', etterem: RESTAURANT_ID, csakaktiv: 0 } });
    const prices = new Map<string, number>();
    for (const row of data?.data || []) {
      if (row !== null && typeof row === 'object' && !Array.isArray(row) && truthy(row.nev) && number(row.pult_ar_1R1)) {
        prices.set(priceKey(row.nev), number(row.pult_ar_1R1));
      }
    }
    return prices;
  }
}
