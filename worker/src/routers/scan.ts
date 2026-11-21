// Staff scan actions. Port of backend/app/routers/scan.py. Every route resolves a scanned value to one member,
// mutates the balance, records a transaction and refreshes the Wallet pass.
import { HttpError, Invalid, int, optStr, type Ctx, type Router } from '../http';
import type { Doc } from '../db';
import { settings } from '../config';
import { getCurrentUser } from '../security';
import * as drinks from '../services/drinks';
import * as email from '../services/email';
import * as members from '../services/members';
import * as plant from '../services/plant';
import * as tiers from '../services/tiers';
import { notifyUpdate } from '../services/wallet';
import { nowIso } from '../util';

async function scannedMember(c: Ctx, code: string): Promise<Doc> {
  const doc = await members.findByScan(c, code);
  if (!doc) throw new HttpError(404, 'Customer not found');
  return doc;
}

async function apply(c: Ctx, code: string, changes: Doc, doc: Doc) {
  await c.db.members.updateOne({ code }, { $set: changes });
  Object.assign(doc, changes);
  await notifyUpdate(c, code);
}

/** What the counter sees: the member, plus the drink to offer them. */
async function card(c: Ctx, doc: Doc) {
  return { ...members.publicView(c, doc), usual: await drinks.usual(c, doc.code) };
}

/** The optional DrinkChoice body: empty or null means none; {drink: max 50 chars or null}. */
async function drinkChoice(c: Ctx): Promise<string | null> {
  const b = await c.json();
  if (b === null || b === undefined) return null;
  if (typeof b !== 'object' || Array.isArray(b)) {
    throw new HttpError(422, [{ loc: ['body'], msg: 'Input should be a valid dictionary or object to extract fields from', type: 'model_attributes_type' }]);
  }
  const inv = new Invalid();
  const drink = optStr(b.drink, 'drink', inv, { max: 50 });
  inv.throwIfAny();
  return drink;
}

async function chosen(c: Ctx, drink: string | null): Promise<string | null> {
  if (!(await drinks.known(c, drink))) throw new HttpError(400, 'Unknown drink');
  return drink;
}

// The grand-opening gift: kept so the counter can still honour a pass handed out before opening day.
const OFFER = ['☕ Coffee', '🍪 Cookie', '✨ Exclusive Bros Cafe sticker'];
const NO_PASS = 'This member has no opening gift';

