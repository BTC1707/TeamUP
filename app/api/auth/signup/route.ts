/**
 * POST /api/auth/signup
 *
 * Creates a new account (first/last name, username, email, password).
 * Rejects if email or username is already taken.
 * Sets the session cookie on success.
 */

import {
  createSessionToken,
  requestIsSecure,
  safeReturnPath,
  validateSignUp,
  writeSessionCookie,
} from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { sameOrigin, runtime } from '@/lib/server';
import { createPasswordUser } from '@/lib/store';

export async function POST(req: Request) {
  try {
    sameOrigin(req);

    const body = (await req.json()) as {
      firstName?: string;
      lastName?: string;
      name?: string;
      username?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      returnTo?: string;
    };

    const validated = validateSignUp(body);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const passwordHash = await hashPassword(validated.password);
    const authId = 'email:' + validated.email;

    try {
      await createPasswordUser(runtime().DB, {
        authId,
        email: validated.email,
        firstName: validated.firstName,
        lastName: validated.lastName,
        name: validated.name,
        username: validated.username,
        passwordHash,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'EMAIL_TAKEN') {
        return Response.json(
          { error: 'An account with that email already exists. Sign in instead.' },
          { status: 409 },
        );
      }
      if (code === 'USERNAME_TAKEN') {
        return Response.json(
          { error: 'That username is taken. Try another one.' },
          { status: 409 },
        );
      }
      throw err;
    }

    const token = await createSessionToken(validated.email, validated.name, { remember: true });
    const cookie = await writeSessionCookie(token, {
      remember: true,
      secure: requestIsSecure(req),
    });

    return Response.json(
      { ok: true, returnTo: safeReturnPath(body.returnTo) },
      { headers: { 'Set-Cookie': cookie } },
    );
  } catch {
    return Response.json(
      { error: 'Unable to create your account. Please try again.' },
      { status: 500 },
    );
  }
}
