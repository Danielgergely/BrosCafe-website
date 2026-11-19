// A signed-in guest's own orders ("Rendeléseim" on /fiok/) and the "order again" pre-fill for the Delivery form.
// Matched by the account's email: Delivery payers (company, organiser or group member) and After Hours bookers.
import type { App } from '../http';
import type { Doc } from '../db';
import { instant, today } from './bookings';
import { cancelLink, modifyLink } from './after_hours';
import { itemRequest } from './delivery';

const LIMIT = 30;
const mailOf = (m: Doc) => String(m.email ?? '').toLowerCase().trim();
const rows = async (q: D1PreparedStatement) => ((await q.all<Doc>()).results ?? []);

export async function list(app: App, member: Doc) {
  const d1 = app.db.d1, email = mailOf(member), now = today(app).date;
  const [dl, ah] = await Promise.all([
    rows(d1.prepare(
      `SELECT o.id, o.kind, o.group_code, o.date, o.slot_time, o.rush, o.status, o.pickup, o.company, o.street, p.status AS paid, p.amount_huf, p.refund_huf, p.organiser,
              (SELECT COUNT(*) FROM dl_items i WHERE i.payer_id = p.id) AS drinks
       FROM dl_payers p JOIN dl_orders o ON o.id = p.order_id
       WHERE lower(p.email) = ? AND p.status IN ('paid', 'refunded') ORDER BY o.date DESC, p.created_at DESC LIMIT ?`,
    ).bind(email, LIMIT)),
    rows(d1.prepare(
      `SELECT * FROM ah_bookings WHERE lower(email) = ? AND status IN ('paid', 'cancelled', 'refunded') ORDER BY date DESC LIMIT ?`,
    ).bind(email, LIMIT)),
  ]);
  return {
    delivery: dl.map((r) => ({
      id: r.id, kind: r.kind, group_code: r.organiser ? r.group_code : null, date: r.date, time: r.rush ? null : r.slot_time, rush: !!r.rush,
      pickup: !!r.pickup, company: r.company, street: r.street, drinks: r.drinks, amount: r.amount_huf, refund: r.refund_huf || 0,
      status: r.paid === 'refunded' ? 'refunded' : r.status, upcoming: r.date >= now,
    })),
    after_hours: await Promise.all(ah.map(async (b) => {
      const left = instant(app, b.date, b.start_time).getTime() - Date.now(), paid = b.status === 'paid';
      return {
        id: b.id, date: b.date, time: b.start_time, hours: b.hours, guests: b.guests, amount: b.amount_huf, refund: b.refund_huf || 0, status: b.status,
        upcoming: b.date >= now,
        modify_url: paid && left > 48 * 3600e3 ? await modifyLink(app, b) : null, // guests change up to 48 h before (after_hours.ts)
        cancel_url: paid && left > 0 ? await cancelLink(app, b) : null,
      };
    })),
  };
}

/** Everything of one of the guest's Delivery orders (default: the latest) except the date and time, for the form. */
export async function reorder(app: App, member: Doc, orderId: unknown) {
  const d1 = app.db.d1, email = mailOf(member), id = typeof orderId === 'string' ? orderId.slice(0, 40) : '';
  const p = await d1.prepare(
    `SELECT p.*, o.kind, o.pickup, o.company, o.street, o.floor, o.note, o.contact_name, o.contact_email, o.contact_phone
     FROM dl_payers p JOIN dl_orders o ON o.id = p.order_id
     WHERE lower(p.email) = ? AND p.status IN ('paid', 'refunded') ${id ? 'AND o.id = ?' : ''} ORDER BY p.created_at DESC LIMIT 1`,
  ).bind(...(id ? [email, id] : [email])).first<Doc>();
  if (!p) return { order: null };
  const items = await rows(d1.prepare('SELECT product_id, who, milk, size, iced, extras, note FROM dl_items WHERE payer_id = ? ORDER BY id').bind(p.id));
  const own = mailOf({ email: p.contact_email }) === email; // a group member's contact details are the organiser's
  return {
    order: {
      id: p.order_id,
      kind: p.kind, // a group member orders again as an organiser: one drink, invoice optional
      pickup: !!p.pickup,
      items: items.map(itemRequest),
      address: { company: p.company, street: p.street, floor: p.floor, note: p.note ?? '' },
      contact: { name: own ? p.contact_name : p.name, email: p.email, phone: own ? p.contact_phone : '' },
      invoice: p.zip ? { name: p.inv_name ?? '', tax_number: p.tax_number ?? '', zip: p.zip, city: p.city ?? '', street: p.inv_street ?? '' } : null,
    },
  };
}
