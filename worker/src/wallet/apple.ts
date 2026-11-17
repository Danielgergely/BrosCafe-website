// Apple Wallet (.pkpass) generation + signing for Bros Cafe loyalty passes. Port of backend/app/wallet/apple.py.
// Credentials come only from Worker secrets, as PEM strings (the Python version could also read files or a .p12).
// Pushes go through the APNS_CERT mTLS binding, which holds the same pass certificate.
import forge from 'node-forge';
import { zipSync, type Zippable } from 'fflate';
import type { App } from '../http';
import type { Doc } from '../db';
import type { Env } from '../env';
import * as artwork from './artwork';
import { PASS_ASSETS } from './pass_assets';

const apnsHost = (env: Env) => (env.APNS_HOST as string | undefined) || 'https://api.push.apple.com';

// ---------------------------------------------------------------- Python-compatible helpers

/** dict.get(key, default): the default only when the key is absent (a stored null stays null). */
export const get = (d: Doc, k: string, def: unknown = null): any => (d[k] === undefined ? def : d[k]);

/** A number Python holds as a float, so json.dumps prints 47.0 rather than 47. */
export class PyFloat {
  constructor(readonly value: number) {}
}

/** str(value) as Python prints it. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}

/** str.format with keyword arguments. */
export const fmt = (s: string, args: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => pyStr(args[k]));

function pyString(s: string) {
  let out = '"';
  for (const ch of s) {
    for (let i = 0; i < ch.length; i++) {
      const c = ch.charCodeAt(i);
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += '\\\\';
      else if (c === 0x0a) out += '\\n';
      else if (c === 0x0d) out += '\\r';
      else if (c === 0x09) out += '\\t';
      else if (c === 0x08) out += '\\b';
      else if (c === 0x0c) out += '\\f';
      else if (c < 0x20 || c > 0x7e) out += '\\u' + c.toString(16).padStart(4, '0');
      else out += ch[i];
    }
  }
  return out + '"';
}

