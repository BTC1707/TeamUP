/**
 * POST /api/auth/signin
 *
 * Signs in with email or username + password.
 * On localhost only, also accepts the hardcoded test account (see lib/local-dev-account.ts).
 * That path writes only to the local Miniflare D1 — never the live Cloudflare DB.
 */

import {
  createSessionToken,
  safeReturnPath,
  sessionCookieHeader,
  validateSignIn,
} from '@/lib/auth';
import {
  isLocalDevHost,
  LOCAL_DEV_ACCOUNT,
  matchesLocalDevAccount,
} from '@/lib/local-dev-account';
import { hashPassword, verifyPassword } from '@/lib/password';
import { sameOrigin, runtime } from '@/lib/server';
import { ensureLocalDevUser, findUserByLogin } from '@/lib/store';

const INVALID = 'Invalid email/username or password.';

export async function POST(req: Request) {
  try {
    sameOrigin(req);

    const body = (await req.json()) as {
      login?: string;
      email?: string;
      username?: string;
      password?: string;
      remember?: boolean;
      returnTo?: string;
    };

    const rawLogin =
      (typeof body.login === 'string' && body.login) ||
      (typeof body.email === 'string' && body.email) ||
      (typeof body.username === 'string' && body.username) ||
      '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';
    const remember = body.remember !== false;

    // Localhost-only test account → blank workspace on the local DB, not production.
    if (isLocalDevHost(req) && matchesLocalDevAccount(rawLogin, rawPassword)) {
      const passwordHash = await hashPassword(LOCAL_DEV_ACCOUNT.password);
      await ensureLocalDevUser(runtime().DB, {
        authId: 'email:' + LOCAL_DEV_ACCOUNT.email,
        email: LOCAL_DEV_ACCOUNT.email,
        username: LOCAL_DEV_ACCOUNT.username,
        firstName: LOCAL_DEV_ACCOUNT.firstName,
        lastName: LOCAL_DEV_ACCOUNT.lastName,
        name: LOCAL_DEV_ACCOUNT.name,
        passwordHash,
      });

      const token = await createSessionToken(LOCAL_DEV_ACCOUNT.email, LOCAL_DEV_ACCOUNT.name, {
        remember,
      });
      const secure = new URL(req.url).protocol === 'https:';
      return Response.json(
        { ok: true, returnTo: safeReturnPath(body.returnTo) },
        { headers: { 'Set-Cookie': sessionCookieHeader(token, secure, { remember }) } },
      );
    }

    const validated = validateSignIn(body);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const user = await findUserByLogin(runtime().DB, {
      email: validated.email,
      username: validated.username,
    });

    if (!user) {
      return Response.json({ error: INVALID }, { status: 401 });
    }

    if (!user.password_hash) {
      return Response.json(
        {
          error:
            'This account has no password yet. Create a new account on Sign up with this email.',
        },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(validated.password, user.password_hash);
    if (!ok) {
      return Response.json({ error: INVALID }, { status: 401 });
    }

    const token = await createSessionToken(user.email, user.name, { remember });
    const secure = new URL(req.url).protocol === 'https:';

    return Response.json(
      { ok: true, returnTo: safeReturnPath(body.returnTo) },
      {
        headers: {
          'Set-Cookie': sessionCookieHeader(token, secure, { remember }),
        },
      },
    );
  } catch {
    return Response.json({ error: 'Unable to sign in. Please try again.' }, { status: 500 });
  }
}
