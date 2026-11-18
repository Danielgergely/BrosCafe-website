// Bros Delivery API (docs/delivery-api.md). The Stripe webhook is in after_hours.ts (one endpoint for both).
import type { Ctx, Router } from '../http';
import { getCurrentUser, requireAdmin } from '../security';
import { handle } from '../services/bookings';
import * as dl from '../services/delivery';
import * as zone from '../services/zone';

export function register(api: Router) {
  const p = '/delivery';
  const body = async (c: Ctx) => (await c.json()) ?? {};
  api.get(`${p}/slots`, handle((c) => dl.slots(c, c.query.get('days'))));
  api.get(`${p}/address-suggest`, handle((c) => zone.suggest(c, c.query.get('q'))));
  api.post(`${p}/address-check`, handle(async (c) => { const b = await body(c); return zone.check(c, b.address, b.postcode); }));
  api.post(`${p}/orders`, handle(async (c) => dl.createOrder(c, await body(c))));
  api.post(`${p}/orders/{id}/recurring`, handle(async (c) => dl.setRecurring(c, c.params.id, await body(c))));
  api.post(`${p}/groups`, handle(async (c) => dl.createGroup(c, await body(c))));
  api.get(`${p}/groups/{code}`, handle((c) => dl.groupView(c, c.params.code)));
  api.post(`${p}/groups/{code}/participants`, handle(async (c) => dl.joinGroup(c, c.params.code, await body(c))));

  // the board is counter work (any staff); settings and refunds are for admins
  const staff = (h: (c: Ctx) => Promise<unknown>) => handle(async (c) => { await getCurrentUser(c); return h(c); });
  const admin = (h: (c: Ctx) => Promise<unknown>) => handle(async (c) => { await requireAdmin(c); return h(c); });
  api.get(`${p}/admin/board`, staff((c) => dl.board(c, c.query.get('date'))));
  api.put(`${p}/admin/orders/{id}/status`, staff(async (c) => dl.setStatus(c, c.params.id, (await body(c)).status)));
  api.put(`${p}/admin/rush`, staff(async (c) => dl.setRush(c, (await body(c)).on)));
  api.put(`${p}/admin/days/{date}/slots/{slot}`, staff(async (c) => dl.closeSlot(c, c.params.date, c.params.slot, (await body(c)).closed)));
  api.get(`${p}/admin/settings`, staff((c) => dl.getSettings(c)));
  api.put(`${p}/admin/settings`, admin(async (c) => dl.saveSettings(c, await body(c))));
  api.get(`${p}/admin/recurring`, staff((c) => dl.recurringList(c)));
  api.put(`${p}/admin/recurring/{id}`, admin(async (c) => dl.pauseRecurring(c, c.params.id, (await body(c)).active)));
  api.post(`${p}/admin/orders/{id}/cancel`, admin((c) => dl.cancelOrder(c, c.params.id)));
}
