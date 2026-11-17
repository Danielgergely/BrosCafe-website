// The automatic deletion the privacy page (/adatvedelem/) promises. Once a day from the cron, in small batches.
import type { App } from '../http';
import { settings } from '../config';
import { isoAt, localParts } from '../util';
import * as members from './members';

const LAST_RUN_KEY = 'retention_last_run'; // in `settings`, beside deployed_version
const RUN_FROM_HOUR = 3; // café time; the first cron run after this does the day's cleanup
const INACTIVE_YEARS = 2;
const ANALYTICS_MONTHS = 14;
const MEMBER_BATCH = 25; // each erase talks to Apple and Google; a backlog drains over the next days
const ANALYTICS_BATCH = 5000;

function monthsAgo(n: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return isoAt(d);
}

/**
 * Members with no sign of life for two years: the card was created before the cutoff and since then there was no
 * transaction (every stamp, redeem, adjustment and the registration bonus is one) and no game run. Sign-ins are not
 * stored anywhere lasting, so they don't count. Anyone whose email is also a staff login is left alone.
 */
async function inactiveMembers(app: App, limit: number): Promise<string[]> {
  const cutoff = monthsAgo(INACTIVE_YEARS * 12);
  const { results } = await app.db.d1.prepare(`
    SELECT json_extract(m.doc, '$.code') AS code FROM members m
    WHERE json_extract(m.doc, '$.created_at') < ?1
      AND NOT EXISTS (SELECT 1 FROM transactions t
        WHERE json_extract(t.doc, '$.code') = json_extract(m.doc, '$.code') AND json_extract(t.doc, '$.at') >= ?1)
      AND NOT EXISTS (SELECT 1 FROM game_runs g
        WHERE json_extract(g.doc, '$.code') = json_extract(m.doc, '$.code') AND json_extract(g.doc, '$.started_at') >= ?1)
      AND lower(json_extract(m.doc, '$.email')) NOT IN
        (SELECT lower(json_extract(u.doc, '$.email')) FROM users u WHERE json_extract(u.doc, '$.email') IS NOT NULL)
    LIMIT ?2`).bind(cutoff, limit).all<{ code: string | null }>();
  return results.map((r) => r.code).filter((c): c is string => !!c);
}

export async function daily(app: App) {
  const today = localParts(new Date(), settings(app.env).cafe_tz);
  if (today.hour < RUN_FROM_HOUR) return;
  const last = await app.db.settings.findOne({ _key: LAST_RUN_KEY });
  if (last?.value === today.date) return;
  // Marked first: a failure waits for tomorrow instead of retrying (and re-pushing passes) every 15 minutes.
  await app.db.settings.updateOne({ _key: LAST_RUN_KEY }, { $set: { _key: LAST_RUN_KEY, value: today.date } }, { upsert: true });

  let erased = 0;
  for (const code of await inactiveMembers(app, MEMBER_BATCH)) {
    // The same erasure as a deletion on request: passes expired/voided, history, tokens, runs, events go too.
    if (await members.erase(app, code)) erased++;
  }

  const analytics = (await app.db.d1.prepare(`
    DELETE FROM analytics_events WHERE _id IN
      (SELECT _id FROM analytics_events WHERE json_extract(doc, '$.at') < ? LIMIT ${ANALYTICS_BATCH})`)
    .bind(monthsAgo(ANALYTICS_MONTHS)).run()).meta.changes;

  if (erased || analytics) console.info(`retention: erased ${erased} inactive members, deleted ${analytics} analytics events`);
}
