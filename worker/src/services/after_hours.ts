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
/** The offer. The page's CONFIG mirrors it; the amounts are DRAFT until Daniel confirms (docs/after-hours.md). */
const offer = (env: Env) => ({
  base: num(env, 'AH_BASE_HUF', 14900),            // 2–6 people, 2 hours
  extraGuest: num(env, 'AH_EXTRA_GUEST_HUF', 1990), // DRAFT: per person 7–12
  extraHour: num(env, 'AH_EXTRA_HOUR_HUF', 5900),   // DRAFT: per hour above 2
  minGuests: 2, baseGuests: 6, maxGuests: 12, baseHours: 2, maxHours: 4,
  open: '18:00', close: '22:00', lastStart: '20:00', startStep: 30,
  launch: String(env.AH_LAUNCH_DATE ?? '2026-12-01'), noticeDays: 3, windowMonths: 3,
  closedDays: ['12-24', '12-25', '12-26', '12-31', '01-01'], // blocked every year unless the admin opens the day
  packages: ['food1', 'food2', 'food3'], // the three food selections (contents TBD, paid on site)
});
/** Voucher codes: percent off the BASE fee only (not the surcharges). Keys upper-case. */
const VOUCHERS: Record<string, { percent: number }> = { AFTER25: { percent: 25 } };
const PATHS = ['/after-hours/'];

const price = (env: Env, guests: number, hours: number) => {
  const o = offer(env);
  return o.base + o.extraGuest * Math.max(0, guests - o.baseGuests) + o.extraHour * Math.max(0, hours - o.baseHours);
};

