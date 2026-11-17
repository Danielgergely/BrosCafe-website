// Számlázz.hu Számla Agent (XML over multipart POST): an e-invoice after each online payment, a storno on a full refund.
// Secret: SZAMLAZZ_AGENT_KEY. Without it nothing is issued; the row keeps invoice_error = 'not_configured' and the
// cron issues it once the key exists. Hungary-only billing.
//
// ACCOUNTANT: every value in `config` below is a draft until confirmed (invoice type, VAT rates, partial refunds).
import type { App } from '../http';
import type { Env } from '../env';
import { settings } from '../config';
import { today } from './bookings';

const s = (env: Env, k: string, def = '') => String(env[k] ?? def).trim();
export const config = (env: Env) => ({
  key: s(env, 'SZAMLAZZ_AGENT_KEY'),
  url: s(env, 'SZAMLAZZ_API_URL') || 'https://www.szamlazz.hu/szamla/', // overridable for local tests against a stub
  // After Hours deposit: 'elolegszamla' (advance invoice, a final invoice follows the evening) or 'szamla' (plain invoice).
  ahInvoiceType: s(env, 'AH_INVOICE_TYPE', 'elolegszamla') as 'elolegszamla' | 'szamla',
  ahVat: s(env, 'AH_VAT', '27'),          // room fee with catering
  dlDrinkVat: s(env, 'DL_DRINK_VAT', '27'), // delivered drinks (on-site service may differ)
  dlFeeVat: s(env, 'DL_FEE_VAT', '27'),    // delivery fee
  prefix: s(env, 'SZAMLAZZ_PREFIX'),       // invoice number prefix, empty = the account's default
  // Preview: payment requests (díjbekérő) only, never reported to NAV and never e-mailed; no storno for them.
  proforma: s(env, 'SZAMLAZZ_PROFORMA') === 'true',
});
// SZAMLAZZ_OFF=true pauses invoicing (and its retries) without removing the key.
export const ready = (env: Env) => !!config(env).key && s(env, 'SZAMLAZZ_OFF') !== 'true';
export const MAX_TRIES = 6;

export interface Buyer { name: string; zip: string; city: string; street: string; email: string; taxNumber?: string | null }
export interface Line { name: string; quantity: number; grossHuf: number; vat: string; unit?: string }
export interface Invoice { ref: string; buyer: Buyer; lines: Line[]; type: 'elolegszamla' | 'szamla'; lang: string; comment?: string; subject: string; body: string }

const x = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Gross is what was charged; net and VAT are derived from it so the invoice total equals the payment. */
function lineXml(l: Line) {
  const rate = Number(l.vat);
  const pct = Number.isFinite(rate) ? rate : 0; // 'AAM', 'TAM' … have no VAT
  const gross = l.grossHuf * l.quantity;
  const net = Math.round(gross / (1 + pct / 100));
  return `<tetel><megnevezes>${x(l.name)}</megnevezes><mennyiseg>${l.quantity}</mennyiseg><mennyisegiEgyseg>${x(l.unit ?? 'db')}</mennyisegiEgyseg>` +
    `<nettoEgysegar>${Math.round((net / l.quantity) * 100) / 100}</nettoEgysegar><afakulcs>${x(l.vat)}</afakulcs>` +
    `<nettoErtek>${net}</nettoErtek><afaErtek>${gross - net}</afaErtek><bruttoErtek>${gross}</bruttoErtek></tetel>`;
}

export function invoiceXml(app: App, inv: Invoice) {
  const cfg = config(app.env);
  const day = today(app).date;
  const b = inv.buyer;
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">' +
    `<beallitasok><szamlaagentkulcs>${x(cfg.key)}</szamlaagentkulcs><eszamla>true</eszamla><szamlaLetoltes>false</szamlaLetoltes><valaszVerzio>1</valaszVerzio><aggregator></aggregator><szamlaKulsoAzon>${x(inv.ref)}</szamlaKulsoAzon></beallitasok>` +
    `<fejlec><keltDatum>${day}</keltDatum><teljesitesDatum>${day}</teljesitesDatum><fizetesiHataridoDatum>${day}</fizetesiHataridoDatum>` +
    `<fizmod>bankkártya</fizmod><penznem>HUF</penznem><szamlaNyelve>${inv.lang === 'en' ? 'en' : 'hu'}</szamlaNyelve><megjegyzes>${x(inv.comment)}</megjegyzes>` +
    `<arfolyamBank></arfolyamBank><arfolyam>0</arfolyam><rendelesSzam>${x(inv.ref)}</rendelesSzam><dijbekeroSzamlaszam></dijbekeroSzamlaszam>` +
    `<elolegszamla>${!cfg.proforma && inv.type === 'elolegszamla'}</elolegszamla><vegszamla>false</vegszamla><helyesbitoszamla>false</helyesbitoszamla><helyesbitettSzamlaszam></helyesbitettSzamlaszam>` +
    `<dijbekero>${cfg.proforma}</dijbekero><szamlaszamElotag>${x(cfg.prefix)}</szamlaszamElotag><fizetve>${!cfg.proforma}</fizetve></fejlec>` +
    `<elado><emailReplyto>${x(settings(app.env).cafe.email)}</emailReplyto><emailTargy>${x(inv.subject)}</emailTargy><emailSzoveg>${x(inv.body)}</emailSzoveg></elado>` +
    `<vevo><nev>${x(b.name)}</nev><irsz>${x(b.zip)}</irsz><telepules>${x(b.city)}</telepules><cim>${x(b.street)}</cim>` +
    `<email>${x(b.email)}</email><sendEmail>${!cfg.proforma}</sendEmail>${b.taxNumber ? `<adoszam>${x(b.taxNumber)}</adoszam>` : ''}</vevo>` +
    `<tetelek>${inv.lines.map(lineXml).join('')}</tetelek></xmlszamla>`;
}

