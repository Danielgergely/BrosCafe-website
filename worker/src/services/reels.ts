// Our Instagram reels on /ujdonsagok/. Staff paste a reel link and may pick a cover in the admin (the Instagram API needs a
// Meta app tied to a Facebook account, and the embed pages no longer carry the cover). A tap plays Instagram's player.
import type { App } from '../http';
import type { Doc } from '../db';
import { ApiError } from './bookings';
import { FILENAME } from './media';

const KEY = 'reels', MAX = 12;
export const PROFILE = 'https://www.instagram.com/broscafe.co/';

interface Reel { code: string; cover: string; cover_en: string; caption: string } // cover '' = a title tile; cover_en for the English site

export async function list(app: App): Promise<Reel[]> {
  return ((await app.db.settings.findOne({ _key: KEY })) ?? {}).items ?? [];
}

export async function feed(app: App) {
  return { profile: PROFILE, items: (await list(app)).map((r) => ({ ...r, link: `https://www.instagram.com/reel/${r.code}/` })) };
}

/** The whole list, in the order shown on the site. */
export async function save(app: App, items: unknown) {
  if (!Array.isArray(items) || items.length > MAX) throw new ApiError(400, 'invalid', { fields: ['items'] });
  const clean: Reel[] = items.map((x: Doc, i) => {
    const cover = String(x?.cover ?? ''), coverEn = String(x?.cover_en ?? '');
    const bad = (c: string) => c !== '' && (!c.startsWith('/api/media/') || !FILENAME.test(c.slice(11)) || c.endsWith('.mp4'));
    if (!/^[\w-]{5,40}$/.test(String(x?.code ?? '')) || bad(cover) || bad(coverEn)) {
      throw new ApiError(400, 'invalid', { fields: [`items.${i}`] });
    }
    return { code: x.code, cover, cover_en: coverEn, caption: String(x.caption ?? '').trim().slice(0, 80) };
  });
  await app.db.settings.updateOne({ _key: KEY }, { $set: { _key: KEY, items: clean } }, { upsert: true });
  return { items: clean };
}
