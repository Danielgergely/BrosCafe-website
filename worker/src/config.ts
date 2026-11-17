// Mirrors backend/app/config.py: every setting read from the environment in one place.
import type { Env } from './env';

const secret = (env: Env, key: string) => String(env[key] ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
const int = (env: Env, key: string, def: number) => {
  const n = Number.parseInt(String(env[key] ?? ''), 10);
  return Number.isFinite(n) ? n : def;
};
const float = (env: Env, key: string, def: number) => {
  const n = Number.parseFloat(String(env[key] ?? ''));
  return Number.isFinite(n) ? n : def;
};
const s = (env: Env, key: string, def = '') => (env[key] === undefined || env[key] === null ? def : String(env[key]));

export function settings(env: Env) {
  const stampsRequired = int(env, 'STAMPS_REQUIRED', 10);
  const cfg = {
    cafe_tz: s(env, 'CAFE_TIMEZONE', 'Europe/Budapest'),
    cors_origins: s(env, 'CORS_ORIGINS', '*').split(',').map((o) => o.trim()).filter(Boolean),
    frontend_url: s(env, 'FRONTEND_URL').replace(/\/+$/, ''),

    jwt_algorithm: 'HS256',
    staff_token_days: int(env, 'STAFF_TOKEN_DAYS', 7),
    customer_token_days: int(env, 'CUSTOMER_TOKEN_DAYS', 365),
    magic_link_minutes: int(env, 'MAGIC_LINK_MINUTES', 20),
    admin_email: s(env, 'ADMIN_EMAIL').toLowerCase().trim(),
    admin_password: s(env, 'ADMIN_PASSWORD'),

    stamps_required: stampsRequired,
    welcome_stamps: Math.max(0, Math.min(int(env, 'WELCOME_STAMPS', 5), stampsRequired - 1)),

    seed_on_startup: s(env, 'SEED_ON_STARTUP', 'false').toLowerCase() === 'true',
    // Online After Hours booking and Delivery ordering; off on production until prices are final.
    bookings_open: s(env, 'BOOKINGS_OPEN', 'false').toLowerCase() === 'true',
    max_upload_mb: int(env, 'MAX_UPLOAD_MB', 20),

    resend_api_key: s(env, 'RESEND_API_KEY'),
    email_from: s(env, 'EMAIL_FROM', 'Bros Cafe <hello@broscafe.hu>'),
    email_from_name: s(env, 'EMAIL_FROM_NAME', 'Bros Cafe'),
    email_reply_to: s(env, 'EMAIL_REPLY_TO'),
    support_email: s(env, 'SUPPORT_EMAIL') || s(env, 'CAFE_EMAIL', 'hello@broscafe.hu'),
    contact_per_hour: int(env, 'CONTACT_PER_HOUR', 5),

    fruitsys_user: secret(env, 'FRUITSYS_USER'),
    fruitsys_password: secret(env, 'FRUITSYS_PASSWORD'),
    live_sales_key: secret(env, 'LIVE_SALES_KEY'),
    live_sales_every_min: int(env, 'LIVE_SALES_EVERY_MIN', 15),
    break_even_net_ft: int(env, 'BREAK_EVEN_NET_FT', 65000),
    gross_per_net: float(env, 'GROSS_PER_NET', 1.072),
    month_open_days: int(env, 'MONTH_OPEN_DAYS', 26),
    weather_lat: float(env, 'WEATHER_LAT', 47.516),
    weather_lon: float(env, 'WEATHER_LON', 19.058),

    cafe: {
      name: s(env, 'CAFE_NAME', 'Bros Cafe'),
      address: s(env, 'CAFE_ADDRESS'),
      instagram: s(env, 'CAFE_INSTAGRAM'),
      phone: s(env, 'CAFE_PHONE'),
      email: s(env, 'CAFE_EMAIL'),
      hours_weekdays: s(env, 'CAFE_HOURS_WEEKDAYS', 'Mon–Fri · 7:30–19:00'),
      hours_weekend: s(env, 'CAFE_HOURS_WEEKEND', 'Sat–Sun · 9:00–18:00'),
      stamps_required: stampsRequired,
    },
  };
  return {
    ...cfg,
    live_sales_configured: !!(cfg.fruitsys_user && cfg.fruitsys_password && cfg.live_sales_key),
    email_configured: !!(cfg.resend_api_key && cfg.email_from),
    /** Read on use, so a missing secret fails the request that needs it, not every request. */
    jwt_secret(): string {
      const v = env.JWT_SECRET;
      if (!v) throw new Error('JWT_SECRET is not set');
      return v;
    },
  };
}
export type Settings = ReturnType<typeof settings>;
