// Számlázz.hu Számla Agent (XML over multipart POST). Per the accountant (2026-11-18): After Hours = advance invoice on
// payment + final invoice dated the evening, all as on-site food and drink; Delivery = invoice at 27 %; full refund =
// storno, partial refund = correcting invoice. Secret: SZAMLAZZ_AGENT_KEY; without it rows keep `<col>_error =
// 'not_configured'` and the cron issues them once the key exists. Hungary-only billing.
import type { App } from '../http';
import type { Env } from '../env';
import { settings } from '../config';
import { today } from './bookings';

const s = (env: Env, k: string, def = '') => String(env[k] ?? def).trim();
export const config = (env: Env) => ({
  key: s(env, 'SZAMLAZZ_AGENT_KEY'),
  url: s(env, 'SZAMLAZZ_API_URL') || 'https://www.szamlazz.hu/szamla/', // overridable for local tests against a stub
  ahVat: s(env, 'AH_VAT', '5'),             // After Hours, every line: invoiced as food and drink served on site
  ahFeeVat: s(env, 'AH_CANCEL_FEE_VAT', '27'), // After Hours cancellation handling fee (ACCOUNTANT: rate to confirm)
  dlDrinkVat: s(env, 'DL_DRINK_VAT', '27'), // delivered drinks
  dlFeeVat: s(env, 'DL_FEE_VAT', '27'),     // delivery fee
  prefix: s(env, 'SZAMLAZZ_PREFIX'),       // invoice number prefix, empty = the account's default
  // Preview: payment requests (díjbekérő) only, never reported to NAV and never e-mailed; no final/correction/storno.
  proforma: s(env, 'SZAMLAZZ_PROFORMA') === 'true',
});
// SZAMLAZZ_OFF=true pauses invoicing (and its retries) without removing the key.
export const ready = (env: Env) => !!config(env).key && s(env, 'SZAMLAZZ_OFF') !== 'true';
export const MAX_TRIES = 6;

interface Buyer { name: string; zip: string; city: string; street: string; email: string; taxNumber?: string | null }
export interface Line { name: string; quantity: number; grossHuf: number; vat: string; unit?: string }
export type Kind = 'elolegszamla' | 'vegszamla' | 'szamla' | 'helyesbito';
export interface Invoice {
  ref: string; order: string; buyer: Buyer; lines: Line[]; type: Kind; lang: string; comment?: string; subject: string; body: string;
  fulfilled?: string; // teljesítés date, default today (the payment day)
  refersTo?: string;  // the advance invoice (vegszamla) or the corrected invoice (helyesbito)
}

const x = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Gross is what was charged; net and VAT are derived from it so the invoice total equals the payment. Negative quantity = reversed line. */
function lineXml(l: Line) {
  const rate = Number(l.vat);
  const pct = Number.isFinite(rate) ? rate : 0; // 'AAM', 'TAM' … have no VAT
  const gross = l.grossHuf * l.quantity;
  const net = Math.round(gross / (1 + pct / 100));
  return `<tetel><megnevezes>${x(l.name)}</megnevezes><mennyiseg>${l.quantity}</mennyiseg><mennyisegiEgyseg>${x(l.unit ?? 'db')}</mennyisegiEgyseg>` +
    `<nettoEgysegar>${Math.round((net / l.quantity) * 100) / 100}</nettoEgysegar><afakulcs>${x(l.vat)}</afakulcs>` +
    `<nettoErtek>${net}</nettoErtek><afaErtek>${gross - net}</afaErtek><bruttoErtek>${gross}</bruttoErtek></tetel>`;
}

