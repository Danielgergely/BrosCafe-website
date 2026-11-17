// Admin-tunable analytics thresholds, stored as a single settings document. Port of backend/app/services/app_settings.py.
import type { Doc } from '../db';
import type { App } from '../http';
import { settings } from '../config';

// The Mongo document had _id "config". Documents carry no _id here, so it is the one `settings` document without a
// `_key`: the cron job keeps its own marker document beside it ({_key: 'deployed_version'}).
const OWN = { _key: { $exists: false } };

function DEFAULTS(app: App): Doc {
  return {
    active_days: 30,
    inactive_days: 30,
    new_days: 14,
    loyal_cycles: 2,
    almost_reward_stamps: Math.max(settings(app.env).stamps_required - 1, 1),
    cafe_lat: null,
    cafe_lng: null,
  };
}

export async function read(app: App): Promise<Doc> {
  const doc = await app.db.settings.findOne(OWN);
  if (!doc) return DEFAULTS(app);
  return { ...DEFAULTS(app), ...doc };
}

export async function write(app: App, values: Doc): Promise<Doc> {
  if (Object.keys(values).length) await app.db.settings.updateOne(OWN, { $set: values }, { upsert: true });
  return read(app);
}
