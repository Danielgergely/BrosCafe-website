// Bros After Hours: one private evening per day, paid in advance. Spec docs/after-hours.md, contract docs/after-hours-api.md.
import type { App } from '../http';
import type { Env } from '../env';
import type { Doc } from '../db';
import { isoAt, nowIso, parseIso, tokenUrlsafe } from '../util';
import {
  ApiError, EMAIL, TAX, ZIP, addDays, addMonths, assertBookingsOpen, bookingsOpen, esc, ft, hm, instant, invalid, iso, lang as langOf, mail, mins, nextId, returnPath, rows,
  safeEqual, sign, siteUrl, staffAddress, text, today, validDate, weekday,
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
  launch: String(env.AH_LAUNCH_DATE ?? '2026-12-01'), noticeDays: 3, windowMonths: 3,
  closedDays: ['12-24', '12-25', '12-26', '12-31', '01-01'], // blocked every year unless the admin opens the day
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

/** First bookable evening: the later of the launch date and three full days' notice (one more once today's evening has opened). */
function bookingWindow(app: App) {
  const o = offer(app.env), now = today(app);
  const notice = addDays(now.date, o.noticeDays + (now.hour * 60 + now.minute >= mins(o.open) ? 1 : 0));
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
    refund_percent: b.refund_percent, refund_huf: b.refund_huf, invoice_no: b.invoice_no, invoice_error: b.invoice_error,
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

// ---- invoice ----
function invoiceOf(app: App, b: Doc): szamlazz.Invoice {
  const cfg = szamlazz.config(app.env), end = hm(mins(b.start_time) + b.hours * 60), en = b.lang === 'en', p = pkgOf(b);
  const head = `Bros After Hours ${cfg.ahInvoiceType === 'elolegszamla' ? 'előleg' : 'privát este'} · ${b.date} ${b.start_time}–${end} · ${b.guests} fő`;
  // VAT: the room (café fee, extra hours) at AH_VAT 27 %, food and drink served in-house at AH_FOOD_VAT 5 % (Daniel 2026-11-18)
  const lines: szamlazz.Line[] = p.lines.length
    ? chargeLines(p, false).map((l, i) => ({ name: i ? l.name : `${head} · ${l.name}`, quantity: l.quantity, grossHuf: l.unit, vat: l.kind === 'cafe' || l.kind === 'hours' ? cfg.ahVat : cfg.ahFoodVat, unit: l.kind === 'hours' ? 'óra' : l.kind === 'cafe' ? undefined : 'fő' }))
    : [{ name: `${head}${b.voucher_code ? ` (${b.voucher_code} kupon)` : ''}`, quantity: 1, grossHuf: b.amount_huf, vat: cfg.ahVat }]; // bookings before 2026-11-17
  return {
    ref: b.id, type: cfg.ahInvoiceType, lang: b.lang,
    buyer: { name: b.company || b.name, zip: b.zip, city: b.city, street: b.street, email: b.email, taxNumber: b.tax_number },
    lines,
    comment: `Foglalás: ${b.id}`,
    subject: en ? `Your Bros After Hours invoice (${b.id})` : `Bros After Hours számla (${b.id})`,
    body: en ? 'Thank you for your booking. Your invoice is attached.' : 'Köszönjük a foglalást! A számlát mellékelten küldjük.',
  };
}
const issueInvoice = (app: App, b: Doc) => szamlazz.issueFor(app, 'ah_bookings', b.id, () => invoiceOf(app, b));

/** Cron: invoices that failed or waited for the Agent key. */
export async function retryInvoices(app: App) {
  if (!szamlazz.ready(app.env)) return;
  const { results } = await app.db.d1.prepare("SELECT * FROM ah_bookings WHERE status = 'paid' AND invoice_no IS NULL AND invoice_tries < ? LIMIT 10").bind(szamlazz.MAX_TRIES).all<Doc>();
  for (const b of results) await issueInvoice(app, b);
}

// ---- emails ----
const cancelLink = async (app: App, b: Doc) => siteUrl(app, `${b.return_path}lemondas/?t=${encodeURIComponent(`${b.id}.${await sign(app, b.id + b.cancel_token)}`)}`);
/** Package, dishes, extras and the price lines, for both emails; old bookings show their indicative food choice. */
function orderRows(b: Doc, en: boolean): [string, string | null][] {
  const p = pkgOf(b), tier = TIERS[b.tier];
  if (p.legacy) return [[en ? 'Food selection (paid on site)' : 'Ételválogatás (helyszínen fizetendő)', p.legacy.join(', ') || null], [en ? 'Voucher' : 'Kuponkód', b.voucher_code ? `${b.voucher_code} (−${ft(b.discount_huf)})` : null]];
  const money = (l: QuoteLine) => `${en ? l.en : l.hu}: ${l.qty > 1 ? `${l.qty} × ${ft(l.unit)} = ` : ''}${l.amount < 0 ? '−' : ''}${ft(Math.abs(l.amount))}`;
  return [
    [en ? 'Package' : 'Csomag', tier ? `${tier[en ? 'en' : 'hu']} (${ft(p.lines.find((l) => l.kind === 'package')?.unit ?? tier.perPerson)} ${en ? 'per person' : '/ fő'})` : b.tier],
    [en ? 'Platters' : 'Tálak', dishNames(p.dishes, en) || null],
    [en ? 'Extra platters' : 'Extra tálak', dishNames(p.extras, en) || null],
    [en ? 'Drinks' : 'Italok', p.lines.some((l) => l.kind === 'drinks') ? (en ? 'Unlimited drinks we make' : 'Korlátlan saját készítésű italok') : null],
    [en ? 'Breakdown' : 'Részletezés', p.lines.map(money).join('\n') || null],
  ];
}
const cakeRow = (b: Doc, en: boolean): [string, string] => [en ? 'Celebration cake' : 'Ünnepi torta', b.cake ? (en ? 'requested, from 10 000 Ft, paid on the evening' : 'kérnek, 10 000 Ft-tól, a helyszínen fizetendő') : (en ? 'no' : 'nem')];
function details(b: Doc, en: boolean) {
  const end = hm(mins(b.start_time) + b.hours * 60);
  return rows([
    [en ? 'Booking' : 'Azonosító', b.id], [en ? 'Date' : 'Dátum', b.date], [en ? 'Time' : 'Időpont', `${b.start_time}–${end}`],
    [en ? 'Guests' : 'Vendégszám', b.guests], ...orderRows(b, en), cakeRow(b, en), [en ? 'Total paid' : 'Kifizetett összeg', ft(b.amount_huf)],
  ]);
}
function staffDetails(b: Doc, extra: [string, string | number | null][] = []) {
  return rows([
    ['Azonosító', b.id], ['Dátum', b.date], ['Időpont', `${b.start_time}–${hm(mins(b.start_time) + b.hours * 60)}`], ['Vendégszám', b.guests],
    ...orderRows(b, false), cakeRow(b, false), ['Fizetett összeg', ft(b.amount_huf)],
    ['Név', b.name], ['E-mail', b.email], ['Telefon', b.phone], ['Számlázás', `${b.company ? `${b.company} (${b.tax_number ?? '–'}), ` : ''}${b.zip} ${b.city}, ${b.street}`],
    ['Alkalom', occasionOf(b.occasion, false)], ['Megjegyzés', b.note], ...extra,
  ]);
}

async function sendConfirmation(app: App, b: Doc, invoiceNo: string | null) {
  const en = b.lang === 'en', d = details(b, en), link = await cancelLink(app, b);
  const intro = en ? 'Your private evening at Bros Cafe is booked. The invoice arrives in a separate email from Számlázz.hu.'
    : 'A privát estétek a Bros Caféban le van foglalva. A számlát külön e-mailben küldi a Számlázz.hu.';
  const food = pkgOf(b).legacy ? (en ? 'Food, cake and extras are paid on the evening.' : 'Az ételeket, a tortát és az extrákat a helyszínen fizetitek.') // bookings before 2026-11-17
    : en ? 'Food and drinks are included in the amount you paid; the cake is paid on the evening.' : 'Az étel és az ital is benne van az előre fizetett összegben; a torta a helyszínen fizetendő.';
  const terms = `${food} ${en ? 'Cancellation: full refund 7 or more days before, 50% until 48 hours before, none after.'
    : 'Lemondás: legalább 7 nappal előtte a teljes összeg, 48 órával előttig a fele jár vissza, azután már nem tudunk visszatéríteni.'}`;
  await mail(app, {
    to: b.email, lang: b.lang, subject: en ? `Your Bros After Hours booking (${b.id})` : `Bros After Hours foglalás (${b.id})`,
    title: en ? 'Your evening is booked' : 'Megvan a foglalás', html: `<p>${esc(intro)}</p>${d.html}<p>${esc(terms)}</p>`,
    text: `${intro}\n\n${d.text}\n\n${terms}\n\n${en ? 'Cancel the booking' : 'Foglalás lemondása'}: ${link}`,
    button: [en ? 'Cancel the booking' : 'Foglalás lemondása', link],
  });
  const s = staffDetails(b, [['Fizetés', 'kifizetve (Stripe)'], ['Számla', invoiceNo ?? `NINCS KIÁLLÍTVA (${szamlazz.ready(app.env) ? 'hiba, újrapróbáljuk' : 'Számlázz.hu kulcs nincs beállítva'})`]]);
  await mail(app, { to: staffAddress(app), subject: `Új After Hours foglalás: ${b.date} ${b.start_time} · ${b.name} (${b.id})`, title: 'Új Bros After Hours foglalás', html: s.html, text: s.text });
}

async function sendCancelled(app: App, b: Doc, by: 'guest' | 'staff', note: string) {
  const en = b.lang === 'en', d = details(b, en);
  const refund = b.refund_huf ? (en ? `Refund: ${ft(b.refund_huf)} (${b.refund_percent}%). It reaches the card you paid with in a few days.` : `Visszatérítés: ${ft(b.refund_huf)} (${b.refund_percent}%). Néhány napon belül érkezik a fizetéshez használt kártyára.`)
    : b.status === 'refunded' ? (en ? 'Under the cancellation terms no refund is due.' : 'A lemondási feltételek szerint visszatérítés nem jár.')
      : (en ? 'We will write to you about the refund.' : 'A visszatérítésről külön értesítünk.');
  const intro = en ? 'Your Bros After Hours booking has been cancelled.' : 'A Bros After Hours foglalásotok le van mondva.';
  await mail(app, { to: b.email, lang: b.lang, subject: en ? `Booking cancelled (${b.id})` : `Foglalás lemondva (${b.id})`, title: en ? 'Booking cancelled' : 'Foglalás lemondva', html: `<p>${esc(intro)}</p>${d.html}<p>${esc(refund)}</p>`, text: `${intro}\n\n${d.text}\n\n${refund}` });
  const s = staffDetails(b, [['Lemondta', by === 'guest' ? 'a vendég (e-mailes link)' : 'admin'], ['Státusz', b.status], ['Visszatérítés', b.refund_huf != null ? `${ft(b.refund_huf)} (${b.refund_percent}%)` : 'még nincs'], ['Teendő', note]]);
  await mail(app, { to: staffAddress(app), subject: `After Hours lemondás: ${b.date} · ${b.name} (${b.id})`, title: 'Bros After Hours lemondás', html: s.html, text: s.text });
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
async function refundCancelled(app: App, b: Doc, percent: number) {
  const amount = Math.round((b.amount_huf * percent) / 100);
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
  await app.db.d1.prepare("UPDATE ah_bookings SET status = 'refunded', refund_huf = ?, refund_percent = ? WHERE id = ? AND status = 'cancelled'").bind(amount, percent, b.id).run();
  // ACCOUNTANT: a full refund cancels the invoice (storno); how a 50 % refund is invoiced is open, so that one is left to staff.
  if (percent === 100) await szamlazz.stornoFor(app, 'ah_bookings', b.id, b.invoice_no, b.email);
  return amount;
}
const invoiceTodo = (b: Doc, percent: number) =>
  !b.invoice_no ? 'Számla nem volt kiállítva.' : percent === 100 ? 'A számlát sztornóztuk (ellenőrizd a Számlázz.hu-ban).' : percent > 0 ? 'RÉSZLEGES visszatérítés: a számla helyesbítését kézzel kell elvégezni (könyvelő).' : 'Nincs visszatérítés, a számla marad.';

async function byToken(app: App, token: string) {
  const dot = token.lastIndexOf('.'), id = token.slice(0, dot), sig = token.slice(dot + 1);
  if (dot < 1 || !/^AH-\d+$/.test(id)) throw new ApiError(404, 'not_found');
  const b = await get(app, id);
  if (!b || !safeEqual(sig, await sign(app, b.id + b.cancel_token))) throw new ApiError(404, 'not_found');
  return b;
}
const cancelView = (b: Doc, percent: number) => ({
  booking: { id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, name: b.name, amount: b.amount_huf, status: b.status, tier: b.tier, lines: pkgOf(b).lines },
  refund_percent: percent, refund_huf: Math.round((b.amount_huf * percent) / 100),
});

/** GET: changes nothing, so a mail scanner following the link cannot cancel. */
export async function cancelInfo(app: App, token: string) {
  const b = await byToken(app, token);
  if (b.status !== 'paid' || instant(app, b.date, b.start_time).getTime() <= Date.now()) throw new ApiError(410, 'gone');
  return cancelView(b, refundPercent(app, b));
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
  return { ...cancelView(fresh, percent), refund_pending: fresh.status === 'cancelled' };
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

export async function adminRefund(app: App, id: string, percent: unknown) {
  const b = await get(app, id);
  if (!b) throw new ApiError(404, 'not_found');
  if (b.status !== 'cancelled') throw new ApiError(409, 'not_cancelled');
  // default: what the terms gave at the moment of cancelling, not now
  const pct = percent === undefined || percent === null ? refundPercent(app, b, b.cancelled_at ? parseIso(b.cancelled_at) : new Date()) : Number(percent);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw invalid(['percent']);
  await refundCancelled(app, b, pct);
  const fresh = (await get(app, id))!;
  app.later(sendCancelled(app, fresh, 'staff', invoiceTodo(b, pct)));
  return view(fresh);
}