function invoiceXml(app: App, inv: Invoice) {
  const cfg = config(app.env);
  const day = today(app).date, real = !cfg.proforma;
  const b = inv.buyer, t = inv.type;
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">' +
    `<beallitasok><szamlaagentkulcs>${x(cfg.key)}</szamlaagentkulcs><eszamla>true</eszamla><szamlaLetoltes>false</szamlaLetoltes><valaszVerzio>1</valaszVerzio><aggregator></aggregator><szamlaKulsoAzon>${x(inv.ref)}</szamlaKulsoAzon></beallitasok>` +
    `<fejlec><keltDatum>${day}</keltDatum><teljesitesDatum>${inv.fulfilled ?? day}</teljesitesDatum><fizetesiHataridoDatum>${day}</fizetesiHataridoDatum>` +
    `<fizmod>bankkártya</fizmod><penznem>HUF</penznem><szamlaNyelve>${inv.lang === 'en' ? 'en' : 'hu'}</szamlaNyelve><megjegyzes>${x(inv.comment)}</megjegyzes>` +
    `<arfolyamBank></arfolyamBank><arfolyam>0</arfolyam><rendelesSzam>${x(inv.order)}</rendelesSzam><dijbekeroSzamlaszam></dijbekeroSzamlaszam>` +
    `<elolegszamla>${real && t === 'elolegszamla'}</elolegszamla><vegszamla>${t === 'vegszamla'}</vegszamla><elolegSzamlaszam>${t === 'vegszamla' ? x(inv.refersTo) : ''}</elolegSzamlaszam>` +
    `<helyesbitoszamla>${t === 'helyesbito'}</helyesbitoszamla><helyesbitettSzamlaszam>${t === 'helyesbito' ? x(inv.refersTo) : ''}</helyesbitettSzamlaszam>` +
    `<dijbekero>${cfg.proforma}</dijbekero>${cfg.prefix ? `<szamlaszamElotag>${x(cfg.prefix)}</szamlaszamElotag>` : ''}<fizetve>${!cfg.proforma}</fizetve></fejlec>` +
    `<elado><emailReplyto>${x(settings(app.env).cafe.email)}</emailReplyto><emailTargy>${x(inv.subject)}</emailTargy><emailSzoveg>${x(inv.body)}</emailSzoveg></elado>` +
    `<vevo><nev>${x(b.name)}</nev><irsz>${x(b.zip)}</irsz><telepules>${x(b.city)}</telepules><cim>${x(b.street)}</cim>` +
    `<email>${x(b.email)}</email><sendEmail>${!cfg.proforma}</sendEmail>${b.taxNumber ? `<adoszam>${x(b.taxNumber)}</adoszam>` : ''}</vevo>` +
    `<tetelek>${inv.lines.map(lineXml).join('')}</tetelek></xmlszamla>`;
}

function stornoXml(app: App, invoiceNo: string, buyerEmail: string, comment = '') {
  const cfg = config(app.env);
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlast xmlns="http://www.szamlazz.hu/xmlszamlast" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlast https://www.szamlazz.hu/szamla/docs/xsds/agentst/xmlszamlast.xsd">' +
    `<beallitasok><szamlaagentkulcs>${x(cfg.key)}</szamlaagentkulcs><eszamla>true</eszamla><szamlaLetoltes>false</szamlaLetoltes><szamlaLetoltesPld>1</szamlaLetoltesPld></beallitasok>` +
    `<fejlec><szamlaszam>${x(invoiceNo)}</szamlaszam><keltDatum>${today(app).date}</keltDatum>${comment ? `<megjegyzes>${x(comment)}</megjegyzes>` : ''}<tipus>SS</tipus></fejlec>` +
    `<elado><emailReplyto>${x(settings(app.env).cafe.email)}</emailReplyto><emailTargy>Sztornó számla</emailTargy><emailSzoveg>Mellékelten küldjük a sztornó számlát.</emailSzoveg></elado>` +
    `<vevo><email>${x(buyerEmail)}</email></vevo></xmlszamlast>`;
}

