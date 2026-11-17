// Every API module, in the order backend/app/main.py mounted them. Each exports register(api).
import type { Router } from './http';
import { register as meta } from './routers/meta';
import { register as staffAuth } from './routers/staff_auth';
import { register as customerAuth } from './routers/customer_auth';
import { register as members } from './routers/members';
import { register as scan } from './routers/scan';
import { register as liveSales } from './routers/live_sales';
import { register as track } from './routers/track';
import { register as content } from './routers/content';
import { register as contact } from './routers/contact';
import { register as game } from './routers/game';
import { register as media } from './routers/media';
import { register as wallet } from './routers/wallet';
import { register as admin } from './routers/admin';
import { register as afterHours } from './routers/after_hours';
import { register as delivery } from './routers/delivery';

export const routes: ((api: Router) => void)[] = [meta, staffAuth, customerAuth, members, scan, liveSales, track, content, contact, game, media, wallet, admin, afterHours, delivery];
