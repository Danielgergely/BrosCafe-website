// Bros After Hours: one private evening per day, paid in advance. Spec docs/after-hours.md, contract docs/after-hours-api.md.
import type { App } from '../http';
import type { Env } from '../env';
import type { Doc } from '../db';
import { isoAt, nowIso, parseIso, tokenUrlsafe } from '../util';
import {
  ApiError, EMAIL, TAX, ZIP, addDays, addMonths, assertBookingsOpen, bookingsOpen, esc, ft, hm, instant, invalid, iso, lang as langOf, mail, mins, nextId, returnPath, rows,
  safeEqual, sign, siteUrl, staffAddress, text, today, validDate, weekday, card, fine, hero, longDate, para, priceCard,
} from './bookings';
import * as stripe from './stripe';
import * as szamlazz from './szamlazz';

const num = (env: Env, k: string, def: number) => {
  const n = Number.parseInt(String(env[k] ?? ''), 10);
  return Number.isFinite(n) ? n : def;
};
/** The offer (owner, 2026-11-17). The page's CONFIG mirrors it and shows the server's quote. Everything is prepaid except the cake. */
const offer = (env: Env) => ({
  base: num(env, 'AH_BASE_HUF', 12900),            // the private café, 2 hours, any group size
  extraHour: num(env, 'AH_EXTRA_HOUR_HUF', 5900),   // per hour above 2
  drinks: num(env, 'AH_DRINKS_HUF', 2500),          // unlimited drinks we make, per guest for the evening, whole group (docs/after-hours-costs.md)
  minGuests: 2, maxGuests: 12, baseHours: 2, maxHours: 4,
  open: '18:00', close: '22:00', lastStart: '20:00', startStep: 30,
  launch: String(env.AH_LAUNCH_DATE ?? '2026-12-01'), noticeDays: 1, windowMonths: 3,
  closedDays: ['12-24', '12-25', '12-26', '12-31', '01-01'], // blocked every year unless the admin opens the day
  cancelFeePct: num(env, 'AH_CANCEL_FEE_PCT', 3),   // kept from a guest cancellation's refund (card fees); never on goodwill or when we cancel
});
/** The six dishes (the brothers' list); `extra` = per person as an additional dish on the menu. */
export const DISHES: Record<string, { hu: string; en: string; extra: number }> = {
  waffle: { hu: 'Waffle board', en: 'Waffle board', extra: 1500 },
  pizza: { hu: 'Mini pizza bites', en: 'Mini pizza bites', extra: 1500 },
  veggie: { hu: 'Fresh fruit & veggie board', en: 'Fresh fruit & veggie board', extra: 1500 },
  burger: { hu: 'Mini burger sliders', en: 'Mini burger sliders', extra: 1500 },
  sandwich: { hu: 'Mini sandwich selection', en: 'Mini sandwich selection', extra: 1500 },
  cheese: { hu: 'Cheese & charcuterie board', en: 'Cheese & charcuterie board', extra: 1500 },
};
/** Per person (Daniel 2026-11-18): welcome drink + 1 platter 2 500, every further platter +1 500 (the 4th on are stored as extras). */
export const TIERS: Record<string, { hu: string; en: string; perPerson: number; pick: number; from: string[]; extras: boolean }> = {
  alap: { hu: '1 tál', en: '1 platter', perPerson: 2500, pick: 1, from: Object.keys(DISHES), extras: false },
  duo: { hu: '2 tál', en: '2 platters', perPerson: 4000, pick: 2, from: Object.keys(DISHES), extras: false },
  menu: { hu: '3 tál', en: '3 platters', perPerson: 5500, pick: 3, from: Object.keys(DISHES), extras: true },
};
/** Voucher codes: percent off the café fee only (never food, drinks or extra hours). Keys upper-case. */
const VOUCHERS: Record<string, { percent: number }> = { AFTER25: { percent: 25 } };
const PATHS = ['/after-hours/'];
const OCCASIONS: Record<string, [string, string]> = {
  birthday: ['Születésnap', 'Birthday'], christmas: ['Karácsonyi összejövetel', 'Christmas gathering'], romantic: ['Évforduló, különleges randi', 'Anniversary or special date'],
  games: ['Game night', 'Game night'], team: ['Céges összejövetel', 'Company gathering'], workshop: ['Kreatív workshop', 'Creative workshop'],
  graduation: ['Ballagás, diplomaosztó', 'Graduation'], friends: ['Baráti és családi este', 'Evening with friends or family'],
  family: ['Családi alkalom', 'Family occasion'], other: ['Egyéb', 'Other'], // family: bookings before 2026-11-18
};

/** One priced line; `amount` = qty × unit. The voucher is a negative line. Stored with the booking so old bookings keep their prices. */
export interface QuoteLine { kind: 'cafe' | 'package' | 'extra' | 'drinks' | 'hours' | 'voucher'; id?: string; hu: string; en: string; qty: number; unit: number; amount: number }
export interface Quote { tier: string; dishes: string[]; extras: string[]; drinks: boolean; guests: number; hours: number; lines: QuoteLine[]; total: number; voucher: { code: string; percent: number; discount: number } | null }

/**
 * The price. Throws 400 invalid (fields) for a bad tier, dish set, extras, guests or hours, and 400 invalid_voucher for an unknown code.
 * Checks: alap 2 p 2 h 17 900 · alap 6 p 27 900 · duo 6 p 36 900 · menu 6 p 45 900 · menu 12 p 4 h 90 700 · menu 6 p + cheese 54 900 · alap 4 p AFTER25 19 675.
 */