/** Case-insensitive, trimmed. null = no such code. The discount is a share of the base fee only. */
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
  return {
    id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, tier: b.tier, name: b.name, email: b.email, phone: b.phone,
    billing: { zip: b.zip, city: b.city, street: b.street, company: b.company ?? '', tax_number: b.tax_number ?? '' },
    occasion: b.occasion ?? '', note: b.note ?? '', packages: JSON.parse(b.packages || '[]'), cake: !!b.cake, voucher_code: b.voucher_code ?? null, discount: b.discount_huf ?? 0, status: b.status, amount: b.amount_huf,
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
    packages: Array.isArray(b.packages) ? b.packages.filter((p: unknown) => o.packages.includes(p as string)) : [],
  };
  need(validDate(v.date), 'date');
  const startOk = /^\d\d:\d\d$/.test(v.start) && mins(v.start) >= mins(o.open) && mins(v.start) <= mins(o.lastStart) && (mins(v.start) - mins(o.open)) % o.startStep === 0;
  need(startOk, 'start');
  need(Number.isInteger(v.hours) && v.hours >= o.baseHours && v.hours <= o.maxHours && startOk && mins(v.start) + v.hours * 60 <= mins(o.close), 'hours');
  need(Number.isInteger(v.guests) && v.guests >= o.minGuests && v.guests <= o.maxGuests, 'guests');
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

  const id = await nextId(app, 'AH'), discount = vch?.discount ?? 0, amount = price(app.env, v.guests, v.hours) - discount, lang = langOf(b.lang), path = returnPath(b.return_path, PATHS, PATHS[0]);
  try {
    await app.db.d1.prepare(
      `INSERT INTO ah_bookings (id, date, status, hold_expires, start_time, hours, guests, tier, amount_huf, cancel_token, name, email, phone, zip, city, street,
        company, tax_number, occasion, note, packages, cake, voucher_code, discount_huf, lang, return_path, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.date, isoAt(new Date(Date.now() + stripe.HOLD_MIN * 60_000)), v.start, v.hours, v.guests, amount, tokenUrlsafe(24), v.name, v.email, v.phone, v.zip, v.city, v.street,
      v.company || null, v.tax || null, v.occasion || null, v.note || null, JSON.stringify(v.packages), v.cake ? 1 : 0, vch?.code ?? null, discount, lang, path, nowIso()).run();
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new ApiError(409, 'day_taken'); // ah_one_per_day: someone else holds or has the evening
    throw e;
  }
  try {
    const end = hm(mins(v.start) + v.hours * 60);
    const session = await stripe.createCheckout(app, {
      kind: 'ah', ref: id, email: v.email, lang,
      lines: [{ name: `Bros After Hours · ${v.date} ${v.start}–${end} · ${v.guests} ${lang === 'en' ? 'guests' : 'fő'}${vch ? ` (${vch.code} −${vch.percent}%)` : ''}`, amountHuf: amount }], // Stripe has no negative lines: the discount is already inside the one amount
      description: `Bros After Hours ${id} · ${v.date} ${v.start}–${end}`,
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
  const cfg = szamlazz.config(app.env), end = hm(mins(b.start_time) + b.hours * 60), en = b.lang === 'en';
  return {
    ref: b.id, type: cfg.ahInvoiceType, lang: b.lang,
    buyer: { name: b.company || b.name, zip: b.zip, city: b.city, street: b.street, email: b.email, taxNumber: b.tax_number },
    lines: [{ name: `Bros After Hours ${cfg.ahInvoiceType === 'elolegszamla' ? 'előleg' : 'privát este'} · ${b.date} ${b.start_time}–${end} · ${b.guests} fő${b.voucher_code ? ` (${b.voucher_code} kupon)` : ''}`, quantity: 1, grossHuf: b.amount_huf, vat: cfg.ahVat }],
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
function details(b: Doc, en: boolean) {
  const end = hm(mins(b.start_time) + b.hours * 60);
  return rows([
    [en ? 'Booking' : 'Azonosító', b.id], [en ? 'Date' : 'Dátum', b.date], [en ? 'Time' : 'Időpont', `${b.start_time}–${end}`],
    [en ? 'Guests' : 'Vendégszám', b.guests], ...(b.voucher_code ? [[en ? 'Voucher' : 'Kuponkód', `${b.voucher_code} (−${ft(b.discount_huf)})`] as [string, string]] : []), [en ? 'Deposit paid' : 'Kifizetett előleg', ft(b.amount_huf)],
  ]);
}
function staffDetails(b: Doc, extra: [string, string | number | null][] = []) {
  return rows([
    ['Azonosító', b.id], ['Dátum', b.date], ['Időpont', `${b.start_time}–${hm(mins(b.start_time) + b.hours * 60)}`], ['Vendégszám', b.guests], ['Előleg', ft(b.amount_huf)],
    ['Név', b.name], ['E-mail', b.email], ['Telefon', b.phone], ['Számlázás', `${b.company ? `${b.company} (${b.tax_number ?? '–'}), ` : ''}${b.zip} ${b.city}, ${b.street}`],
    ['Alkalom', b.occasion], ['Ételválogatás (helyszínen fizetendő)', JSON.parse(b.packages || '[]').join(', ')], ['Ünnepi torta (helyszínen fizetendő)', b.cake ? 'IGEN, kérnek tortát' : 'nem'], ['Kuponkód', b.voucher_code ? `${b.voucher_code} (−${ft(b.discount_huf)})` : null], ['Megjegyzés', b.note], ...extra,
  ]);
}

async function sendConfirmation(app: App, b: Doc, invoiceNo: string | null) {
  const en = b.lang === 'en', d = details(b, en), link = await cancelLink(app, b);
  const intro = en ? 'Your private evening at Bros Cafe is booked. The invoice arrives in a separate email from Számlázz.hu.'
    : 'A privát estétek a Bros Caféban le van foglalva. A számlát külön e-mailben küldi a Számlázz.hu.';
  const terms = en ? 'Cancellation: full refund 7 or more days before, 50% until 48 hours before, none after. Food, cake and extras are paid on the evening.'
    : 'Lemondás: legalább 7 nappal előtte a teljes előleg, 48 órával előttig a fele jár vissza, azután már nem tudunk visszatéríteni. Az ételeket, a tortát és az extrákat a helyszínen fizetitek.';
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
  booking: { id: b.id, date: b.date, start: b.start_time, hours: b.hours, guests: b.guests, name: b.name, amount: b.amount_huf, status: b.status },
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
