// Bindings and environment. Plain settings mirror backend/app/config.py; everything secret is a Worker secret.
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket; // photos uploaded through /admin (was MEDIA_DIR)
  ASSETS: Fetcher; // the static site (site/)
  APNS_CERT?: Fetcher; // mTLS binding with the Apple pass certificate, for Wallet pushes
  CF_VERSION?: { id: string; tag?: string; timestamp?: string }; // the deployed version

  FRONTEND_URL: string;
  PREVIEW?: string;
  REDIRECT_TO?: string; // set on the retired preview: every request redirects there // "1" on broscafe.gracelabs.dev: noindex everywhere, variant switcher on the app
  CORS_ORIGINS?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
  STAFF_TOKEN_DAYS?: string;
  CUSTOMER_TOKEN_DAYS?: string;
  MAGIC_LINK_MINUTES?: string;
  STAMPS_REQUIRED?: string;
  WELCOME_STAMPS?: string;
  SEED_ON_STARTUP?: string;
  MAX_UPLOAD_MB?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  SUPPORT_EMAIL?: string;
  CONTACT_PER_HOUR?: string;
  FRUITSYS_USER?: string;
  FRUITSYS_PASSWORD?: string;
  LIVE_SALES_KEY?: string;
  LIVE_SALES_EVERY_MIN?: string;
  BREAK_EVEN_NET_FT?: string;
  GROSS_PER_NET?: string;
  MONTH_OPEN_DAYS?: string;
  WEATHER_LAT?: string;
  WEATHER_LON?: string;
  CAFE_TIMEZONE?: string;
  CAFE_NAME?: string;
  CAFE_ADDRESS?: string;
  CAFE_INSTAGRAM?: string;
  GOOGLE_PLACES_KEY?: string; // Places API (New) key: the home page's Google rating (services/reviews.ts)
  GOOGLE_PLACE_ID?: string; // optional: otherwise found once by text search
  CAFE_PHONE?: string;
  CAFE_EMAIL?: string;
  CAFE_HOURS_WEEKDAYS?: string;
  CAFE_HOURS_WEEKEND?: string;

  // Apple Wallet (names as in the Python version where they existed)
  APPLE_PASS_CONFIGURED?: string;
  APPLE_PASS_TYPE_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_CERTIFICATE?: string; // pass certificate, PEM (signing)
  APPLE_PRIVATE_KEY?: string; // its key, PEM (signing; pushes go through APNS_CERT)
  APPLE_WWDR_CERTIFICATE?: string; // Apple WWDR intermediate, PEM
  APNS_HOST?: string;

  // Google Wallet
  GOOGLE_WALLET_CONFIGURED?: string;
  GOOGLE_ISSUER_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string; // the service account key file's contents
  GOOGLE_WALLET_CLASS_SUFFIX?: string;
  GOOGLE_WALLET_LOGO_URL?: string;

  [key: string]: unknown;
}
