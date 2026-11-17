// Wallet identity provisioning and pass generation for a member. Port of backend/app/services/wallet.py.
import type { App } from '../http';
import type { Doc } from '../db';
import { settings } from '../config';
import { isoAt, nowIso, tokenUrlsafe, uuidHex } from '../util';
import { publicView } from './members';
import { read as readAppSettings } from './app_settings';
import * as apple from '../wallet/apple';
import * as google from '../wallet/google';

/** Give a member a stable Wallet serial, auth token and scan token — once. */
export async function ensureIdentity(app: App, member: Doc): Promise<Doc> {
  const updates: Doc = {};
  if (!member.wallet_serial) updates.wallet_serial = 'bros_customer_' + uuidHex().slice(0, 12);
  if (!member.wallet_auth_token) updates.wallet_auth_token = tokenUrlsafe(24);
  // Passes issued before the barcode moved to the member code carry this token, and findByScan still resolves it.
  if (!member.loyalty_token) updates.loyalty_token = tokenUrlsafe(24);
  if (Object.keys(updates).length) {
    await app.db.members.updateOne({ code: member.code }, { $set: updates });
    Object.assign(member, updates);
  }
  return member;
}

export const webServiceUrl = (app: App) => `${settings(app.env).frontend_url}/api/wallet`;

/** What the counter's scanner reads off this member's pass: the member code (a smaller QR than the token). */
export const scanValue = (member: Doc): string => member.code;

export async function buildPkpass(app: App, member: Doc, lang?: string | null): Promise<Uint8Array> {
  await ensureIdentity(app, member);
  return apple.buildPkpass(
    app,
    { ...(await publicView(app, member)), name: member.name },
    settings(app.env).cafe,
    await readAppSettings(app),
    member.wallet_serial,
    member.wallet_auth_token,
    scanValue(member),
    webServiceUrl(app),
    lang || apple.get(member, 'wallet_lang', 'en'),
  );
}

export const cardUrl = (app: App, memberCode: string) => `${settings(app.env).frontend_url}/card/${memberCode}`;

/** Origins allowed to present the Save-to-Google-Wallet button, with and without www. */
function origins(app: App): string[] {
  const base = settings(app.env).frontend_url.replace(/\/+$/, '');
  if (!base) return [];
  const host = base.split('://').at(-1)!;
  const sibling = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  return [base, `https://${sibling}`];
}

/** A 'Save to Google Wallet' URL. Creates the class and object first so the pass is updatable straight away. */
export async function googleSaveLink(app: App, member: Doc, lang = 'en'): Promise<string> {
  await ensureIdentity(app, member);
  const cafe = settings(app.env).cafe;
  const barcode = scanValue(member);
  const url = cardUrl(app, member.code);

  await google.ensureClass(app, cafe, lang);
  await google.upsertObject(app, member, cafe, barcode, url, lang);
  await app.db.members.updateOne(
    { code: member.code },
    { $set: { google_object_id: google.objectId(app.env, member.code), google_wallet_lang: lang } },
  );
  return google.saveLink(app, member, cafe, barcode, url, origins(app), lang);
}

async function notifyApple(app: App, member: Doc): Promise<void> {
  const serial = member.wallet_serial;
  if (!serial) return;
  const registrations = await app.db.wallet_registrations.find({ serial }, { limit: 500 });
  const tokens = registrations.filter((r) => r.push_token).map((r) => r.push_token as string);
  if (!tokens.length) return;
  try {
    const sent = await apple.pushToDevices(app.env, tokens);
    console.info(`Apple Wallet push: ${sent}/${tokens.length} devices for ${serial}`);
  } catch (exc) {
    await bumpStat(app, 'push_failures');
    console.warn(`Apple Wallet push failed for ${serial}: ${exc}`);
  }
}

/** Patch the member's LoyaltyObject; Google pushes it to the device. */
async function notifyGoogle(app: App, member: Doc): Promise<void> {
  if (!member.google_object_id) return; // never saved a Google pass
  try {
    const updated = await google.pushUpdate(
      app, member, settings(app.env).cafe, scanValue(member), cardUrl(app, member.code), apple.get(member, 'google_wallet_lang', 'en'),
    );
    if (updated) console.info(`Google Wallet updated for ${member.code}`);
  } catch (exc) {
    await bumpStat(app, 'google_push_failures');
    console.warn(`Google Wallet update failed for ${member.code}: ${exc}`);
  }
}

/** Refresh both wallets after a balance change. Best-effort: a wallet problem must never fail the barista's tap. */
export async function notifyUpdate(app: App, code: string): Promise<void> {
  const appleOn = apple.isConfigured(app.env);
  const googleOn = google.isConfigured(app.env);
  if (!(appleOn || googleOn)) return;

  const member = await app.db.members.findOne({ code });
  if (!member) return;

  await app.db.members.updateOne({ code }, { $set: { wallet_updated_at: nowIso() } });

  if (appleOn) await notifyApple(app, member);
  if (googleOn) await notifyGoogle(app, member);
}

/**
 * The single wallet_stats document. Python keyed it {"_id": "stats"}; documents carry no _id here, so it is the
 * table's only row and the filter is empty (read it with wallet_stats.findOne({})).
 */
export async function bumpStat(app: App, field: string): Promise<void> {
  await app.db.wallet_stats.updateOne({}, { $inc: { [field]: 1 } }, { upsert: true });
}

/** How long a device token outlives a closed card, so the void can reach a phone that is switched off. */
export const VOID_KEEP_DAYS = 30;

/**
 * Leave a pass that can only ever say "closed", then tell the phone. The tombstone holds the serial and its auth
 * token and nothing else. Registrations stay (so the phone can fetch the void) but get an expiry; the cron job
 * deletes them once expire_at has passed (Mongo's TTL index did that before).
 */
export async function voidApplePass(app: App, member: Doc): Promise<boolean> {
  const serial = member.wallet_serial;
  if (!serial) return false;

  await app.db.voided_passes.updateOne(
    { serial },
    { $set: { serial, auth_token: apple.get(member, 'wallet_auth_token', ''), lang: apple.get(member, 'lang', 'hu'), voided_at: nowIso() } },
    { upsert: true },
  );

  // Push while the registrations are still there. Best-effort.
  await notifyApple(app, member);

  await app.db.wallet_registrations.updateMany(
    { serial },
    { $set: { expire_at: isoAt(new Date(Date.now() + VOID_KEEP_DAYS * 86400_000)) } },
  );

  console.info(`Apple pass ${serial} voided; device tokens expire in ${VOID_KEEP_DAYS} days`);
  return true;
}

export async function voidedPass(app: App, serial: string): Promise<Doc | null> {
  return app.db.voided_passes.findOne({ serial });
}