/** The Agent answers 200 even on errors: the result is in the szlahu_* headers. Returns the document number. */
async function post(app: App, field: string, xml: string): Promise<string> {
  const body = new FormData();
  body.append(field, new Blob([xml], { type: 'text/xml' }), 'request.xml');
  const r = await fetch(config(app.env).url, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
  const error = r.headers.get('szlahu_error');
  const number = r.headers.get('szlahu_szamlaszam');
  if (!r.ok || error || !number) {
    const detail = error ? decodeURIComponent(error.replace(/\+/g, ' ')) : (await r.text()).slice(0, 200);
    throw new Error(`Számlázz.hu ${r.headers.get('szlahu_error_code') ?? r.status}: ${detail}`);
  }
  return number;
}

const issue = (app: App, inv: Invoice) => post(app, 'action-xmlagentxmlfile', invoiceXml(app, inv));
const storno = (app: App, invoiceNo: string, buyerEmail: string, comment = '') => post(app, 'action-szamla_agent_st', stornoXml(app, invoiceNo, buyerEmail, comment));

/** Lines that reverse `original` and charge `keepHuf` instead, split per VAT rate (the accountant's correction format). */
export function correctionLines(original: Line[], keepHuf: number, keepName: string): Line[] {
  const reversed = original.map((l) => ({ ...l, quantity: -l.quantity }));
  const total = original.reduce((n, l) => n + l.grossHuf * l.quantity, 0);
  const byVat = new Map<string, number>();
  for (const l of original) byVat.set(l.vat, (byVat.get(l.vat) ?? 0) + l.grossHuf * l.quantity);
  const kept: Line[] = [];
  let left = keepHuf;
  [...byVat].forEach(([vat, gross], i, all) => {
    const amount = i === all.length - 1 ? left : Math.round((gross * keepHuf) / (total || 1));
    left -= amount;
    if (amount) kept.push({ name: keepName, quantity: 1, grossHuf: amount, vat });
  });
  return [...reversed, ...kept];
}

type Col = 'invoice' | 'final' | 'correction';
/**
 * Issues one document of a row (`ah_bookings` / `dl_payers`) into `<col>_no` and records the outcome. Never throws.
 * The row is claimed first (`<col>_tries`), so a webhook retry and the cron cannot both issue it.
 * `build` returning null records `<col>_error = skip` (e.g. 'pos': rung into the till instead) and stops retries.
 */
export async function issueFor(app: App, table: 'ah_bookings' | 'dl_payers', id: string, build: () => Invoice | null, col: Col = 'invoice', skip = 'pos'): Promise<string | null> {
  const d1 = app.db.d1, no = `${col}_no`, err = `${col}_error`, tries = `${col}_tries`;
  if (!ready(app.env) || (col !== 'invoice' && config(app.env).proforma)) {
    await d1.prepare(`UPDATE ${table} SET ${err} = ? WHERE id = ? AND ${no} IS NULL`).bind(ready(app.env) ? 'proforma' : 'not_configured', id).run();
    return null;
  }
  const row = await d1.prepare(`SELECT ${tries} AS n FROM ${table} WHERE id = ? AND ${no} IS NULL`).bind(id).first<{ n: number }>();
  if (!row || row.n >= MAX_TRIES) return null;
  const claim = await d1.prepare(`UPDATE ${table} SET ${tries} = ${tries} + 1 WHERE id = ? AND ${no} IS NULL AND ${tries} = ?`).bind(id, row.n).run();
  if (!claim.meta.changes) return null;
  try {
    const inv = build();
    if (!inv) {
      await d1.prepare(`UPDATE ${table} SET ${err} = ?, ${tries} = ? WHERE id = ?`).bind(skip, MAX_TRIES, id).run();
      return null;
    }
    const n = await issue(app, inv);
    await d1.prepare(`UPDATE ${table} SET ${no} = ?, ${err} = NULL WHERE id = ?`).bind(n, id).run();
    return n;
  } catch (e) {
    console.error(`${col} for ${id} failed`, e);
    await d1.prepare(`UPDATE ${table} SET ${err} = ? WHERE id = ?`).bind(String((e as Error).message).slice(0, 300), id).run();
    return null;
  }
}

/** Storno after a full refund. Never throws; returns the storno number or null. */
export async function stornoFor(app: App, table: 'ah_bookings' | 'dl_payers', id: string, invoiceNo: string | null, buyerEmail: string, comment = ''): Promise<string | null> {
  if (!invoiceNo || !ready(app.env) || config(app.env).proforma) return null;
  try {
    const no = await storno(app, invoiceNo, buyerEmail, comment);
    await app.db.d1.prepare(`UPDATE ${table} SET storno_no = ? WHERE id = ?`).bind(no, id).run();
    return no;
  } catch (e) {
    console.error(`storno of ${invoiceNo} failed`, e);
    return null;
  }
}
