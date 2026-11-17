// Shared by Bros After Hours and Bros Delivery: error shape, Budapest time, ids, signed links, emails.
import { json, type App, type Ctx } from '../http';
import { settings } from '../config';
import * as email from './email';
import { localParts } from '../util';

/** These two APIs answer errors as {"error": code, ...extra} (docs/after-hours-api.md), not FastAPI's {"detail"}. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly extra: Record<string, unknown> = {}) {
    super(code);
  }
}
export const handle = (h: (c: Ctx) => Promise<unknown>) => async (c: Ctx) => {
  try {
    return await h(c);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code, ...e.extra }, e.status);
    throw e;
  }
};
export const invalid = (fields: string[]) => new ApiError(400, 'invalid', { fields });
export const bookingsOpen = (app: App) => settings(app.env).bookings_open;
export function assertBookingsOpen(app: App) {
  if (!bookingsOpen(app)) throw new ApiError(503, 'bookings_closed', { message: 'Online booking opens soon. Until then write to hello@broscafe.hu.' });
}

// ---- Budapest time: a day is 'YYYY-MM-DD', a time 'HH:MM' ----
export const tz = (app: App) => settings(app.env).cafe_tz;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const today = (app: App, at = new Date()) => localParts(at, tz(app));
/** The instant of a wall-clock time in the café's zone. */
export function instant(app: App, date: string, time: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const w = localParts(new Date(guess), tz(app));
  const wall = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return new Date(guess - (wall - guess));
}
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** 0 = Sunday. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** 30 Nov + 3 months = 28 Feb (clamped), like the page. */
export function addMonths(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  m.setUTCDate(Math.min(d.getUTCDate(), last));
  return m.toISOString().slice(0, 10);
}
export const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const ft = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`;

// ---- ids and signatures ----
/** 'AH-0001', 'BD-0001': one counter per prefix. */
export async function nextId(app: App, prefix: string) {
  await app.db.d1.prepare('INSERT OR IGNORE INTO bk_seq (name, n) VALUES (?, 0)').bind(prefix).run();
  const row = await app.db.d1.prepare('UPDATE bk_seq SET n = n + 1 WHERE name = ? RETURNING n').bind(prefix).first<{ n: number }>();
  return `${prefix}-${String(row!.n).padStart(4, '0')}`;
}
export async function sign(app: App, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(settings(app.env).jwt_secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Stripe may only send people back to our own pages. */
export function returnPath(v: unknown, allowed: string[], def: string) {
  if (typeof v !== 'string') return def;
  const p = (v.endsWith('/') ? v : `${v}/`).replace(/^\/d\//, '/'); // old rows saved while the site lived under /d/
  return allowed.includes(p) ? p : def;
}
export const siteUrl = (app: App, path: string) => `${settings(app.env).frontend_url}${path}`;

// ---- validation helpers ----
export const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const EMAIL = /^[^\s@<>()[\],;:"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export const TAX = /^\d{8}-\d-\d{2}$/;
export const ZIP = /^\d{4}$/;
export const lang = (v: unknown) => (v === 'en' ? 'en' : 'hu');

// ---- email: the loyalty shell with a neutral footer ----
export const esc = email.escape;
export const staffAddress = (app: App) => settings(app.env).cafe.email || 'hello@broscafe.hu';
export interface Mail { to: string; subject: string; title: string; html: string; text: string; button?: [string, string]; lang?: string }
/** Never throws: an email problem must not undo a payment or a cancellation. */
export async function mail(app: App, m: Mail) {
  const button = m.button
    ? `<tr><td style="padding:8px 24px 24px"><a href="${m.button[1]}" style="display:inline-block;background:#66734A;color:#F5F0E6;text-decoration:none;padding:14px 28px;border-radius:14px;font-weight:600">${esc(m.button[0])}</a></td></tr>`
    : '';
  const footer = m.lang === 'en' ? 'Sent by Bros Cafe · 1132 Budapest, Csanády u. 4/b. We never ask for your password or card details by email.'
    : 'Küldte: Bros Cafe · 1132 Budapest, Csanády u. 4/b. Jelszót és bankkártyaadatot soha nem kérünk e-mailben.';
  const html =
    '<table role="presentation" width="100%" style="background:#F5F0E6;padding:24px 0"><tr><td align="center">' +
    '<table role="presentation" width="480" style="background:#ffffff;border-radius:20px;font-family:Arial,Helvetica,sans-serif;overflow:hidden">' +
    `<tr><td style="padding:28px 24px 6px;font-size:22px;font-weight:700;color:#2C3322">${esc(m.title)}</td></tr>` +
    `<tr><td style="padding:0 24px 8px;font-size:15px;line-height:1.6;color:#5b614f">${m.html}</td></tr>${button}` +
    `<tr><td style="padding:16px 24px 24px;font-size:12px;color:#9aa08c">${footer}</td></tr></table></td></tr></table>`;
  try {
    await email.send(app, m.to, m.subject, html, m.text);
  } catch (e) {
    console.error(`email to ${m.to} failed: ${m.subject}`, e);
  }
}
/** '<p><b>k:</b> v</p>' rows and the same as plain text. */
export function rows(pairs: [string, string | number | null | undefined][]) {
  const kept = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return {
    html: kept.map(([k, v]) => `<p style="margin:4px 0"><strong>${esc(k)}:</strong> ${esc(String(v)).replace(/\n/g, '<br>')}</p>`).join(''),
    text: kept.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}
