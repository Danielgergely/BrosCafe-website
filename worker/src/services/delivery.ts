// Bros Delivery: timed and rush orders to nearby offices. Spec docs/delivery.md, contract docs/delivery-api.md.
// Prices, the fee and capacity are always computed here, never taken from the request.
import type { App } from '../http';
import type { Doc } from '../db';
import { settings } from '../config';
import { isoAt, nowIso, parseIso, tokenUrlsafe } from '../util';
import {
  ApiError, EMAIL, TAX, ZIP, addDays, assertBookingsOpen, bookingsOpen, esc, ft, instant, invalid, iso, lang as langOf, mail, nextId, returnPath, rows, safeEqual, sign, siteUrl,
  staffAddress, text, today, validDate, weekday, card, fine, hero, listCard, longDate, para, priceCard,
} from './bookings';
import { earnsStamp } from './drinks';
import * as emailService from './email';
import * as members from './members';
import * as tiers from './tiers';
import { notifyUpdate } from './wallet';
import * as stripe from './stripe';
import * as szamlazz from './szamlazz';
import * as zone from './zone';

// ---- config (DRAFT defaults; the editable part lives in dl_settings / dl_slots) ----
const CATS = ['coffee', 'specialty', 'tea', 'smoothie', 'bottled']; // every drink (Daniel 2026-11-17)
/** Hungarian public holidays: never delivery days. Extend each year (the same list as CONFIG.holidays on the page). */
const HOLIDAYS = ['2026-12-25', '2026-12-26', '2027-01-01', '2027-03-15', '2027-03-26', '2027-03-29', '2027-05-01', '2027-05-17', '2027-08-20', '2027-10-23', '2027-11-01', '2027-12-25', '2027-12-26'];
const RUSH_AUTO_OFF_MIN = 45;
const RUSH_ANSWER_MIN = 10; // a rush request nobody answers is declined (and the card released) after this
const SLOT_HOURS = ['07:30', '18:00'];
const DAYS_AHEAD_MAX = 10;
const MAX_CUPS = 40;
const GROUP_FEE_RULE = 'organiser'; // the organiser pays the fee up front; refunded when the group reaches free_from paid cups
const RECURRING_FROM_HOUR = 18; // the evening before: tomorrow's recurring orders are prepared from this hour
const MILKS: Record<string, string> = { Oat: 'Zabtej', CoconutRice: 'Kókusz-rizs tej', Pea: 'Borsótej' };
// DRAFT 2026-11-19: free extras and the drinks that offer them (decaf: every espresso drink; cream: on request, catalogue)
const EXTRAS: Record<string, { label: string; ids: string[] }> = {
  decaf: { label: 'koffeinmentes', ids: ['espresso', 'double-espresso', 'espresso-macchiato', 'americano', 'cortado', 'flat-white', 'cappuccino', 'latte', 'pistachio-latte', 'caramel-latte', 'pumpkin-spice-latte', 'espresso-tonic'] },
  cream: { label: 'tejszínhabbal', ids: ['belgian-hot-chocolate'] },
};
const extrasView = () => Object.fromEntries(Object.entries(EXTRAS).map(([k, v]) => [k, v.ids]));
const CAFE_ADDRESS = 'Csanády u. 4/b';
const PATHS = ['/delivery/', '/delivery/csoport/'];
const BOARD = ['new', 'making', 'out', 'delivered'];

const d1 = (app: App) => app.db.d1;
const all = async <T = Doc>(q: D1PreparedStatement) => (await q.all<T>()).results;

interface Settings { rush_until: string | null; days: number[]; free_from: number; fee_huf: number; rush_max: number; rush_eta_min: number }
interface Slot { id: string; time: string; cutoff_min: number; capacity: number; active: number }
async function readSettings(app: App): Promise<Settings> {
  const r = (await d1(app).prepare('SELECT * FROM dl_settings WHERE id = 1').first<Doc>()) ?? { days: '[1,2,3,4,5]', free_from: 5, fee_huf: 490, rush_max: 8, rush_eta_min: 30, rush_until: null };
  return { rush_until: r.rush_until, days: JSON.parse(r.days), free_from: r.free_from, fee_huf: r.fee_huf, rush_max: r.rush_max, rush_eta_min: r.rush_eta_min };
}
const activeSlots = (app: App) => all<Slot>(d1(app).prepare('SELECT * FROM dl_slots WHERE active = 1 ORDER BY time'));
const rushOn = (s: Settings) => !!s.rush_until && s.rush_until > nowIso();
const rushView = (s: Settings) => ({ on: rushOn(s), until: rushOn(s) ? iso(s.rush_until) : null, max_drinks: s.rush_max, eta_min: s.rush_eta_min });
const deliveryDay = (s: Settings, date: string) => s.days.includes(weekday(date)) && !HOLIDAYS.includes(date);
const feeFor = (s: Settings, cups: number) => (cups >= s.free_from ? 0 : s.fee_huf);

// Cups that take a slot's capacity: paid, or held by a payment in progress.
const TAKEN = "o.status NOT IN ('cancelled', 'expired') AND (p.status = 'paid' OR (p.status = 'pending' AND p.hold_expires > ?))";
const CUPS_IN_SLOT = `(SELECT COUNT(*) FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id JOIN dl_orders o ON o.id = i.order_id WHERE o.date = ? AND o.slot_id = ? AND ${TAKEN})`;
async function booked(app: App, from: string, to: string) {
  const r = await all<{ date: string; slot: string | null; n: number }>(d1(app).prepare(
    `SELECT o.date AS date, o.slot_id AS slot, COUNT(*) AS n FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id JOIN dl_orders o ON o.id = i.order_id
     WHERE o.date BETWEEN ? AND ? AND ${TAKEN} GROUP BY o.date, o.slot_id`).bind(from, to, nowIso()));
  return new Map(r.map((x) => [`${x.date}|${x.slot ?? 'rush'}`, x.n]));
}
async function closedSlots(app: App, from: string, to: string) {
  const r = await all<{ date: string; slot_id: string }>(d1(app).prepare('SELECT date, slot_id FROM dl_day_slots WHERE closed = 1 AND date BETWEEN ? AND ?').bind(from, to));
  return new Set(r.map((x) => `${x.date}|${x.slot_id}`));
}
function slotInfo(app: App, date: string, s: Slot, taken: Map<string, number>, closed: Set<string>) {
  const cutoff = new Date(instant(app, date, s.time).getTime() - s.cutoff_min * 60_000), n = taken.get(`${date}|${s.id}`) ?? 0, left = Math.max(0, s.capacity - n);
  const status = closed.has(`${date}|${s.id}`) ? 'closed' : Date.now() >= cutoff.getTime() ? 'past' : left <= 0 ? 'full' : 'open';
  return { id: s.id, time: s.time, cutoff_min: s.cutoff_min, cutoff_at: cutoff.toISOString(), capacity: s.capacity, left, status, drinks: n };
}

// ---- housekeeping: runs from the cron and before the reads that depend on it ----
export async function sweep(app: App) {
  const now = nowIso();
  await d1(app).batch([
    d1(app).prepare("UPDATE dl_payers SET status = 'expired' WHERE status = 'pending' AND hold_expires < ?").bind(now),
    d1(app).prepare("UPDATE dl_orders SET status = 'expired' WHERE kind = 'company' AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM dl_payers p WHERE p.order_id = dl_orders.id AND p.status IN ('pending', 'paid'))"),
  ]);
  const due = await all(d1(app).prepare("SELECT * FROM dl_orders WHERE kind = 'group' AND status = 'open' AND cutoff_at <= ? LIMIT 20").bind(now));
  for (const o of due) await lockGroup(app, o);
  const unanswered = await all(d1(app).prepare("SELECT * FROM dl_orders WHERE status = 'requested' AND answer_by <= ? LIMIT 10").bind(now));
  for (const o of unanswered) await declineRush(app, o, 'timeout');
}

// ---- public reads ----
export async function slots(app: App, daysParam: unknown) {
  await sweep(app);
  const n = Math.min(DAYS_AHEAD_MAX, Math.max(1, Number(daysParam) || 5));
  const [s, list] = await Promise.all([readSettings(app), activeSlots(app)]);
  const start = today(app).date, end = addDays(start, 40);
  const [taken, closed] = await Promise.all([booked(app, start, end), closedSlots(app, start, end)]);
  const days = [];
  for (let i = 0; i < 40 && days.length < n; i++) {
    const date = addDays(start, i);
    if (!deliveryDay(s, date)) continue;
    const infos = list.map((x) => slotInfo(app, date, x, taken, closed)).map(({ drinks: _d, ...rest }) => rest);
    if (infos.length && infos.every((x) => x.status === 'past')) continue; // today, after its last cutoff
    days.push({ date, slots: infos });
  }
  return { free_from: s.free_from, fee: s.fee_huf, zone_m: zone.radius(app), rush: rushView(s), days, extras: extrasView(), payments_ready: stripe.ready(app.env), bookings_open: bookingsOpen(app) };
}

