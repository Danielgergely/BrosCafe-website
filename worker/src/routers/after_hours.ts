// Bros After Hours API (docs/after-hours-api.md) and the Stripe webhook shared with Bros Delivery.
import { json, type Ctx, type Router } from '../http';
import { requireAdmin } from '../security';
import { nowIso } from '../util';
import { handle } from '../services/bookings';
import * as ah from '../services/after_hours';
import * as dl from '../services/delivery';
import * as stripe from '../services/stripe';

/** One endpoint for both modules: the session's metadata.kind says whose payment it is. Idempotent on the event id. */
async function webhook(c: Ctx) {
  if (!stripe.ready(c.env)) return json({ error: 'payments_not_configured' }, 503);
  const event = await stripe.verifyWebhook(c.env, await c.req.text(), c.req.headers.get('Stripe-Signature'));
  if (!event) return json({ error: 'bad_signature' }, 400);
  if (await c.db.d1.prepare('SELECT 1 FROM stripe_events WHERE id = ?').bind(event.id).first()) return { received: true, duplicate: true };
  const session = event.data.object, mod = session.metadata?.kind === 'ah' ? ah : session.metadata?.kind === 'dl' ? dl : null;
  if (mod) {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await mod.onPaid(c, session);
    else if (event.type === 'checkout.session.expired') await mod.onExpired(c, session);
  }
  // recorded last: a failure above answers 500 and Stripe sends the event again (the handlers are safe to repeat)
  await c.db.d1.prepare('INSERT OR IGNORE INTO stripe_events (id, type, at) VALUES (?, ?, ?)').bind(event.id, event.type, nowIso()).run();
  return { received: true };
}

export function register(api: Router) {
  for (const p of ['/stripe/webhook', '/after-hours/stripe/webhook', '/delivery/stripe/webhook']) api.post(p, webhook);

  const p = '/after-hours';
  api.get(`${p}/availability`, handle((c) => ah.availability(c, c.query.get('from'), c.query.get('to'))));
  api.post(`${p}/bookings`, handle(async (c) => ah.book(c, (await c.json()) ?? {})));
  api.get(`${p}/cancel/{token}`, handle((c) => ah.cancelInfo(c, c.params.token)));
  api.post(`${p}/cancel/{token}`, handle((c) => ah.cancelConfirm(c, c.params.token)));

  // refunds move money: admin role only
  const admin = (h: (c: Ctx) => Promise<unknown>) => handle(async (c) => { await requireAdmin(c); return h(c); });
  api.get(`${p}/admin/days`, admin((c) => ah.adminDays(c, c.query.get('from'), c.query.get('to'))));
  api.put(`${p}/admin/days/{date}`, admin(async (c) => ah.setDay(c, c.params.date, (await c.json())?.open)));
  api.get(`${p}/admin/bookings`, admin((c) => ah.adminBookings(c, c.query.get('status'))));
  api.post(`${p}/admin/bookings/{id}/cancel`, admin((c) => ah.adminCancel(c, c.params.id)));
  api.post(`${p}/admin/bookings/{id}/refund`, admin(async (c) => ah.adminRefund(c, c.params.id, (await c.json())?.percent)));
}
