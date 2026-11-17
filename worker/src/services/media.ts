// Photography and video uploaded through the admin dashboard. Port of backend/app/services/media.py.
// Bytes live in the R2 bucket `MEDIA` (was MEDIA_DIR) under the same content-hash filenames; a row in `media`
// records what each file is.
import type { Doc } from '../db';
import type { App } from '../http';
import { nowIso } from '../util';

/** What the site can display; the value is the extension we store under. */
export const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
};

export const SNIFF_BYTES = 16;

export const FILENAME = /^[0-9a-f]{32}\.(jpg|png|webp|avif|mp4)$/;

const startsWith = (head: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => head[at + i] === b);
const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
const slice = (head: Uint8Array, from: number, to: number) => String.fromCharCode(...head.subarray(from, to));

/** Content type from magic bytes, ignoring what the client claimed. */
export function sniff(head: Uint8Array): string | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x89, ...ascii('PNG\r\n\x1a\n')])) return 'image/png';
  if (slice(head, 0, 4) === 'RIFF' && slice(head, 8, 12) === 'WEBP') return 'image/webp';
  if (slice(head, 4, 8) === 'ftyp') {
    const brand = slice(head, 8, 12);
    if (brand === 'avif') return 'image/avif';
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) return 'video/mp4';
  }
  return null;
}

/** Site-relative on purpose, so the library works on any hostname. */
export const publicUrl = (filename: string) => `/api/media/${filename}`;

export async function save(app: App, data: Uint8Array, originalName: string, contentType: string, by: string): Promise<Doc> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const digest = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const filename = `${digest}${ALLOWED[contentType]}`;

  if (!(await app.env.MEDIA.head(filename))) await app.env.MEDIA.put(filename, data, { httpMetadata: { contentType } });

  const doc = {
    id: digest,
    filename,
    url: publicUrl(filename),
    content_type: contentType,
    bytes: data.length,
    original_name: [...originalName].slice(0, 120).join(''),
    uploaded_at: nowIso(),
    uploaded_by: by,
  };
  await app.db.media.updateOne({ id: digest }, { $set: doc }, { upsert: true });
  return doc;
}

export const listing = (app: App, limit = 300) => app.db.media.find({}, { projection: { _id: 0 }, sort: { uploaded_at: -1 }, limit });

export const find = (app: App, filename: string) => app.db.media.findOne({ filename }, { projection: { _id: 0 } });

/** Where a file is referenced ({"images": url} in Mongo matches an element of the array, or the value itself). */
export async function usage(app: App, url: string): Promise<string[]> {
  const { results: products } = await app.db.d1
    .prepare(
      `SELECT json_extract(doc, '$.id') AS id FROM products
       WHERE json_extract(doc, '$.images') = ?1
          OR (json_type(doc, '$.images') = 'array' AND EXISTS (SELECT 1 FROM json_each(doc, '$.images') WHERE value = ?1))
       ORDER BY _id LIMIT 200`,
    )
    .bind(url)
    .all<{ id: string }>();
  const posts = await app.db.content.find({ image: url }, { projection: { _id: 0, id: 1 }, limit: 200 });
  return [...products.map((d) => d.id), ...posts.map((d) => d.id)];
}

export async function remove(app: App, filename: string): Promise<boolean> {
  const doc = await find(app, filename);
  if (!doc) return false;
  try {
    await app.env.MEDIA.delete(filename);
  } catch (e) {
    console.error(`Could not remove media file ${filename}`, e);
  }
  await app.db.media.deleteOne({ filename });
  return true;
}
export { remove as delete };
