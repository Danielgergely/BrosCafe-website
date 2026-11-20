// Google reviews on the home page (services/reviews.ts): the public block and the admin's picks.
import type { Ctx, Router } from '../http';
import { requireAdmin } from '../security';
import { handle } from '../services/bookings';
import * as reviews from '../services/reviews';

export function register(api: Router) {
  const admin = (h: (c: Ctx) => Promise<unknown>) => handle(async (c) => { await requireAdmin(c); return h(c); });
  api.get('/reviews', handle((c) => reviews.feed(c)));
  api.get('/admin/reviews', admin((c) => reviews.adminView(c)));
  api.put('/admin/reviews', admin(async (c) => reviews.setItems(c, ((await c.json()) ?? {}).items)));
  api.post('/admin/reviews/sync', admin((c) => reviews.syncNow(c)));
}
