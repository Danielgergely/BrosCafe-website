// Mirrors backend/app/security.py. Tokens are PyJWT-compatible HS256 JWTs signed with the same JWT_SECRET, so every
// session issued by the Python API stays valid here (and the other way round, for the way back).
import bcrypt from 'bcryptjs';
import { HttpError, type Ctx } from './http';
import { settings } from './config';
import type { Doc } from './db';

const TOKEN_STAFF = 'access';
const TOKEN_CUSTOMER = 'customer';

export const hashPassword = (password: string) => bcrypt.hashSync(password, 12);
export function verifyPassword(plain: string, hashed: string) {
  try {
    return bcrypt.compareSync(plain, hashed);
  } catch {
    return false;
  }
}

export async function hashToken(raw: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function encodeJwt(payload: Doc, secret: string) {
  const head = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(head)));
  return `${head}.${b64url(sig)}`;
}

/** PyJWT's decode: signature, then `exp`. Throws 'expired' or 'invalid'. */
async function decodeJwt(token: string, secret: string): Promise<Doc> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid');
  let header: Doc, payload: Doc;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    throw new Error('invalid');
  }
  if (header.alg !== 'HS256') throw new Error('invalid');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('invalid');
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== 'number') throw new Error('invalid');
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('expired');
  }
  return payload;
}

async function encode(c: Ctx, payload: Doc, days: number) {
  // PyJWT turns the datetime into whole seconds
  return encodeJwt({ ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 }, settings(c.env).jwt_secret());
}

export const createStaffToken = (c: Ctx, userId: string, email: string, role: string) =>
  encode(c, { sub: userId, email, role, type: TOKEN_STAFF }, settings(c.env).staff_token_days);
export const createCustomerToken = (c: Ctx, code: string, email: string) =>
  encode(c, { sub: code, email, type: TOKEN_CUSTOMER }, settings(c.env).customer_token_days);

function bearer(c: Ctx) {
  const header = c.req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated');
  return header.slice(7);
}

async function decode(c: Ctx, token: string, expected: string) {
  let payload: Doc;
  try {
    payload = await decodeJwt(token, settings(c.env).jwt_secret());
  } catch (e) {
    if ((e as Error).message === 'expired') throw new HttpError(401, 'Session expired');
    throw new HttpError(401, 'Invalid token');
  }
  if (payload.type !== expected) throw new HttpError(401, 'Invalid token type');
  return payload;
}

export async function getCurrentUser(c: Ctx): Promise<Doc> {
  const payload = await decode(c, bearer(c), TOKEN_STAFF);
  const user = await c.db.users.findOne({ id: payload.sub }, { projection: { password_hash: 0 } });
  if (!user) throw new HttpError(401, 'User not found');
  return user;
}

export async function requireAdmin(c: Ctx): Promise<Doc> {
  const user = await getCurrentUser(c);
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required');
  return user;
}

export async function getCurrentCustomer(c: Ctx): Promise<Doc> {
  const payload = await decode(c, bearer(c), TOKEN_CUSTOMER);
  const member = await c.db.members.findOne({ code: payload.sub });
  if (!member) throw new HttpError(401, 'Member not found');
  return member;
}