export function register(api: Router) {
  // Before /scan/{code}, as in the Python router.
  api.get('/scan/drinks', async (c) => {
    await getCurrentUser(c);
    return drinks.choices(c);
  });

  api.get('/scan/{code}', async (c) => {
    await getCurrentUser(c);
    return card(c, await scannedMember(c, c.params.code));
  });

  api.post('/scan/{code}/add-coffee', async (c) => {
    // FastAPI resolves the user dependency before it validates the body
    const user = await getCurrentUser(c);
    const body = await drinkChoice(c);
    const doc = await scannedMember(c, c.params.code);
    const code: string = doc.code;
    const drink = await chosen(c, body);
    const required = tiers.stampsRequired(doc, settings(c.env));

    // Diamond members drink free: serving one is the whole transaction.
    if (required === 0) {
      const changes = { ...(await plant.water(c, doc)), stamps: 0, reward_ready: true, total_coffees: doc.total_coffees + 1, rewards_redeemed: doc.rewards_redeemed + 1 };
      await apply(c, code, changes, doc);
      await members.log(c, code, doc.name, user.email, members.REWARD_REDEEMED, 0, 0, true, true, drink);
      return card(c, doc);
    }

    if (doc.reward_ready) throw new HttpError(400, 'Reward is ready — redeem the free coffee first');

    const previous = doc.stamps;
    const stamps = previous + 1;
    const rewardReady = stamps >= required;
    const changes = { ...(await plant.water(c, doc)), stamps, total_coffees: doc.total_coffees + 1, reward_ready: rewardReady };

    await apply(c, code, changes, doc);
    await members.log(c, code, doc.name, user.email, members.COFFEE_ADDED, previous, stamps, false, rewardReady, drink);

    // The friend has now actually been served, so the card they were handed pays out. Never blocks the counter.
    try {
      const referrer = await members.creditReferrer(c, doc, user.email);
      if (referrer) await email.sendReferralEarned(c, referrer.email, doc.name, members.get(referrer, 'lang', 'hu') as string);
    } catch (e) {
      console.warn(`Referral credit failed: ${(e as Error)?.message ?? e}`);
    }
    if (rewardReady) {
      await members.log(c, code, doc.name, user.email, members.REWARD_EARNED, stamps, stamps, false, true);
      try {
        await email.sendRewardReady(c, doc.email, members.get(doc, 'lang', 'hu') as string);
      } catch (e) {
        console.warn(`Reward email failed: ${(e as Error)?.message ?? e}`);
      }
    }
    return card(c, doc);
  });

  api.post('/scan/{code}/redeem', async (c) => {
    const user = await getCurrentUser(c);
    const body = await drinkChoice(c);
    const doc = await scannedMember(c, c.params.code);
    if (!doc.reward_ready) throw new HttpError(400, 'No reward available to redeem');

    const code: string = doc.code;
    const drink = await chosen(c, body);
    const previous = doc.stamps;
    const changes = { ...(await plant.water(c, doc)), stamps: 0, reward_ready: false, rewards_redeemed: doc.rewards_redeemed + 1 };

    await apply(c, code, changes, doc);
    await members.log(c, code, doc.name, user.email, members.REWARD_REDEEMED, previous, 0, true, false, drink);
    return card(c, doc);
  });

  /** Spend a banked free drink (referrals, weekly game winner). The stamp card is untouched. */
  api.post('/scan/{code}/redeem-free', async (c) => {
    const user = await getCurrentUser(c);
    const body = await drinkChoice(c);
    const doc = await scannedMember(c, c.params.code);
    if ((members.get(doc, 'free_coffees', 0) as number) < 1) throw new HttpError(400, 'No free coffee banked');

    const drink = await chosen(c, body);
    const code: string = doc.code;
    const remaining = doc.free_coffees - 1;
    const changes = { ...(await plant.water(c, doc)), free_coffees: remaining };
    await c.db.members.updateOne({ code }, { $set: changes });
    Object.assign(doc, changes);
    await notifyUpdate(c, code);
    await members.log(c, code, doc.name, user.email, members.FREE_COFFEE_REDEEMED, doc.stamps, doc.stamps, doc.reward_ready, doc.reward_ready, drink);
    return card(c, doc);
  });

  api.post('/scan/{code}/adjust', async (c) => {
    const user = await getCurrentUser(c);
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const delta = int(b.delta, 'delta', inv);
    inv.throwIfAny();
    const doc = await scannedMember(c, c.params.code);
    const code: string = doc.code;
    const previous = doc.stamps, previousReward = doc.reward_ready;
    const required = tiers.stampsRequired(doc, settings(c.env)) || settings(c.env).stamps_required;
    const stamps = Math.max(0, Math.min(required, previous + delta));
    const rewardReady = stamps >= required;

    await apply(c, code, { stamps, reward_ready: rewardReady }, doc);
    await members.log(c, code, doc.name, user.email, members.MANUAL_ADJUSTMENT, previous, stamps, previousReward, rewardReady);
    return card(c, doc);
  });

  api.post('/scan/{code}/opening/reveal', async (c) => {
    await getCurrentUser(c);
    const doc = await scannedMember(c, c.params.code);
    let status = members.get(doc, 'opening_status', 'reserved');
    if (status === 'none') throw new HttpError(400, NO_PASS);
    if (status !== 'redeemed') {
      status = 'revealed';
      await c.db.members.updateOne({ code: doc.code }, { $set: { opening_status: status } });
    }
    return { status, offer: OFFER };
  });

  api.post('/scan/{code}/opening/redeem', async (c) => {
    const user = await getCurrentUser(c);
    const doc = await scannedMember(c, c.params.code);
    if (doc.opening_status === 'none') throw new HttpError(400, NO_PASS);
    if (doc.opening_status === 'redeemed') throw new HttpError(400, 'Opening offer already redeemed');
    await c.db.members.updateOne({ code: doc.code }, { $set: { opening_status: 'redeemed', opening_redeemed_at: nowIso() } });
    await members.log(c, doc.code, doc.name, user.email, members.OPENING_REDEEMED, doc.stamps, doc.stamps, doc.reward_ready, doc.reward_ready);
    return { status: 'redeemed', offer: OFFER };
  });
}
