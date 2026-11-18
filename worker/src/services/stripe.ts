// Stripe through its REST API (no SDK on Workers): Checkout sessions, refunds, webhook signatures.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Without both, payments are "not configured" and the routes answer 503.
import type { App } from '../http';
import type { Env } from '../env';
import { safeEqual } from './bookings';

const s = (env: Env, k: string) => String(env[k] ?? '').trim();
const config = (env: Env) => ({
  key: s(env, 'STRIPE_SECRET_KEY'),
  webhookSecret: s(env, 'STRIPE_WEBHOOK_SECRET'),
  base: s(env, 'STRIPE_API_BASE') || 'https://api.stripe.com', // overridable for local tests against a stub
});
export const ready = (env: Env) => !!(config(env).key && config(env).webhookSecret);

/** Checkout cannot expire sooner than 30 minutes after creation; one extra minute covers clock drift. */
export const SESSION_MIN = 31;
/** The hold outlives the Checkout session, so a payment never lands on a released hold. */
export const HOLD_MIN = 33;
// Stripe counts HUF in fillér (two decimals); whole forints only.
const minor = (huf: number) => Math.round(huf) * 100;

class StripeError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Stripe ${status}: ${body.slice(0, 300)}`);
  }
}

function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call<T = any>(app: App, method: string, path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const cfg = config(app.env);
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.key}` };
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  // the preview and production share the Stripe sandbox and number bookings alike: keys carry the site's host
  if (idempotencyKey) headers['Idempotency-Key'] = `${String(app.env.FRONTEND_URL ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/${idempotencyKey}`;
  const r = await fetch(`${cfg.base}/v1${path}`, { method, headers, body: params ? form(params).toString() : undefined, signal: AbortSignal.timeout(20_000) });
  const body = await r.text();
  if (!r.ok) throw new StripeError(r.status, body);
  return JSON.parse(body) as T;
}

interface CheckoutLine { name: string; amountHuf: number; quantity?: number }
interface Checkout {
  kind: 'ah' | 'dl'; ref: string; // metadata: which module and which row the payment belongs to
  lines: CheckoutLine[]; email: string; lang: string; description: string;
  successUrl: string; cancelUrl: string; expiresAt?: Date;
}
/** Card, Apple Pay and Google Pay: Checkout offers the wallets by itself when they are on in the Stripe dashboard. */
export function createCheckout(app: App, o: Checkout): Promise<{ id: string; url: string }> {
  const expires = o.expiresAt ?? new Date(Date.now() + SESSION_MIN * 60_000);
  return call(app, 'POST', '/checkout/sessions', {
    mode: 'payment',
    adaptive_pricing: { enabled: false }, // always charge HUF, never offer the visitor's local currency
    locale: o.lang === 'en' ? 'en' : 'hu',
    customer_email: o.email,
    client_reference_id: o.ref,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    expires_at: Math.floor(expires.getTime() / 1000),
    metadata: { kind: o.kind, ref: o.ref },
    payment_intent_data: { description: o.description, metadata: { kind: o.kind, ref: o.ref } },
    line_items: Object.fromEntries(o.lines.map((l, i) => [i, {
      quantity: l.quantity ?? 1,
      price_data: { currency: 'huf', unit_amount: minor(l.amountHuf), product_data: { name: l.name } },
    }])),
  }, `checkout-${o.ref}`);
}

/** Idempotent per (reference, amount): a retry never refunds twice. */
export const refund = (app: App, paymentIntent: string, amountHuf: number, ref: string): Promise<{ id: string; status: string }> =>
  call(app, 'POST', '/refunds', { payment_intent: paymentIntent, amount: minor(amountHuf), metadata: { ref } }, `refund-${ref}-${amountHuf}`);

/** Best effort: closes a Checkout page that should not be paid any more. */
export async function expireSession(app: App, sessionId: string) {
  try {
    await call(app, 'POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
  } catch (e) {
    console.warn(`could not expire Checkout session ${sessionId}: ${(e as Error).message}`);
  }
}

interface StripeEvent { id: string; type: string; data: { object: Record<string, any> } }
const TOLERANCE_S = 300;
/** Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.body">. Null when it does not verify. */
export async function verifyWebhook(env: Env, raw: string, header: string | null): Promise<StripeEvent | null> {
  const secret = config(env).webhookSecret;
  if (!secret || !header) return null;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!sigs.some((v) => safeEqual(v, expected))) return null;
  try {
    return JSON.parse(raw) as StripeEvent;
  } catch {
    return null;
  }
}
