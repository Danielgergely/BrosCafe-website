// Service metadata and public café details. Port of backend/app/routers/meta.py.
import type { Router } from '../http';
import { settings } from '../config';
import * as apple from '../wallet/apple';
import * as google from '../wallet/google';

export function register(api: Router) {
  // FastAPI served this at /api/ and redirected /api to it; here both answer directly.
  api.get('', () => ({ message: 'Bros Cafe API' }));

  api.get('/cafe', (c) => ({
    ...settings(c.env).cafe,
    apple_wallet_configured: apple.isConfigured(c.env),
    google_wallet_configured: google.isConfigured(c.env),
    bookings_open: settings(c.env).bookings_open,
  }));
}