export function quote(env: Env, b: Doc): Quote {
  const o = offer(env), bad: string[] = [];
  const tierId = String(b.tier ?? ''), tier = TIERS[tierId];
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const dishes = list(b.dishes), extras = list(b.extras);
  const guests = Number(b.guests), hours = Number(b.hours);
  if (!tier) bad.push('tier');
  else {
    if (dishes.length !== tier.pick || new Set(dishes).size !== dishes.length || !dishes.every((d) => tier.from.includes(d))) bad.push('dishes');
    if (extras.length && (!tier.extras || new Set(extras).size !== extras.length || !extras.every((d) => DISHES[d] && !dishes.includes(d)))) bad.push('extras');
  }
  if (!(Number.isInteger(guests) && guests >= o.minGuests && guests <= o.maxGuests)) bad.push('guests');
  if (!(Number.isInteger(hours) && hours >= o.baseHours && hours <= o.maxHours)) bad.push('hours');
  if (bad.length) throw invalid(bad);
  const vch = String(b.voucher ?? '').trim() ? voucher(env, b.voucher) : null;
  if (String(b.voucher ?? '').trim() && !vch) throw new ApiError(400, 'invalid_voucher');

  const line = (l: Omit<QuoteLine, 'amount'>): QuoteLine => ({ ...l, amount: l.qty * l.unit });
  const names = (ids: string[], k: 'hu' | 'en') => ids.map((d) => DISHES[d][k]).join(', ');
  const lines: QuoteLine[] = [
    line({ kind: 'cafe', hu: `Privát kávézó, ${o.baseHours} óra`, en: `Private café, ${o.baseHours} hours`, qty: 1, unit: o.base }),
    line({ kind: 'package', id: tierId, hu: `Üdvözlőital + ${tier.hu} (${names(dishes, 'hu')})`, en: `Welcome drink + ${tier.en} (${names(dishes, 'en')})`, qty: guests, unit: tier.perPerson }),
    ...extras.map((d) => line({ kind: 'extra', id: d, hu: `Extra tál: ${DISHES[d].hu}`, en: `Extra platter: ${DISHES[d].en}`, qty: guests, unit: DISHES[d].extra })),
  ];
  const drinks = b.drinks === true;
  if (drinks) lines.push(line({ kind: 'drinks', hu: 'Korlátlan italok (saját készítésű)', en: 'Unlimited drinks (made by us)', qty: guests, unit: o.drinks }));
  if (hours > o.baseHours) lines.push(line({ kind: 'hours', hu: 'További óra', en: 'Extra hour', qty: hours - o.baseHours, unit: o.extraHour }));
  if (vch) lines.push(line({ kind: 'voucher', id: vch.code, hu: `Kuponkód ${vch.code} (−${vch.percent}% a kávézó díjából)`, en: `Voucher ${vch.code} (−${vch.percent}% off the café fee)`, qty: 1, unit: -vch.discount }));
  return { tier: tierId, dishes, extras, drinks, guests, hours, lines, total: lines.reduce((s, l) => s + l.amount, 0), voucher: vch };
}

/** Stripe and Számlázz take no negative lines: the voucher comes off the café line, so the lines still add up to the total. */
function chargeLines(q: { lines: QuoteLine[] }, en: boolean) {
  const disc = q.lines.find((l) => l.kind === 'voucher');
  return q.lines.filter((l) => l.kind !== 'voucher').map((l) => {
    const cut = l.kind === 'cafe' && disc;
    return { kind: l.kind, name: `${en ? l.en : l.hu}${cut ? ` (${disc.id} −${ft(-disc.amount)})` : ''}`, quantity: l.qty, unit: l.unit + (cut ? disc.amount : 0) };
  });
}

/** The stored package: { tier, dishes, extras, lines, total } since 2026-11-17; older rows hold an array of 'food1'… ids (indicative, paid on site). */
function pkgOf(b: Doc): { legacy: string[] | null; dishes: string[]; extras: string[]; lines: QuoteLine[] } {
  let p: unknown;
  try { p = JSON.parse(b.packages || '[]'); } catch { p = []; }
  if (Array.isArray(p)) return { legacy: p.map(String), dishes: [], extras: [], lines: [] };
  const o = (p ?? {}) as Doc;
  return { legacy: null, dishes: o.dishes ?? [], extras: o.extras ?? [], lines: o.lines ?? [] };
}
const dishNames = (ids: string[], en: boolean) => ids.map((d) => DISHES[d]?.[en ? 'en' : 'hu'] ?? d).join(', ');
const occasionOf = (v: string | null, en: boolean) => (v ? OCCASIONS[v]?.[en ? 1 : 0] ?? v : null);

/** Case-insensitive, trimmed. null = no such code. The discount is a share of the café fee only. */
function voucher(env: Env, raw: unknown) {
  const code = String(raw ?? '').trim().toUpperCase(), v = VOUCHERS[code];
  return v ? { code, percent: v.percent, discount: Math.round((offer(env).base * v.percent) / 100) } : null;
}

/** First bookable evening: the later of the launch date and tomorrow (Daniel 2026-11-18: bookable one day ahead). */
function bookingWindow(app: App) {
  const o = offer(app.env), now = today(app);
  const notice = addDays(now.date, o.noticeDays);
  return { min: notice > o.launch ? notice : o.launch, max: addMonths(now.date, o.windowMonths) };
}
const defaultOpen = (env: Env, date: string) => weekday(date) !== 0 && !offer(env).closedDays.includes(date.slice(5));

/** Agreed terms: 100 % at 7+ days before the start, 50 % until 48 h, nothing after. */
function refundPercent(app: App, b: Doc, at = new Date()) {
  const h = (instant(app, b.date, b.start_time).getTime() - at.getTime()) / 3600e3;
  return h >= 7 * 24 ? 100 : h >= 48 ? 50 : 0;
}

const get = (app: App, id: string) => app.db.d1.prepare('SELECT * FROM ah_bookings WHERE id = ?').bind(id).first<Doc>();
const expireHolds = (app: App) => app.db.d1.prepare("UPDATE ah_bookings SET status = 'expired' WHERE status = 'pending' AND hold_expires < ?").bind(nowIso()).run();

function view(b: Doc) {
  const p = pkgOf(b);
  return {
    id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, tier: b.tier, name: b.name, email: b.email, phone: b.phone,
    billing: { zip: b.zip, city: b.city, street: b.street, company: b.company ?? '', tax_number: b.tax_number ?? '' },
    occasion: b.occasion ?? '', note: b.note ?? '', packages: p.legacy ?? [], dishes: p.dishes, extras: p.extras, lines: p.lines, cake: !!b.cake, voucher_code: b.voucher_code ?? null, discount: b.discount_huf ?? 0, status: b.status, amount: b.amount_huf,
    created_at: iso(b.created_at), paid_at: iso(b.paid_at), cancelled_at: iso(b.cancelled_at),
    refund_percent: b.refund_percent, refund_huf: b.refund_huf, cancel_fee_huf: b.cancel_fee_huf ?? 0, invoice_no: b.invoice_no, invoice_error: b.invoice_error,
    final_no: b.final_no ?? null, final_error: b.final_error ?? null, correction_no: b.correction_no ?? null, correction_error: b.correction_error ?? null,
  };
}

async function overrides(app: App, from: string, to: string) {
  const { results } = await app.db.d1.prepare('SELECT date, open FROM ah_days WHERE date BETWEEN ? AND ?').bind(from, to).all<{ date: string; open: number }>();
  return new Map(results.map((r) => [r.date, !!r.open]));
}
async function live(app: App, from: string, to: string) {
  const { results } = await app.db.d1.prepare("SELECT date, id, status FROM ah_bookings WHERE status IN ('pending', 'paid') AND date BETWEEN ? AND ?").bind(from, to).all<{ date: string; id: string; status: string }>();
  return new Map(results.map((r) => [r.date, r]));
}

