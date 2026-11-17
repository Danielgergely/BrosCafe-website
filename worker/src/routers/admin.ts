// Admin surface: stats, members, transactions, thresholds, and the content editor — catalog, journal posts and
// uploaded photography. Port of backend/app/routers/admin.py. Every route checks require_admin first, as the
// router-level dependency did (before any body validation).
import type { Collection, Doc } from '../db';
import { HttpError, Invalid, type Ctx, type Router } from '../http';
import { requireAdmin } from '../security';
import { settings } from '../config';
import { nowIso } from '../util';
import * as analytics from '../services/analytics';
import * as appSettings from '../services/app_settings';
import * as media from '../services/media';
import * as members from '../services/members';
import * as wallet from '../services/wallet';
import * as seed from '../services/startup';
import * as apple from '../wallet/apple';
import * as google from '../wallet/google';

// ---------------------------------------------------------------- request models (pydantic, lax mode)

type Loc = (string | number)[];
const T = Symbol('invalid');
type Out = unknown | typeof T;

function err(inv: Invalid, loc: Loc, msg: string, type: string) {
  inv.errors.push({ loc: ['body', ...loc], msg, type });
  return T;
}

const INT_STR = /^\s*[+-]?\d+\s*$/;
function vInt(v: unknown, loc: Loc, inv: Invalid, opts: { ge?: number; le?: number } = {}): Out {
  let n: unknown = v;
  if (typeof v === 'string') {
    if (!INT_STR.test(v)) return err(inv, loc, 'Input should be a valid integer, unable to parse string as an integer', 'int_parsing');
    n = Number.parseInt(v, 10);
  }
  if (typeof n !== 'number') return err(inv, loc, 'Input should be a valid integer', 'int_type');
  if (!Number.isInteger(n)) return err(inv, loc, 'Input should be a valid integer, got a number with a fractional part', 'int_from_float');
  if (opts.ge !== undefined && n < opts.ge) return err(inv, loc, `Input should be greater than or equal to ${opts.ge}`, 'greater_than_equal');
  if (opts.le !== undefined && n > opts.le) return err(inv, loc, `Input should be less than or equal to ${opts.le}`, 'less_than_equal');
  return n;
}
function vFloat(v: unknown, loc: Loc, inv: Invalid): Out {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || Number.isNaN(n)) {
    return typeof v === 'string' ? err(inv, loc, 'Input should be a valid number, unable to parse string as a number', 'float_parsing') : err(inv, loc, 'Input should be a valid number', 'float_type');
  }
  return n;
}
const TRUE = ['1', 'on', 't', 'true', 'y', 'yes'];
const FALSE = ['0', 'f', 'false', 'n', 'no', 'off'];
function vBool(v: unknown, loc: Loc, inv: Invalid): Out {
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (TRUE.includes(s)) return true;
    if (FALSE.includes(s)) return false;
    return err(inv, loc, 'Input should be a valid boolean, unable to interpret input', 'bool_parsing');
  }
  return err(inv, loc, 'Input should be a valid boolean', 'bool_type');
}
function vStr(v: unknown, loc: Loc, inv: Invalid, pattern?: RegExp): Out {
  if (typeof v !== 'string') return err(inv, loc, 'Input should be a valid string', 'string_type');
  if (pattern && !pattern.test(v)) return err(inv, loc, `String should match pattern '${pattern.source}'`, 'string_pattern_mismatch');
  return v;
}
function vLiteral(allowed: readonly string[]) {
  return (v: unknown, loc: Loc, inv: Invalid): Out =>
    typeof v === 'string' && allowed.includes(v) ? v : err(inv, loc, `Input should be ${allowed.map((a) => `'${a}'`).join(', ').replace(/, ([^,]*)$/, ' or $1')}`, 'literal_error');
}
function vStrList(v: unknown, loc: Loc, inv: Invalid): Out {
  if (!Array.isArray(v)) return err(inv, loc, 'Input should be a valid list', 'list_type');
  let bad = false;
  v.forEach((x, i) => { if (vStr(x, [...loc, i], inv) === T) bad = true; });
  return bad ? T : [...v];
}
function vDict(v: unknown, loc: Loc, inv: Invalid): Out {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : err(inv, loc, 'Input should be a valid dictionary', 'dict_type');
}
/** A nested model: {en, hu}, unknown keys dropped. */
function vModel(name: string, item: (v: unknown, loc: Loc, inv: Invalid) => Out) {
  return (v: unknown, loc: Loc, inv: Invalid): Out => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return err(inv, loc, `Input should be a valid dictionary or instance of ${name}`, 'model_type');
    const o = v as Doc;
    const out: Doc = {};
    let bad = false;
    for (const k of ['en', 'hu']) {
      if (o[k] === undefined) { err(inv, [...loc, k], 'Field required', 'missing'); bad = true; continue; }
      const r = item(o[k], [...loc, k], inv);
      if (r === T) bad = true;
      else out[k] = r;
    }
    return bad ? T : out;
  };
}
const vLocalized = vModel('Localized', (v, l, i) => vStr(v, l, i));
const vLocalizedList = vModel('LocalizedList', vStrList);

