/**
 * POST /api/auth/forgot-password
 *
 * Starts a password reset email when Resend is configured.
 * Always returns a generic success message when the email looks valid,
 * so responses do not reveal whether an account exists.
 */

import { EmailError } from '@/lib/email';
import { requestPasswordReset } from '@/lib/password-reset';
import { sameOrigin, runtime } from '@/lib/server';

const GENERIC_OK =
  'If an account exists for that email, a reset link is on its way. Check your inbox.';

export async function POST(req: Request) {
  try {
    sameOrigin(req);

    const body = (await req.json()) as { email?: string };
    const email = typeof body.email === 'string' ? body.email : '';

    try {
      await requestPasswordReset(runtime().DB, email, new URL(req.url).origin);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'EMAIL_INVALID') {
        return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
      }
      if (code === 'EMAIL_NOT_CONFIGURED') {
        return Response.json(
          {
            error:
              'Password reset email is not available yet. Ask the site owner to finish connecting email delivery.',
          },
          { status: 503 },
        );
      }
      if (err instanceof EmailError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    return Response.json({ ok: true, message: GENERIC_OK });
  } catch {
    return Response.json(
      { error: 'Unable to start a password reset. Please try again.' },
      { status: 500 },
    );
  }
}