export async function availability(app: App, from: unknown, to: unknown, code?: unknown) {
  const w = bookingWindow(app);
  const a = validDate(from) && from > w.min ? from : w.min, z = validDate(to) && to < w.max ? to : w.max;
  await expireHolds(app);
  const [ov, taken] = await Promise.all([overrides(app, a, z), live(app, a, z)]);
  const days: { date: string; status: 'open' | 'booked' }[] = [];
  for (let d = a; d <= z; d = addDays(d, 1)) {
    if (taken.has(d)) days.push({ date: d, status: 'booked' });
    else if (ov.get(d) ?? defaultOpen(app.env, d)) days.push({ date: d, status: 'open' });
  }
  const res: Record<string, unknown> = { days, payments_ready: stripe.ready(app.env), bookings_open: bookingsOpen(app) };
  if (String(code ?? '').trim()) { const v = voucher(app.env, code); res.voucher = v ? { valid: true, ...v } : { valid: false }; }
  return res;
}

/** POST /quote: the price the page shows (same function as the booking). No date needed; a start, when sent, must leave room for the hours. */
export function priceQuote(app: App, b: Doc) {
  const o = offer(app.env), q = quote(app.env, b), start = text(b.start, 5);
  if (start && (!/^\d\d:\d\d$/.test(start) || mins(start) + q.hours * 60 > mins(o.close))) throw invalid(['hours']);
  return { tier: q.tier, dishes: q.dishes, extras: q.extras, drinks: q.drinks, guests: q.guests, hours: q.hours, lines: q.lines, total: q.total, voucher: q.voucher };
}

