// MongoDB-shaped collections on D1. Every collection is a table of JSON documents, so the ported code keeps the
// exact document shapes of the Python backend (and the data imports one to one). Only what the backend used is
// implemented: equality, $ne, $exists, $gt/$gte/$lt/$lte, $in/$nin, $or in filters; $set, $unset, $inc in updates;
// projections, sort, skip, limit. Field names may be dotted ("a.b").
//
// Mongo semantics that matter and are kept:
// - {f: null} matches a missing field; {f: {$ne: x}} also matches a missing field.
// - updateOne touches at most one document and is a single SQL statement (atomic).
// - upsert inserts the equality fields of the filter plus the update.

export type Doc = Record<string, any>;
export type Filter = Record<string, any>;
export type Sort = [string, 1 | -1][] | Record<string, 1 | -1>;
export interface FindOptions { projection?: Record<string, 0 | 1>; sort?: Sort; skip?: number; limit?: number }
export interface Update { $set?: Doc; $unset?: Record<string, unknown>; $inc?: Record<string, number> }

const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
function path(field: string) {
  if (!FIELD.test(field)) throw new Error(`bad field name: ${field}`);
  return `$.${field}`;
}
const extract = (field: string) => `json_extract(doc, '${path(field)}')`;

/** Values as D1 can bind them: booleans as 1/0 (json_extract returns true/false as 1/0). */
function bindable(v: unknown) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return v as string | number | null;
}

function compile(filter: Filter, args: unknown[]): string {
  const parts: string[] = [];
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or' || key === '$and') {
      const subs = (cond as Filter[]).map((f) => `(${compile(f, args)})`);
      parts.push(subs.length ? `(${subs.join(key === '$or' ? ' OR ' : ' AND ')})` : key === '$or' ? '0' : '1');
      continue;
    }
    const col = extract(key);
    const isOps = cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'));
    if (!isOps) {
      if (cond === null) parts.push(`${col} IS NULL`);
      else if (typeof cond === 'object' && !(cond instanceof Date)) {
        parts.push(`json(json_extract(doc, '${path(key)}')) = json(?)`);
        args.push(JSON.stringify(cond));
      } else {
        parts.push(`${col} = ?`);
        args.push(bindable(cond));
      }
      continue;
    }
    for (const [op, v] of Object.entries(cond as Doc)) {
      switch (op) {
        case '$ne':
          if (v === null) parts.push(`${col} IS NOT NULL`);
          else {
            parts.push(`(${col} IS NULL OR ${col} != ?)`);
            args.push(bindable(v));
          }
          break;
        case '$exists':
          parts.push(v ? `json_type(doc, '${path(key)}') IS NOT NULL` : `json_type(doc, '${path(key)}') IS NULL`);
          break;
        case '$gt': case '$gte': case '$lt': case '$lte': {
          const sym = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
          parts.push(`${col} ${sym} ?`);
          args.push(bindable(v));
          break;
        }
        case '$in': case '$nin': {
          const list = v as unknown[];
          if (!list.length) {
            parts.push(op === '$in' ? '0' : '1');
            break;
          }
          const hasNull = list.some((x) => x === null);
          const vals = list.filter((x) => x !== null);
          const inList = vals.length ? `${col} IN (${vals.map(() => '?').join(',')})` : '0';
          args.push(...vals.map(bindable));
          const clause = hasNull ? `(${inList} OR ${col} IS NULL)` : inList;
          // Mongo's $nin also matches documents without the field
          parts.push(op === '$in' ? clause : hasNull ? `NOT ${clause}` : `(${col} IS NULL OR NOT ${clause})`);
          break;
        }
        default:
          throw new Error(`unsupported filter operator ${op}`);
      }
    }
  }
  return parts.length ? parts.join(' AND ') : '1';
}

function orderBy(sort?: Sort) {
  if (!sort) return '';
  const list = Array.isArray(sort) ? sort : Object.entries(sort);
  return list.length ? ` ORDER BY ${list.map(([f, d]) => `${extract(f)} ${d === -1 ? 'DESC' : 'ASC'}`).join(', ')}, _id` : '';
}

