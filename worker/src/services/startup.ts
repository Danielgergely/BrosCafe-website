// What the Python API did on every start (backend/app/main.py: _seed_admin, _seed_content_from_files) plus the
// seeder itself (backend/app/seed.py). The cron job calls startup() once per deployed version.
import catalogFile from '../../../backend/data/catalog.json';
import whatsNewFile from '../../../backend/data/whats_new.json';
import type { Collection, Doc } from '../db';
import type { App } from '../http';
import { settings } from '../config';
import { hashPassword, verifyPassword } from '../security';
import { nowIso, uuid4 } from '../util';

type Section = 'products' | 'content';

const FILES: Record<Section, () => Doc[]> = {
  products: () => structuredClone((catalogFile as { products: Doc[] }).products),
  content: () => structuredClone((whatsNewFile as { posts: Doc[] }).posts),
};

/** ProductUpsert / PostUpsert fields minus id and active (seed.py KNOWN_FIELDS). */
export const KNOWN_FIELDS: Record<Section, string[]> = {
  products: [
    'cat', 'section', 'order', 'price_huf', 'name', 'desc', 'images', 'tip', 'ingredients', 'behind', 'sizes', 'material',
    'flavor', 'allergens', 'milks', 'temp', 'video', 'pairings', 'stock_photos',
  ],
  content: ['order', 'kind', 'tags', 'date', 'product_ids', 'image', 'title', 'blurb', 'body'],
};

/** One item as it stands in data/*.json — what "revert" restores. */
export function fileDocument(section: Section, docId: string): Doc | null {
  return FILES[section]().find((d) => d.id === docId) ?? null;
}

/** Upsert by id, archive what the file no longer lists, keep admin edits. Returns [seeded, archived, kept]. */
async function upsert(app: App, collection: Collection, documents: Doc[], force = false, known: string[] = []): Promise<[number, number, number]> {
  let seeded = 0, kept = 0;
  const fileIds: unknown[] = [];
  for (const doc of documents) {
    fileIds.push(doc.id);
    if (!force) {
      const existing = await collection.findOne({ id: doc.id }, { projection: { edited_at: 1 } });
      if (existing && existing.edited_at) {
        kept += 1;
        continue;
      }
    }
    const fields = { ...doc, active: 'active' in doc ? doc.active : true };
    const unset: Record<string, string> = {};
    for (const field of known) if (!(field in doc)) unset[field] = '';
    if (force) Object.assign(unset, { edited_at: '', edited_by: '' });
    const update: { $set: Doc; $unset?: Record<string, string> } = { $set: fields };
    if (Object.keys(unset).length) update.$unset = unset;
    await collection.updateOne({ id: doc.id }, update, { upsert: true });
    seeded += 1;
  }

  // {"id": {"$nin": file_ids}, "active": {"$ne": False}} (+ "edited_at": {"$exists": False}), with the id list
  // passed as one JSON array: D1 allows only 100 bound parameters, and the catalog is close to that.
  const sql =
    `UPDATE ${collection.name} SET doc = json_set(doc, '$.active', json('false'))
     WHERE (json_extract(doc, '$.id') IS NULL OR json_extract(doc, '$.id') NOT IN (SELECT value FROM json_each(?)))
       AND (json_extract(doc, '$.active') IS NULL OR json_extract(doc, '$.active') != 0)` +
    (force ? '' : ` AND json_type(doc, '$.edited_at') IS NULL`);
  const res = await app.db.d1.prepare(sql).bind(JSON.stringify(fileIds)).run();
  return [seeded, res.meta.changes ?? 0, kept];
}

/** Set each product's price to the file's, ignoring edited_at. Returns [id, old, new] per change. */
export async function syncPrices(app: App, documents: Doc[]): Promise<[string, unknown, number][]> {
  const changed: [string, unknown, number][] = [];
  for (const doc of documents) {
    const existing = await app.db.products.findOne({ id: doc.id }, { projection: { price_huf: 1 } });
    if (existing === null || existing.price_huf === doc.price_huf) continue;
    await app.db.products.updateOne({ id: doc.id }, { $set: { price_huf: doc.price_huf } });
    changed.push([doc.id, existing.price_huf ?? null, doc.price_huf]);
  }
  return changed;
}

/** `python -m app.seed [--products|--content|--force|--prices]`. */
export async function seed(app: App, opts: { products?: boolean; content?: boolean; force?: boolean; prices?: boolean } = {}) {
  const both = !(opts.products || opts.content);
  if (opts.prices) {
    const changed = await syncPrices(app, FILES.products());
    for (const [docId, old, now] of changed) console.log(`  ${docId}: ${old} -> ${now} Ft`);
    console.log(`prices: ${changed.length} changed`);
    return 0;
  }
  for (const [name, wanted] of [['products', both || opts.products], ['content', both || opts.content]] as [Section, boolean][]) {
    if (!wanted) continue;
    const [seeded, archived, kept] = await upsert(app, app.db[name], FILES[name](), !!opts.force, KNOWN_FIELDS[name]);
    const note = kept ? `, ${kept} left as edited in /admin` : '';
    console.log(`${name}: ${seeded} seeded, ${archived} archived${note}`);
  }
  return 0;
}

/** Keep the configured admin account in sync with the environment. */
async function seedAdmin(app: App) {
  const s = settings(app.env);
  if (!(s.admin_email && s.admin_password)) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD unset — no admin account provisioned');
    return;
  }
  const existing = await app.db.users.findOne({ email: s.admin_email });
  if (existing === null) {
    await app.db.users.insertOne({
      id: uuid4(), name: 'Bros Cafe Admin',
      email: s.admin_email,
      password_hash: hashPassword(s.admin_password),
      role: 'admin', created_at: nowIso(),
    });
    console.log(`Seeded admin user ${s.admin_email}`);
  } else if (!verifyPassword(s.admin_password, existing.password_hash)) {
    await app.db.users.updateOne({ email: s.admin_email }, { $set: { password_hash: hashPassword(s.admin_password) } });
    console.log(`Updated admin password for ${s.admin_email}`);
  }
}

/** Load data/catalog.json and data/whats_new.json when SEED_ON_STARTUP is true. Never throws. */
async function seedContentFromFiles(app: App) {
  if (!settings(app.env).seed_on_startup) return;
  try {
    await seed(app);
  } catch (e) {
    console.error('Seeding from data files failed; continuing without it', e);
  }
}

export async function startup(app: App): Promise<void> {
  await seedAdmin(app);
  await seedContentFromFiles(app);
}
