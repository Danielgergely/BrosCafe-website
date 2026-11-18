// Shared by Bros After Hours and Bros Delivery: error shape, Budapest time, ids, signed links, emails.
import { json, type App, type Ctx } from '../http';
import { settings } from '../config';
import * as email from './email';
import { localParts, parseIso } from '../util';
export { addDays } from './daytypes';

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
const tz = (app: App) => settings(app.env).cafe_tz;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const today = (app: App, at = new Date()) => localParts(at, tz(app));
/** The instant of a wall-clock time in the café's zone. */
export function instant(app: App, date: string, time: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const w = localParts(new Date(guess), tz(app));
  const wall = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return new Date(guess - (wall - guess));
}
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
/** A stored timestamp as the API shows it (UTC, 'Z'). */
export const iso = (v: string | null) => (v ? parseIso(v).toISOString() : null);
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
/** One block of an email: its HTML (email-safe tables, inline styles) and the same as plain text. */
export interface Part { html: string; text: string }
interface Mail {
  to: string; subject: string; title: string; lang?: string;
  parts?: Part[];                     // the email body as blocks (cards); or html + text for a plain body
  html?: string; text?: string;
  button?: [string, string];          // the main action
  links?: [string, string][];         // quiet secondary actions (change, cancel)
  staff?: boolean;                    // internal email: no guest footer
}
export const CAFE_PHONE = '+36 20 356 6754';
export const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Bros+Cafe+Csan%C3%A1dy+u.+4%2Fb+Budapest';

// ---- email building blocks (brand: olive #68704B, espresso #25251C, ivory #F3EBDD) ----
const C = { olive: '#68704B', espresso: '#25251C', ivory: '#F3EBDD', paper: '#FBF8F2', line: '#E6DDCB', muted: '#7A7566', text: '#3A382E' };
const FONT = 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif';
const block = (inner: string, pad = '0 24px 14px') => `<tr><td style="padding:${pad}">${inner}</td></tr>`;

/** "December 4., péntek" / "Friday, 4 December" from YYYY-MM-DD. */
export const longDate = (date: string, en = false) => {
  const s = new Intl.DateTimeFormat(en ? 'en-GB' : 'hu-HU', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1); // it opens a line in the emails (Daniel 2026-11-18)
};

export const para = (t: string): Part => ({ html: block(`<p style="margin:0;font-size:15px;line-height:1.6;color:${C.text}">${esc(t)}</p>`), text: t });
export const fine = (t: string): Part => ({ html: block(`<p style="margin:0;font-size:13px;line-height:1.5;color:${C.muted}">${esc(t)}</p>`), text: t });
/** The highlighted card: the date big, the rest small; an optional map link under it. */
export function hero(big: string, small: string[], mapLabel?: string): Part {
  const map = mapLabel ? `<p style="margin:12px 0 0"><a href="${MAP_URL}" style="color:${C.ivory};font-size:14px;font-weight:600">${esc(mapLabel)} &rarr;</a></p>` : '';
  return {
    html: block(`<table role="presentation" width="100%" style="background:${C.olive};border-radius:16px"><tr><td style="padding:18px 20px">` +
      `<p style="margin:0;font-size:24px;line-height:1.2;font-weight:700;color:${C.ivory}">${esc(big)}</p>` +
      small.map((l) => `<p style="margin:6px 0 0;font-size:15px;line-height:1.4;color:${C.ivory}">${esc(l)}</p>`).join('') + map + '</td></tr></table>'),
    text: [big, ...small, ...(mapLabel ? [MAP_URL] : [])].join('\n'),
  };
}
/** A titled card of label/value rows; empty values are left out. */
export function card(title: string, rowsIn: [string, string | number | null | undefined][]): Part {
  const kept = rowsIn.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!kept.length) return { html: '', text: '' };
  const rowsHtml = kept.map(([k, v], i) => `<tr><td style="padding:8px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-size:13px;color:${C.muted};vertical-align:top;width:38%">${esc(k)}</td>` +
    `<td style="padding:8px 0 8px 12px;${i ? `border-top:1px solid ${C.line};` : ''}font-size:15px;line-height:1.45;color:${C.text};vertical-align:top">${esc(String(v)).replace(/\n/g, '<br>')}</td></tr>`).join('');
  return {
    html: block(`<table role="presentation" width="100%" style="background:${C.paper};border:1px solid ${C.line};border-radius:16px"><tr><td style="padding:14px 18px">` +
      `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${C.olive}">${esc(title)}</p>` +
      `<table role="presentation" width="100%">${rowsHtml}</table></td></tr></table>`),
    text: `${title.toUpperCase()}\n${kept.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
  };
}
/** Price lines right-aligned and a bold total. */
export function priceCard(title: string, lines: [string, string][], total: [string, string]): Part {
  const row = (k: string, v: string, strong = false, top = true) => `<tr><td style="padding:7px 0;${top ? `border-top:1px solid ${C.line};` : ''}font-size:${strong ? 16 : 14}px;${strong ? 'font-weight:700;' : ''}color:${C.text};line-height:1.4">${esc(k)}</td>` +
    `<td align="right" style="padding:7px 0 7px 12px;${top ? `border-top:1px solid ${C.line};` : ''}font-size:${strong ? 16 : 14}px;${strong ? 'font-weight:700;' : ''}color:${C.text};white-space:nowrap;vertical-align:top">${esc(v)}</td></tr>`;
  return {
    html: block(`<table role="presentation" width="100%" style="background:${C.paper};border:1px solid ${C.line};border-radius:16px"><tr><td style="padding:14px 18px">` +
      `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${C.olive}">${esc(title)}</p>` +
      `<table role="presentation" width="100%">${lines.map(([k, v], i) => row(k, v, false, i > 0)).join('')}${row(total[0], total[1], true, true)}</table></td></tr></table>`),
    text: `${title.toUpperCase()}\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}\n${total[0]}: ${total[1]}`,
  };
}
/** A plain bulleted list in a card (drinks of an order). */
export function listCard(title: string, items: string[]): Part {
  if (!items.length) return { html: '', text: '' };
  return {
    html: block(`<table role="presentation" width="100%" style="background:${C.paper};border:1px solid ${C.line};border-radius:16px"><tr><td style="padding:14px 18px">` +
      `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${C.olive}">${esc(title)}</p>` +
      items.map((i) => `<p style="margin:4px 0;font-size:15px;line-height:1.45;color:${C.text}">&bull;&nbsp;${esc(i)}</p>`).join('') + '</td></tr></table>'),
    text: `${title.toUpperCase()}\n${items.map((i) => `- ${i}`).join('\n')}`,
  };
}

