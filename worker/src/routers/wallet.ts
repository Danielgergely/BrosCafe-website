// Apple Wallet pass download plus the PassKit web service Apple calls back on. Port of backend/app/routers/wallet.py.
import { HttpError, type Ctx, type Router } from '../http';
import type { Doc } from '../db';
import { nowIso, parseIso } from '../util';
import * as apple from '../wallet/apple';
import * as artwork from '../wallet/artwork';
import * as google from '../wallet/google';
import * as wallet from '../services/wallet';

const PKPASS_MEDIA_TYPE = 'application/vnd.apple.pkpass';

/** FastAPI's int path parameter: anything else answers 422. */
function intParam(c: Ctx, name: string): number {
  const raw = c.params[name];
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
    throw new HttpError(422, [{ type: 'int_parsing', loc: ['path', name], msg: 'Input should be a valid integer, unable to parse string as an integer', input: raw }]);
  }
  return Number.parseInt(raw, 10);
}

const normaliseLang = (value: string) => (String(value).toLowerCase().startsWith('hu') ? 'hu' : 'en');

/** A stored ISO timestamp as an HTTP date (Python sent the ISO string itself, which is not a valid header date). */
function httpDate(iso: string): string {
  const d = parseIso(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toUTCString();
}

const pkpassResponse = (data: Uint8Array, headers: Record<string, string>) =>
  new Response(data, { headers: { 'Content-Type': PKPASS_MEDIA_TYPE, ...headers } });

// ---- PassKit web service (Apple calls these; paths are fixed by the spec) ----
function authorise(c: Ctx, expectedToken: string): void {
  const header = c.req.headers.get('Authorization') ?? '';
  const prefix = 'ApplePass ';
  const token = header.startsWith(prefix) ? header.slice(prefix.length) : '';
  if (!token || !timingSafeEqual(token, expectedToken || '')) throw new HttpError(401, 'Unauthorized');
}

/** hmac.compare_digest. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
}

/** Resolve a serial to a live member, or to a voided pass whose tombstone outlives the member. */
async function passBySerial(c: Ctx, serial: string): Promise<[Doc | null, Doc | null]> {
  const member = await c.db.members.findOne({ wallet_serial: serial });
  if (member) return [member, null];
  const tombstone = await wallet.voidedPass(c, serial);
  if (tombstone) return [null, tombstone];
  throw new HttpError(404, 'Not found');
}

const authToken = (member: Doc | null, tombstone: Doc | null): string =>
  (member ?? {}).wallet_auth_token || apple.get(tombstone ?? {}, 'auth_token', '');

export function register(api: Router) {
  /**
   * The banner Google Wallet fetches for a member's card. Public by necessity (Google's servers request it) and it
   * reveals nothing: a tier's colours and a count of filled circles. Each state has its own immutable URL.
   */
  api.get('/wallet/hero/{tier}/{stamps}-{required}.png', async (c) => {
    const tier = c.params.tier;
    const stamps = intParam(c, 'stamps');
    const required = intParam(c, 'required');
    if (!(artwork.TIERS as readonly string[]).includes(tier) || !(stamps >= 0 && stamps <= 50 && required >= 0 && required <= 50)) {
      throw new HttpError(404, 'Not found');
    }
    return new Response(await artwork.hero(c, tier, stamps, required), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  });

  api.get('/members/{code}/wallet/apple', async (c) => {
    const code = c.params.code;
    const doc = await c.db.members.findOne({ code });
    if (!doc) throw new HttpError(404, 'Loyalty card not found');

    if (!apple.isConfigured(c.env)) {
      return { configured: false, message: 'Apple Wallet passes are not configured yet.', missing: apple.configStatus(c.env).missing };
    }

    const lang = normaliseLang(c.query.get('lang') ?? 'en');
    await c.db.members.updateOne({ code }, { $set: { wallet_lang: lang } });
    doc.wallet_lang = lang;

    let pkpass: Uint8Array;
    try {
      pkpass = await wallet.buildPkpass(c, doc, lang);
    } catch (e) {
      console.error(`Failed to build pkpass for ${code}`, e);
      await wallet.bumpStat(c, 'gen_failures');
      throw new HttpError(500, "We're having trouble creating your Wallet card right now.");
    }

    await wallet.bumpStat(c, 'passes_issued');
    const filename = `broscafe-${doc.wallet_serial}.pkpass`;
    return pkpassResponse(pkpass, { 'Content-Disposition': `attachment; filename="${filename}"` });
  });

  /** Returns the 'Save to Google Wallet' link for this member's pass. */
  api.get('/members/{code}/wallet/google', async (c) => {
    const code = c.params.code;
    const doc = await c.db.members.findOne({ code });
    if (!doc) throw new HttpError(404, 'Loyalty card not found');

    if (!google.isConfigured(c.env)) {
      return { configured: false, message: 'Google Wallet passes are not configured yet.', missing: google.configStatus(c.env).missing };
    }

    const lang = normaliseLang(c.query.get('lang') ?? 'en');
    try {
      return { configured: true, save_url: await wallet.googleSaveLink(c, doc, lang) };
    } catch (e) {
      console.error(`Failed to build Google Wallet pass for ${code}`, e);
      await wallet.bumpStat(c, 'google_gen_failures');
      throw new HttpError(502, "We're having trouble creating your Google Wallet card right now.");
    }
  });

  api.post('/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}', async (c) => {
    const { device_id, pass_type, serial } = c.params;
    const [member, tombstone] = await passBySerial(c, serial);
    authorise(c, authToken(member, tombstone));
    let body: any;
    try {
      body = await c.json();
    } catch {
      body = {};
    }

    const existing = await c.db.wallet_registrations.findOne({ device_id, serial });
    await c.db.wallet_registrations.updateOne(
      { device_id, serial },
      { $set: { device_id, serial, pass_type, push_token: body?.pushToken ?? null, updated_at: nowIso() } },
      { upsert: true },
    );
    return new Response(null, { status: existing ? 200 : 201 });
  });

  api.delete('/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}', async (c) => {
    const { device_id, serial } = c.params;
    const member = await c.db.members.findOne({ wallet_serial: serial });
    const tombstone = member ? null : await wallet.voidedPass(c, serial);
    if (member || tombstone) authorise(c, authToken(member, tombstone));
    await c.db.wallet_registrations.deleteOne({ device_id, serial });
    // The card is off the phone, so the tombstone has nothing left to answer.
    if (tombstone && !(await c.db.wallet_registrations.countDocuments({ serial }))) {
      await c.db.voided_passes.deleteOne({ serial });
    }
    return new Response(null, { status: 200 });
  });

  api.get('/wallet/v1/devices/{device_id}/registrations/{pass_type}', async (c) => {
    const { device_id, pass_type } = c.params;
    // passesUpdatedSince is accepted and, as before, not used: every registered serial is returned.
    const registrations = await c.db.wallet_registrations.find({ device_id, pass_type }, { limit: 500 });
    const serials = registrations.map((r) => r.serial);
    if (!serials.length) return new Response(null, { status: 204 });
    return { lastUpdated: nowIso(), serialNumbers: serials };
  });

  api.get('/wallet/v1/passes/{pass_type}/{serial}', async (c) => {
    const { serial } = c.params;
    const [member, tombstone] = await passBySerial(c, serial);
    authorise(c, authToken(member, tombstone));
    if (!apple.isConfigured(c.env)) throw new HttpError(503, 'Wallet not configured');

    if (tombstone) {
      const pkpass = await apple.buildVoidedPkpass(c.env, serial, apple.get(tombstone, 'auth_token', ''), wallet.webServiceUrl(c), apple.get(tombstone, 'lang', 'hu'));
      if (tombstone.voided_at === undefined) throw new Error("KeyError: 'voided_at'");
      return pkpassResponse(pkpass, { 'Last-Modified': httpDate(String(tombstone.voided_at)) });
    }

    const pkpass = await wallet.buildPkpass(c, member!);
    const lastModified = apple.get(member!, 'wallet_updated_at', nowIso());
    return pkpassResponse(pkpass, { 'Last-Modified': httpDate(String(lastModified)) });
  });

  api.post('/wallet/v1/log', async (c) => {
    try {
      console.info(`Apple Wallet log: ${JSON.stringify(await c.json()).slice(0, 500)}`);
    } catch {
      // ignored, as before
    }
    return { ok: true };
  });
}