/** json.dumps(value) with Python's defaults (", " and ": " separators, ensure_ascii), byte for byte. */
export function pyDumps(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v instanceof PyFloat) {
    const n = v.value;
    if (Number.isNaN(n)) return 'NaN';
    if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
    const r = String(n);
    return Number.isInteger(n) && !/e/.test(r) ? `${r}.0` : r.replace(/e([+-])(\d)$/, 'e$10$2');
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return pyString(v);
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(', ')}]`;
  return `{${Object.entries(v as Doc).map(([k, x]) => `${pyString(k)}: ${pyDumps(x)}`).join(', ')}}`;
}

// ---------------------------------------------------------------- configuration
const env_ = (env: Env, k: string) => {
  const v = env[k];
  return v ? String(v).trim() : '';
};

export function configStatus(env: Env) {
  const team = env_(env, 'APPLE_TEAM_ID');
  const passType = env_(env, 'APPLE_PASS_TYPE_ID');
  const wwdr = !!env_(env, 'APPLE_WWDR_CERTIFICATE');
  const pem = !!(env_(env, 'APPLE_CERTIFICATE') && env_(env, 'APPLE_PRIVATE_KEY'));
  const enabled = env_(env, 'APPLE_PASS_CONFIGURED').toLowerCase() === 'true';
  const missing: string[] = [];
  if (!enabled) missing.push('APPLE_PASS_CONFIGURED="true"');
  if (!team) missing.push('APPLE_TEAM_ID');
  if (!passType) missing.push('APPLE_PASS_TYPE_ID');
  if (!pem) missing.push('APPLE_CERTIFICATE + APPLE_PRIVATE_KEY (PEM)');
  if (!wwdr) missing.push('APPLE_WWDR_CERTIFICATE (PEM)');
  return {
    enabled_flag: enabled, team_id: !!team, pass_type_id: !!passType,
    signing_identity: pem, wwdr,
    configured: enabled && !!team && !!passType && pem && wwdr,
    missing,
  };
}

export const isConfigured = (env: Env) => configStatus(env).configured;

// ---------------------------------------------------------------- signing identity
function loadIdentity(env: Env) {
  const pemCert = env_(env, 'APPLE_CERTIFICATE');
  const pemKey = env_(env, 'APPLE_PRIVATE_KEY');
  const password = env_(env, 'APPLE_CERTIFICATE_PASSWORD') || env_(env, 'APPLE_PASS_CERT_PASSWORD');
  const cert = forge.pki.certificateFromPem(pemCert);
  const key = password ? forge.pki.decryptRsaPrivateKey(pemKey, password) : forge.pki.privateKeyFromPem(pemKey);
  if (!key) throw new Error('APPLE_PRIVATE_KEY could not be decrypted');
  return { key, cert };
}

function loadWwdr(env: Env) {
  const pem = env_(env, 'APPLE_WWDR_CERTIFICATE');
  try {
    return forge.pki.certificateFromPem(pem);
  } catch {
    // DER, base64-encoded (a secret cannot hold raw bytes)
    return forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(pem.replace(/\s+/g, ''))));
  }
}

const toBinary = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};
const fromBinary = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** PKCS#7 detached signature (DER) over the manifest, signed with SHA-256 by the pass certificate, WWDR included. */
export function signManifest(env: Env, manifest: Uint8Array): Uint8Array {
  const { key, cert } = loadIdentity(env);
  const wwdr = loadWwdr(env);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(toBinary(manifest));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime }, // filled in with the current time
    ],
  });
  p7.sign({ detached: true });
  return fromBinary(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// A full palette per tier, not just a background: diamond is meant to look unmistakably different, so it gets dark
// platinum with cool silver labels rather than the cream-on-colour the earned tiers share.
const OLIVE = [102, 115, 74];

// `fg` colours the member's name, the stamp row and the header value, so the accent runs through the card.
export const TIER_PALETTE: Record<string, { bg: number[]; fg: number[]; label: number[] }> = {
  base: { bg: OLIVE, fg: [245, 240, 230], label: [204, 211, 186] },
  bronze: { bg: OLIVE, fg: [226, 162, 108], label: [206, 214, 188] },
  silver: { bg: OLIVE, fg: [214, 222, 232], label: [206, 214, 188] },
  gold: { bg: OLIVE, fg: [242, 202, 108], label: [206, 214, 188] },
  diamond: { bg: [22, 25, 32], fg: [176, 212, 238], label: [140, 160, 182] },
};

type Strings = { [k: string]: any; tier_names: Record<string, string> };

/** The member's standing, and what it would take to move up. */
function tierLine(L: Strings, member: Doc): string {
  const name = get(L.tier_names, get(member, 'tier', 'base'), '');
  const upcoming = get(member, 'next_tier');
  if (!upcoming) return name;
  return fmt(L.tier_progress, { tier: name, n: get(member, 'coffees_to_next', 0), next: get(L.tier_names, upcoming, upcoming) });
}

// ---------------------------------------------------------------- pass.json
export const PASS_STRINGS: Record<string, Strings> = {
  en: {
    desc: 'Bros Cafe Loyalty Card', club: 'Loyalty Club', member: 'Member',
    reward_label: 'Reward', reward_value: '\u{1F389} FREE COFFEE AVAILABLE',
    reward_relevant: 'Your free coffee is ready at Bros Cafe!',
    coffees: 'Coffees', free_coffees: 'Free coffees',
    left_label: 'Coffees to go',
    since_value: 'since {year}',
    until_label: 'To {tier}',
    until_value: '{n} coffees',
    reward_short: '\u{1F389}',
    always_free_short: '\u{1F48E}',
    tier_label: 'Status',
    tier_names: { base: 'Member', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond' },
    tier_progress: '{tier} — {n} more coffees to {next}',
    always_free: '\u{1F48E} Every coffee on the house',
    how_label: 'How it works', how_value: 'Collect {n} stamps and your next coffee is free.',
    status_label: 'Status', cafe_label: 'Bros Cafe',
    one_more: 'One more coffee → FREE COFFEE',
    many: '{n} coffees until your free coffee',
    welcome: 'Welcome to Bros Cafe ☕',
  },
  hu: {
    desc: 'Bros Cafe Hűségkártya', club: 'Hűségklub', member: 'Tag',
    reward_label: 'Jutalom', reward_value: '\u{1F389} INGYEN KÁVÉ ELÉRHETŐ',
    reward_relevant: 'Az ingyen kávéd készen áll a Bros Cafénál!',
    coffees: 'Kávék', free_coffees: 'Ingyen kávék',
    left_label: 'Még kell',
    since_value: '{year} óta',
    until_label: '{tier}ig',
    until_value: '{n} kávé',
    reward_short: '\u{1F389}',
    always_free_short: '\u{1F48E}',
    tier_label: 'Szint',
    tier_names: { base: 'Klubtag', bronze: 'Bronz', silver: 'Ezüst', gold: 'Arany', diamond: 'Gyémánt' },
    tier_progress: '{tier} — még {n} kávé a(z) {next} szintig',
    always_free: '\u{1F48E} Minden kávé a ház ajándéka',
    how_label: 'Hogyan működik', how_value: '{n} pecsét, és a következő kávé a miénk.',
    status_label: 'Állapot', cafe_label: 'Bros Cafe',
    one_more: 'Még egy kávé → INGYEN KÁVÉ',
    many: 'Még {n} kávé az ingyen kávéig',
    welcome: 'Üdv a Bros Cafénál ☕',
  },
};

const rgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** os.environ[key]: the raw value, and a KeyError (here an Error) when it is not set. */
function required(env: Env, k: string): string {
  const v = env[k];
  if (v === undefined || v === null) throw new Error(`KeyError: '${k}'`);
  return String(v);
}

export function buildPassDict(
  env: Env, member: Doc, cafe: Doc, settings: Doc, serial: string, authToken: string, barcodeMsg: string,
  webServiceUrl: string, lang = 'en',
): Doc {
  const L = PASS_STRINGS[lang] ?? PASS_STRINGS.en;
  const requiredStamps = get(member, 'stamps_required', 10);
  const stamps = get(member, 'stamps', 0);
  const reward = get(member, 'reward_ready', false);
  const tier = get(member, 'tier', 'base');
  const palette = TIER_PALETTE[tier] ?? TIER_PALETTE.base;
  const tierName: string = get(L.tier_names, tier, L.club);
  const since = pyStr(get(member, 'created_at', '')).slice(0, 4) || '';
  // "ARANY TAG · 2026 óta". The base tier is already the word for member, so it does not get "TAG" appended to it.
  let nameLine = tierName.toUpperCase();
  if (tier !== 'base') nameLine += ` ${L.member.toUpperCase()}`;
  if (since) nameLine += ` · ${fmt(L.since_value, { year: since })}`;

  const upcoming = get(member, 'next_tier');
  let nextField: Doc;
  if (get(member, 'always_free')) nextField = { key: 'next', label: L.tier_label, value: tierName };
  else if (upcoming) {
    // "EZÜSTIG / 90 kávé" reads as a distance; "EZÜST / 90" did not.
    nextField = {
      key: 'next',
      label: fmt(L.until_label, { tier: get(L.tier_names, upcoming, upcoming) }),
      value: fmt(L.until_value, { n: get(member, 'coffees_to_next', 0) }),
    };
  } else nextField = { key: 'next', label: L.tier_label, value: tierName };

  let relevant: string, headerLabel: string, headerValue: string;
  if (get(member, 'always_free')) {
    // No card to fill — the standing itself is the message.
    relevant = L.always_free;
    [headerLabel, headerValue] = [tierName, L.always_free_short];
  } else if (reward) {
    relevant = L.reward_relevant;
    [headerLabel, headerValue] = [tierName, L.reward_short];
  } else {
    const remaining = requiredStamps - stamps;
    relevant = remaining === 1 ? L.one_more : fmt(L.many, { n: remaining });
    [headerLabel, headerValue] = [tierName, `${pyStr(stamps)} / ${pyStr(requiredStamps)}`];
  }

  const passJson: Doc = {
    formatVersion: 1,
    passTypeIdentifier: required(env, 'APPLE_PASS_TYPE_ID'),
    teamIdentifier: required(env, 'APPLE_TEAM_ID'),
    serialNumber: serial,
    authenticationToken: authToken,
    webServiceURL: webServiceUrl,
    organizationName: get(cafe, 'name', 'Bros Cafe'),
    description: L.desc,
    // No logoText: the header field already prints the café name, and with both present Apple squeezes it.
    foregroundColor: rgb(palette.fg),
    backgroundColor: rgb(palette.bg),
    labelColor: rgb(palette.label),
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: barcodeMsg,
      messageEncoding: 'iso-8859-1',
      // Printed under the QR, for the scanner's manual field when a camera cannot read the screen.
      altText: barcodeMsg,
    }],
    storeCard: {
      headerFields: [{ key: 'left', label: headerLabel, value: headerValue }],
      primaryFields: [{ key: 'member', label: nameLine, value: get(member, 'name', '') }],
      // The stamps live in the strip artwork, so this row carries the running totals.
      secondaryFields: [
        { key: 'coffees', label: L.coffees, value: pyStr(get(member, 'total_coffees', 0)) },
        { key: 'rewards', label: L.free_coffees, value: pyStr(get(member, 'rewards_redeemed', 0)) },
        nextField,
      ],
      auxiliaryFields: [],
      backFields: [
        { key: 'status', label: L.status_label, value: relevant },
        { key: 'how', label: L.how_label, value: fmt(L.how_value, { n: requiredStamps }) },
        { key: 'tier', label: L.tier_label, value: tierLine(L, member) },
        { key: 'cafe', label: L.cafe_label, value: get(cafe, 'address', '') },
      ],
    },
  };

  const lat = get(settings, 'cafe_lat');
  const lng = get(settings, 'cafe_lng');
  if (lat !== null && lng !== null) {
    passJson.locations = [{ latitude: new PyFloat(Number(lat)), longitude: new PyFloat(Number(lng)), relevantText: L.welcome }];
  }
  return passJson;
}

const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const asset = (name: string) => (PASS_ASSETS[name] === undefined ? undefined : b64bytes(PASS_ASSETS[name]));

/** The images that go into the .pkpass. Strips are pre-rendered (see artwork.ts). */
async function collectAssets(app: App, tier = 'base', stamps = 0, requiredStamps = 0) {
  const files: Record<string, Uint8Array> = {};
  for (const name of ['icon.png', 'icon@2x.png', 'icon@3x.png']) {
    const data = asset(name);
    if (data) files[name] = data;
  }
  for (const suffix of ['', '@2x', '@3x']) {
    const data = asset(`logo-${tier}${suffix}.png`) ?? asset(`logo-base${suffix}.png`);
    if (data) files[`logo${suffix}.png`] = data;
  }
  const strips = await Promise.all([1, 2, 3].map((scale) => artwork.strip(app, tier, stamps, requiredStamps, scale)));
  files['strip.png'] = strips[0];
  files['strip@2x.png'] = strips[1];
  files['strip@3x.png'] = strips[2];
  return files;
}

async function sha1Hex(data: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** manifest.json, signature, and the zip, in the order Python writes them. */
async function pack(env: Env, files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const manifest: Doc = {};
  for (const [name, data] of Object.entries(files)) manifest[name] = await sha1Hex(data);
  const manifestBytes = new TextEncoder().encode(pyDumps(manifest));
  const signature = signManifest(env, manifestBytes);
  const zip: Zippable = {};
  for (const [name, data] of Object.entries(files)) zip[name] = [data, { level: 6 }];
  zip['manifest.json'] = [manifestBytes, { level: 6 }];
  zip['signature'] = [signature, { level: 6 }];
  return zipSync(zip);
}

export async function buildPkpass(
  app: App, member: Doc, cafe: Doc, settings: Doc, serial: string, authToken: string, barcodeMsg: string,
  webServiceUrl: string, lang = 'en',
): Promise<Uint8Array> {
  const passJson = new TextEncoder().encode(
    pyDumps(buildPassDict(app.env, member, cafe, settings, serial, authToken, barcodeMsg, webServiceUrl, lang)),
  );
  const files: Record<string, Uint8Array> = { 'pass.json': passJson };
  Object.assign(files, await collectAssets(
    app,
    get(member, 'tier', 'base'),
    get(member, 'stamps', 0),
    get(member, 'always_free') ? 0 : get(member, 'stamps_required', 0),
  ));
  return pack(app.env, files);
}

export const VOIDED_TEXT: Record<string, { desc: string; title: string; body: string }> = {
  en: {
    desc: 'Bros Cafe loyalty card',
    title: 'CARD CLOSED',
    body: 'This loyalty card is no longer active. You can delete it from Wallet.',
  },
  hu: {
    desc: 'Bros Cafe hűségkártya',
    title: 'LEZÁRT KÁRTYA',
    body: 'Ez a hűségkártya már nem aktív. Nyugodtan törölheted a Pénztárcából.',
  },
};

/**
 * A pass that says it is finished: Wallet greys a `voided` card out. It is the last version a device will ever be
 * served, so it carries no name, no stamp count and no barcode.
 */
export async function buildVoidedPkpass(env: Env, serial: string, authToken: string, webServiceUrl: string, lang = 'hu') {
  const text = VOIDED_TEXT[lang] ?? VOIDED_TEXT.hu;
  const passJson = new TextEncoder().encode(pyDumps({
    formatVersion: 1,
    passTypeIdentifier: required(env, 'APPLE_PASS_TYPE_ID'),
    teamIdentifier: required(env, 'APPLE_TEAM_ID'),
    serialNumber: serial,
    authenticationToken: authToken,
    webServiceURL: webServiceUrl,
    organizationName: 'Bros Cafe',
    description: text.desc,
    voided: true,
    foregroundColor: 'rgb(120, 120, 120)',
    backgroundColor: 'rgb(232, 232, 232)',
    labelColor: 'rgb(150, 150, 150)',
    storeCard: {
      headerFields: [],
      primaryFields: [{ key: 'closed', label: text.title, value: '' }],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [{ key: 'info', label: text.title, value: text.body }],
    },
  }));

  const files: Record<string, Uint8Array> = { 'pass.json': passJson };
  // Icons only: no strip, so the greyed card carries no stamp artwork.
  for (const name of ['icon.png', 'icon@2x.png', 'icon@3x.png']) {
    const data = asset(name);
    if (data) files[name] = data;
  }
  for (const suffix of ['', '@2x', '@3x']) {
    const data = asset(`logo-base${suffix}.png`);
    if (data) files[`logo${suffix}.png`] = data;
  }
  return pack(env, files);
}

// ---------------------------------------------------------------- APNs push (best-effort)

/** Send empty Wallet update pushes via APNs. No-op if unconfigured. Returns count sent. */
export async function pushToDevices(env: Env, pushTokens: string[]): Promise<number> {
  if (!isConfigured(env) || !pushTokens.length) return 0;
  const client = env.APNS_CERT;
  if (!client) {
    console.warn('APNs push skipped: no usable signing identity');
    return 0;
  }
  const topic = required(env, 'APPLE_PASS_TYPE_ID');
  const host = apnsHost(env);
  let sent = 0;
  for (const token of pushTokens) {
    try {
      const response = await client.fetch(`${host}/3/device/${token}`, {
        method: 'POST',
        headers: { 'apns-topic': topic, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 200) sent += 1;
      else console.warn(`APNs rejected ${token.slice(0, 8)}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    } catch (exc) {
      console.warn(`APNs push to ${token.slice(0, 8)} failed: ${exc}`);
    }
  }
  return sent;
}