/** Never throws: an email problem must not undo a payment or a cancellation. */
export async function mail(app: App, m: Mail) {
  const en = m.lang === 'en';
  const body = m.parts ? m.parts.map((p) => p.html).join('') : block(`<div style="font-size:15px;line-height:1.6;color:${C.text}">${m.html ?? ''}</div>`);
  const textBody = m.parts ? m.parts.filter((p) => p.text).map((p) => p.text).join('\n\n') : (m.text ?? '');
  const button = m.button ? block(`<a href="${m.button[1]}" style="display:inline-block;background:${C.olive};color:${C.ivory};text-decoration:none;padding:13px 24px;border-radius:12px;font-size:15px;font-weight:600">${esc(m.button[0])}</a>`, '4px 24px 10px') : '';
  const link = m.links?.length ? block(m.links.map(([l, u]) => `<a href="${u}" style="font-size:13px;color:${C.muted}">${esc(l)}</a>`).join('&nbsp;&nbsp;·&nbsp;&nbsp;'), '2px 24px 10px') : '';
  const linkText = m.links?.length ? `\n\n${m.links.map(([l, u]) => `${l}: ${u}`).join('\n')}` : '';
  const footer = m.staff ? 'Bros Cafe · belső értesítés'
    : en ? `Questions? Just reply to this email.<br>Bros Cafe · 1132 Budapest, Csanády u. 4/b · ${CAFE_PHONE}<br>We never ask for your password or card details by email.`
      : `Kérdésed van? Válaszolj erre az e-mailre.<br>Bros Cafe · 1132 Budapest, Csanády u. 4/b · ${CAFE_PHONE}<br>Jelszót és bankkártyaadatot soha nem kérünk e-mailben.`;
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>' +
    `<body style="margin:0;padding:0;background:${C.ivory}">` +
    `<table role="presentation" width="100%" style="background:${C.ivory};padding:24px 8px"><tr><td align="center">` +
    `<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;${FONT}">` +
    `<tr><td style="padding:24px 24px 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.olive}">Bros Cafe</td></tr>` +
    `<tr><td style="padding:2px 24px 16px;font-size:24px;line-height:1.2;font-weight:700;color:${C.espresso}">${esc(m.title)}</td></tr>` +
    body + button + link +
    `<tr><td style="padding:14px 24px 22px;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.muted}">${footer}</td></tr>` +
    '</table></td></tr></table></body></html>';
  try {
    await email.send(app, m.to, m.subject, html, textBody + linkText + (m.button ? `\n\n${m.button[0]}: ${m.button[1]}` : ''));
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