export function stornoXml(app: App, invoiceNo: string, buyerEmail: string) {
  const cfg = config(app.env);
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlast xmlns="http://www.szamlazz.hu/xmlszamlast" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlast https://www.szamlazz.hu/szamla/docs/xsds/agentst/xmlszamlast.xsd">' +
    `<beallitasok><szamlaagentkulcs>${x(cfg.key)}</szamlaagentkulcs><eszamla>true</eszamla><szamlaLetoltes>false</szamlaLetoltes><szamlaLetoltesPld>1</szamlaLetoltesPld></beallitasok>` +
    `<fejlec><szamlaszam>${x(invoiceNo)}</szamlaszam><keltDatum>${today(app).date}</keltDatum><tipus>SS</tipus></fejlec>` +
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

export const issue = (app: App, inv: Invoice) => post(app, 'action-xmlagentxmlfile', invoiceXml(app, inv));
export const storno = (app: App, invoiceNo: string, buyerEmail: string) => post(app, 'action-szamla_agent_st', stornoXml(app, invoiceNo, buyerEmail));

/**
 * Issues the invoice of one row (`ah_bookings` or `dl_payers`) and records the outcome on it. Never throws.
 * The row is claimed first (invoice_tries), so a webhook retry and the cron cannot both issue it.
 */
export async function issueFor(app: App, table: 'ah_bookings' | 'dl_payers', id: string, build: () => Invoice | null): Promise<string | null> {
  const d1 = app.db.d1;
  if (!ready(app.env)) {
    await d1.prepare(`UPDATE ${table} SET invoice_error = 'not_configured' WHERE id = ? AND invoice_no IS NULL`).bind(id).run();
    return null;
  }
  const row = await d1.prepare(`SELECT invoice_tries AS n FROM ${table} WHERE id = ? AND invoice_no IS NULL`).bind(id).first<{ n: number }>();
  if (!row || row.n >= MAX_TRIES) return null;
  const claim = await d1.prepare(`UPDATE ${table} SET invoice_tries = invoice_tries + 1 WHERE id = ? AND invoice_no IS NULL AND invoice_tries = ?`).bind(id, row.n).run();
  if (!claim.meta.changes) return null;
  try {
    const inv = build();
    if (!inv) {
      await d1.prepare(`UPDATE ${table} SET invoice_error = 'no_billing_address', invoice_tries = ? WHERE id = ?`).bind(MAX_TRIES, id).run();
      return null;
    }
    const no = await issue(app, inv);
    await d1.prepare(`UPDATE ${table} SET invoice_no = ?, invoice_error = NULL WHERE id = ?`).bind(no, id).run();
    return no;
  } catch (e) {
    console.error(`invoice for ${id} failed`, e);
    await d1.prepare(`UPDATE ${table} SET invoice_error = ? WHERE id = ?`).bind(String((e as Error).message).slice(0, 300), id).run();
    return null;
  }
}

/** Storno after a full refund. Never throws; returns the storno number or null. */
export async function stornoFor(app: App, table: 'ah_bookings' | 'dl_payers', id: string, invoiceNo: string | null, buyerEmail: string): Promise<string | null> {
  if (!invoiceNo || !ready(app.env) || config(app.env).proforma) return null;
  try {
    const no = await storno(app, invoiceNo, buyerEmail);
    await app.db.d1.prepare(`UPDATE ${table} SET storno_no = ? WHERE id = ?`).bind(no, id).run();
    return no;
  } catch (e) {
    console.error(`storno of ${invoiceNo} failed`, e);
    return null;
  }
}