function getPath(doc: Doc, field: string) {
  return field.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), doc);
}
function setPath(doc: Doc, field: string, value: unknown) {
  const keys = field.split('.');
  let o = doc;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)!] = value;
}

export function project(doc: Doc, projection?: Record<string, 0 | 1>): Doc {
  const { _id: _ignored, ...rest } = doc;
  if (!projection) return rest;
  const fields = Object.entries(projection).filter(([k]) => k !== '_id');
  if (!fields.length) return rest;
  if (fields.some(([, v]) => v)) {
    const out: Doc = {};
    for (const [k, v] of fields) if (v) { const val = getPath(rest, k); if (val !== undefined) setPath(out, k, val); }
    return out;
  }
  const out = structuredClone(rest);
  for (const [k] of fields) {
    const keys = k.split('.');
    const parent = keys.length > 1 ? getPath(out, keys.slice(0, -1).join('.')) : out;
    if (parent && typeof parent === 'object') delete parent[keys.at(-1)!];
  }
  return out;
}

/** JSON for json_set: dates become ISO strings, undefined becomes null. */
const asJson = (v: unknown) => JSON.stringify(v === undefined ? null : v instanceof Date ? v.toISOString() : v);

function updateSql(update: Update, args: unknown[]) {
  let expr = 'doc';
  const sets = Object.entries(update.$set ?? {});
  if (sets.length) {
    expr = `json_set(${expr}, ${sets.map(([k]) => `'${path(k)}', json(?)`).join(', ')})`;
    args.push(...sets.map(([, v]) => asJson(v)));
  }
  const incs = Object.entries(update.$inc ?? {});
  if (incs.length) {
    expr = `json_set(${expr}, ${incs.map(([k]) => `'${path(k)}', COALESCE(json_extract(doc, '${path(k)}'), 0) + ?`).join(', ')})`;
    args.push(...incs.map(([, v]) => v));
  }
  const unsets = Object.keys(update.$unset ?? {});
  if (unsets.length) expr = `json_remove(${expr}, ${unsets.map((k) => `'${path(k)}'`).join(', ')})`;
  return expr;
}

/** The document an upsert creates: plain equality fields of the filter, then the update applied. */
function upsertDoc(filter: Filter, update: Update): Doc {
  const doc: Doc = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    const isOps = v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some((x) => x.startsWith('$'));
    if (!isOps) setPath(doc, k, v);
  }
  for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v instanceof Date ? v.toISOString() : v);
  for (const [k, v] of Object.entries(update.$inc ?? {})) setPath(doc, k, (getPath(doc, k) ?? 0) + v);
  for (const k of Object.keys(update.$unset ?? {})) {
    const keys = k.split('.');
    const parent = keys.length > 1 ? getPath(doc, keys.slice(0, -1).join('.')) : doc;
    if (parent && typeof parent === 'object') delete parent[keys.at(-1)!];
  }
  return doc;
}

export class Collection {
  constructor(private d1: D1Database, readonly name: string) {}

  async find(filter: Filter = {}, opts: FindOptions = {}): Promise<Doc[]> {
    const args: unknown[] = [];
    let sql = `SELECT doc FROM ${this.name} WHERE ${compile(filter, args)}${orderBy(opts.sort)}`;
    if (opts.limit !== undefined || opts.skip !== undefined) sql += ` LIMIT ${Math.max(0, Math.floor(opts.limit ?? -1)) || -1} OFFSET ${Math.max(0, Math.floor(opts.skip ?? 0))}`;
    if (opts.limit === 0) return []; // Mongo's to_list(0) is not used; a zero limit here means none
    const { results } = await this.d1.prepare(sql).bind(...args).all<{ doc: string }>();
    return results.map((r) => project(JSON.parse(r.doc), opts.projection));
  }

  async findOne(filter: Filter = {}, opts: Omit<FindOptions, 'limit'> = {}): Promise<Doc | null> {
    return (await this.find(filter, { ...opts, limit: 1 }))[0] ?? null;
  }

