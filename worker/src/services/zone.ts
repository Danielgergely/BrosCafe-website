// Delivery zone: address suggestions and a straight-line distance check from the café, via Photon (OpenStreetMap).
// Only the typed address goes to Photon, from the Worker (no visitor IP, no personal data); answers are cached a day.
import type { App } from '../http';
import { text } from './bookings';

const CAFE = { lat: 47.51605, lon: 19.0583 }; // Csanády u. 4/b (OSM)
const BUDAPEST_BBOX = '18.92,47.35,19.34,47.62';
const USER_AGENT = 'BrosCafe-delivery/1.0 (+https://broscafe.hu)';
const TIMEOUT_MS = 3000;

export type ZoneStatus = 'in_zone' | 'out_of_zone' | 'confirm';
interface Feature { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }

export const radius = (app: App) => Number.parseInt(String(app.env.DELIVERY_RADIUS_M ?? ''), 10) || 700;

/** "Váci u. 12B" → "váci utca 12/b": the street spelled as OSM has it, the house letter after a slash. */
function normalize(v: string) {
  return v.toLocaleLowerCase('hu').replace(/\s+/g, ' ').trim()
    .replace(/\bu\.(?=\s|$)/g, 'utca').replace(/\bkrt\.(?=\s|$)/g, 'körút').replace(/\bstr\.(?=\s|$)/g, 'utca')
    .replace(/(\d+)\s*\/?\s*([a-z])\b/g, '$1/$2').replace(/[.,]+$/, '');
}
const houseNo = (v: string) => /(\d+(?:-\d+)?(?:\/[a-z])?)\s*$/.exec(normalize(v).replace(/,.*$/, ''))?.[1] ?? null;

function metres(lat: number, lon: number) {
  const r = Math.PI / 180, dLat = (lat - CAFE.lat) * r, dLon = (lon - CAFE.lon) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(CAFE.lat * r) * Math.cos(lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(a)));
}

async function photon(app: App, q: string, limit: number): Promise<Feature[]> {
  const url = new URL('/api/', String(app.env.PHOTON_URL ?? '') || 'https://photon.komoot.io'); // PHOTON_URL: local tests only
  url.search = new URLSearchParams({ q, limit: String(limit), bbox: BUDAPEST_BBOX, lat: String(CAFE.lat), lon: String(CAFE.lon) }).toString();
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default, key = new Request(url.toString());
  try {
    let res = cache ? await cache.match(key) : undefined;
    if (!res) {
      res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return [];
      res = new Response(res.body, res); res.headers.set('Cache-Control', 'public, max-age=86400');
      if (cache) app.later(cache.put(key, res.clone()));
    }
    const body = (await res.json()) as { features?: Feature[] };
    return (body.features ?? []).filter((f) => f.properties.city === 'Budapest');
  } catch { return []; } // a slow or missing map service never blocks an order
}

/** Up to 6 Budapest streets / house numbers for the typed text: { street, postcode, district, house }. */
export async function suggest(app: App, q: unknown) {
  const v = text(q, 120);
  if (v.length < 3) return { items: [] };
  const seen = new Set<string>(), items: { street: string; postcode: string; district: string; house: boolean }[] = [];
  for (const f of await photon(app, normalize(v), 12)) {
    const p = f.properties, street = p.type === 'house' && p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.type === 'street' ? p.name : null;
    if (!street) continue;
    const key = `${street}|${p.postcode ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key); items.push({ street, postcode: p.postcode ?? '', district: p.district ?? '', house: p.type === 'house' });
    if (items.length === 6) break;
  }
  return { items };
}

/** in_zone / out_of_zone only when the exact house number is on the map; otherwise "confirm" (we check it by hand). */
export async function check(app: App, address: unknown, postcode?: unknown): Promise<{ status: ZoneStatus; radius_m: number }> {
  const r = radius(app), v = text(address, 160), zip = text(postcode, 4), no = houseNo(v);
  if (v.length < 4 || !no) return { status: 'confirm', radius_m: r };
  const typed = normalize(v);
  const houses = (await photon(app, `${typed}, Budapest`, 10)).filter((f) => {
    const p = f.properties;
    return p.type === 'house' && p.street && p.housenumber && normalize(p.housenumber) === no && (!zip || p.postcode === zip);
  });
  // "Pozsonyi út 20" must not match "Pozsonyi utca 20"; only "Pozsonyi 20" (no street type) falls back to the name
  const full = houses.filter((f) => typed.includes(normalize(f.properties.street!)));
  const hits = full.length ? full : houses.filter((f) => typed.includes(normalize(f.properties.street!).split(' ')[0]));
  if (!hits.length) return { status: 'confirm', radius_m: r };
  const inside = hits.map((f) => metres(f.geometry.coordinates[1], f.geometry.coordinates[0]) <= r);
  // the same street name in two districts (Váci út 37: XIII. and IV.) without a postcode: we cannot tell which one
  return { status: inside.every(Boolean) ? 'in_zone' : inside.some(Boolean) ? 'confirm' : 'out_of_zone', radius_m: r };
}