// ---- pricing from the catalogue ----
interface Cup { product_id: string; cat: string; label: string; who: string; milk: string | null; size: number | null; iced: number; extras: string | null; note: string | null; price: number }
const nice = (v: string) => (v && v === v.toUpperCase() ? v.charAt(0) + v.slice(1).toLocaleLowerCase('hu') : v || '');
async function priceCups(app: App, items: unknown): Promise<Cup[]> {
  if (!Array.isArray(items) || !items.length || items.length > MAX_CUPS) throw invalid(['items']);
  const ids = [...new Set(items.map((i) => String(i?.product_id ?? '')))];
  const products = new Map((await app.db.products.find({ id: { $in: ids }, active: { $ne: false }, cat: { $in: CATS } }, { limit: 200 })).map((p) => [p.id as string, p]));
  return items.map((i) => {
    const p = products.get(String(i?.product_id ?? ''));
    if (!p) throw invalid(['items']);
    // "3 dl — 1 490 Ft": a size without its own price costs the product's price
    const sizes = ((p.sizes?.hu ?? []) as string[]).map((s) => { const [label, pr] = s.split('—'); return { label: label.trim(), price: Number((pr ?? '').replace(/\D/g, '')) || p.price_huf }; });
    const size = sizes.length ? sizes[Number.isInteger(i.size) && sizes[i.size] ? i.size : 0] : null;
    const milk = typeof i.milk === 'string' && (p.milks ?? []).includes(i.milk) ? i.milk : null;
    const iced = p.temp === 'both' && i.iced === true;
    const extras = Object.keys(EXTRAS).filter((k) => i[k] === true && EXTRAS[k].ids.includes(p.id));
    const price = size ? size.price : p.price_huf;
    if (!Number.isInteger(price) || price <= 0) throw invalid(['items']);
    return {
      product_id: p.id, cat: p.cat, who: text(i.who, 60), milk, size: size ? sizes.indexOf(size) : null, iced: iced ? 1 : 0, price,
      extras: extras.join(',') || null, note: text(i.note, 80) || null,
      label: [nice(p.name?.hu ?? p.id), size?.label, milk && (MILKS[milk] ?? milk), iced && 'jeges', ...extras.map((k) => EXTRAS[k].label)].filter(Boolean).join(' · '),
    };
  });
}
const sum = (cups: { price: number }[]) => cups.reduce((n, c) => n + c.price, 0);
/** A stored cup as an order request again (recurring orders, "order again"). */
export const itemRequest = (i: Doc) => ({
  product_id: i.product_id, who: i.who ?? '', milk: i.milk ?? '', size: i.size ?? 0, iced: !!i.iced, note: i.note ?? '',
  ...Object.fromEntries(Object.keys(EXTRAS).map((k) => [k, String(i.extras ?? '').split(',').includes(k)])),
});

// ---- creating orders ----
interface Party { name: string; email: string; loyaltyEmail?: string | null; invoice?: { name: string; tax: string | null; zip: string; city: string; street: string } | null }
interface Place {
  kind: 'company' | 'group'; pickup: boolean; date: string; slot: Slot | null; cups: Cup[]; lang: string; path: string;
  address: { company: string; street: string; floor: string; note: string }; contact: { name: string; email: string; phone: string };
  payer: Party; recurringId?: string | null; payBy?: Date;
}

function checkParty(b: Doc, bad: string[], opts: { invoice: 'required' | 'optional' }): Party {
  const inv = b.invoice && typeof b.invoice === 'object' ? b.invoice : null;
  const name = text(b.name, 120), email = text(b.email, 200), loyalty = text(b.loyalty_email, 200).toLowerCase();
  if (name.length < 2) bad.push('name');
  if (!EMAIL.test(email)) bad.push('email');
  if (loyalty && !EMAIL.test(loyalty)) bad.push('loyalty_email');
  let invoice: Party['invoice'] = null;
  if (inv || opts.invoice === 'required') {
    const v = { name: text(inv?.name, 160), tax: text(inv?.tax_number, 13) || null, zip: text(inv?.zip, 4), city: text(inv?.city, 80), street: text(inv?.street, 160) };
    if (v.name.length < 2) bad.push('inv_name');
    if (opts.invoice === 'required' ? !TAX.test(v.tax ?? '') : !!v.tax && !TAX.test(v.tax)) bad.push('tax_number');
    if (!ZIP.test(v.zip)) bad.push('zip'); // Hungary only
    if (v.city.length < 2) bad.push('city');
    if (v.street.length < 4) bad.push('inv_street');
    invoice = v;
  }
  return { name, email, loyaltyEmail: loyalty || null, invoice };
}

/** Validates a company or organiser request body up to the slot. */
async function readOrder(app: App, b: Doc, kind: 'company' | 'group'): Promise<Place> {
  const bad: string[] = [], a = b.address ?? {}, c = b.contact ?? {}, pickup = b.pickup === true;
  // pickup: made for the chosen time and collected at the counter; no address, no zone, no fee, invoice on request
  const address = pickup ? { company: '', street: '', floor: '', note: text(a.note, 500) }
    : { company: text(a.company, 160), street: text(a.street, 160), floor: text(a.floor, 80), note: text(a.note, 500) };
  const contact = { name: text(c.name, 120), email: text(c.email, 200), phone: text(c.phone, 40) };
  if (pickup && kind === 'group') bad.push('pickup');
  if (!pickup && address.company.length < 2) bad.push('company');
  if (!pickup && address.street.length < 4) bad.push('street');
  if (!pickup && address.floor.length < 1) bad.push('floor');
  if (contact.phone.replace(/\D/g, '').length < 7) bad.push('phone');
  const payer = checkParty({ ...contact, invoice: b.invoice }, bad, { invoice: kind === 'company' && !pickup ? 'required' : 'optional' });
  if (b.terms !== true) bad.push('terms');
  const rush = b.rush === true;
  if ((kind === 'group' || pickup) && rush) bad.push('slot');
  if (!rush && !validDate(b.date)) bad.push('date');
  if (bad.length) throw invalid(bad);
  const cups = await priceCups(app, b.items);
  if (cups.some((c) => !c.who)) throw invalid(['who']); // the barista writes it on the cup
  // only a house the map places outside the radius is refused; an unknown address is confirmed by hand
  if (!pickup && (await zone.check(app, address.street, a.postcode)).status === 'out_of_zone') throw new ApiError(409, 'out_of_zone', { fields: ['street'] });
  if (!stripe.ready(app.env)) throw new ApiError(503, 'payments_not_configured');

  await sweep(app);
  const s = await readSettings(app), now = today(app).date;
  let slot: Slot | null = null;
  const date = rush ? now : (b.date as string);
  if (rush) {
    if (!rushOn(s)) throw new ApiError(409, 'rush_off');
    if (cups.length > s.rush_max) throw new ApiError(409, 'slot_full', { left: s.rush_max });
  } else {
    slot = (await d1(app).prepare('SELECT * FROM dl_slots WHERE id = ? AND active = 1').bind(String(b.slot_id ?? '')).first<Slot>()) ?? null;
    if (!slot || date < now || date > addDays(now, 40) || !deliveryDay(s, date)) throw new ApiError(409, 'slot_closed');
    const info = slotInfo(app, date, slot, await booked(app, date, date), await closedSlots(app, date, date));
    if (info.status === 'closed' || info.status === 'past') throw new ApiError(409, 'slot_closed');
    if (info.left < cups.length) throw new ApiError(409, 'slot_full', { left: info.left });
  }
  return { kind, pickup, date, slot, cups, lang: langOf(b.lang), path: returnPath(b.return_path, [PATHS[0]], PATHS[0]), address, contact, payer };
}

const cutoffOf = (app: App, date: string, slot: Slot) => new Date(instant(app, date, slot.time).getTime() - slot.cutoff_min * 60_000);
const groupCode = () => { const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => abc[b % abc.length]).join(''); };

function payerInsert(app: App, o: { id: string; orderId: string; party: Party; organiser: boolean; amount: number; fee: number; lang: string; path: string; holdUntil: Date }, where: string, whereArgs: unknown[]) {
  const p = o.party, inv = p.invoice;
  return d1(app).prepare(
    `INSERT INTO dl_payers (id, order_id, name, email, loyalty_email, inv_name, tax_number, zip, city, inv_street, organiser, status, hold_expires, amount_huf, fee_huf, lang, return_path, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ? WHERE ${where}`,
  ).bind(o.id, o.orderId, p.name, p.email, p.loyaltyEmail ?? null, inv?.name ?? null, inv?.tax ?? null, inv?.zip ?? null, inv?.city ?? null, inv?.street ?? null, o.organiser ? 1 : 0,
    isoAt(o.holdUntil), o.amount, o.fee, o.lang, o.path, nowIso(), ...whereArgs);
}
const itemInserts = (app: App, orderId: string, payerId: string, cups: Cup[]) => cups.map((c) => d1(app).prepare(
  `INSERT INTO dl_items (order_id, payer_id, product_id, cat, label, who, milk, size, iced, extras, note, price_huf) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM dl_payers WHERE id = ?)`,
).bind(orderId, payerId, c.product_id, c.cat, c.label, c.who || null, c.milk, c.size, c.iced, c.extras, c.note, c.price, payerId));

