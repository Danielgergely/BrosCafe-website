// Google Wallet loyalty passes for Android. Port of backend/app/wallet/google.py.
// The pass lives on Google's servers: we create a LoyaltyObject over their REST API and hand the customer a signed
// "save" link; to update a stamp count we PATCH the object and Google pushes it to the device.
import type { App } from '../http';
import type { Doc } from '../db';
import type { Env } from '../env';
import { fmt, get, pyStr } from './apple';

const API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SAVE_URL = 'https://pay.google.com/gp/v/save';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

// Google's palette fields want plain hex; this matches the site's tokens. The card colour is a property of the
// class, shared by every member, so the tier shows in the hero image and the text modules instead.
const BRAND_BACKGROUND = '#66734A';

/** Per isolate, like the Python process-wide cache. */
const tokenCache: { value: string | null; expires_at: number } = { value: null, expires_at: 0 };

const env_ = (env: Env, k: string) => (env[k] ? String(env[k]) : '').trim();

// ---------------------------------------------------------------- configuration
function serviceAccount(env: Env): Doc | null {
  const inline = env_(env, 'GOOGLE_SERVICE_ACCOUNT_JSON');
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }
  return null;
}

export function configStatus(env: Env) {
  const enabled = env_(env, 'GOOGLE_WALLET_CONFIGURED').toLowerCase() === 'true';
  const issuerId = env_(env, 'GOOGLE_ISSUER_ID');
  const account = serviceAccount(env);
  const hasKey = !!(account && account.private_key && account.client_email);
  const missing: string[] = [];
  if (!enabled) missing.push('GOOGLE_WALLET_CONFIGURED="true"');
  if (!issuerId) missing.push('GOOGLE_ISSUER_ID');
  if (!hasKey) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  return { enabled_flag: enabled, issuer_id: !!issuerId, service_account: hasKey, configured: enabled && !!issuerId && hasKey, missing };
}

export const isConfigured = (env: Env) => configStatus(env).configured;

const issuerId = (env: Env) => env_(env, 'GOOGLE_ISSUER_ID');

/** One class per programme — the shared template every pass is built from. */
export function classId(env: Env) {
  const suffix = env_(env, 'GOOGLE_WALLET_CLASS_SUFFIX') || 'broscafe_loyalty';
  return `${issuerId(env)}.${suffix}`;
}

/** Stable per member. */
export const objectId = (env: Env, memberCode: string) => `${issuerId(env)}.${memberCode}`;

// ---------------------------------------------------------------- auth (PyJWT's RS256, on WebCrypto)
const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function rs256(payload: Doc, privateKeyPem: string): Promise<string> {
  const body = privateKeyPem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const enc = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
  const head = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)));
  return `${head}.${b64url(sig)}`;
}

/** httpx's raise_for_status. */
async function raiseForStatus(res: Response) {
  if (!res.ok) throw new Error(`Google Wallet HTTP ${res.status} for ${res.url}: ${(await res.text()).slice(0, 500)}`);
}

/** A self-signed service-account JWT exchanged for an OAuth access token, cached until shortly before expiry. */
async function accessToken(env: Env): Promise<string> {
  const now = Date.now() / 1000;
  if (tokenCache.value && now < tokenCache.expires_at) return tokenCache.value;

  const account = serviceAccount(env);
  if (!account) throw new Error('Google Wallet service account is not configured');

  const issuedAt = Math.floor(now);
  const assertion = await rs256(
    { iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 },
    account.private_key,
  );
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(20_000),
  });
  await raiseForStatus(response);
  const payload = (await response.json()) as Doc;
  tokenCache.value = payload.access_token;
  // Refresh a minute early rather than racing the expiry.
  tokenCache.expires_at = now + Math.trunc(Number(payload.expires_in ?? 3600)) - 60;
  return tokenCache.value as string;
}

