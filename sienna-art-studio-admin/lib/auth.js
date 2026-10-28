// Single-admin login: username + password (scrypt hash) from env vars, signed httpOnly session cookie.
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'sas_admin';
const MAX_AGE = 60 * 60 * 8; // 8 hours

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (at least 32 characters)');
  return new TextEncoder().encode(s);
};

export { hashPassword } from './auth-hash.mjs';

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export function checkCredentials(username, password) {
  const u = process.env.ADMIN_USERNAME || '';
  const stored = process.env.ADMIN_PASSWORD_HASH || '';
  const [kind, saltHex, hashHex] = stored.split(':');
  const userOk = safeEqual(String(username || ''), u);
  let passOk = false;
  if (kind === 'scrypt' && saltHex && hashHex) {
    const got = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), 64);
    passOk = crypto.timingSafeEqual(got, Buffer.from(hashHex, 'hex'));
  }
  return userOk && passOk && Boolean(u);
}

export async function createSession() {
  const token = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isLoggedIn() {
  try {
    const jar = await cookies();
    const t = jar.get(COOKIE);
    if (!t) return false;
    await jwtVerify(t.value, key());
    return true;
  } catch {
    return false;
  }
}

// API guard: returns a Response when the request must be rejected, otherwise null.
export async function guard(request) {
  if (!(await isLoggedIn())) return Response.json({ error: 'Not logged in' }, { status: 401 });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || new URL(origin).host !== host) return Response.json({ error: 'Bad origin' }, { status: 403 });
  }
  return null;
}