/** One Checkout session for one payer; on failure the hold is released. */
async function checkout(app: App, o: { payerId: string; orderId: string; cups: Cup[]; fee: number; email: string; lang: string; success: string; cancel: string; expiresAt?: Date; what: string; authorizeOnly?: boolean }) {
  try {
    const lines = o.cups.map((c) => ({ name: c.label, amountHuf: c.price }));
    if (o.fee) lines.push({ name: o.lang === 'en' ? 'Delivery fee' : 'Kiszállítási díj', amountHuf: o.fee });
    const session = await stripe.createCheckout(app, { kind: 'dl', ref: o.payerId, lines, email: o.email, lang: o.lang, description: `Bros Delivery ${o.orderId} · ${o.what}`, successUrl: o.success, cancelUrl: o.cancel, expiresAt: o.expiresAt, authorizeOnly: o.authorizeOnly });
    await d1(app).prepare('UPDATE dl_payers SET stripe_session = ? WHERE id = ?').bind(session.id, o.payerId).run();
    return session.url;
  } catch (e) {
    console.error(`Checkout for ${o.payerId} failed`, e);
    await d1(app).prepare("UPDATE dl_payers SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(o.payerId).run();
    await d1(app).prepare("UPDATE dl_orders SET status = 'expired' WHERE id = ? AND kind = 'company' AND status = 'pending'").bind(o.orderId).run();
    throw new ApiError(502, 'payment_unavailable');
  }
}

/** Inserts order + payer + cups in one batch; the order row is only written while the slot still has room. */
async function place(app: App, v: Place) {
  const s = await readSettings(app), orderId = await nextId(app, 'BD'), payerId = `${orderId}-${tokenUrlsafe(6)}`, code = v.kind === 'group' ? groupCode() : null;
  const fee = v.pickup ? 0 : feeFor(s, v.cups.length); // company: below free_from; group: the organiser carries it until the group reaches free_from
  const cutoff = v.slot ? cutoffOf(app, v.date, v.slot) : null;
  const sessionEnd = v.payBy ?? new Date(Date.now() + stripe.SESSION_MIN * 60_000), holdUntil = new Date(sessionEnd.getTime() + 2 * 60_000);
  const capacity = v.slot ? `${CUPS_IN_SLOT} + ? <= ?` : '1 = 1';
  const capArgs = v.slot ? [v.date, v.slot.id, nowIso(), v.cups.length, v.slot.capacity] : [];
  const res = await d1(app).batch([
    d1(app).prepare(
      `INSERT INTO dl_orders (id, kind, pickup, group_code, date, slot_id, rush, slot_time, cutoff_at, status, company, street, floor, note, contact_name, contact_email, contact_phone, fee_huf, recurring_id, lang, return_path, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${capacity}`,
    ).bind(orderId, v.kind, v.pickup ? 1 : 0, code, v.date, v.slot?.id ?? null, v.slot ? 0 : 1, v.slot?.time ?? null, cutoff ? isoAt(cutoff) : null, v.kind === 'group' ? 'open' : 'pending',
      v.address.company, v.address.street, v.address.floor, v.address.note || null, v.contact.name, v.contact.email, v.contact.phone, fee, v.recurringId ?? null, v.lang, v.path, nowIso(), ...capArgs),
    payerInsert(app, { id: payerId, orderId, party: v.payer, organiser: v.kind === 'group', amount: sum(v.cups) + fee, fee, lang: v.lang, path: v.path, holdUntil }, 'EXISTS (SELECT 1 FROM dl_orders WHERE id = ?)', [orderId]),
    ...itemInserts(app, orderId, payerId, v.cups),
  ]);
  if (!res[0].meta.changes) {
    const left = Math.max(0, v.slot!.capacity - ((await booked(app, v.date, v.date)).get(`${v.date}|${v.slot!.id}`) ?? 0));
    throw new ApiError(409, 'slot_full', { left });
  }
  const groupPath = `${v.path}csoport/`;
  const url = await checkout(app, {
    payerId, orderId, cups: v.cups, fee, email: v.payer.email, lang: v.lang, expiresAt: v.payBy, authorizeOnly: !v.slot, what: `${v.date} ${v.slot?.time ?? 'rush'} · ${v.pickup ? 'elvitel' : v.address.company}`,
    success: siteUrl(app, code ? `${groupPath}?g=${code}&paid=1&o=${await orgToken(app, orderId)}` : `${v.path}?order=${orderId}&paid=1&t=${await sign(app, `rec${orderId}`)}`),
    cancel: siteUrl(app, code ? `${groupPath}?g=${code}&cancelled=1` : `${v.path}?cancelled=1`),
  });
  return { orderId, code, checkout_url: url, url: code ? siteUrl(app, `${groupPath}?g=${code}`) : null };
}

export async function createOrder(app: App, b: Doc) {
  assertBookingsOpen(app);
  const r = await place(app, await readOrder(app, b, 'company'));
  return { checkout_url: r.checkout_url };
}
export async function createGroup(app: App, b: Doc) {
  assertBookingsOpen(app);
  const r = await place(app, await readOrder(app, b, 'group'));
  return { code: r.code, url: r.url, checkout_url: r.checkout_url };
}

const orderByCode = (app: App, code: string) => d1(app).prepare("SELECT * FROM dl_orders WHERE group_code = ? AND kind = 'group'").bind(code.toUpperCase()).first<Doc>();
const paidCups = async (app: App, orderId: string) =>
  (await d1(app).prepare("SELECT COUNT(*) AS n FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id WHERE i.order_id = ? AND p.status = 'paid'").bind(orderId).first<{ n: number }>())?.n ?? 0;

export async function groupView(app: App, code: string) {
  await sweep(app);
  const o = await orderByCode(app, code);
  if (!o) throw new ApiError(404, 'not_found');
  const s = await readSettings(app);
  const rowsOf = await all<{ id: string; name: string; status: string; label: string }>(d1(app).prepare(
    "SELECT p.id, p.name, p.status, i.label FROM dl_payers p JOIN dl_items i ON i.payer_id = p.id WHERE p.order_id = ? AND (p.status = 'paid' OR (p.status = 'pending' AND p.hold_expires > ?)) ORDER BY p.created_at, i.id").bind(o.id, nowIso()));
  const people = new Map<string, { name: string; paid: boolean; items: string[] }>();
  for (const r of rowsOf) (people.get(r.id) ?? people.set(r.id, { name: r.name, paid: r.status === 'paid', items: [] }).get(r.id)!).items.push(r.label);
  const participants = [...people.values()], drinks = participants.reduce((n, p) => n + (p.paid ? p.items.length : 0), 0);
  return {
    code: o.group_code, status: o.status === 'open' ? 'open' : 'locked', closed_early: !!(o.locked_at && o.cutoff_at && o.locked_at < o.cutoff_at), date: o.date, time: o.slot_time, cutoff_at: iso(o.cutoff_at), company: o.company,
    address: { street: o.street, floor: o.floor }, organiser: o.contact_name, drinks, free_from: s.free_from, fee: s.fee_huf, fee_due: feeFor(s, drinks), fee_rule: GROUP_FEE_RULE, participants, extras: extrasView(),
    payments_ready: stripe.ready(app.env), bookings_open: bookingsOpen(app),
  };
}

export async function joinGroup(app: App, code: string, b: Doc) {
  assertBookingsOpen(app);
  const bad: string[] = [];
  const party = checkParty(b, bad, { invoice: 'optional' });
  if (b.terms !== true) bad.push('terms');
  if (bad.length) throw invalid(bad);
  const cups = await priceCups(app, b.items);
  if (!stripe.ready(app.env)) throw new ApiError(503, 'payments_not_configured');
  await sweep(app);
  const o = await orderByCode(app, code);
  if (!o) throw new ApiError(404, 'not_found');
  if (o.status !== 'open') throw new ApiError(409, 'locked');
  const slot = await d1(app).prepare('SELECT * FROM dl_slots WHERE id = ?').bind(o.slot_id).first<Slot>();
  const capacity = slot?.capacity ?? 0, payerId = `${o.id}-${tokenUrlsafe(6)}`, lang = langOf(b.lang), path = returnPath(b.return_path, [PATHS[1]], `${o.return_path}csoport/`);
  const res = await d1(app).batch([
    payerInsert(app, { id: payerId, orderId: o.id, party, organiser: false, amount: sum(cups), fee: 0, lang, path, holdUntil: new Date(Date.now() + stripe.HOLD_MIN * 60_000) },
      `${CUPS_IN_SLOT} + ? <= ? AND EXISTS (SELECT 1 FROM dl_orders WHERE id = ? AND status = 'open')`, [o.date, o.slot_id, nowIso(), cups.length, capacity, o.id]),
    ...itemInserts(app, o.id, payerId, cups),
  ]);
  if (!res[0].meta.changes) {
    const left = Math.max(0, capacity - ((await booked(app, o.date, o.date)).get(`${o.date}|${o.slot_id}`) ?? 0));
    throw new ApiError(409, 'slot_full', { left });
  }
  const url = await checkout(app, {
    payerId, orderId: o.id, cups, fee: 0, email: party.email, lang, what: `${o.date} ${o.slot_time} · ${o.company}`,
    success: siteUrl(app, `${path}?g=${o.group_code}&paid=1`), cancel: siteUrl(app, `${path}?g=${o.group_code}&cancelled=1`),
  });
  return { checkout_url: url };
}

// ---- invoices ----
async function itemsOf(app: App, payerId: string) {
  return all<Doc>(d1(app).prepare('SELECT * FROM dl_items WHERE payer_id = ? ORDER BY id').bind(payerId));
}
// Accountant 2026-11-18: drinks and fee 27 %. A private payer who asks for no invoice is rung into the till (Fruitsys)
// by staff from the counter email instead (invoice_error = 'pos').
const wantsInvoice = (p: Doc) => !!(p.zip && p.city && p.inv_street);
const FEE_LINE = 'Kiszállítási díj';
function invoiceOf(app: App, p: Doc, o: Doc, items: Doc[], type: szamlazz.Kind = 'szamla', extra: Partial<szamlazz.Invoice> = {}): szamlazz.Invoice {
  const cfg = szamlazz.config(app.env), en = p.lang === 'en', grouped = new Map<string, szamlazz.Line>();
  for (const i of items) {
    const k = `${i.label}|${i.price_huf}`;
    grouped.set(k, { name: i.label, quantity: (grouped.get(k)?.quantity ?? 0) + 1, grossHuf: i.price_huf, vat: cfg.dlDrinkVat });
  }
  const lines = [...grouped.values()];
  if (p.fee_huf > 0) lines.push({ name: FEE_LINE, quantity: 1, grossHuf: p.fee_huf, vat: cfg.dlFeeVat });
  const what = type === 'helyesbito' ? ['helyesbítő számla', 'A helyesbítő számlát', 'correcting invoice'] : ['számla', 'A számlát', 'invoice'];
  return {
    ref: p.id, order: p.id, type, lang: p.lang, lines, comment: `Bros Cafe · Bros Delivery ${o.id} · ${o.date} ${o.slot_time ?? 'rush'}`,
    buyer: { name: p.inv_name || p.name, zip: p.zip, city: p.city, street: p.inv_street, email: p.email, taxNumber: p.tax_number },
    subject: en ? `Your Bros Delivery ${what[2]} (${o.id})` : `Bros Delivery ${what[0]} (${o.id})`,
    body: en ? `Thank you for your order. Your ${what[2]} is attached.` : `Köszönjük a rendelést! ${what[1]} mellékelten küldjük.`,
    ...extra,
  };
}
async function issueInvoice(app: App, p: Doc, o: Doc) {
  const items = await itemsOf(app, p.id);
  return szamlazz.issueFor(app, 'dl_payers', p.id, () => (wantsInvoice(p) ? invoiceOf(app, p, o, items) : null));
}
/** The organiser's delivery fee went back: a correcting invoice reverses the fee line. */
async function issueFeeCorrection(app: App, p: Doc, o: Doc) {
  return szamlazz.issueFor(app, 'dl_payers', p.id, () => {
    const inv = invoiceOf(app, p, o, [], 'helyesbito', { ref: `${p.id}-H`, refersTo: p.invoice_no });
    return { ...inv, lines: szamlazz.correctionLines(inv.lines.filter((l) => l.name === FEE_LINE), 0, '') };
  }, 'correction');
}
export async function retryInvoices(app: App) {
  if (!szamlazz.ready(app.env)) return;
  const due = await all(d1(app).prepare("SELECT * FROM dl_payers WHERE status = 'paid' AND invoice_no IS NULL AND invoice_tries < ? LIMIT 10").bind(szamlazz.MAX_TRIES));
  for (const p of due) {
    const o = await getOrder(app, p.order_id);
    if (o) await issueInvoice(app, p, o);
  }
}

// ---- loyalty stamps (group payers only; the same rules as a stamp at the counter) ----
async function grantStamps(app: App, p: Doc) {
  if (!p.loyalty_email) return;
  const claim = await d1(app).prepare('UPDATE dl_payers SET stamped_at = ? WHERE id = ? AND stamped_at IS NULL').bind(nowIso(), p.id).run();
  if (!claim.meta.changes) return; // the payer id is the idempotency key
  const member = await app.db.members.findOne({ email: String(p.loyalty_email).toLowerCase() });
  if (!member) return;
  const s = settings(app.env), cups = (await itemsOf(app, p.id)).filter((i) => earnsStamp(i.product_id, i.cat));
  let n = 0;
  for (const cup of cups) {
    const required = tiers.stampsRequired(member, s);
    if (required === 0 || member.reward_ready) break; // free drinkers and a waiting reward: nothing to add, as at the counter
    const prev = member.stamps, stamps = prev + 1, ready = stamps >= required;
    const changes = { stamps, total_coffees: member.total_coffees + 1, reward_ready: ready };
    await app.db.members.updateOne({ code: member.code }, { $set: changes });
    Object.assign(member, changes);
    await members.log(app, member.code, member.name, 'delivery', members.COFFEE_ADDED, prev, stamps, false, ready, cup.product_id);
    n++;
    if (ready) {
      await members.log(app, member.code, member.name, 'delivery', members.REWARD_EARNED, stamps, stamps, false, true);
      await emailService.sendRewardReady(app, member.email, members.get(member, 'lang', 'hu') as string).catch((e) => console.warn('reward email failed', e));
    }
  }
  if (!n) return;
  await d1(app).prepare('UPDATE dl_payers SET stamps = ? WHERE id = ?').bind(n, p.id).run();
  await members.creditReferrer(app, member, 'delivery').catch((e) => console.warn('referral credit failed', e));
  await notifyUpdate(app, member.code).catch((e) => console.warn('wallet update failed', e));
}

// ---- emails ----
const getOrder = (app: App, id: string) => d1(app).prepare('SELECT * FROM dl_orders WHERE id = ?').bind(id).first<Doc>();
const getPayer = (app: App, id: string) => d1(app).prepare('SELECT * FROM dl_payers WHERE id = ?').bind(id).first<Doc>();
const when = (o: Doc, en = false) => `${o.date} · ${o.rush ? (o.eta_hm ? (en ? `about ${o.eta_hm} (rush)` : `kb. ${o.eta_hm} (rush)`) : en ? 'as soon as possible' : 'amint lehet (rush)') : o.slot_time}`;
/** HH:MM in Budapest of an ISO time. */
const clockAt = (app: App, at: string) => { const t = today(app, parseIso(at)); return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`; };
/** The order with its accepted arrival time as HH:MM (rush), for the emails. */
const withEta = (app: App, o: Doc): Doc => ({ ...o, eta_hm: o.eta_at ? clockAt(app, o.eta_at) : null });
const cupLine = (i: Doc) => `${i.who ? `${i.who} · ${i.label}` : i.label}${i.note ? ` · „${i.note}”` : ''}`;
const placeOf = (o: Doc, en = false) => (o.pickup ? (en ? `Pickup at the counter · ${CAFE_ADDRESS}` : `Elvitel a pultnál · ${CAFE_ADDRESS}`) : `${o.company} · ${o.street}, ${o.floor}`);
async function paidItems(app: App, orderId: string) {
  return all<Doc>(d1(app).prepare("SELECT i.* FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id WHERE i.order_id = ? AND p.status = 'paid' ORDER BY i.id").bind(orderId));
}
function list(lines: string[]) {
  return { html: `<ul style="margin:8px 0;padding-left:20px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`, text: lines.map((l) => `- ${l}`).join('\n') };
}

/** The highlighted card: the day big, time and place small. */
const deliveryHero = (o: Doc, en: boolean) => hero(o.rush ? (o.eta_hm ? (en ? `About ${o.eta_hm}` : `Kb. ${o.eta_hm}`) : en ? 'As soon as possible' : 'Amint lehet') : longDate(o.date, en),
  [...(o.rush ? [] : [o.slot_time]), placeOf(o, en)]);

/** The counter's ticket: a new order to make. */
async function notifyCounter(app: App, order: Doc) {
  const o = withEta(app, order), items = await paidItems(app, o.id);
  const payers = await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'paid'").bind(o.id));
  const till = payers.filter((p) => !wantsInvoice(p)).map((p) => `${p.name}: ${ft(p.amount_huf - p.refund_huf)}`);
  const noInvoice = payers.filter((p) => wantsInvoice(p) && !p.invoice_no).map((p) => `${p.name}: ${p.invoice_error ?? 'folyamatban'}`);
  await mail(app, {
    to: staffAddress(app), staff: true, subject: `Delivery ${o.id}: ${when(o)} · ${o.pickup ? 'ELVITEL' : o.company} · ${items.length} ital`, title: `${o.pickup ? 'Elvitel' : 'Delivery'} · ${items.length} ital`,
    parts: [
      deliveryHero(o, false),
      listCard('Italok', items.map(cupLine)),
      card('Rendelés', [['Azonosító', o.id], ['Típus', o.pickup ? 'elvitel a pultnál' : o.kind === 'company' ? 'cég fizet' : 'csoportos'], ['Megjegyzés', o.note],
        ['Kapcsolat', `${o.contact_name} · ${o.contact_phone} · ${o.contact_email}`], ['Fizetve', ft(payers.reduce((n, p) => n + p.amount_huf - p.refund_huf, 0))]]),
      listCard('Pénztárgépbe ütni (online kártyás fizetés, nyugta)', till),
      listCard('Számla hiányzik', noInvoice),
    ],
  });
}

async function sendPayer(app: App, p: Doc, order: Doc, kind: 'confirmed' | 'coming' | 'out' | 'late' | 'cancelled' | 'requested' | 'declined' | 'timeout') {
  const en = p.lang === 'en', items = await itemsOf(app, p.id), o = withEta(app, order);
  const released = en ? 'The amount was only held on your card and is released now; nothing was charged (some banks show the hold for a few more days). You can still order for the fixed times.'
    : 'Az összeget csak zároltuk a kártyádon, ezt most feloldottuk, semmit nem terheltünk (egyes bankok még pár napig mutatják a zárolást). A fix időpontokra továbbra is rendelhetsz.';
  const T = {
    requested: en ? ['We got your rush request', 'Request received', `Within ${RUSH_ANSWER_MIN} minutes we confirm when we can be there. Until then the amount is only held on your card, not charged.`]
      : ['Megkaptuk az azonnali kérésed', 'Megkaptuk a kérést', `${RUSH_ANSWER_MIN} percen belül visszaigazoljuk, mikorra érünk oda. Addig az összeget csak zároljuk a kártyádon, nem terheljük meg.`],
    declined: en ? ['We cannot do your rush order now', 'Not possible right now', `Sorry, we cannot bring it right now. ${released}`] : ['Most nem tudjuk vállalni', 'Most nem megy', `Sajnos most nem tudjuk azonnal kivinni. ${released}`],
    timeout: en ? ['We could not confirm your rush order in time', 'Not possible right now', `We could not answer within ${RUSH_ANSWER_MIN} minutes, so we closed the request. ${released}`]
      : ['Nem tudtuk időben visszaigazolni', 'Most nem megy', `Nem tudtunk ${RUSH_ANSWER_MIN} percen belül válaszolni, ezért lezártuk a kérést. ${released}`],
    confirmed: o.rush && o.eta_hm ? (en ? ['Your Bros Delivery is accepted', 'Accepted!', `We will be there at about ${o.eta_hm}. Your order is paid.`] : ['Elfogadtuk a Bros Delivery rendelést', 'Elfogadtuk!', `Kb. ${o.eta_hm}-ra ott vagyunk. A rendelés ki van fizetve.`])
      : en ? ['Your Bros Delivery order', 'Thank you for your order!', o.kind === 'group' ? 'Your drink is paid and on the group list. We bring whatever is paid by the deadline.' : o.pickup ? `Your order is paid. It will be ready at the counter at the time you chose (${CAFE_ADDRESS}).` : 'Your order is paid. We are bringing it at the time you chose.']
      : ['Bros Delivery rendelés', 'Köszönjük a rendelést!', o.kind === 'group' ? 'Az italod ki van fizetve, és a csoport listáján van. Amit a határidőig kifizettek, azt visszük.' : o.pickup ? `A rendelés ki van fizetve. A választott időpontra elkészítjük, a pultnál vár (${CAFE_ADDRESS}).` : 'A rendelés ki van fizetve, a választott időpontra visszük.'],
    coming: en ? ['Your group order is closed', 'It is coming', 'The group order is closed and we are making the drinks.'] : ['Lezárult a csoportos rendelés', 'Készül, visszük', 'A csoportos rendelés lezárult, készítjük az italokat.'],
    out: o.pickup ? (en ? ['Your order is ready', 'Ready to collect', `Your drinks are ready at the counter (${CAFE_ADDRESS}).`] : ['Kész a rendelésed', 'Átveheted', `Elkészültek az italok, a pultnál várnak (${CAFE_ADDRESS}).`])
      : en ? ['Your Bros Delivery is on its way', 'On the way', 'One of us has just left the café with your drinks.'] : ['Úton a Bros Delivery', 'Elindultunk', 'Egyikünk most indult el a kávézóból az italokkal.'],
    late: en ? ['Your payment was refunded', 'Payment refunded', 'Your payment arrived after the order had closed or the delivery time had filled up, so we refunded it in full. Nothing will be delivered for it.']
      : ['Visszatérítettük a fizetést', 'Visszatérítés', 'A fizetés azután érkezett, hogy a rendelés lezárult vagy az időpont betelt, ezért a teljes összeget visszatérítettük. Ehhez a fizetéshez nem szállítunk.'],
    cancelled: en ? ['Your Bros Delivery order was cancelled', 'Order cancelled', 'We had to cancel this order. What you paid is refunded in full; it reaches your card in a few days.']
      : ['Töröltük a Bros Delivery rendelést', 'Rendelés törölve', 'Ezt a rendelést törölnünk kellett. A kifizetett összeget teljes egészében visszatérítjük, néhány napon belül megérkezik a kártyádra.'],
  }[kind];
  const parts = [para(T[2]), deliveryHero(o, en), listCard(en ? 'Drinks' : 'Italok', items.map(cupLine))];
  if (kind === 'confirmed') {
    const drinks = p.amount_huf - p.fee_huf;
    parts.push(priceCard(en ? 'Payment' : 'Fizetés', [[en ? 'Drinks' : 'Italok', ft(drinks)], ...(p.fee_huf ? [[en ? 'Delivery fee' : 'Kiszállítási díj', ft(p.fee_huf)] as [string, string]] : [])], [en ? 'Paid' : 'Kifizetve', ft(p.amount_huf)]));
    // free cancellation until the slot's order deadline (ÁSZF, Daniel 2026-11-18); a rush order is made at once
    const by = o.cutoff_at ? today(app, parseIso(o.cutoff_at)) : null;
    const until = by ? `${by.date === o.date ? '' : `${longDate(by.date, en)}, `}${String(by.hour).padStart(2, '0')}:${String(by.minute).padStart(2, '0')}` : null;
    parts.push(card(en ? 'Good to know' : 'Jó tudni', [
      [en ? 'Free cancellation' : 'Díjmentes lemondás', until ? (en ? `Until ${until}, by replying to this email` : `${until}-ig, erre az e-mailre válaszolva`) : null],
      [en ? 'Invoice' : 'Számla', wantsInvoice(p) ? (en ? 'Arrives in a separate email' : 'Külön e-mailben érkezik') : (en ? 'Not requested; reply with your billing details if you need one' : 'Nem kértél; ha kell, válaszolj a számlázási adatokkal')],
    ]));
  }
  parts.push(fine(en ? `Order reference: ${o.id}` : `Rendelési azonosító: ${o.id}`));
  // the organiser's page: who has ordered, and closing the order early once everyone is in
  const button: [string, string] | undefined = kind === 'confirmed' && p.organiser && o.kind === 'group' && o.status === 'open'
    ? [en ? 'Open the group page' : 'A csoport oldala', siteUrl(app, `${o.return_path}csoport/?g=${o.group_code}&o=${await orgToken(app, o.id)}`)] : undefined;
  if (button) parts.splice(1, 0, para(en ? 'On the group page you see who has ordered; once everyone has, you can send the order before the deadline.' : 'A csoport oldalán látod, ki rendelt már; ha mindenki rendelt, a határidő előtt is elküldheted a rendelést.'));
  await mail(app, { to: p.email, lang: p.lang, subject: `${T[0]} (${o.id})`, title: T[1], parts, button });
}

// ---- Stripe webhook ----
/** The organiser paid the fee up front; it goes back once the group has free_from paid cups. */
async function settleGroupFee(app: App, o: Doc) {
  if (o.kind !== 'group') return;
  const s = await readSettings(app);
  if ((await paidCups(app, o.id)) < s.free_from) return;
  const org = await d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND organiser = 1 AND status = 'paid' AND fee_huf > 0 AND refund_huf = 0").bind(o.id).first<Doc>();
  if (!org) return;
  const claim = await d1(app).prepare('UPDATE dl_payers SET refund_huf = fee_huf WHERE id = ? AND refund_huf = 0').bind(org.id).run();
  if (!claim.meta.changes) return;
  try {
    await stripe.refund(app, org.stripe_payment_intent, org.fee_huf, `${org.id}-fee`);
    await d1(app).prepare('UPDATE dl_orders SET fee_huf = 0 WHERE id = ?').bind(o.id).run();
    const fixed = org.invoice_no ? await issueFeeCorrection(app, org, o) : null;
    const note = !org.invoice_no ? 'Számla nem volt (pénztárgépbe a díj nélküli összeg kerül).' : fixed ? `Helyesbítő számla: ${fixed}.` : 'A HELYESBÍTŐ SZÁMLA NEM KÉSZÜLT EL: kézzel kell kiállítani a Számlázz.hu-ban.';
    const msg = `${o.id}: a csoport elérte az ingyenes kiszállítást, a szervező (${org.name}) visszakapta a díjat. ${note}`;
    await mail(app, { to: staffAddress(app), subject: `Delivery ${o.id}: kiszállítási díj visszatérítve (${ft(org.fee_huf)})`, title: 'Kiszállítási díj visszatérítve', html: `<p>${esc(msg)}</p>`, text: msg });
  } catch (e) {
    console.error(`fee refund for ${o.id} failed`, e);
    await d1(app).prepare('UPDATE dl_payers SET refund_huf = 0 WHERE id = ?').bind(org.id).run(); // tried again at the next payment or at the lock
  }
}

/** Full refund of one payer (what is left of the payment). Throws when Stripe refuses. */
async function refundPayer(app: App, p: Doc) {
  const rest = p.amount_huf - p.refund_huf;
  if (rest > 0) await stripe.refund(app, p.stripe_payment_intent, rest, `${p.id}-all`);
  await d1(app).prepare("UPDATE dl_payers SET status = 'refunded', refund_huf = amount_huf WHERE id = ?").bind(p.id).run();
  await szamlazz.stornoFor(app, 'dl_payers', p.id, p.invoice_no, p.email);
}

export async function onPaid(app: App, session: Doc) {
  const id = String(session.metadata?.ref ?? session.client_reference_id ?? '');
  const before = await getPayer(app, id);
  if (!before) return;
  if (session.payment_status !== 'paid') { if (session.status === 'complete' && session.payment_intent) await onAuthorised(app, before, session); return; }
  if (!['pending', 'expired'].includes(before.status)) return;
  const r = await d1(app).prepare("UPDATE dl_payers SET status = 'paid', paid_at = ?, hold_expires = NULL, stripe_payment_intent = ?, stripe_session = ? WHERE id = ? AND status IN ('pending', 'expired')")
    .bind(nowIso(), String(session.payment_intent ?? ''), session.id ?? before.stripe_session, id).run();
  if (!r.meta.changes) return;
  const p = (await getPayer(app, id))!, o = (await getOrder(app, p.order_id))!;

  // a payment that lands after the lock, a cancellation, or on a hold that was released and since filled: all of it goes back
  let late = o.status === 'cancelled' || (o.kind === 'group' ? o.status !== 'open' : !['pending', 'expired'].includes(o.status));
  if (!late && before.status === 'expired') {
    if (o.cutoff_at && o.cutoff_at <= nowIso()) late = true;
    else if (o.slot_id) {
      const slot = await d1(app).prepare('SELECT * FROM dl_slots WHERE id = ?').bind(o.slot_id).first<Slot>();
      // an expired company order's cups are not in the count yet
      const taken = ((await booked(app, o.date, o.date)).get(`${o.date}|${o.slot_id}`) ?? 0) + (o.status === 'expired' ? (await itemsOf(app, p.id)).length : 0);
      if (slot && taken > slot.capacity) late = true;
    }
  }
  if (late) {
    await refundPayer(app, p);
    await sendPayer(app, p, o, 'late');
    return;
  }
  if (o.kind === 'company') await d1(app).prepare("UPDATE dl_orders SET status = 'new' WHERE id = ? AND status IN ('pending', 'expired')").bind(o.id).run();
  await issueInvoice(app, p, o);
  if (o.kind === 'group') {
    await grantStamps(app, p);
    await settleGroupFee(app, o);
  } else await notifyCounter(app, o);
  await sendPayer(app, p, o, 'confirmed');
}

// ---- rush requests: the card is authorised at Checkout, staff accept (capture) or decline (release) ----
/** Checkout finished without a charge: a rush request waiting for the counter's answer. */
async function onAuthorised(app: App, before: Doc, session: Doc) {
  if (!['pending', 'expired'].includes(before.status)) return;
  const o = await getOrder(app, before.order_id);
  if (!o?.rush) return;
  const pi = await stripe.paymentIntent(app, String(session.payment_intent)); // Checkout's payment_status alone does not say "authorised"
  if (pi.status !== 'requires_capture') return;
  const r = await d1(app).prepare("UPDATE dl_payers SET status = 'authorised', hold_expires = NULL, stripe_payment_intent = ?, stripe_session = ? WHERE id = ? AND status IN ('pending', 'expired')")
    .bind(pi.id, session.id ?? before.stripe_session, before.id).run();
  if (!r.meta.changes) return;
  const answerBy = isoAt(new Date(Date.now() + RUSH_ANSWER_MIN * 60_000));
  const ok = await d1(app).prepare("UPDATE dl_orders SET status = 'requested', answer_by = ? WHERE id = ? AND status IN ('pending', 'expired')").bind(answerBy, o.id).run();
  const p = (await getPayer(app, before.id))!;
  if (!ok.meta.changes) { // cancelled meanwhile: let the card go
    await stripe.cancelIntent(app, pi.id).catch((e) => console.error(`release of ${p.id} failed`, e));
    await d1(app).prepare("UPDATE dl_payers SET status = 'released' WHERE id = ?").bind(p.id).run();
    return;
  }
  const req = (await getOrder(app, o.id))!;
  await notifyRequest(app, req);
  await sendPayer(app, p, req, 'requested');
}

/** The counter's alarm: answer within RUSH_ANSWER_MIN minutes on the admin board. */
async function notifyRequest(app: App, o: Doc) {
  const items = await all<Doc>(d1(app).prepare("SELECT i.* FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id WHERE i.order_id = ? AND p.status = 'authorised' ORDER BY i.id").bind(o.id));
  const by = clockAt(app, o.answer_by);
  await mail(app, {
    to: staffAddress(app), staff: true, subject: `AZONNALI kérés ${o.id}: ${items.length} ital · ${o.company}, válasz ${by}-ig`, title: 'Azonnali kérés',
    parts: [
      hero(`Válaszolj ${by}-ig`, [`${o.company} · ${o.street}, ${o.floor}`]),
      listCard('Italok', items.map(cupLine)),
      card('Rendelés', [['Azonosító', o.id], ['Megjegyzés', o.note], ['Kapcsolat', `${o.contact_name} · ${o.contact_phone}`]]),
      para(`A táblán: Elfogad (15 / 20 / 30 perc vagy időpont), vagy Most nem megy. ${RUSH_ANSWER_MIN} perc után magától elutasítjuk, és a vendég kártyáján feloldjuk a zárolást.`),
    ],
    button: ['Megnyitom a táblát', siteUrl(app, '/admin/delivery/')],
  });
}

/** Releases the card of a request that is declined by staff or not answered in time. False when it was no longer open. */
async function declineRush(app: App, o: Doc, why: 'declined' | 'timeout') {
  const claim = await d1(app).prepare("UPDATE dl_orders SET status = 'declined' WHERE id = ? AND status = 'requested'").bind(o.id).run();
  if (!claim.meta.changes) return false;
  for (const p of await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'authorised'").bind(o.id))) {
    // a failed release still lapses by itself within 7 days (Stripe); the guest is told either way
    await stripe.cancelIntent(app, p.stripe_payment_intent).catch((e) => console.error(`release of ${p.id} failed`, e));
    await d1(app).prepare("UPDATE dl_payers SET status = 'released' WHERE id = ?").bind(p.id).run();
    await sendPayer(app, p, o, why);
  }
  return true;
}

/** Staff answer: { minutes } or { time: "HH:MM" } accepts (captures, then invoice, counter email, ETA email); { accept: false } declines. */
export async function answerRush(app: App, id: string, b: Doc) {
  const o = await getOrder(app, id);
  if (!o) throw new ApiError(404, 'not_found');
  if (b.accept === false) {
    if (!(await declineRush(app, o, 'declined'))) throw new ApiError(409, 'not_requested');
    return { id, status: 'declined' };
  }
  const now = Date.now();
  let eta: Date;
  if (Number.isInteger(b.minutes) && b.minutes >= 5 && b.minutes <= 120) eta = new Date(now + b.minutes * 60_000);
  else if (typeof b.time === 'string' && /^\d\d:\d\d$/.test(b.time)) {
    eta = instant(app, today(app).date, b.time);
    if (eta.getTime() <= now || eta.getTime() > now + 3 * 3600e3) throw invalid(['time']);
  } else throw invalid(['minutes']);
  const claim = await d1(app).prepare("UPDATE dl_orders SET status = 'new', eta_at = ? WHERE id = ? AND status = 'requested'").bind(isoAt(eta), id).run();
  if (!claim.meta.changes) throw new ApiError(409, 'not_requested'); // answered meanwhile, or timed out
  const p = await d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'authorised' LIMIT 1").bind(id).first<Doc>();
  try {
    if (!p) throw new Error('no authorised payer');
    await stripe.capture(app, p.stripe_payment_intent);
  } catch (e) {
    console.error(`capture of ${id} failed`, e);
    await d1(app).prepare("UPDATE dl_orders SET status = 'requested' WHERE id = ? AND status = 'new'").bind(id).run();
    await declineRush(app, o, 'declined'); // the hold is gone or refused: the guest is told, nothing was charged
    throw new ApiError(409, 'capture_failed');
  }
  await d1(app).prepare("UPDATE dl_payers SET status = 'paid', paid_at = ? WHERE id = ?").bind(nowIso(), p.id).run();
  const paid = (await getPayer(app, p.id))!, accepted = (await getOrder(app, id))!;
  app.later((async () => { await issueInvoice(app, paid, accepted); await notifyCounter(app, accepted); await sendPayer(app, paid, accepted, 'confirmed'); })());
  return { id, status: 'new', eta_at: iso(accepted.eta_at) };
}

/** The guest's page after Checkout polls this (signed `t` from the return URL): where the order stands. */
export async function orderStatus(app: App, id: string, token: unknown) {
  if (typeof token !== 'string' || !safeEqual(token, await recToken(app, id))) throw new ApiError(403, 'forbidden');
  await sweep(app);
  const o = await getOrder(app, id);
  if (!o) throw new ApiError(404, 'not_found');
  return { id, status: o.status, rush: !!o.rush, answer_by: o.answer_by ? iso(o.answer_by) : null, eta_at: o.eta_at ? iso(o.eta_at) : null };
}

export async function onExpired(app: App, session: Doc) {
  const id = String(session.metadata?.ref ?? session.client_reference_id ?? '');
  await d1(app).prepare("UPDATE dl_payers SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(id).run();
  await sweep(app); // releases a company order whose only payer is gone
}

/** The cutoff of a group order: unpaid drinks are dropped, the rest is made. */
async function lockGroup(app: App, o: Doc) {
  const r = await d1(app).prepare("UPDATE dl_orders SET status = 'new', locked_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(), o.id).run();
  if (!r.meta.changes) return;
  const pending = await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'pending'").bind(o.id));
  await d1(app).prepare("UPDATE dl_payers SET status = 'expired' WHERE order_id = ? AND status = 'pending'").bind(o.id).run();
  if (stripe.ready(app.env)) for (const p of pending) if (p.stripe_session) app.later(stripe.expireSession(app, p.stripe_session));
  if (!(await paidCups(app, o.id))) {
    await d1(app).prepare("UPDATE dl_orders SET status = 'cancelled' WHERE id = ?").bind(o.id).run();
    return;
  }
  await settleGroupFee(app, o);
  const fresh = (await getOrder(app, o.id))!;
  await notifyCounter(app, fresh);
  for (const p of await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'paid'").bind(o.id))) await sendPayer(app, p, fresh, 'coming');
}

/** The organiser closes the group before the deadline: the same lock as the cutoff. */
const orgToken = (app: App, orderId: string) => sign(app, `org${orderId}`);
export async function closeGroup(app: App, code: string, token: unknown) {
  assertBookingsOpen(app);
  await sweep(app);
  const o = await orderByCode(app, code);
  if (!o) throw new ApiError(404, 'not_found');
  if (typeof token !== 'string' || !safeEqual(token, await orgToken(app, o.id))) throw new ApiError(403, 'forbidden');
  if (o.status !== 'open') throw new ApiError(409, 'locked');
  if (!(await paidCups(app, o.id))) throw new ApiError(409, 'nothing_paid'); // locking now would cancel the whole order
  await lockGroup(app, o);
  return groupView(app, code);
}

// ---- recurring: a reminder with a payment link the evening before, no stored card ----
const recToken = (app: App, orderId: string) => sign(app, `rec${orderId}`);
export async function setRecurring(app: App, orderId: string, b: Doc) {
  const rule = String(b.rule ?? '');
  if (rule !== 'weekdays' && !/^[1-6]$/.test(rule)) throw invalid(['rule']);
  if (typeof b.token !== 'string' || !safeEqual(b.token, await recToken(app, orderId))) throw new ApiError(403, 'forbidden');
  const o = await getOrder(app, orderId);
  if (!o || o.kind !== 'company' || !o.slot_id || !BOARD.includes(o.status)) throw new ApiError(404, 'not_found');
  const old = await d1(app).prepare('SELECT id FROM dl_recurring WHERE source_order = ?').bind(orderId).first<{ id: string }>();
  const id = old?.id ?? (await nextId(app, 'R'));
  await d1(app).prepare('INSERT INTO dl_recurring (id, source_order, rule, slot_id, active, created_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET rule = excluded.rule, active = 1')
    .bind(id, orderId, rule, o.slot_id, nowIso()).run();
  return { id, order_id: orderId, rule, active: true };
}

/** Cron, from 18:00 Budapest: tomorrow's recurring orders become pending orders with a payment link that works until the cutoff. */
export async function runRecurring(app: App) {
  const now = today(app);
  if (now.hour < RECURRING_FROM_HOUR || !stripe.ready(app.env)) return;
  const date = addDays(now.date, 1), s = await readSettings(app);
  if (!deliveryDay(s, date)) return;
  const due = await all(d1(app).prepare(
    'SELECT r.* FROM dl_recurring r WHERE r.active = 1 AND (r.rule = ? OR r.rule = ?) AND NOT EXISTS (SELECT 1 FROM dl_orders o WHERE o.recurring_id = r.id AND o.date = ?) LIMIT 20').bind('weekdays', String(weekday(date)), date));
  for (const r of due) {
    try {
      const src = await getOrder(app, r.source_order), slot = await d1(app).prepare('SELECT * FROM dl_slots WHERE id = ? AND active = 1').bind(r.slot_id).first<Slot>();
      const payer = src && (await d1(app).prepare('SELECT * FROM dl_payers WHERE order_id = ? ORDER BY created_at LIMIT 1').bind(src.id).first<Doc>());
      if (!src || !slot || !payer || (await closedSlots(app, date, date)).has(`${date}|${slot.id}`)) continue;
      const cups = await priceCups(app, (await itemsOf(app, payer.id)).map(itemRequest));
      const cutoff = cutoffOf(app, date, slot), payBy = new Date(Math.min(cutoff.getTime(), Date.now() + 23 * 3600e3));
      const placed = await place(app, {
        kind: 'company', pickup: !!src.pickup, date, slot, cups, lang: src.lang, path: src.return_path, recurringId: r.id, payBy,
        address: { company: src.company, street: src.street, floor: src.floor, note: src.note ?? '' }, contact: { name: src.contact_name, email: src.contact_email, phone: src.contact_phone },
        payer: { name: payer.name, email: payer.email, invoice: { name: payer.inv_name, tax: payer.tax_number, zip: payer.zip, city: payer.city, street: payer.inv_street } },
      });
      const en = src.lang === 'en', c = list(cups.map((x) => x.label));
      const intro = en ? `Your repeating order for ${date} ${slot.time} is ready. Pay before the order deadline and we bring it; unpaid, it simply lapses.`
        : `Az ismétlődő rendelésed (${date} ${slot.time}) elő van készítve. Ha a rendelési határidőig kifizeted, visszük; ha nem, magától törlődik.`;
      await mail(app, { to: src.contact_email, lang: src.lang, subject: en ? `Your Bros Delivery for ${date}` : `Bros Delivery ${date}: fizetési link`, title: en ? 'Your repeating order' : 'Ismétlődő rendelés',
        html: `<p>${esc(intro)}</p>${c.html}`, text: `${intro}\n\n${c.text}\n\n${placed.checkout_url}`, button: [en ? 'Pay now' : 'Kifizetem', placed.checkout_url] });
    } catch (e) {
      console.error(`recurring ${r.id} for ${date} failed`, e); // e.g. the slot is full: skipped for that day
    }
  }
}

// ---- admin ----
export async function board(app: App, dateParam: unknown) {
  await sweep(app);
  const date = validDate(dateParam) ? dateParam : today(app).date;
  const [s, list, taken, closed] = await Promise.all([readSettings(app), activeSlots(app), booked(app, date, date), closedSlots(app, date, date)]);
  const orders = await all(d1(app).prepare(`SELECT * FROM dl_orders WHERE date = ? AND status IN ('requested', 'new', 'making', 'out', 'delivered') ORDER BY created_at`).bind(date));
  const items = await all(d1(app).prepare("SELECT i.* FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id JOIN dl_orders o ON o.id = i.order_id WHERE o.date = ? AND p.status IN ('paid', 'authorised') ORDER BY i.id").bind(date));
  const view = (o: Doc) => {
    const cups = items.filter((i) => i.order_id === o.id).map(cupLine);
    return { id: o.id, slot_id: o.slot_id ?? 'rush', type: o.kind, pickup: !!o.pickup, company: o.pickup ? o.contact_name : o.company, contact: `${o.contact_name} · ${o.contact_phone}`, address: o.pickup ? 'Elvitel a pultnál' : `${o.street}, ${o.floor}`, note: o.note ?? '', cups, drinks: cups.length, status: o.status, answer_by: o.answer_by ? iso(o.answer_by) : null, eta_at: o.eta_at ? iso(o.eta_at) : null };
  };
  const cols: Doc[] = list.map((x) => ({ ...slotInfo(app, date, x, taken, closed), orders: orders.filter((o) => o.slot_id === x.id).map(view) }));
  // orders of a slot that was removed since, and rush orders, still have to be made
  const rest = orders.filter((o) => !list.some((x) => x.id === o.slot_id));
  if (rest.length) cols.push({ id: 'rush', rush: true, time: null, cutoff_min: 0, cutoff_at: null, capacity: s.rush_max, left: 0, status: 'open', drinks: rest.reduce((n, o) => n + view(o).drinks, 0), orders: rest.map(view) });
  return { date, rush: rushOn(s), rush_until: rushOn(s) ? iso(s.rush_until) : null, slots: cols, payments_ready: stripe.ready(app.env) };
}

export async function setStatus(app: App, id: string, status: unknown) {
  if (typeof status !== 'string' || !BOARD.includes(status)) throw invalid(['status']);
  const r = await d1(app).prepare(`UPDATE dl_orders SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END WHERE id = ? AND status IN ('new', 'making', 'out', 'delivered') AND status != ?`)
    .bind(status, status, nowIso(), id, status).run();
  const o = await getOrder(app, id);
  if (!o) throw new ApiError(404, 'not_found');
  if (r.meta.changes && status === 'out') {
    app.later((async () => { for (const p of await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'paid'").bind(id))) await sendPayer(app, p, o, 'out'); })());
  }
  return { id, status: o.status };
}

export async function setRush(app: App, on: unknown) {
  if (typeof on !== 'boolean') throw invalid(['on']);
  await d1(app).prepare('UPDATE dl_settings SET rush_until = ?, updated_at = ? WHERE id = 1').bind(on ? isoAt(new Date(Date.now() + RUSH_AUTO_OFF_MIN * 60_000)) : null, nowIso()).run();
  const v = rushView(await readSettings(app));
  return { on: v.on, until: v.until };
}

export async function getSettings(app: App) {
  const [s, list] = await Promise.all([readSettings(app), activeSlots(app)]);
  return { slots: list.map((x) => ({ id: x.id, time: x.time, cutoffMin: x.cutoff_min, capacity: x.capacity })), days: s.days, free_from: s.free_from, fee: s.fee_huf };
}

export async function saveSettings(app: App, b: Doc) {
  const list = Array.isArray(b.slots) ? b.slots : null, days = Array.isArray(b.days) ? b.days : null;
  const ok = list && days && list.length <= 12
    && list.every((x: Doc) => typeof x.id === 'string' && /^s[a-z0-9]{1,16}$/.test(x.id) && typeof x.time === 'string' && /^\d\d:\d\d$/.test(x.time) && x.time >= SLOT_HOURS[0] && x.time <= SLOT_HOURS[1]
      && Number.isInteger(x.cutoffMin) && x.cutoffMin >= 0 && x.cutoffMin <= 600 && Number.isInteger(x.capacity) && x.capacity >= 0 && x.capacity <= 99)
    && new Set(list.map((x: Doc) => x.time)).size === list.length && new Set(list.map((x: Doc) => x.id)).size === list.length
    && days.every((d: unknown) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 6); // never Sunday
  if (!ok) throw invalid(['slots', 'days']);
  await d1(app).batch([
    d1(app).prepare('UPDATE dl_slots SET active = 0'), // removing a slot only deactivates it; orders keep their copied time
    ...list.map((x: Doc) => d1(app).prepare('INSERT INTO dl_slots (id, time, cutoff_min, capacity, active) VALUES (?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET time = excluded.time, cutoff_min = excluded.cutoff_min, capacity = excluded.capacity, active = 1')
      .bind(x.id, x.time, x.cutoffMin, x.capacity)),
    d1(app).prepare('UPDATE dl_settings SET days = ?, updated_at = ? WHERE id = 1').bind(JSON.stringify([...new Set(days as number[])].sort()), nowIso()),
  ]);
  return getSettings(app);
}

export async function closeSlot(app: App, date: string, slotId: string, closed: unknown) {
  if (!validDate(date) || date < today(app).date || typeof closed !== 'boolean') throw invalid(['date', 'closed']);
  if (closed) {
    const n = await d1(app).prepare("SELECT COUNT(*) AS n FROM dl_items i JOIN dl_payers p ON p.id = i.payer_id JOIN dl_orders o ON o.id = i.order_id WHERE o.date = ? AND o.slot_id = ? AND p.status = 'paid' AND o.status NOT IN ('cancelled', 'expired', 'delivered')")
      .bind(date, slotId).first<{ n: number }>();
    if (n?.n) throw new ApiError(409, 'has_orders');
    await d1(app).prepare('INSERT INTO dl_day_slots (date, slot_id, closed) VALUES (?, ?, 1) ON CONFLICT(date, slot_id) DO UPDATE SET closed = 1').bind(date, slotId).run();
  } else await d1(app).prepare('DELETE FROM dl_day_slots WHERE date = ? AND slot_id = ?').bind(date, slotId).run();
  return { date, slot_id: slotId, closed };
}

export async function recurringList(app: App) {
  const r = await all(d1(app).prepare(
    `SELECT r.id, r.rule, r.active, o.company, COALESCE(s.time, o.slot_time) AS time, (SELECT COUNT(*) FROM dl_items i WHERE i.order_id = o.id) AS drinks
     FROM dl_recurring r JOIN dl_orders o ON o.id = r.source_order LEFT JOIN dl_slots s ON s.id = r.slot_id ORDER BY r.created_at`));
  return { recurring: r.map((x) => ({ id: x.id, company: x.company, rule: /^\d$/.test(x.rule) ? Number(x.rule) : x.rule, time: x.time, drinks: x.drinks, active: !!x.active })) };
}
export async function pauseRecurring(app: App, id: string, active: unknown) {
  if (typeof active !== 'boolean') throw invalid(['active']);
  const r = await d1(app).prepare('UPDATE dl_recurring SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run();
  if (!r.meta.changes) throw new ApiError(404, 'not_found');
  return { id, active };
}

/** Cancels an order and refunds every payer in full. */
export async function cancelOrder(app: App, id: string) {
  const o = await getOrder(app, id);
  if (!o) throw new ApiError(404, 'not_found');
  if (o.status === 'requested') { await declineRush(app, o, 'declined'); return { id, status: 'declined', refunded: 0 }; }
  if (!['pending', 'open', 'new', 'making', 'out'].includes(o.status)) throw new ApiError(409, 'not_cancellable');
  const paid = await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'paid'").bind(id));
  if (paid.length && !stripe.ready(app.env)) throw new ApiError(503, 'payments_not_configured');
  await d1(app).prepare("UPDATE dl_orders SET status = 'cancelled' WHERE id = ?").bind(id).run();
  const pending = await all(d1(app).prepare("SELECT * FROM dl_payers WHERE order_id = ? AND status = 'pending'").bind(id));
  await d1(app).prepare("UPDATE dl_payers SET status = 'expired' WHERE order_id = ? AND status = 'pending'").bind(id).run();
  if (stripe.ready(app.env)) for (const p of pending) if (p.stripe_session) app.later(stripe.expireSession(app, p.stripe_session));
  const failed: string[] = [];
  for (const p of paid) {
    try {
      await refundPayer(app, p);
      app.later(sendPayer(app, p, o, 'cancelled'));
    } catch (e) {
      console.error(`refund of ${p.id} failed`, e);
      failed.push(p.id);
    }
  }
  if (failed.length) throw new ApiError(502, 'refund_failed', { payers: failed }); // the order is cancelled; these still need a refund in Stripe
  return { id, status: 'cancelled', refunded: paid.length };
}
