// Member lifecycle: creation, public projection, stamps, transaction log. Port of backend/app/services/members.py.
import type { App } from '../http';
import type { Doc } from '../db';
import { settings } from '../config';
import * as tiers from './tiers';
import { expireObject } from '../wallet/google';
import { voidApplePass } from './wallet'; // circular (wallet imports this module); only used at call time
import { nowIso, uuid4, uuidHex } from '../util';

export const REGISTRATION = 'registration';
export const COFFEE_ADDED = 'coffee_added';
export const FREE_COFFEE_EARNED = 'free_coffee_earned';
export const FREE_COFFEE_REDEEMED = 'free_coffee_redeemed';
export const REWARD_EARNED = 'reward_earned';
export const REWARD_REDEEMED = 'reward_redeemed';
export const MANUAL_ADJUSTMENT = 'manual_adjustment';
export const OPENING_REDEEMED = 'opening_redeemed';

/** dict.get(key, default): the default only when the key is absent (a stored null stays null). */
export const get = (doc: Doc, key: string, def: unknown) => (key in doc ? doc[key] : def);

/** Everything a customer or staff member is allowed to see. Never tokens. */
export function publicView(app: App, doc: Doc): Doc {
  return {
    code: doc.code,
    name: doc.name,
    email: doc.email,
    stamps: doc.stamps,
    // Per member, not global: a tier shortens the card.
    stamps_required: tiers.stampsRequired(doc, settings(app.env)),
    total_coffees: doc.total_coffees,
    rewards_redeemed: doc.rewards_redeemed,
    reward_ready: doc.reward_ready,
    free_coffees: get(doc, 'free_coffees', 0),
    opening_status: get(doc, 'opening_status', 'reserved'),
    created_at: doc.created_at,
    ...tiers.summary(doc),
  };
}

export function newDocument(app: App, name: string, email: string): Doc {
  return {
    code: uuidHex().slice(0, 10),
    name: name.trim() || 'Friend',
    email,
    // The welcome bonus counts towards the reward but is not a purchase.
    stamps: settings(app.env).welcome_stamps,
    total_coffees: 0,
    rewards_redeemed: 0,
    reward_ready: false,
    free_coffees: 0,
    // Members from before opening day carry "reserved" (or no field); everyone after gets none.
    opening_status: 'none',
    created_at: nowIso(),
  };
}

export async function create(app: App, name: string, email: string, lang = 'hu', referredBy?: string | null): Promise<Doc> {
  const doc: Doc = { ...newDocument(app, name, email), lang };
  if (referredBy) {
    // Credited only when this member is actually served, see creditReferrer().
    doc.referred_by = referredBy;
    doc.referral_credited = false;
  }
  await app.db.members.insertOne({ ...doc });
  // Record the bonus in the history, so a card that starts at 5 is explained.
  await log(app, doc.code, doc.name, 'customer', REGISTRATION, 0, doc.stamps, false, false);
  return doc;
}

/** Delete a member and everything that identifies them (GDPR erasure). See the Python docstring. */
export async function erase(app: App, code: string): Promise<Doc | null> {
  const doc = await app.db.members.findOne({ code });
  if (!doc) return null;

  let passExpired = false;
  if (doc.google_object_id) {
    try {
      passExpired = await expireObject(app, code);
    } catch (e) {
      console.error(`Could not expire the Google pass for ${code}`, e);
    }
  }

  // Must happen before the record goes: the push needs the registrations, the tombstone the auth token.
  let passVoided = false;
  try {
    passVoided = await voidApplePass(app, doc);
  } catch (e) {
    console.error(`Could not void the Apple pass for ${code}`, e);
  }

  const removed = {
    transactions: (await app.db.transactions.deleteMany({ code })).deletedCount,
    magic_tokens: (await app.db.magic_tokens.deleteMany({ email: doc.email })).deletedCount,
    analytics_events: (await app.db.analytics_events.deleteMany({ code })).deletedCount,
    // Runs carry the player's first name and the leaderboard reads it from there.
    game_runs: (await app.db.game_runs.deleteMany({ code })).deletedCount,
    // Kept when the pass was voided, so the phone can still be told and fetch the closed version.
    wallet_registrations: doc.wallet_serial
      ? passVoided ? 0 : (await app.db.wallet_registrations.deleteMany({ serial: doc.wallet_serial })).deletedCount
      : 0,
  };
  await app.db.members.deleteOne({ code });
  console.log(`Erased member ${code} (${doc.email}): voided=${passVoided ? 'True' : 'False'} ${JSON.stringify(removed)}`);
  return { code, email: doc.email, google_pass_expired: passExpired, apple_pass_voided: passVoided, removed };
}

/** Resolve a scanned value: card code, Wallet serial or loyalty token. */
export async function findByScan(app: App, value: string): Promise<Doc | null> {
  value = value.trim();
  return app.db.members.findOne({ $or: [{ code: value }, { wallet_serial: value }, { loyalty_token: value }] });
}

export async function log(
  app: App, code: string, name: string, employee: string, kind: string,
  prevStamps: number, newStamps: number, prevReward: boolean, newReward: boolean, drink: string | null = null,
): Promise<void> {
  await app.db.transactions.insertOne({
    id: uuid4(),
    code, customer_name: name, employee, type: kind,
    prev_stamps: prevStamps, new_stamps: newStamps,
    prev_reward: prevReward, new_reward: newReward,
    drink,
    at: nowIso(),
  });
}

/** Bank a free drink for someone. Never goes below zero. */
export async function grantFreeCoffees(app: App, code: string, count: number, reason: string, employee = 'system'): Promise<Doc | null> {
  const doc = await app.db.members.findOne({ code });
  if (!doc) return null;
  const total = Math.max(0, (get(doc, 'free_coffees', 0) as number) + count);
  await app.db.members.updateOne({ code }, { $set: { free_coffees: total } });
  doc.free_coffees = total;
  await log(app, code, doc.name, employee, count > 0 ? FREE_COFFEE_EARNED : FREE_COFFEE_REDEEMED,
    doc.stamps, doc.stamps, doc.reward_ready, doc.reward_ready);
  console.log(`Free coffees for ${code}: ${count >= 0 ? '+' : ''}${count} (${reason}) -> ${total}`);
  return doc;
}

/** Pay out a referral the first time the referred member is served. Returns the referrer if credited. */
export async function creditReferrer(app: App, member: Doc, employee: string): Promise<Doc | null> {
  const referrerCode = member.referred_by;
  if (!referrerCode || member.referral_credited) return null;

  // Mark first: a failure past this point must not pay twice.
  await app.db.members.updateOne({ code: member.code }, { $set: { referral_credited: true } });
  member.referral_credited = true;
  return grantFreeCoffees(app, referrerCode, 1, `referred ${member.code}`, employee);
}