export async function book(app: App, b: Doc) {
  assertBookingsOpen(app);
  const o = offer(app.env), bad: string[] = [];
  const need = (ok: boolean, f: string) => { if (!ok) bad.push(f); };
  const billing = b.billing ?? {};
  const v = {
    date: b.date, start: text(b.start, 5), hours: Number(b.hours), guests: Number(b.guests),
    name: text(b.name, 120), email: text(b.email, 200), phone: text(b.phone, 40),
    zip: text(billing.zip, 4), city: text(billing.city, 80), street: text(billing.street, 160),
    company: text(billing.company, 160), tax: text(billing.tax_number, 13),
    occasion: text(b.occasion, 40), note: text(b.note, 1000), cake: b.cake === true,
  };
  need(validDate(v.date), 'date');
  const startOk = /^\d\d:\d\d$/.test(v.start) && mins(v.start) >= mins(o.open) && mins(v.start) <= mins(o.lastStart) && (mins(v.start) - mins(o.open)) % o.startStep === 0;
  need(startOk, 'start');
  need(Number.isInteger(v.hours) && v.hours >= o.baseHours && v.hours <= o.maxHours && startOk && mins(v.start) + v.hours * 60 <= mins(o.close), 'hours');
  need(Number.isInteger(v.guests) && v.guests >= o.minGuests && v.guests <= o.maxGuests, 'guests');
  let q: Quote | null = null;
  try { q = quote(app.env, b); } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'invalid') throw e; // invalid_voucher goes straight out, as before
    for (const f of e.extra.fields as string[]) if (!bad.includes(f)) bad.push(f);
  }
  need(v.name.length >= 2, 'name');
  need(EMAIL.test(v.email), 'email');
  need(v.phone.replace(/\D/g, '').length >= 7, 'phone');
  need(ZIP.test(v.zip), 'zip');
  need(v.city.length >= 2, 'city');
  need(v.street.length >= 3, 'street');
  need(!v.tax || TAX.test(v.tax), 'tax_number');
  need(!v.tax || v.company.length >= 2, 'company');
  need(b.terms === true, 'terms');
  const vch = String(b.voucher ?? '').trim() ? voucher(app.env, b.voucher) : null;
  if (String(b.voucher ?? '').trim() && !vch) throw new ApiError(400, 'invalid_voucher');
  if (bad.length) throw invalid(bad);
  if (!stripe.ready(app.env)) throw new ApiError(503, 'payments_not_configured');

  const w = bookingWindow(app);
  await expireHolds(app);
  const open = (await overrides(app, v.date, v.date)).get(v.date) ?? defaultOpen(app.env, v.date);
  if (v.date < w.min || v.date > w.max || !open) throw new ApiError(409, 'day_taken');

  const qt = q!, id = await nextId(app, 'AH'), discount = vch?.discount ?? 0, amount = qt.total, lang = langOf(b.lang), path = returnPath(b.return_path, PATHS, PATHS[0]);
  const pkg = JSON.stringify({ tier: qt.tier, dishes: qt.dishes, extras: qt.extras, drinks: qt.drinks, lines: qt.lines, total: qt.total });
  try {
    await app.db.d1.prepare(
      `INSERT INTO ah_bookings (id, date, status, hold_expires, start_time, hours, guests, tier, amount_huf, cancel_token, name, email, phone, zip, city, street,
        company, tax_number, occasion, note, packages, cake, voucher_code, discount_huf, lang, return_path, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.date, isoAt(new Date(Date.now() + stripe.HOLD_MIN * 60_000)), v.start, v.hours, v.guests, qt.tier, amount, tokenUrlsafe(24), v.name, v.email, v.phone, v.zip, v.city, v.street,
      v.company || null, v.tax || null, v.occasion || null, v.note || null, pkg, v.cake ? 1 : 0, vch?.code ?? null, discount, lang, path, nowIso()).run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new ApiError(409, 'day_taken'); // ah_one_per_day: someone else holds or has the evening
    throw e;
  }
  try {
    const end = hm(mins(v.start) + v.hours * 60);
    const session = await stripe.createCheckout(app, {
      kind: 'ah', ref: id, email: v.email, lang,
      lines: chargeLines(qt, lang === 'en').map((l, i) => ({ name: i ? l.name : `Bros After Hours ${v.date} ${v.start}–${end} · ${l.name}`, quantity: l.quantity, amountHuf: l.unit })),
      description: `Bros After Hours ${id} · ${v.date} ${v.start}–${end} · ${v.guests} ${lang === 'en' ? 'guests' : 'fő'}`,
      successUrl: siteUrl(app, `${path}?booking=${id}&paid=1`), cancelUrl: siteUrl(app, `${path}?cancelled=1`),
    });
    await app.db.d1.prepare('UPDATE ah_bookings SET stripe_session = ? WHERE id = ?').bind(session.id, id).run();
    return { checkout_url: session.url };
  } catch (e) {
    console.error(`Checkout for ${id} failed`, e);
    await app.db.d1.prepare("UPDATE ah_bookings SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(id).run(); // frees the evening
    throw new ApiError(502, 'payment_unavailable');
  }
}

// ---- invoices ----
// Accountant 2026-11-18: advance invoice (előlegszámla) dated the payment, final invoice (végszámla) dated the evening,
// both as food and drink sold on site (AH_VAT, 5 %); a partial refund gets a correcting invoice (helyesbítő).
const endOf = (b: Doc) => hm(mins(b.start_time) + b.hours * 60);
function linesOf(app: App, b: Doc): szamlazz.Line[] {
  const vat = szamlazz.config(app.env).ahVat, p = pkgOf(b), head = `Bros After Hours · ${b.date} ${b.start_time}–${endOf(b)} · ${b.guests} fő`;
  return p.lines.length
    ? chargeLines(p, false).map((l, i) => ({ name: i ? l.name : `${head} · ${l.name}`, quantity: l.quantity, grossHuf: l.unit, vat, unit: l.kind === 'hours' ? 'óra' : l.kind === 'cafe' ? undefined : 'fő' }))
    : [{ name: `${head}${b.voucher_code ? ` (${b.voucher_code} kupon)` : ''}`, quantity: 1, grossHuf: b.amount_huf, vat }]; // bookings before 2026-11-17
}
function invoiceOf(app: App, b: Doc, type: szamlazz.Kind, extra: Partial<szamlazz.Invoice> = {}): szamlazz.Invoice {
  const en = b.lang === 'en';
  const what = { elolegszamla: ['előlegszámla', 'az előlegszámlát', 'advance invoice'], vegszamla: ['végszámla', 'a végszámlát', 'final invoice'], helyesbito: ['helyesbítő számla', 'a helyesbítő számlát', 'correcting invoice'], szamla: ['számla', 'a számlát', 'invoice'] }[type];
  return {
    ref: b.id, order: b.id, type, lang: b.lang,
    buyer: { name: b.company || b.name, zip: b.zip, city: b.city, street: b.street, email: b.email, taxNumber: b.tax_number },
    lines: linesOf(app, b),
    comment: `Bros Cafe · Foglalás: ${b.id}`,
    subject: en ? `Your Bros After Hours ${what[2]} (${b.id})` : `Bros After Hours ${what[0]} (${b.id})`,
    body: en ? `Thank you for your booking. Your ${what[2]} is attached.` : `Köszönjük a foglalást! ${what[1][0].toUpperCase()}${what[1].slice(1)} mellékelten küldjük.`,
    ...extra,
  };
}
const issueInvoice = (app: App, b: Doc) => szamlazz.issueFor(app, 'ah_bookings', b.id, () => invoiceOf(app, b, 'elolegszamla'));
const issueFinal = (app: App, b: Doc) => szamlazz.issueFor(app, 'ah_bookings', b.id,
  () => invoiceOf(app, b, 'vegszamla', { ref: `${b.id}-V`, fulfilled: b.date, refersTo: b.invoice_no }), 'final');
/** Partial refund: the advance invoice reversed, the kept amount charged again (total = −refund); the handling fee is its own line. */
const issueCorrection = (app: App, b: Doc, refundHuf: number, percent: number, fee: number, goodwill: string) => szamlazz.issueFor(app, 'ah_bookings', b.id, () => {
  const name = `Fennmaradó összeg lemondás után (az eredeti ${ft(b.amount_huf)} ${100 - percent} %-a${goodwill ? ', méltányosságból' : ''})`;
  const lines = szamlazz.correctionLines(linesOf(app, b), b.amount_huf - refundHuf - fee, name);
  if (fee) lines.push({ name: `Kezelési költség lemondás miatt (a befizetett ${ft(b.amount_huf)} ${offer(app.env).cancelFeePct} %-a)`, quantity: 1, grossHuf: fee, vat: szamlazz.config(app.env).ahFeeVat });
  return invoiceOf(app, b, 'helyesbito', { ref: `${b.id}-H`, refersTo: b.invoice_no, lines, comment: `Bros Cafe · Foglalás: ${b.id}${goodwill ? ` · ${goodwill}` : ''}` });
}, 'correction');

/** Cron: advance invoices that failed or waited for the Agent key, and final invoices once the evening is over. */
export async function retryInvoices(app: App) {
  if (!szamlazz.ready(app.env)) return;
  const d1 = app.db.d1, max = szamlazz.MAX_TRIES;
  const { results } = await d1.prepare("SELECT * FROM ah_bookings WHERE status = 'paid' AND invoice_no IS NULL AND invoice_tries < ? LIMIT 10").bind(max).all<Doc>();
  for (const b of results) await issueInvoice(app, b);
  const due = await d1.prepare("SELECT * FROM ah_bookings WHERE status = 'paid' AND invoice_no IS NOT NULL AND final_no IS NULL AND final_tries < ? AND date <= ? LIMIT 10").bind(max, today(app).date).all<Doc>();
  for (const b of due.results) if (instant(app, b.date, endOf(b)).getTime() <= Date.now()) await issueFinal(app, b);
}

// ---- emails ----
const cancelLink = async (app: App, b: Doc) => siteUrl(app, `${b.return_path}lemondas/?t=${encodeURIComponent(`${b.id}.${await sign(app, b.id + b.cancel_token)}`)}`);
const timeOf = (b: Doc) => `${b.start_time}–${endOf(b)}`;
/** The highlighted date card: the evening, the time and size, the place. */
const evening = (b: Doc, en: boolean, map = true) => hero(longDate(b.date, en), [
  `${timeOf(b)} · ${b.guests} ${en ? 'people' : 'fő'}`, 'Bros Cafe · 1132 Budapest, Csanády u. 4/b',
], map ? (en ? 'Directions in Google Maps' : 'Útvonal a Google Térképen') : undefined);
/** What they asked for: package, platters, drinks, cake, occasion, note. Old bookings show their indicative food choice. */
function orderCard(b: Doc, en: boolean) {
  const p = pkgOf(b), tier = TIERS[b.tier];
  const cake = b.cake ? (en ? 'Yes, from 10 000 Ft, paid on the evening' : 'Igen, 10 000 Ft-tól, a helyszínen fizetendő') : null;
  const occasion = occasionOf(b.occasion, en), note = b.note || null;
  if (p.legacy) return card(en ? 'Your evening' : 'Az estétek', [[en ? 'Food (paid on site)' : 'Ételek (helyszínen fizetendő)', p.legacy.join(', ') || null], [en ? 'Cake' : 'Torta', cake], [en ? 'Occasion' : 'Alkalom', occasion], [en ? 'Note' : 'Megjegyzés', note]]);
  return card(en ? 'Your evening' : 'Az estétek', [
    [en ? 'Package' : 'Csomag', tier ? `${en ? 'Welcome drink' : 'Üdvözlőital'} + ${tier[en ? 'en' : 'hu']}` : b.tier],
    [en ? 'Platters' : 'Tálak', dishNames(p.dishes, en) || null],
    [en ? 'Extra platters' : 'Extra tálak', dishNames(p.extras, en) || null],
    [en ? 'Drinks' : 'Italok', p.lines.some((l) => l.kind === 'drinks') ? (en ? 'Unlimited, made by us' : 'Korlátlan, saját készítésű') : null],
    [en ? 'Cake' : 'Torta', cake], [en ? 'Occasion' : 'Alkalom', occasion], [en ? 'Note' : 'Megjegyzés', note],
  ]);
}
/** The price lines and what was paid. */
function payCard(b: Doc, en: boolean, totalLabel?: string) {
  const lines = pkgOf(b).lines.map((l): [string, string] => [`${en ? l.en : l.hu}${l.qty > 1 ? ` (${l.qty} × ${ft(l.unit)})` : ''}`, `${l.amount < 0 ? '−' : ''}${ft(Math.abs(l.amount))}`]);
  return priceCard(en ? 'Payment' : 'Fizetés', lines, [totalLabel ?? (en ? 'Paid' : 'Kifizetve'), ft(b.amount_huf)]);
}
const guestCard = (b: Doc) => card('Vendég', [['Név', b.name], ['E-mail', b.email], ['Telefon', b.phone],
  ['Számlázás', `${b.company ? `${b.company} (${b.tax_number ?? '–'}), ` : ''}${b.zip} ${b.city}, ${b.street}`]]);

async function sendConfirmation(app: App, b: Doc, invoiceNo: string | null) {
  const en = b.lang === 'en', link = await cancelLink(app, b), pct = offer(app.env).cancelFeePct;
  const included = pkgOf(b).legacy ? (en ? 'Food, cake and extras are paid on the evening.' : 'Az ételeket, a tortát és az extrákat a helyszínen fizetitek.') // bookings before 2026-11-17
    : en ? 'Food and drinks are included; the cake and anything extra are paid on the evening.' : 'Az étel és az ital benne van; a tortát és az extra fogyasztást a helyszínen fizetitek.';
  await mail(app, {
    to: b.email, lang: b.lang, subject: en ? `Your Bros After Hours booking (${b.id})` : `Bros After Hours foglalás (${b.id})`,
    title: en ? 'Thank you for your booking!' : 'Köszönjük a foglalást!',
    parts: [
      para(en ? 'The café will be all yours for the evening, and we are looking forward to having you.' : 'Az estére csak a tiétek a kávézó, már nagyon várunk titeket.'),
      evening(b, en),
      orderCard(b, en),
      payCard(b, en),
      card(en ? 'Good to know' : 'Jó tudni', [
        [en ? 'Arrival' : 'Érkezés', en ? `At ${b.start_time}: everything will be ready for you.` : `${b.start_time}-kor, addigra minden készen vár.`],
        [en ? 'Included' : 'Benne van', included],
        [en ? 'Invoice' : 'Számla', en ? 'Advance invoice now from Számlázz.hu, final invoice on the day.' : 'Előlegszámla most, külön e-mailben a Számlázz.hu-tól; végszámla az est napján.'],
        [en ? 'Cancellation' : 'Lemondás', en ? `7+ days before: 100% back · until 48 hours before: 50% · after that: none. ${pct}% handling fee from a refund.`
          : `7+ nappal előtte: 100% · 48 óráig: 50% · utána: nincs visszatérítés. A visszatérítésből ${pct}% kezelési költség.`],
      ]),
      fine(en ? `Booking reference: ${b.id}. Allergies or special wishes? Reply to this email.` : `Foglalási azonosító: ${b.id}. Allergia vagy különleges kérés? Válaszoljatok erre az e-mailre.`),
    ],
    links: [[en ? 'Change the booking' : 'Foglalás módosítása', await modifyLink(app, b)], [en ? 'Cancel the booking' : 'Foglalás lemondása', link]],
  });
  const invoice = invoiceNo ?? `NINCS KIÁLLÍTVA (${szamlazz.ready(app.env) ? 'hiba, újrapróbáljuk' : 'Számlázz.hu kulcs nincs beállítva'})`;
  await mail(app, {
    to: staffAddress(app), staff: true, subject: `Új After Hours foglalás: ${b.date} ${b.start_time} · ${b.name} (${b.id})`, title: 'Új After Hours foglalás',
    parts: [evening(b, false, false), guestCard(b), orderCard(b, false), payCard(b, false), card('Állapot', [['Azonosító', b.id], ['Fizetés', 'kifizetve (Stripe)'], ['Előlegszámla', invoice]])],
  });
}

/**
 * Cron: a reminder the day before the evening, from 10:00 Budapest time. Not for bookings paid the day before or later
 * (they just had the confirmation): those are marked 'skip'.
 */
export async function sendReminders(app: App) {
  const now = today(app);
  if (now.hour < 10) return;
  const d1 = app.db.d1, tomorrow = addDays(now.date, 1);
  const { results } = await d1.prepare("SELECT * FROM ah_bookings WHERE status = 'paid' AND date = ? AND reminder_sent_at IS NULL").bind(tomorrow).all<Doc>();
  for (const b of results) {
    const late = !b.paid_at || today(app, parseIso(b.paid_at)).date >= now.date;
    const claim = await d1.prepare('UPDATE ah_bookings SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL').bind(late ? 'skip' : nowIso(), b.id).run();
    if (!claim.meta.changes || late) continue;
    const en = b.lang === 'en';
    await mail(app, {
      to: b.email, lang: b.lang, subject: en ? `See you tomorrow at Bros After Hours (${b.id})` : `Holnap találkozunk: Bros After Hours (${b.id})`,
      title: en ? 'See you tomorrow!' : 'Holnap találkozunk!',
      parts: [
        para(en ? 'Tomorrow is your private evening at Bros Cafe.' : 'Holnap lesz a privát estétek a Bros Caféban.'),
        evening(b, en),
        card(en ? 'Good to know' : 'Jó tudni', [
          [en ? 'Arrival' : 'Érkezés', en ? `At ${b.start_time}: everything will be ready for you.` : `${b.start_time}-kor, addigra minden készen vár.`],
          [en ? 'Cake' : 'Torta', b.cake ? (en ? 'Paid on the evening' : 'A helyszínen fizetitek') : null],
        ]),
        fine(en ? 'Allergies, a change in numbers or anything else to tell us? Reply to this email.' : 'Allergia, létszámváltozás vagy bármi, amit jeleznétek? Válaszoljatok erre az e-mailre.'),
      ],
    });
  }
}

async function sendCancelled(app: App, b: Doc, by: 'guest' | 'staff', note: string) {
  const en = b.lang === 'en';
  const back = b.refund_huf ? ft(b.refund_huf) : b.status === 'refunded' ? (en ? 'No refund under the terms' : 'A feltételek szerint nem jár') : (en ? 'We will write to you' : 'Külön értesítünk');
  await mail(app, {
    to: b.email, lang: b.lang, subject: en ? `Booking cancelled (${b.id})` : `Foglalás lemondva (${b.id})`,
    title: en ? 'Your booking is cancelled' : 'A foglalást lemondtuk',
    parts: [
      para(en ? 'We are sorry you cannot make it. This evening is no longer booked:' : 'Sajnáljuk, hogy most nem jön össze. Ez az este már nincs lefoglalva:'),
      evening(b, en, false),
      card(en ? 'Refund' : 'Visszatérítés', [
        [en ? 'Paid' : 'Kifizetve', ft(b.amount_huf)],
        [en ? 'Handling fee' : 'Kezelési költség', b.cancel_fee_huf ? `−${ft(b.cancel_fee_huf)}` : null],
        [en ? 'Refunded' : 'Visszajár', b.refund_percent != null && b.refund_huf ? `${back} (${b.refund_percent}%)` : back],
        [en ? 'When' : 'Mikor', b.refund_huf ? (en ? 'Within a few days, to the card you paid with' : 'Néhány napon belül, a fizetéshez használt kártyára') : null],
      ]),
      fine(en ? `Booking reference: ${b.id}. We hope to see you another time!` : `Foglalási azonosító: ${b.id}. Reméljük, máskor találkozunk!`),
    ],
  });
  await mail(app, {
    to: staffAddress(app), staff: true, subject: `After Hours lemondás: ${b.date} · ${b.name} (${b.id})`, title: 'After Hours lemondás',
    parts: [evening(b, false, false), card('Lemondás', [['Azonosító', b.id], ['Lemondta', by === 'guest' ? 'a vendég (e-mailes link)' : 'admin'], ['Státusz', b.status],
      ['Visszatérítés', b.refund_huf != null ? `${ft(b.refund_huf)} (${b.refund_percent}%)${b.cancel_fee_huf ? `, kezelési költség ${ft(b.cancel_fee_huf)}` : ''}` : 'még nincs'], ['Teendő', note]]), guestCard(b)],
  });
}

// ---- Stripe webhook ----
export async function onPaid(app: App, session: Doc) {
  const id = String(session.metadata?.ref ?? session.client_reference_id ?? '');
  const b = await get(app, id);
  if (!b || session.payment_status !== 'paid') return;
  if (b.status !== 'pending' && b.status !== 'expired') return; // already handled (Stripe retries)
  const pi = String(session.payment_intent ?? '');
  let taken = false;
  try {
    // an expired hold is revived unless the evening went to someone else (the unique index decides)
    const r = await app.db.d1.prepare("UPDATE ah_bookings SET status = 'paid', paid_at = ?, hold_expires = NULL, stripe_payment_intent = ?, stripe_session = ? WHERE id = ? AND status IN ('pending', 'expired')")
      .bind(nowIso(), pi, session.id ?? b.stripe_session, id).run();
    if (!r.meta.changes) return;
  } catch (e) {
    if (!/UNIQUE/i.test(String((e as Error).message))) throw e;
    taken = true;
  }
  if (taken) {
    // paid for a released evening: give it all back
    await stripe.refund(app, pi, b.amount_huf, id);
    await app.db.d1.prepare("UPDATE ah_bookings SET status = 'refunded', stripe_payment_intent = ?, refund_huf = amount_huf, refund_percent = 100, cancelled_at = ? WHERE id = ?").bind(pi, nowIso(), id).run();
    const fresh = (await get(app, id))!;
    await sendCancelled(app, fresh, 'staff', 'A fizetés a foglalási idő lejárta után érkezett, az estét közben más lefoglalta: automatikusan teljes visszatérítés ment.');
    return;
  }
  const paid = (await get(app, id))!;
  const invoiceNo = await issueInvoice(app, paid);
  await sendConfirmation(app, paid, invoiceNo);
}
export const onExpired = (app: App, session: Doc) =>
  app.db.d1.prepare("UPDATE ah_bookings SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(String(session.metadata?.ref ?? session.client_reference_id ?? '')).run();

// ---- cancelling ----
/** Refunds a cancelled booking and closes it. Throws ApiError when Stripe cannot do it; the booking then stays `cancelled`. */
/** What a cancellation pays back: the terms' share minus the handling fee (none on goodwill, when waived, or when nothing is refunded). */
function refundOf(app: App, b: Doc, percent: number, policy: number, waive = false) {
  const fee = !waive && percent > 0 && percent <= policy ? Math.round((b.amount_huf * offer(app.env).cancelFeePct) / 100) : 0;
  return { fee, refund: Math.max(0, Math.round((b.amount_huf * percent) / 100) - fee) };
}
const policyOf = (app: App, b: Doc) => refundPercent(app, b, b.cancelled_at ? parseIso(b.cancelled_at) : new Date());

async function refundCancelled(app: App, b: Doc, percent: number, waive = false) {
  const policy = policyOf(app, b), { fee, refund: amount } = refundOf(app, b, percent, policy, waive);
  if (amount > 0) {
    if (!stripe.ready(app.env)) throw new ApiError(503, 'payments_not_configured');
    if (!b.stripe_payment_intent) throw new ApiError(409, 'not_paid_online');
    try {
      await stripe.refund(app, b.stripe_payment_intent, amount, b.id);
    } catch (e) {
      console.error(`refund of ${b.id} failed`, e);
      throw new ApiError(502, 'refund_failed');
    }
  }
  await app.db.d1.prepare("UPDATE ah_bookings SET status = 'refunded', refund_huf = ?, refund_percent = ?, cancel_fee_huf = ? WHERE id = ? AND status = 'cancelled'").bind(amount, percent, fee, b.id).run();
  // everything back: storno; otherwise a correcting invoice (accountant 2026-11-18). After the final invoice it is left to staff.
  // more than the terms gave (admin goodwill): said on the invoice
  const goodwill = percent > policy ? `Méltányossági visszatérítés: ${percent} % (a lemondási feltételek szerint ${policy} % járt).` : '';
  if (!b.final_no && amount === b.amount_huf) await szamlazz.stornoFor(app, 'ah_bookings', b.id, b.invoice_no, b.email, goodwill);
  else if (!b.final_no && amount > 0 && b.invoice_no) await issueCorrection(app, b, amount, percent, fee, goodwill);
  return amount;
}
const invoiceTodo = (b: Doc, percent: number) =>
  !b.invoice_no ? 'Előlegszámla nem volt kiállítva: a Számlázz.hu-ban kézzel kell rendezni.'
    : b.final_no && percent > 0 ? 'A végszámla már ki volt állítva: a helyesbítést kézzel kell elvégezni (könyvelő).'
      : b.refund_huf === b.amount_huf ? 'Az előlegszámlát sztornóztuk (ellenőrizd a Számlázz.hu-ban).'
        : percent > 0 ? 'Visszatérítés: helyesbítő számlát állítottunk ki (ellenőrizd a Számlázz.hu-ban).' : 'Nincs visszatérítés, az előlegszámla marad.';

async function byToken(app: App, token: string) {
  const dot = token.lastIndexOf('.'), id = token.slice(0, dot), sig = token.slice(dot + 1);
  if (dot < 1 || !/^AH-\d+$/.test(id)) throw new ApiError(404, 'not_found');
  const b = await get(app, id);
  if (!b || !safeEqual(sig, await sign(app, b.id + b.cancel_token))) throw new ApiError(404, 'not_found');
  return b;
}
const cancelView = (app: App, b: Doc, percent: number) => {
  const r = b.status === 'paid' ? refundOf(app, b, percent, percent) : { fee: b.cancel_fee_huf ?? 0, refund: b.refund_huf ?? 0 };
  return {
    booking: { id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, name: b.name, amount: b.amount_huf, status: b.status, tier: b.tier, lines: pkgOf(b).lines },
    refund_percent: percent, refund_huf: r.refund, fee_huf: r.fee, fee_percent: offer(app.env).cancelFeePct,
  };
};

/** GET: changes nothing, so a mail scanner following the link cannot cancel. */
export async function cancelInfo(app: App, token: string) {
  const b = await byToken(app, token);
  if (b.status !== 'paid' || instant(app, b.date, b.start_time).getTime() <= Date.now()) throw new ApiError(410, 'gone');
  return cancelView(app, b, refundPercent(app, b));
}

export async function cancelConfirm(app: App, token: string) {
  const b = await byToken(app, token);
  if (b.status !== 'paid' || instant(app, b.date, b.start_time).getTime() <= Date.now()) throw new ApiError(410, 'gone');
  const at = new Date(), percent = refundPercent(app, b, at);
  const r = await app.db.d1.prepare("UPDATE ah_bookings SET status = 'cancelled', cancelled_at = ?, refund_percent = ? WHERE id = ? AND status = 'paid'").bind(isoAt(at), percent, b.id).run();
  if (!r.meta.changes) throw new ApiError(410, 'gone');
  let note = invoiceTodo(b, percent);
  try {
    await refundCancelled(app, { ...b, status: 'cancelled' }, percent);
  } catch (e) {
    note = `A VISSZATÉRÍTÉS NEM SIKERÜLT (${(e as Error).message}): indítsd el az adminban. ${note}`;
  }
  const fresh = (await get(app, b.id))!;
  app.later(sendCancelled(app, fresh, 'guest', note));
  return { ...cancelView(app, fresh, percent), refund_pending: fresh.status === 'cancelled' };
}

// ---- changing a booking (nothing that changes the price; for that: cancel without fee and book again) ----
/** Guests may change these until 48 hours before; admins also name and email, any time, to any free evening. */
async function change(app: App, b: Doc, body: Doc, who: 'guest' | 'admin') {
  if (b.status !== 'paid') throw new ApiError(409, 'not_paid');
  const o = offer(app.env), bad: string[] = [], has = (k: string) => body[k] !== undefined && body[k] !== null;
  if (who === 'guest' && instant(app, b.date, b.start_time).getTime() - Date.now() < 48 * 3600e3) throw new ApiError(409, 'too_late');
  const v = {
    date: has('date') ? String(body.date) : b.date, start: has('start') ? text(body.start, 5) : b.start_time,
    occasion: has('occasion') ? text(body.occasion, 40) : (b.occasion ?? ''), note: has('note') ? text(body.note, 1000) : (b.note ?? ''),
    phone: has('phone') ? text(body.phone, 40) : b.phone, cake: has('cake') ? body.cake === true : !!b.cake,
    name: who === 'admin' && has('name') ? text(body.name, 120) : b.name, email: who === 'admin' && has('email') ? text(body.email, 200) : b.email,
  };
  const startOk = /^\d\d:\d\d$/.test(v.start) && mins(v.start) >= mins(o.open) && mins(v.start) <= mins(o.lastStart) && (mins(v.start) - mins(o.open)) % o.startStep === 0;
  if (!validDate(v.date)) bad.push('date');
  if (!startOk || mins(v.start) + b.hours * 60 > mins(o.close)) bad.push('start');
  if (v.occasion && !OCCASIONS[v.occasion]) bad.push('occasion');
  if (v.phone.replace(/\D/g, '').length < 7) bad.push('phone');
  if (v.name.length < 2) bad.push('name');
  if (!EMAIL.test(v.email)) bad.push('email');
  if (bad.length) throw invalid(bad);
  if (v.date !== b.date) {
    await expireHolds(app);
    const w = bookingWindow(app), open = (await overrides(app, v.date, v.date)).get(v.date) ?? defaultOpen(app.env, v.date);
    if (who === 'guest' ? v.date < w.min || v.date > w.max || !open : v.date < today(app).date) throw new ApiError(409, 'day_taken');
    const taken = (await live(app, v.date, v.date)).get(v.date);
    if (taken && taken.id !== b.id) throw new ApiError(409, 'day_taken');
  }
  try {
    await app.db.d1.prepare(`UPDATE ah_bookings SET date = ?, start_time = ?, occasion = ?, note = ?, phone = ?, cake = ?, name = ?, email = ?,
      reminder_sent_at = CASE WHEN date = ? THEN reminder_sent_at ELSE NULL END WHERE id = ? AND status = 'paid'`)
      .bind(v.date, v.start, v.occasion || null, v.note || null, v.phone, v.cake ? 1 : 0, v.name, v.email, v.date, b.id).run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new ApiError(409, 'day_taken');
    throw e;
  }
  const after = (await get(app, b.id))!;
  app.later(sendChanged(app, b, after, who));
  return after;
}

/** What changed, old → new, for both emails. */
function changes(a: Doc, b: Doc, en: boolean): [string, string][] {
  const yes = en ? 'yes' : 'igen', no = en ? 'no' : 'nem', out: [string, string][] = [];
  const add = (label: string, x: unknown, y: unknown) => { if ((x ?? '') !== (y ?? '')) out.push([label, `${x || '–'} → ${y || '–'}`]); };
  add(en ? 'Date' : 'Dátum', longDate(a.date, en), longDate(b.date, en));
  add(en ? 'Time' : 'Időpont', timeOf(a), timeOf(b));
  add(en ? 'Occasion' : 'Alkalom', occasionOf(a.occasion, en), occasionOf(b.occasion, en));
  add(en ? 'Cake' : 'Torta', a.cake ? yes : no, b.cake ? yes : no);
  add(en ? 'Note' : 'Megjegyzés', a.note, b.note);
  add(en ? 'Phone' : 'Telefon', a.phone, b.phone);
  add(en ? 'Name' : 'Név', a.name, b.name);
  add('E-mail', a.email, b.email);
  return out;
}
const modifyLink = async (app: App, b: Doc) => siteUrl(app, `${b.return_path}modositas/?t=${encodeURIComponent(`${b.id}.${await sign(app, b.id + b.cancel_token)}`)}`);

async function sendChanged(app: App, before: Doc, b: Doc, who: 'guest' | 'admin') {
  const en = b.lang === 'en', diff = changes(before, b, en);
  if (!diff.length) return;
  await mail(app, {
    to: b.email, lang: b.lang, subject: en ? `Your booking has been changed (${b.id})` : `Módosult a foglalásotok (${b.id})`,
    title: en ? 'Your booking is updated' : 'Módosítottuk a foglalást',
    parts: [
      para(en ? 'Here is your evening with the changes:' : 'Így néz ki most az estétek:'),
      evening(b, en), card(en ? 'What changed' : 'Mi változott', diff), orderCard(b, en),
      fine(en ? `Booking reference: ${b.id}. The amount paid and the cancellation terms stay the same.` : `Foglalási azonosító: ${b.id}. A kifizetett összeg és a lemondási feltételek nem változnak.`),
    ],
    links: [[en ? 'Change the booking' : 'Foglalás módosítása', await modifyLink(app, b)], [en ? 'Cancel the booking' : 'Foglalás lemondása', await cancelLink(app, b)]],
  });
  await mail(app, {
    to: staffAddress(app), staff: true, subject: `After Hours módosítás: ${b.date} ${b.start_time} · ${b.name} (${b.id})`, title: 'After Hours módosítás',
    parts: [evening(b, false, false), card('Mi változott', changes(before, b, false)), card('Módosította', [['Ki', who === 'guest' ? 'a vendég (e-mailes link)' : 'admin'], ['Azonosító', b.id]]), guestCard(b)],
  });
}

/** GET for the guest's change page: the booking, what can be changed, the booking window. */
export async function changeInfo(app: App, token: string) {
  const b = await byToken(app, token);
  if (b.status !== 'paid' || instant(app, b.date, b.start_time).getTime() <= Date.now()) throw new ApiError(410, 'gone');
  const w = bookingWindow(app);
  return {
    booking: { id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, name: b.name, occasion: b.occasion ?? '', note: b.note ?? '', phone: b.phone, cake: !!b.cake },
    editable: instant(app, b.date, b.start_time).getTime() - Date.now() >= 48 * 3600e3, window: w,
  };
}
export async function changeConfirm(app: App, token: string, body: Doc) {
  const b = await byToken(app, token);
  await change(app, b, body, 'guest');
  return changeInfo(app, token);
}
export async function adminChange(app: App, id: string, body: Doc) {
  const b = await get(app, id);
  if (!b) throw new ApiError(404, 'not_found');
  return view(await change(app, b, body, 'admin'));
}

// ---- admin ----
export async function adminDays(app: App, from: unknown, to: unknown) {
  if (!validDate(from) || !validDate(to) || to < from || to > addDays(from, 400)) throw invalid(['from', 'to']);
  await expireHolds(app);
  const [ov, taken] = await Promise.all([overrides(app, from, to), live(app, from, to)]);
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = taken.get(d);
    days.push({ date: d, open: !!t || (ov.get(d) ?? defaultOpen(app.env, d)), booking_id: t?.status === 'paid' ? t.id : null, held: t?.status === 'pending' });
  }
  return { days };
}

export async function setDay(app: App, date: string, open: unknown) {
  if (!validDate(date) || typeof open !== 'boolean') throw invalid(['date', 'open']);
  await expireHolds(app);
  if (!open && (await live(app, date, date)).has(date)) throw new ApiError(409, 'has_booking');
  await app.db.d1.prepare('INSERT INTO ah_days (date, open, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET open = excluded.open, updated_at = excluded.updated_at').bind(date, open ? 1 : 0, nowIso()).run();
  return { date, open };
}

/** Newest evening first. Expired holds (abandoned payments) are left out unless asked for with ?status=expired. */
export async function adminBookings(app: App, status: string | null) {
  await expireHolds(app);
  const q = status ? app.db.d1.prepare('SELECT * FROM ah_bookings WHERE status = ? ORDER BY date DESC LIMIT 500').bind(status)
    : app.db.d1.prepare("SELECT * FROM ah_bookings WHERE status != 'expired' ORDER BY date DESC LIMIT 500");
  return { bookings: (await q.all<Doc>()).results.map(view), payments_ready: stripe.ready(app.env) };
}

export async function adminCancel(app: App, id: string) {
  const r = await app.db.d1.prepare("UPDATE ah_bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'paid'").bind(nowIso(), id).run();
  const b = await get(app, id);
  if (!b) throw new ApiError(404, 'not_found');
  if (!r.meta.changes) throw new ApiError(409, 'not_paid');
  app.later(sendCancelled(app, b, 'staff', 'Lemondva az adminban. A visszatérítést külön gombbal kell elindítani.'));
  return view(b);
}

export async function adminRefund(app: App, id: string, percent: unknown, waiveFee: unknown = false) {
  const b = await get(app, id);
  if (!b) throw new ApiError(404, 'not_found');
  if (b.status !== 'cancelled') throw new ApiError(409, 'not_cancelled');
  // default: what the terms gave at the moment of cancelling, not now
  const pct = percent === undefined || percent === null ? refundPercent(app, b, b.cancelled_at ? parseIso(b.cancelled_at) : new Date()) : Number(percent);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw invalid(['percent']);
  await refundCancelled(app, b, pct, waiveFee === true);
  const fresh = (await get(app, id))!;
  app.later(sendCancelled(app, fresh, 'staff', invoiceTodo(fresh, pct)));
  return view(fresh);
}
