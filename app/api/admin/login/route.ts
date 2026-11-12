/**
 * POST /api/admin/login
 *
 * Same email or username and password as TeamUP. The session is only created
 * when that account is allowed to open the admin page.
 */

import {
  createSessionToken,
  requestIsSecure,
  validateSignIn,
  writeSessionCookie,
} from '@/lib/auth';
import { isSiteOwnerEmail, markAdmin } from '@/lib/admin';
import {
  isLocalDevHost,
  LOCAL_DEV_ACCOUNT,
  matchesLocalDevAccount,
} from '@/lib/local-dev-account';
import { hashPassword, verifyPassword } from '@/lib/password';
import { runtime, sameOrigin } from '@/lib/server';
import { ensureLocalDevUser, findUserByLogin } from '@/lib/store';

const INVALID = 'Invalid email/username or password.';
const DENIED = 'This account can’t open the admin page.';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = (await req.json()) as { login?: string; password?: string; remember?: boolean };
    const rawLogin = typeof body.login === 'string' ? body.login : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';
    const remember = body.remember === true;
    const secure = requestIsSecure(req);
    const db = runtime().DB;

    if (isLocalDevHost(req) && matchesLocalDevAccount(rawLogin, rawPassword)) {
      const passwordHash = await hashPassword(LOCAL_DEV_ACCOUNT.password);
      const account = await ensureLocalDevUser(db, {
        authId: 'email:' + LOCAL_DEV_ACCOUNT.email,
        email: LOCAL_DEV_ACCOUNT.email,
        username: LOCAL_DEV_ACCOUNT.username,
        firstName: LOCAL_DEV_ACCOUNT.firstName,
        lastName: LOCAL_DEV_ACCOUNT.lastName,
        name: LOCAL_DEV_ACCOUNT.name,
        passwordHash,
      });
      await markAdmin(db, account.userId);
      const token = await createSessionToken(LOCAL_DEV_ACCOUNT.email, LOCAL_DEV_ACCOUNT.name, {
        remember,
      });
      const cookie = await writeSessionCookie(token, { remember, secure });
      return Response.json(
        { ok: true },
        { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'private, no-store' } },
      );
    }

    const validated = validateSignIn({ login: rawLogin, password: rawPassword });
    if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });

    const user = await findUserByLogin(db, {
      email: validated.email,
      username: validated.username,
    });
    if (!user?.password_hash) return Response.json({ error: INVALID }, { status: 401 });

    const ok = await verifyPassword(validated.password, user.password_hash);
    if (!ok) return Response.json({ error: INVALID }, { status: 401 });

    const flagged = await db
      .prepare('SELECT admin FROM users WHERE id=?')
      .bind(user.id)
      .first<{ admin: number }>();
    const allowed = flagged?.admin === 1 || isSiteOwnerEmail(user.email);
    if (!allowed) return Response.json({ error: DENIED }, { status: 403 });

    if (flagged?.admin !== 1) await markAdmin(db, user.id);

    const token = await createSessionToken(user.email, user.name, { remember });
    const cookie = await writeSessionCookie(token, { remember, secure });
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Invalid origin') {
      return Response.json({ error: 'Unable to sign in.' }, { status: 403 });
    }
    console.error('Admin login failed', message);
    return Response.json({ error: 'Unable to sign in. Please try again.' }, { status: 500 });
  }
}