type Validator = (v: unknown, loc: Loc, inv: Invalid) => Out;
interface Field { check: Validator; optional?: boolean; required?: boolean; def?: () => unknown }

/** Validate a body like a pydantic model: returns the dump (exclude_none, in field order) and the fields set. */
function model(body: unknown, fields: Record<string, Field>, inv: Invalid): { dump: Doc; set: Set<string>; values: Doc } {
  const b: Doc = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Doc) : {};
  if (b !== body) inv.errors.push({ loc: ['body'], msg: 'Input should be a valid dictionary or object to extract fields from', type: 'model_attributes_type' });
  const values: Doc = {};
  const set = new Set<string>();
  for (const [name, f] of Object.entries(fields)) {
    if (!(name in b) || b[name] === undefined) {
      if (f.required) err(inv, [name], 'Field required', 'missing');
      else values[name] = f.def ? f.def() : null;
      continue;
    }
    set.add(name);
    const v = b[name];
    if (v === null && f.optional) {
      values[name] = null;
      continue;
    }
    const r = f.check(v, [name], inv);
    if (r !== T) values[name] = r;
  }
  const dump: Doc = {};
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) dump[k] = v;
  return { dump, set, values };
}

const ID = /^[a-z0-9-]{2,50}$/;
const CATEGORIES = ['coffee', 'specialty', 'tea', 'smoothie', 'sandwich', 'pastry', 'cake', 'dessert', 'bottled', 'beans', 'merch'] as const;
const SECTIONS = ['coffee', 'cold', 'savoury', 'sweet'] as const;
const POST_KINDS = ['guest', 'house', 'pastry'] as const;
const TIERS = ['base', 'bronze', 'silver', 'gold', 'diamond'] as const;

const PRODUCT_UPSERT: Record<string, Field> = {
  id: { check: (v, l, i) => vStr(v, l, i, ID), required: true },
  cat: { check: vLiteral(CATEGORIES), required: true },
  section: { check: vLiteral(SECTIONS), optional: true },
  order: { check: (v, l, i) => vInt(v, l, i), def: () => 99 },
  price_huf: { check: (v, l, i) => vInt(v, l, i, { ge: 0 }), required: true },
  name: { check: vLocalized, required: true },
  desc: { check: vLocalized, required: true },
  images: { check: vStrList, def: () => [] },
  tip: { check: vLocalized, optional: true },
  ingredients: { check: vLocalizedList, optional: true },
  behind: { check: vLocalizedList, optional: true },
  sizes: { check: vLocalizedList, optional: true },
  material: { check: vLocalized, optional: true },
  flavor: { check: vDict, optional: true },
  allergens: { check: vStrList, def: () => [] },
  milks: { check: vStrList, def: () => [] },
  temp: { check: (v, l, i) => vStr(v, l, i), optional: true },
  video: { check: (v, l, i) => vStr(v, l, i), optional: true },
  pairings: { check: vStrList, def: () => [] },
  active: { check: vBool, def: () => true },
  stock_photos: { check: vBool, def: () => false },
};