async function request(env: Env, method: string, path: string, json?: unknown): Promise<Response> {
  const token = await accessToken(env);
  return fetch(`${API_BASE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(30_000),
  });
}

// ---------------------------------------------------------------- pass content
type Strings = { [k: string]: any; tier_names: Record<string, string> };
export const STRINGS: Record<string, Strings> = {
  en: {
    program: 'Bros Cafe Loyalty Club',
    points: 'Coffees',
    reward_header: 'Your reward',
    reward_ready: 'Free coffee ready — show this at the counter',
    one_more: 'One more coffee and the next is free',
    many: '{n} more coffees until your free one',
    how_header: 'How it works',
    how_body: 'Collect {n} stamps and your next coffee is on us. Show this pass at the counter.',
    card_link: 'Open my loyalty card',
    tier_header: 'Status',
    tier_names: { base: 'Member', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond' },
    tier_progress: '{tier} — {n} more coffees to {next}',
    always_free: 'Every coffee on the house',
  },
  hu: {
    program: 'Bros Cafe Klubtag',
    points: 'Kávék',
    reward_header: 'A jutalmad',
    reward_ready: 'Megvan az ingyen kávéd — mutasd meg a pultnál',
    one_more: 'Még egy kávé, és a következő ingyen van',
    many: 'Még {n} kávé az ingyenesig',
    how_header: 'Így működik',
    how_body: '{n} pecsét, és a következő kávé a miénk. Mutasd meg ezt a kártyát a pultnál.',
    card_link: 'Megnyitom a kártyám',
    tier_header: 'Szint',
    tier_names: { base: 'Klubtag', bronze: 'Bronz', silver: 'Ezüst', gold: 'Arany', diamond: 'Gyémánt' },
    tier_progress: '{tier} — még {n} kávé a(z) {next} szintig',
    always_free: 'Minden kávé a ház ajándéka',
  },
};

const strings = (lang: string) => STRINGS[lang] ?? STRINGS.en;

export function buildClass(env: Env, cafe: Doc, lang = 'en'): Doc {
  const text = strings(lang);
  const logo = env_(env, 'GOOGLE_WALLET_LOGO_URL');
  const loyaltyClass: Doc = {
    id: classId(env),
    issuerName: get(cafe, 'name', 'Bros Cafe'),
    programName: text.program,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: BRAND_BACKGROUND,
  };
  if (logo) {
    loyaltyClass.programLogo = {
      sourceUri: { uri: logo },
      contentDescription: { defaultValue: { language: lang, value: get(cafe, 'name', 'Bros Cafe') } },
    };
  }
  if (get(cafe, 'address')) loyaltyClass.locations = []; // coordinates optional; address shown in text
  return loyaltyClass;
}

/** Where Google fetches the member's banner. Absolute, because Google's servers request it. */
export function heroUri(env: Env, tier: string, stamps: number, required: number) {
  const base = String(env.FRONTEND_URL ?? '').replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/api/wallet/hero/${tier}/${pyStr(stamps)}-${pyStr(required)}.png`;
}

export function buildObject(env: Env, member: Doc, cafe: Doc, barcodeValue: string, cardUrl: string, lang = 'en'): Doc {
  const text = strings(lang);
  const required = get(member, 'stamps_required', 10);
  const stamps = get(member, 'stamps', 0);
  const remaining = Math.max(required - stamps, 0);
  const tier = get(member, 'tier', 'base');
  const tierName = get(text.tier_names, tier, tier);

  let status: string;
  if (get(member, 'always_free')) status = text.always_free;
  else if (get(member, 'reward_ready')) status = text.reward_ready;
  else if (remaining === 1) status = text.one_more;
  else status = fmt(text.many, { n: remaining });

  const obj: Doc = {
    id: objectId(env, member.code),
    classId: classId(env),
    accountIdLabel: get(text.tier_names, tier, ''),
    state: 'ACTIVE',
    accountId: member.code,
    accountName: get(member, 'name', ''),
    loyaltyPoints: {
      label: text.points,
      balance: { string: get(member, 'always_free') ? text.always_free : `${pyStr(stamps)} / ${pyStr(required)}` },
    },
    barcode: { type: 'QR_CODE', value: barcodeValue, alternateText: member.code },
    textModulesData: [
      { header: text.reward_header, body: status, id: 'status' },
      {
        header: text.tier_header,
        body: get(member, 'next_tier')
          ? fmt(text.tier_progress, { tier: tierName, n: get(member, 'coffees_to_next', 0), next: get(text.tier_names, get(member, 'next_tier'), '') })
          : tierName,
        id: 'tier',
      },
      { header: text.how_header, body: fmt(text.how_body, { n: required }), id: 'how' },
    ],
    linksModuleData: { uris: [{ uri: cardUrl, description: text.card_link, id: 'card' }] },
  };
  // The banner is the only surface Google gives us to design: the tier band and the stamp row.
  const banner = get(member, 'always_free') ? heroUri(env, tier, 0, 0) : heroUri(env, tier, get(member, 'stamps', 0), required);
  if (banner) {
    obj.heroImage = {
      sourceUri: { uri: banner },
      contentDescription: { defaultValue: { language: lang, value: text.points } },
    };
  }
  return obj;
}

// ---------------------------------------------------------------- operations

/**
 * Create the loyalty class if it does not exist. Never update it: Google refuses a class edit that keeps APPROVED,
 * and UNDER_REVIEW puts the "only for testing" banner on every card. A new GOOGLE_WALLET_CLASS_SUFFIX makes a fresh class.
 */
export async function ensureClass(app: App, cafe: Doc, lang = 'en'): Promise<void> {
  const existing = await request(app.env, 'GET', `loyaltyClass/${classId(app.env)}`);
  if (existing.status === 200) return;
  if (existing.status !== 404) await raiseForStatus(existing);
  const created = await request(app.env, 'POST', 'loyaltyClass', buildClass(app.env, cafe, lang));
  await raiseForStatus(created);
  console.info(`Created Google Wallet loyalty class ${classId(app.env)}`);
}

/** Create the member's pass, or update it if it already exists. */
export async function upsertObject(app: App, member: Doc, cafe: Doc, barcodeValue: string, cardUrl: string, lang = 'en'): Promise<Doc> {
  const body = buildObject(app.env, member, cafe, barcodeValue, cardUrl, lang);
  const existing = await request(app.env, 'GET', `loyaltyObject/${body.id}`);
  if (existing.status === 200) {
    const patched = await request(app.env, 'PATCH', `loyaltyObject/${body.id}`, body);
    await raiseForStatus(patched);
    return patched.json();
  }
  if (existing.status !== 404) await raiseForStatus(existing);
  const created = await request(app.env, 'POST', 'loyaltyObject', body);
  await raiseForStatus(created);
  return created.json();
}

/** Update an already-issued pass. No-op if the customer never saved one. */
export async function pushUpdate(app: App, member: Doc, cafe: Doc, barcodeValue: string, cardUrl: string, lang = 'en'): Promise<boolean> {
  const body = buildObject(app.env, member, cafe, barcodeValue, cardUrl, lang);
  const response = await request(app.env, 'PATCH', `loyaltyObject/${body.id}`, body);
  if (response.status === 404) return false; // never saved to a device; nothing to update
  await raiseForStatus(response);
  return true;
}

/** Mark an issued pass expired (Google greys it out). False if the customer never saved one. */
export async function expireObject(app: App, memberCode: string): Promise<boolean> {
  const oid = objectId(app.env, memberCode);
  const response = await request(app.env, 'PATCH', `loyaltyObject/${oid}`, { id: oid, state: 'EXPIRED' });
  if (response.status === 404) return false;
  await raiseForStatus(response);
  return true;
}

/** The 'Save to Google Wallet' URL. The object is embedded in the signed token, so the link works on its own. */
export async function saveLink(app: App, member: Doc, cafe: Doc, barcodeValue: string, cardUrl: string, origins: string[], lang = 'en'): Promise<string> {
  const account = serviceAccount(app.env);
  if (!account) throw new Error('Google Wallet service account is not configured');
  const token = await rs256(
    {
      iss: account.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins,
      payload: { loyaltyObjects: [buildObject(app.env, member, cafe, barcodeValue, cardUrl, lang)] },
    },
    account.private_key,
  );
  return `${SAVE_URL}/${token}`;
}
