// The reel videos on /ujdonsagok/ (services/reels.ts): the public list and the admin's edit of it.
import type { Router } from '../http';
import { requireAdmin } from '../security';
import { handle } from '../services/bookings';
import * as reels from '../services/reels';

export function register(api: Router) {
  api.get('/reels', handle((c) => reels.feed(c)));
  api.get('/admin/reels', handle(async (c) => { await requireAdmin(c); return { items: await reels.list(c) }; }));
  api.put('/admin/reels', handle(async (c) => { await requireAdmin(c); return reels.save(c, ((await c.json()) ?? {}).items); }));
}
