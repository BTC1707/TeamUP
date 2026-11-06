/**
 * Server-side session auth (email/username + password).
 *
 * How it works:
 * 1. /signup POSTs account fields to /api/auth/signup → creates user + sets cookie
 * 2. /signin POSTs login + password to /api/auth/signin → verifies hash + sets cookie
 * 3. Later requests call getSessionUser() to read the signed cookie
 *
 * Browser helpers live in lib/auth-client.ts.
 * Password hashing lives in lib/password.ts.
 * Cookie crypto (HMAC) stays in this file — do not call from client components.
 */

import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';

export type SessionUser = {
  /** Stable id stored in users.auth_id (format: "email:you@school.edu") */
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

/** Cookie name sent to the browser after a successful sign-in / sign-up. */
export const SESSION_COOKIE = 'teamup_session';
/** Long-lived session when “Remember me” is checked (and for new sign-ups). */
export const SESSION_REMEMBER_DAYS = 30;
/** Shorter token lifetime when “Remember me” is unchecked. */
export const SESSION_TEMPORARY_HOURS = 12;

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Compact fields inside the signed cookie payload. */
type SessionPayload = {
  e: string; // email
  n: string; // display name
  i: string; // user id ("email:…")
  exp: number; // expiry (unix ms)
};

function encoder() {
  return new TextEncoder();
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function authSecret() {
  const bindings = env as unknown as { AUTH_SECRET?: string };
  const secret = bindings.AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  // Local-only fallback so `npm run dev` works before secrets are configured.
  if (process.env.NODE_ENV !== 'production') return 'teamup-local-dev-auth-secret';
  throw new Error('AUTH_SECRET is not configured');
}

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder().encode(authSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payload: string) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder().encode(payload));
  return toBase64Url(signature);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

type AuthError = { ok: false; error: string };
type AuthOk<T> = { ok: true } & T;

export function validateUsername(raw: unknown): AuthError | AuthOk<{ username: string }> {
  const username = typeof raw === 'string' ? normalizeUsername(raw) : '';
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: 'Username must be 3–24 characters: lowercase letters, numbers, or underscores.',
    };
  }
  return { ok: true, username };
}

export function validatePassword(raw: unknown): AuthError | AuthOk<{ password: string }> {
  const password = typeof raw === 'string' ? raw : '';
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (password.length > 200) {
    return { ok: false, error: 'Password is too long.' };
  }
  return { ok: true, password };
}

function cleanNamePart(raw: unknown, max = 40) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Combine first + last into the display name used across the app. */
export function displayNameFromParts(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
}

/** Validate fields for creating a new account. */
export function validateSignUp(input: {
  firstName?: unknown;
  lastName?: unknown;
  /** @deprecated Prefer firstName + lastName. Still accepted as a fallback. */
  name?: unknown;
  username?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}):
  | AuthError
  | AuthOk<{
      firstName: string;
      lastName: string;
      name: string;
      username: string;
      email: string;
      password: string;
    }> {
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  let firstName = cleanNamePart(input.firstName);
  let lastName = cleanNamePart(input.lastName);

  // Back-compat: if only a single "name" was sent, split on the first space.
  if ((!firstName || !lastName) && typeof input.name === 'string') {
    const parts = input.name.trim().replace(/\s+/g, ' ').split(' ');
    if (!firstName) firstName = parts[0] || '';
    if (!lastName) lastName = parts.slice(1).join(' ');
  }

  if (!firstName || firstName.length < 1) {
    return { ok: false, error: 'Enter your first name.' };
  }
  if (!lastName || lastName.length < 1) {
    return { ok: false, error: 'Enter your last name.' };
  }

  const name = displayNameFromParts(firstName, lastName);
  if (name.length > 80) {
    return { ok: false, error: 'Name is too long.' };
  }

  const usernameResult = validateUsername(input.username);
  if (!usernameResult.ok) return usernameResult;

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const passwordResult = validatePassword(input.password);
  if (!passwordResult.ok) return passwordResult;

  const confirm = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  if (passwordResult.password !== confirm) {
    return { ok: false, error: 'Passwords do not match.' };
  }

  return {
    ok: true,
    firstName,
    lastName,
    name,
    username: usernameResult.username,
    email,
    password: passwordResult.password,
  };
}

/** Validate fields for signing in (email or username + password). */
export function validateSignIn(input: {
  login?: unknown;
  email?: unknown;
  username?: unknown;
  password?: unknown;
}):
  | AuthError
  | AuthOk<{ email: string | null; username: string | null; password: string }> {
  const loginRaw =
    typeof input.login === 'string'
      ? input.login.trim()
      : typeof input.email === 'string'
        ? input.email.trim()
        : typeof input.username === 'string'
          ? input.username.trim()
          : '';

  if (!loginRaw) {
    return { ok: false, error: 'Enter your email or username.' };
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) {
    return { ok: false, error: 'Enter your password.' };
  }

  const looksLikeEmail = loginRaw.includes('@');
  if (looksLikeEmail) {
    const email = normalizeEmail(loginRaw);
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    return { ok: true, email, username: null, password };
  }

  const usernameResult = validateUsername(loginRaw);
  if (!usernameResult.ok) {
    return { ok: false, error: 'Enter a valid email or username.' };
  }
  return { ok: true, email: null, username: usernameResult.username, password };
}

export async function createSessionToken(
  email: string,
  name: string,
  opts?: { remember?: boolean },
) {
  const remember = opts?.remember !== false;
  const ttlMs = remember
    ? SESSION_REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : SESSION_TEMPORARY_HOURS * 60 * 60 * 1000;
  const payload: SessionPayload = {
    e: normalizeEmail(email),
    n: name,
    i: 'email:' + normalizeEmail(email),
    exp: Date.now() + ttlMs,
  };
  const body = toBase64Url(encoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

export async function readSessionToken(
  token: string | undefined | null,
): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = await sign(body);
  if (expected.length !== signature.length) return null;
  let match = 0;
  for (let i = 0; i < expected.length; i++) match |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (match !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.e || !payload?.n || !payload?.i || !payload?.exp) return null;
    if (payload.exp < Date.now()) return null;
    const email = normalizeEmail(payload.e);
    return {
      userId: payload.i || 'email:' + email,
      email,
      displayName: payload.n,
      fullName: payload.n,
    };
  } catch {
    return null;
  }
}

function parseCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  return readSessionToken(parseCookie(requestHeaders.get('cookie'), SESSION_COOKIE));
}

export function sessionCookieHeader(
  token: string,
  secure: boolean,
  opts?: { remember?: boolean },
) {
  const remember = opts?.remember !== false;
  const base = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
  const secureFlag = secure ? '; Secure' : '';
  if (!remember) {
    // Browser session cookie — cleared when the browser quits.
    return `${base}${secureFlag}`;
  }
  const maxAge = SESSION_REMEMBER_DAYS * 24 * 60 * 60;
  return `${base}; Max-Age=${maxAge}${secureFlag}`;
}

export function clearSessionCookieHeader(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/workspace/overview';
  try {
    const url = new URL(value, 'https://app.local');
    if (url.origin !== 'https://app.local') return '/workspace/overview';
    if (
      url.pathname === '/signin' ||
      url.pathname === '/signup' ||
      url.pathname.startsWith('/api/auth')
    ) {
      return '/workspace/overview';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/workspace/overview';
  }
}

export function signInPath(returnTo = '/workspace/overview') {
  return `/signin?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function signOutPath(returnTo = '/') {
  const target = safeReturnPath(returnTo);
  return `/api/auth/signout?return_to=${encodeURIComponent(target)}`;
}
