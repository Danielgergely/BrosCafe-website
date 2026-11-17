// A small router with FastAPI's conventions: paths like /scan/{code}, errors as {"detail": ...}, handlers that
// return plain objects (sent as JSON) or a Response.
import type { Db } from './db';
import type { Env } from './env';

export class HttpError extends Error {
  constructor(readonly status: number, readonly detail: unknown, readonly headers: Record<string, string> = {}) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
}

/** What services need: bindings, the database, and a way to finish work after the response (or the cron run). */
export interface App {
  env: Env;
  db: Db;
  /** Run after the response is sent (FastAPI BackgroundTasks / fire-and-forget). Errors are logged, never thrown. */
  later(p: Promise<unknown>): void;
}

export interface Ctx extends App {
  req: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  exec: ExecutionContext;
  /** The request body as JSON; {} when empty. Cached, so it can be read twice. */
  json<T = any>(): Promise<T>;
}

type Handler = (c: Ctx) => Promise<unknown> | unknown;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

export class Router {
  private routes: Route[] = [];
  constructor(private prefix = '') {}

  private add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const full = this.prefix + path;
    const re = new RegExp(
      '^' + full.replace(/[.+*?^$()[\]\\|]/g, '\\$&').replace(/\{(\w+)\}/g, (_m, k: string) => (keys.push(k), '([^/]+?)')) + '/?$',
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  match(method: string, pathname: string) {
    let pathOnly = false;
    for (const r of this.routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) {
        pathOnly = true;
        continue;
      }
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return pathOnly ? 'method' : null;
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ detail: e.detail }, e.status, e.headers);
  console.error(e);
  return json({ detail: 'Internal Server Error' }, 500);
}

// ---- request validation (Pydantic's job in the Python version) ----
// Errors use FastAPI's 422 shape: {"detail": [{"loc": ["body", field], "msg": ..., "type": ...}]}

export class Invalid {
  errors: { loc: (string | number)[]; msg: string; type: string }[] = [];
  add(field: string, msg: string, type = 'value_error') {
    this.errors.push({ loc: ['body', field], msg, type });
  }
  throwIfAny() {
    if (this.errors.length) throw new HttpError(422, this.errors);
  }
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
/** Pydantic's EmailStr: valid address, domain lowercased (the local part keeps its case). */
export function email(v: unknown, field: string, inv: Invalid): string {
  if (typeof v !== 'string' || !EMAIL.test(v.trim())) {
    inv.add(field, 'value is not a valid email address: The email address is not valid.', 'value_error');
    return '';
  }
  const [local, domain] = v.trim().split(/@(?=[^@]*$)/);
  return `${local}@${domain.toLowerCase()}`;
}
export function str(v: unknown, field: string, inv: Invalid, opts: { required?: boolean; min?: number; max?: number; pattern?: RegExp } = {}): string {
  if (v === undefined || v === null) {
    if (opts.required !== false) inv.add(field, 'Field required', 'missing');
    return '';
  }
  if (typeof v !== 'string') {
    inv.add(field, 'Input should be a valid string', 'string_type');
    return '';
  }
  if (opts.min !== undefined && v.length < opts.min) inv.add(field, `String should have at least ${opts.min} character${opts.min === 1 ? '' : 's'}`, 'string_too_short');
  if (opts.max !== undefined && v.length > opts.max) inv.add(field, `String should have at most ${opts.max} characters`, 'string_too_long');
  if (opts.pattern && !opts.pattern.test(v)) inv.add(field, `String should match pattern '${opts.pattern.source}'`, 'string_pattern_mismatch');
  return v;
}
export function optStr(v: unknown, field: string, inv: Invalid, opts: { max?: number; pattern?: RegExp } = {}): string | null {
  if (v === undefined || v === null) return null;
  return str(v, field, inv, opts);
}
export function int(v: unknown, field: string, inv: Invalid, opts: { required?: boolean; ge?: number; le?: number; def?: number } = {}): number {
  if (v === undefined || v === null) {
    if (opts.def !== undefined) return opts.def;
    if (opts.required !== false) inv.add(field, 'Field required', 'missing');
    return 0;
  }
  const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    inv.add(field, 'Input should be a valid integer', 'int_type');
    return 0;
  }
  if (opts.ge !== undefined && n < opts.ge) inv.add(field, `Input should be greater than or equal to ${opts.ge}`, 'greater_than_equal');
  if (opts.le !== undefined && n > opts.le) inv.add(field, `Input should be less than or equal to ${opts.le}`, 'less_than_equal');
  return n;
}
export function optNum(v: unknown, field: string, inv: Invalid): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    inv.add(field, 'Input should be a valid number', 'float_type');
    return null;
  }
  return n;
}
export function bool(v: unknown, field: string, inv: Invalid, def: boolean): boolean {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  inv.add(field, 'Input should be a valid boolean', 'bool_type');
  return def;
}
export function oneOf<T extends string>(v: unknown, field: string, inv: Invalid, allowed: readonly T[], def?: T | null): T | null {
  if (v === undefined || v === null) return def ?? null;
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    inv.add(field, `Input should be ${allowed.map((a) => `'${a}'`).join(', ').replace(/, ([^,]*)$/, ' or $1')}`, 'literal_error');
    return def ?? null;
  }
  return v as T;
}
export function strList(v: unknown, field: string, inv: Invalid, opts: { max?: number } = {}): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    inv.add(field, 'Input should be a valid list', 'list_type');
    return [];
  }
  if (opts.max !== undefined && v.length > opts.max) inv.add(field, `List should have at most ${opts.max} items after validation, not ${v.length}`, 'too_long');
  return v as string[];
}
