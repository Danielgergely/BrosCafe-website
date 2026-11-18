// Cron (every 15 minutes): what the API used to do on start (once per deployed version), the cleanups MongoDB's
// TTL indexes did, and the live sales poll that ran in a loop every LIVE_SALES_EVERY_MIN minutes.
import { settings } from './config';
import { database } from './db';
import type { Env } from './env';
import type { App } from './http';
import { runOnce } from './services/live_sales';
import { startup } from './services/startup';
import { isoAt, nowIso } from './util';
import * as afterHours from './services/after_hours';
import * as delivery from './services/delivery';
import * as retention from './services/retention';

const CRON_MINUTES = 15;
// Kept in `settings` beside app_settings' document, told apart by `_key` (that document has none).
const VERSION_KEY = 'deployed_version';

/** on_startup, once per deployed version. True when it ran (a new version). */
async function startupOnce(app: App): Promise<boolean> {
  const version = app.env.CF_VERSION?.id ?? 'unknown';
  const stored = await app.db.settings.findOne({ _key: VERSION_KEY });
  if (stored?.value === version) return false;
  await startup(app);
  await app.db.settings.updateOne({ _key: VERSION_KEY }, { $set: { _key: VERSION_KEY, value: version } }, { upsert: true });
  const s = settings(app.env);
  if (s.live_sales_configured) console.info(`live sales: on, polling Fruitsys as ${s.fruitsys_user}`);
  else {
    const missing = ([['FRUITSYS_USER', s.fruitsys_user], ['FRUITSYS_PASSWORD', s.fruitsys_password], ['LIVE_SALES_KEY', s.live_sales_key]] as const)
      .filter(([, v]) => !v).map(([name]) => name);
    console.info(`live sales: off — ${missing.join(', ')} not set`);
  }
  return true;
}

/** What expireAfterSeconds did in backend/app/db.py (Mongo checked every minute; this runs every 15). */
async function cleanups(app: App) {
  const now = nowIso();
  await app.db.magic_tokens.deleteMany({ expires_at: { $lt: now } });
  await app.db.contact_log.deleteMany({ at: { $lt: isoAt(new Date(Date.now() - 7200_000)) } });
  await app.db.wallet_registrations.deleteMany({ expire_at: { $lt: now } });
}

/** The old loop slept LIVE_SALES_EVERY_MIN (at least 5) minutes: poll when a whole such interval began since the last cron run. */
function liveSalesDue(app: App, scheduledTime: number) {
  const every = Math.max(settings(app.env).live_sales_every_min, 5) * 60_000;
  return Math.floor(scheduledTime / every) !== Math.floor((scheduledTime - CRON_MINUTES * 60_000) / every);
}

export async function scheduled(controller: ScheduledController, env: Env, exec: ExecutionContext) {
  const app: App = { env, db: database(env.DB), later: (p) => exec.waitUntil(p.catch((e) => console.error('background task failed', e))) };

  let started = false;
  try {
    started = await startupOnce(app);
  } catch (e) {
    console.error('startup failed (retried on the next run)', e);
  }

  try {
    await cleanups(app);
  } catch (e) {
    console.error('TTL cleanup failed', e);
  }

  try {
    await retention.daily(app);
  } catch (e) {
    console.error('retention cleanup failed', e);
  }

  // Bros After Hours + Delivery: group cutoffs, expired holds, invoices that waited, tomorrow's recurring orders
  for (const [name, job] of [['delivery sweep', delivery.sweep], ['recurring', delivery.runRecurring], ['delivery invoices', delivery.retryInvoices], ['after hours invoices', afterHours.retryInvoices], ['after hours reminders', afterHours.sendReminders]] as const) {
    try {
      await job(app);
    } catch (e) {
      console.error(`${name} failed`, e);
    }
  }

  // A new version polls at once, whatever the time, as the API did on start.
  if (settings(env).live_sales_configured && (started || liveSalesDue(app, controller.scheduledTime))) {
    await runOnce(app, started);
  }
}
