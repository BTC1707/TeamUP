/**
 * POST /api/auth/reset-password
 *
 * Completes a password reset with a one-time token from the email link.
 */

import { validatePassword } from '@/lib/auth';
import { completePasswordReset } from '@/lib/password-reset';
import { sameOrigin, runtime } from '@/lib/server';

export async function POST(req: Request) {
  try {
    sameOrigin(req);

    const body = (await req.json()) as {
      token?: string;
      password?: string;
      confirmPassword?: string;
    };

    const passwordResult = validatePassword(body.password);
    if (!passwordResult.ok) {
      return Response.json({ error: passwordResult.error }, { status: 400 });
    }
    if (body.password !== body.confirmPassword) {
      return Response.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    try {
      await completePasswordReset(
        runtime().DB,
        typeof body.token === 'string' ? body.token : '',
        passwordResult.password,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'TOKEN_INVALID') {
        return Response.json(
          {
            error:
              'This reset link is invalid or has expired. Request a new one from Sign in.',
          },
          { status: 400 },
        );
      }
      throw err;
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Unable to reset your password. Please try again.' },
      { status: 500 },
    );
  }
}