const POST_UPSERT: Record<string, Field> = {
  id: { check: (v, l, i) => vStr(v, l, i, ID), required: true },
  order: { check: (v, l, i) => vInt(v, l, i), def: () => 99 },
  kind: { check: vLiteral(POST_KINDS), def: () => 'house' },
  tags: { check: vStrList, def: () => [] },
  date: { check: (v, l, i) => vStr(v, l, i, /^\d{4}-\d{2}-\d{2}$/), optional: true },
  product_ids: { check: vStrList, def: () => [] },
  image: { check: (v, l, i) => vStr(v, l, i), def: () => '' },
  title: { check: vLocalized, required: true },
  blurb: { check: vLocalized, required: true },
  body: { check: vLocalized, required: true },
  active: { check: vBool, def: () => true },
};

const SETTINGS_UPDATE: Record<string, Field> = {
  active_days: { check: (v, l, i) => vInt(v, l, i), optional: true },
  inactive_days: { check: (v, l, i) => vInt(v, l, i), optional: true },
  new_days: { check: (v, l, i) => vInt(v, l, i), optional: true },
  loyal_cycles: { check: (v, l, i) => vInt(v, l, i), optional: true },
  almost_reward_stamps: { check: (v, l, i) => vInt(v, l, i), optional: true },
  cafe_lat: { check: vFloat, optional: true },
  cafe_lng: { check: vFloat, optional: true },
};

// ---------------------------------------------------------------- helpers

/** Mark a row as dashboard-owned: `edited_at` stops the file seeder from overwriting it. */
const stamp = (doc: Doc, user: Doc): Doc => ({ ...doc, edited_at: nowIso(), edited_by: members.get(user, 'email', 'admin') });

/** Hand ownership of one item back to data/*.json. */
async function revertToFile(collection: Collection, section: 'products' | 'content', docId: string): Promise<Doc> {
  const original = seed.fileDocument(section, docId);
  if (!original) throw new HttpError(404, 'This item only exists in the dashboard, so there is no file version to restore');
  await collection.updateOne({ id: docId }, { $set: { ...original, active: true }, $unset: { edited_at: '', edited_by: '' } });
  return original;
}

/** A FastAPI `int` query parameter. */
function queryInt(c: Ctx, name: string, def: number): number {
  const raw = c.query.get(name);
  if (raw === null) return def;
  if (!INT_STR.test(raw)) {
    throw new HttpError(422, [{ type: 'int_parsing', loc: ['query', name], msg: 'Input should be a valid integer, unable to parse string as an integer', input: raw }]);
  }
  return Number.parseInt(raw, 10);
}

/** Fields a product may legitimately not have. Sent as null they mean "remove". */
export const OPTIONAL_PRODUCT_FIELDS = ['flavor', 'tip', 'ingredients', 'behind', 'sizes', 'material', 'video', 'temp', 'section'];