  async countDocuments(filter: Filter = {}): Promise<number> {
    const args: unknown[] = [];
    const row = await this.d1.prepare(`SELECT COUNT(*) AS n FROM ${this.name} WHERE ${compile(filter, args)}`).bind(...args).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async insertOne(doc: Doc): Promise<void> {
    const { _id: _ignored, ...rest } = doc;
    await this.d1.prepare(`INSERT INTO ${this.name} (doc) VALUES (json(?))`).bind(asJson(rest)).run();
  }

  async insertMany(docs: Doc[]): Promise<void> {
    if (!docs.length) return;
    const stmt = this.d1.prepare(`INSERT INTO ${this.name} (doc) VALUES (json(?))`);
    await this.d1.batch(docs.map(({ _id: _ignored, ...rest }) => stmt.bind(asJson(rest))));
  }

  async updateOne(filter: Filter, update: Update, opts: { upsert?: boolean } = {}) {
    const args: unknown[] = [];
    const expr = updateSql(update, args);
    const where = compile(filter, args);
    const res = await this.d1.prepare(`UPDATE ${this.name} SET doc = ${expr} WHERE _id = (SELECT _id FROM ${this.name} WHERE ${where} LIMIT 1)`).bind(...args).run();
    const matched = res.meta.changes ?? 0;
    if (!matched && opts.upsert) {
      await this.insertOne(upsertDoc(filter, update));
      return { matchedCount: 0, modifiedCount: 0, upserted: true };
    }
    return { matchedCount: matched, modifiedCount: matched, upserted: false };
  }

  async updateMany(filter: Filter, update: Update) {
    const args: unknown[] = [];
    const expr = updateSql(update, args);
    const where = compile(filter, args);
    const res = await this.d1.prepare(`UPDATE ${this.name} SET doc = ${expr} WHERE ${where}`).bind(...args).run();
    return { matchedCount: res.meta.changes ?? 0, modifiedCount: res.meta.changes ?? 0 };
  }

  async replaceOne(filter: Filter, doc: Doc, opts: { upsert?: boolean } = {}) {
    const { _id: _ignored, ...rest } = doc;
    const args: unknown[] = [asJson(rest)];
    const where = compile(filter, args);
    const res = await this.d1.prepare(`UPDATE ${this.name} SET doc = json(?) WHERE _id = (SELECT _id FROM ${this.name} WHERE ${where} LIMIT 1)`).bind(...args).run();
    const matched = res.meta.changes ?? 0;
    if (!matched && opts.upsert) {
      await this.insertOne(rest);
      return { matchedCount: 0, upserted: true };
    }
    return { matchedCount: matched, upserted: false };
  }

  async deleteOne(filter: Filter) {
    const args: unknown[] = [];
    const where = compile(filter, args);
    const res = await this.d1.prepare(`DELETE FROM ${this.name} WHERE _id = (SELECT _id FROM ${this.name} WHERE ${where} LIMIT 1)`).bind(...args).run();
    return { deletedCount: res.meta.changes ?? 0 };
  }

  async deleteMany(filter: Filter) {
    const args: unknown[] = [];
    const where = compile(filter, args);
    const res = await this.d1.prepare(`DELETE FROM ${this.name} WHERE ${where}`).bind(...args).run();
    return { deletedCount: res.meta.changes ?? 0 };
  }

  /** For the few aggregations: a WHERE clause compiled from a Mongo filter, plus its arguments. */
  where(filter: Filter) {
    const args: unknown[] = [];
    return { sql: compile(filter, args), args };
  }
}

export const COLLECTIONS = [
  'users', 'members', 'transactions', 'analytics_events', 'magic_tokens', 'settings', 'content', 'products', 'media',
  'contact_log', 'game_runs', 'wallet_registrations', 'voided_passes', 'wallet_stats', 'sales_days', 'live_sales',
  'sales_forecasts', 'special_days', 'social_posts',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export type Db = Record<CollectionName, Collection> & { d1: D1Database };
export function database(d1: D1Database): Db {
  const db = { d1 } as Db;
  for (const name of COLLECTIONS) (db as any)[name] = new Collection(d1, name);
  return db;
}
