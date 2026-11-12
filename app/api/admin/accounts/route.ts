/** POST /api/admin/accounts — create an account without signing in as that person. */

import { validateSignUp } from '@/lib/auth';
import { createAdminAccount, requireAdmin } from '@/lib/admin';
import { hashPassword } from '@/lib/password';

export async function POST(req: Request) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const body = (await req.json()) as {
      firstName?: string;
      lastName?: string;
      username?: string;
      email?: string;
      password?: string;
      admin?: boolean;
    };
    const validated = validateSignUp({ ...body, confirmPassword: body.password });
    if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });

    const passwordHash = await hashPassword(validated.password);
    await createAdminAccount(access.db, {
      authId: 'email:' + validated.email,
      email: validated.email,
      firstName: validated.firstName,
      lastName: validated.lastName,
      name: validated.name,
      username: validated.username,
      passwordHash,
      admin: body.admin === true,
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'EMAIL_TAKEN') {
      return Response.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }
    if (code === 'USERNAME_TAKEN') {
      return Response.json({ error: 'That username is taken.' }, { status: 409 });
    }
    console.error('Admin create failed', code);
    return Response.json({ error: 'Unable to create that account.' }, { status: 500 });
  }
}