export function register(api: Router) {
  /** Every admin route: the admin check first, as the router-level dependency ran before validation. */
  const admin = (method: 'get' | 'post' | 'put' | 'delete', path: string, handler: (c: Ctx, user: Doc) => unknown) =>
    api[method](`/admin${path}`, async (c) => handler(c, await requireAdmin(c)));

  // ---------------------------------------------------------------- overview
  admin('get', '/stats', async (c) => {
    // {$group: {_id: null, coffees: {$sum: "$total_coffees"}, rewards: {$sum: "$rewards_redeemed"}}}: $sum skips
    // anything that is not a number; no members means no group, hence the zeros.
    const num = (f: string) => `SUM(CASE WHEN json_type(doc, '$.${f}') IN ('integer', 'real') THEN json_extract(doc, '$.${f}') ELSE 0 END)`;
    const row = await c.db.d1
      .prepare(`SELECT COUNT(*) AS n, ${num('total_coffees')} AS coffees, ${num('rewards_redeemed')} AS rewards FROM members`)
      .first<{ n: number; coffees: number | null; rewards: number | null }>();
    const totals = row && row.n ? { coffees: row.coffees ?? 0, rewards: row.rewards ?? 0 } : { coffees: 0, rewards: 0 };
    return {
      members: await c.db.members.countDocuments({}),
      coffees: totals.coffees,
      rewards_redeemed: totals.rewards,
    };
  });

  admin('get', '/members', async (c) => {
    const docs = await c.db.members.find({}, { projection: { _id: 0 }, sort: { created_at: -1 }, limit: 1000 });
    return docs.map((d) => members.publicView(c, d));
  });

  admin('put', '/members/{code}/tier', async (c) => {
    const code = c.params.code;
    const inv = new Invalid();
    const { values } = model(await c.json(), { tier: { check: vLiteral(TIERS), optional: true } }, inv);
    inv.throwIfAny();
    const tier = values.tier ?? null;

    const doc = await c.db.members.findOne({ code });
    if (!doc) throw new HttpError(404, 'Member not found');

    await c.db.members.updateOne({ code }, { $set: { tier_override: tier } });
    doc.tier_override = tier;
    try {
      await wallet.notifyUpdate(c, code);
    } catch (e) {
      console.error(`Could not refresh the wallet pass for ${code} after a tier change`, e);
    }
    return members.publicView(c, doc);
  });

  admin('put', '/members/{code}/free-coffees', async (c, user) => {
    const inv = new Invalid();
    const { values } = model(await c.json(), { delta: { check: (v, l, i) => vInt(v, l, i, { ge: -10, le: 10 }), required: true } }, inv);
    inv.throwIfAny();
    const doc = await members.grantFreeCoffees(c, c.params.code, values.delta, 'admin grant', user.email);
    if (!doc) throw new HttpError(404, 'Customer not found');
    return members.publicView(c, doc);
  });

  admin('delete', '/members/{code}', async (c) => {
    const result = await members.erase(c, c.params.code);
    if (!result) throw new HttpError(404, 'Member not found');
    return result;
  });

  admin('get', '/transactions', async (c) => {
    const limit = queryInt(c, 'limit', 200);
    const query: Doc = {};
    for (const k of ['type', 'code']) {
      const v = c.query.get(k);
      if (v) query[k] = v;
    }
    return c.db.transactions.find(query, { projection: { _id: 0 }, sort: { at: -1 }, limit });
  });

  // ---------------------------------------------------------------- settings
  admin('get', '/settings', (c) => appSettings.read(c));

  admin('put', '/settings', async (c) => {
    const inv = new Invalid();
    const { dump } = model(await c.json(), SETTINGS_UPDATE, inv);
    inv.throwIfAny();
    return appSettings.write(c, dump);
  });

  // ---------------------------------------------------------------- analytics
  admin('get', '/analytics/overview', (c) => analytics.overview(c));
  admin('get', '/analytics/funnel', (c) => analytics.funnel(c));
  admin('get', '/analytics/customers', (c) => analytics.customers(c));
  admin('get', '/analytics/coffee', (c) => analytics.coffee(c));
  admin('get', '/analytics/rewards', (c) => analytics.rewards(c));
  admin('get', '/analytics/retention', (c) => analytics.retention(c));
  admin('get', '/analytics/segments', (c) => analytics.segments(c));

  // ---------------------------------------------------------------- catalog
  admin('get', '/products', (c) => c.db.products.find({}, { projection: { _id: 0 }, sort: { order: 1 }, limit: 200 }));

  admin('post', '/products', async (c, user) => {
    const inv = new Invalid();
    const body = model(await c.json(), PRODUCT_UPSERT, inv);
    inv.throwIfAny();
    const doc = stamp(body.dump, user);

    // "field omitted" vs "field explicitly cleared": a cleared optional field is $unset, not set to null.
    const update: { $set: Doc; $unset?: Record<string, string> } = { $set: doc };
    const cleared: Record<string, string> = {};
    for (const field of OPTIONAL_PRODUCT_FIELDS) if (body.set.has(field) && body.values[field] === null) cleared[field] = '';
    if (Object.keys(cleared).length) update.$unset = cleared;

    await c.db.products.updateOne({ id: doc.id }, update, { upsert: true });
    return doc;
  });

  admin('post', '/products/{product_id}/reset', (c) => revertToFile(c.db.products, 'products', c.params.product_id));

  admin('delete', '/products/{product_id}', async (c) => {
    const id = c.params.product_id;
    const result = await c.db.products.updateOne({ id }, { $set: { active: false, edited_at: nowIso() } });
    if (!result.matchedCount) throw new HttpError(404, 'Product not found');
    return { id, active: false };
  });

  // ---------------------------------------------------------------- journal
  admin('get', '/whats-new', (c) => c.db.content.find({}, { projection: { _id: 0 }, sort: { order: 1 }, limit: 100 }));

  admin('post', '/whats-new', async (c, user) => {
    const inv = new Invalid();
    const body = model(await c.json(), POST_UPSERT, inv);
    inv.throwIfAny();
    const doc = stamp(body.dump, user);
    await c.db.content.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    return doc;
  });

  admin('delete', '/whats-new/{post_id}', async (c) => {
    const id = c.params.post_id;
    const result = await c.db.content.updateOne({ id }, { $set: { active: false, edited_at: nowIso() } });
    if (!result.matchedCount) throw new HttpError(404, 'Post not found');
    return { id, active: false };
  });

  admin('post', '/whats-new/{post_id}/reset', (c) => revertToFile(c.db.content, 'content', c.params.post_id));

  // ---------------------------------------------------------------- media
  admin('get', '/media', (c) => media.listing(c));

  admin('post', '/media', async (c, user) => {
    let file: unknown = null;
    try {
      file = (await c.req.formData()).get('file');
    } catch {
      file = null;
    }
    if (file === null || typeof file === 'string') {
      throw new HttpError(422, [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null }]);
    }
    const upload = file as File;
    const maxMb = settings(c.env).max_upload_mb;
    const limit = maxMb * 1024 * 1024;
    if (upload.size > limit) throw new HttpError(413, `Keep files under ${maxMb} MB`);
    const data = new Uint8Array(await upload.arrayBuffer());
    if (data.length > limit) throw new HttpError(413, `Keep files under ${maxMb} MB`);

    const kind = media.sniff(data.subarray(0, media.SNIFF_BYTES));
    if (!kind || !(kind in media.ALLOWED)) throw new HttpError(415, 'Upload a JPEG, PNG, WebP, AVIF or MP4');
    return media.save(c, data, upload.name || 'upload', kind, members.get(user, 'email', 'admin') as string);
  });

  admin('delete', '/media/{filename}', async (c) => {
    const filename = c.params.filename;
    if (!media.FILENAME.test(filename)) throw new HttpError(404, 'Not found');

    const usedBy = await media.usage(c, media.publicUrl(filename));
    if (usedBy.length) throw new HttpError(409, `Still used by: ${usedBy.join(', ')}`);
    if (!(await media.remove(c, filename))) throw new HttpError(404, 'Not found');
    return { filename, deleted: true };
  });

  // ---------------------------------------------------------------- wallet
  admin('get', '/wallet/status', async (c) => {
    // the Mongo document {_id: "stats"} is the only one in wallet_stats
    const statsDoc = (await c.db.wallet_stats.findOne({})) ?? {};
    const last = await c.db.members.find(
      { wallet_updated_at: { $exists: true } },
      { projection: { _id: 0, wallet_updated_at: 1 }, sort: { wallet_updated_at: -1 }, limit: 1 },
    );
    return {
      config: apple.configStatus(c.env),
      google_config: google.configStatus(c.env),
      passes_issued: await c.db.members.countDocuments({ wallet_serial: { $exists: true } }),
      google_passes_issued: await c.db.members.countDocuments({ google_object_id: { $exists: true } }),
      active_registrations: await c.db.wallet_registrations.countDocuments({}),
      last_update: last.length ? last[0].wallet_updated_at : null,
      generation_failures: members.get(statsDoc, 'gen_failures', 0),
      push_failures: members.get(statsDoc, 'push_failures', 0),
      google_generation_failures: members.get(statsDoc, 'google_gen_failures', 0),
      google_push_failures: members.get(statsDoc, 'google_push_failures', 0),
    };
  });
}
