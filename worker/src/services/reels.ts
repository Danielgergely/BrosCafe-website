// Our Instagram reels on /ujdonsagok/. Staff paste a reel link and pick a cover in the admin (the Instagram API needs a
// Meta app tied to a Facebook account, and the embed pages no longer carry the cover). A tap plays Instagram's player.
import type { App } from '../http';
import type { Doc } from '../db';
import { ApiError } from './bookings';
import { FILENAME } from './media';

const KEY = 'reels', MAX = 12;
export const PROFILE = 'https://www.instagram.com/broscafe.co/';

interface Reel { code: string; cover: string; caption: string }

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
    const cover = String(x?.cover ?? '');
    if (!/^[\w-]{5,40}$/.test(String(x?.code ?? '')) || !cover.startsWith('/api/media/') || !FILENAME.test(cover.slice(11)) || cover.endsWith('.mp4')) {
      throw new ApiError(400, 'invalid', { fields: [`items.${i}`] });
    }
    return { code: x.code, cover, caption: String(x.caption ?? '').trim().slice(0, 140) };
  });
  await app.db.settings.updateOne({ _key: KEY }, { $set: { _key: KEY, items: clean } }, { upsert: true });
  return { items: clean };
}
