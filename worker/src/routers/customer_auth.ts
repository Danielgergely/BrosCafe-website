// Passwordless customer accounts: request a magic link, verify it, manage the account.
// Port of backend/app/routers/customer_auth.py.
import { HttpError, Invalid, email, oneOf, optStr, str, type Ctx, type Router } from '../http';
import type { Doc } from '../db';
import { settings } from '../config';
import { createCustomerToken, getCurrentCustomer, hashToken } from '../security';
import * as emailService from '../services/email';
import * as members from '../services/members';
import * as myOrders from '../services/my_orders';
import { isoAt, nowIso, parseIso, tokenUrlsafe } from '../util';

/** Resolve a referral code, ignoring anything that isn't a real other member. */
async function referrerCode(c: Ctx, ref: string | null, addr: string): Promise<string | null> {
  if (!ref) return null;
  const referrer = await c.db.members.findOne({ code: ref.trim() }, { projection: { code: 1, email: 1 } });
  if (!referrer || referrer.email === addr) return null;
  return referrer.code;
}

export function register(api: Router) {
  /** One smart form: a known email just gets a link; a new one needs a first name first. */
  api.post('/auth/request-link', async (c) => {
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const addr = email(b.email, 'email', inv);
    const firstNameIn = optStr(b.first_name, 'first_name', inv);
    const ref = optStr(b.ref, 'ref', inv, { max: 64 });
    const langIn = oneOf(b.lang, 'lang', inv, ['hu', 'en'] as const);
    inv.throwIfAny();

    const e = addr.toLowerCase().trim();
    const firstName = (firstNameIn || '').trim();
    const lang = langIn || 'hu';
    let member: Doc | null = await c.db.members.findOne({ email: e });
    const isNew = member === null;

    // Returning needs_name before creating anything keeps phantom members out of the database.
    if (isNew && !firstName) return { ok: true, is_new: true, needs_name: true };

    if (isNew) {
      member = await members.create(c, firstName, e, lang, await referrerCode(c, ref, e));
    } else {
      // Remember the language they signed in with, so the reward email weeks later is in the same one.
      const changes: Doc = { lang };
      if (firstName && [null, undefined, '', 'Friend'].includes(member!.name)) changes.name = firstName;
      await c.db.members.updateOne({ email: e }, { $set: changes });
    }

    const raw = tokenUrlsafe(32);
    const s = settings(c.env);
    await c.db.magic_tokens.insertOne({
      token_hash: await hashToken(raw),
      email: e,
      // A BSON datetime in Mongo (TTL index); an ISO string here, deleted by the cron once it is past.
      expires_at: isoAt(new Date(Date.now() + s.magic_link_minutes * 60_000)),
      used: false,
      created_at: nowIso(),
    });

    const link = `${s.frontend_url}/auth/verify?token=${raw}`;
    if (!s.email_configured) {
      // Local development only: with no mail provider the link is unreachable, so log it.
      console.warn(`DEV ONLY — magic link for ${e}: ${link}`);
    }
    try {
      await emailService.sendMagicLink(c, e, link, isNew, lang);
    } catch (err) {
      console.error(`Magic link email to ${e} failed: ${(err as Error)?.message ?? err}`);
    }
    return { ok: true, is_new: isNew };
  });

  api.post('/auth/verify', async (c) => {
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const token = str(b.token, 'token', inv);
    inv.throwIfAny();

    const tokenHash = await hashToken(token);
    const record = await c.db.magic_tokens.findOne({ token_hash: tokenHash, used: false });
    if (!record || parseIso(record.expires_at).getTime() < Date.now()) {
      throw new HttpError(400, 'This link is invalid or has expired. Please request a new one.');
    }

    // Python updated by _id; the hash identifies the same single unused record.
    await c.db.magic_tokens.updateOne({ token_hash: tokenHash, used: false }, { $set: { used: true } });
    const member = await c.db.members.findOne({ email: record.email });
    if (!member) throw new HttpError(404, 'Account not found');
    return {
      token: await createCustomerToken(c, member.code, member.email),
      member: members.publicView(c, member),
    };
  });

  /** The signed-in customer, and a freshly minted session (sliding: every visit resets the clock). */
  api.get('/customer/me', async (c) => {
    const member = await getCurrentCustomer(c);
    return {
      ...members.publicView(c, member),
      session_token: await createCustomerToken(c, member.code, member.email),
    };
  });

  /** "Rendeléseim": the guest's Delivery orders and After Hours bookings; and one order for "Újra rendelem". */
  api.get('/customer/orders', async (c) => myOrders.list(c, await getCurrentCustomer(c)));
  api.get('/customer/reorder', async (c) => myOrders.reorder(c, await getCurrentCustomer(c), c.query.get('order')));

  api.post('/customer/change-email', async (c) => {
    const member = await getCurrentCustomer(c);
    const b = (await c.json()) ?? {};
    const inv = new Invalid();
    const addr = email(b.email, 'email', inv);
    inv.throwIfAny();

    const newEmail = addr.toLowerCase().trim();
    const clash = await c.db.members.findOne({ email: newEmail });
    if (clash && clash.code !== member.code) throw new HttpError(400, 'That email is already in use.');
    await c.db.members.updateOne({ code: member.code }, { $set: { email: newEmail } });
    return members.publicView(c, (await c.db.members.findOne({ code: member.code }))!);
  });
}
