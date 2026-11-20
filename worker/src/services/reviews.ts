// Google reviews on the home page. The rating and the count come from the Places API (New) once a day (Place Details,
// Enterprise SKU: 1,000 free calls a month, we make ~30). The comments are Google's own 5, fetched fresh when a visitor
// scrolls near them (Google forbids storing reviews; Enterprise + Atmosphere SKU, capped at LIVE_CAP a month to stay
// free); the comments picked by hand in the admin stand in when Google's can't be loaded. GOOGLE_PLACES_KEY turns it on.
import type { App } from '../http';
import type { Doc } from '../db';
import { ApiError } from './bookings';

const KEY = 'google_reviews', API = 'https://places.googleapis.com/v1', EVERY_H = 23, MAX = 8, LIVE_CAP = 900;
const SEARCH = 'Bros Cafe, Csanády u. 4/b, 1132 Budapest';

interface Item { name: string; stars: number; text: string; date: string }
const state = async (app: App): Promise<Doc> => (await app.db.settings.findOne({ _key: KEY })) ?? {};
const save = (app: App, set: Doc) => app.db.settings.updateOne({ _key: KEY }, { $set: { _key: KEY, ...set } }, { upsert: true });

async function places(app: App, path: string, mask: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Goog-Api-Key': app.env.GOOGLE_PLACES_KEY ?? '', 'X-Goog-FieldMask': mask, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000),
  });
  const data = (await r.json().catch(() => ({}))) as Doc;
  if (!r.ok) throw new Error(`places ${r.status}: ${data.error?.message ?? 'error'}`);
  return data;
}

/** Cron: at most once every EVERY_H hours (or now, from the admin). Never throws; the error is kept for the admin. */
export async function sync(app: App, force = false) {
  if (!app.env.GOOGLE_PLACES_KEY) return;
  const s = await state(app);
  if (!force && s.fetched_at && Date.now() - Date.parse(s.fetched_at) < EVERY_H * 3600e3) return;
  try {
    let placeId: string = s.place_id || app.env.GOOGLE_PLACE_ID || '';
    if (!placeId) { // once: our place's id, kept for good
      const found = await places(app, '/places:searchText', 'places.id', { textQuery: SEARCH, languageCode: 'hu' });
      placeId = found.places?.[0]?.id ?? '';
      if (!placeId) throw new Error('place not found');
    }
    const p = await places(app, `/places/${encodeURIComponent(placeId)}`, 'rating,userRatingCount,googleMapsUri');
    await save(app, { place_id: placeId, rating: p.rating ?? null, count: p.userRatingCount ?? 0, maps_uri: p.googleMapsUri ?? null,
      fetched_at: new Date().toISOString(), error: null });
  } catch (e) {
    console.error('google reviews sync failed', e);
    await save(app, { error: String((e as Error).message ?? e).slice(0, 300), error_at: new Date().toISOString() });
  }
}

/** Public: the rating and the picked comments; empty until there is something to show. */
export async function feed(app: App) {
  const s = await state(app);
  const url = s.maps_uri || (s.place_id ? `https://www.google.com/maps/place/?q=place_id:${s.place_id}` : null);
  return {
    rating: s.rating ?? null, count: s.count ?? 0, url,
    write_url: s.place_id ? `https://search.google.com/local/writereview?placeid=${s.place_id}` : null,
    items: (s.items ?? []) as Item[],
  };
}

/** Public, on scroll: Google's reviews as Google returns them (its order, its translation), never stored. */
export async function live(app: App, lang: string) {
  const s = await state(app);
  if (!app.env.GOOGLE_PLACES_KEY || !s.place_id) return { items: [] };
  const month = new Date().toISOString().slice(0, 7), used = s.live_month === month ? Number(s.live_calls ?? 0) : 0;
  if (used >= LIVE_CAP) return { items: [], capped: true };
  await save(app, { live_month: month, live_calls: used + 1 });
  try {
    const p = await places(app, `/places/${encodeURIComponent(s.place_id)}?languageCode=${lang === 'en' ? 'en' : 'hu'}`, 'reviews');
    return {
      items: ((p.reviews ?? []) as Doc[]).map((r) => {
        const a = r.authorAttribution ?? {};
        return { name: a.displayName ?? '', author_url: a.uri ?? null, photo: a.photoUri ? `/api/reviews/avatar?u=${encodeURIComponent(a.photoUri)}` : null,
          stars: r.rating ?? null, text: r.text?.text ?? r.originalText?.text ?? '', when: r.relativePublishTimeDescription ?? '', url: r.googleMapsUri ?? null };
      }).filter((r) => r.text),
    };
  } catch (e) {
    console.error('google reviews live failed', e);
    return { items: [] };
  }
}

/** The author photos go through us, so visitors' browsers don't contact Google (passed through, not kept). */
export async function avatar(u: string | null) {
  let url: URL;
  try { url = new URL(u ?? ''); } catch { throw new ApiError(404, 'not_found'); }
  if (url.protocol !== 'https:' || !/(^|\.)googleusercontent\.com$/.test(url.hostname)) throw new ApiError(404, 'not_found');
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new ApiError(404, 'not_found');
  return new Response(r.body, { headers: { 'Content-Type': r.headers.get('content-type')!, 'Cache-Control': 'no-store' } });
}

export async function adminView(app: App) {
  const s = await state(app);
  return { connected: !!app.env.GOOGLE_PLACES_KEY, rating: s.rating ?? null, count: s.count ?? 0, fetched_at: s.fetched_at ?? null,
    error: s.error ?? null, place_id: s.place_id ?? null, items: (s.items ?? []) as Item[] };
}

/** The highlighted comments, in the order shown. */
export async function setItems(app: App, items: unknown) {
  if (!Array.isArray(items) || items.length > MAX) throw new ApiError(400, 'invalid', { fields: ['items'] });
  const clean: Item[] = items.map((x: Doc, i) => {
    const name = String(x?.name ?? '').trim().slice(0, 60), text = String(x?.text ?? '').trim().slice(0, 600);
    const stars = Math.round(Number(x?.stars ?? 5)), date = String(x?.date ?? '').trim().slice(0, 20);
    if (!name || !text || !(stars >= 1 && stars <= 5)) throw new ApiError(400, 'invalid', { fields: [`items.${i}`] });
    return { name, stars, text, date };
  });
  await save(app, { items: clean });
  return adminView(app);
}

export async function syncNow(app: App) {
  await sync(app, true);
  return adminView(app);
}
