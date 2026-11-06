import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { ensureUser, getProject } from './store';

export const runtime = () =>
  env as unknown as {
    DB: D1Database;
    BUCKET: R2Bucket;
    GEMINI_API_KEY?: string;
    AI_CONFIG_ENCRYPTION_KEY?: string;
    SITE_OWNER_EMAIL?: string;
    AUTH_SECRET?: string;
    VAPID_SUBJECT?: string;
    VAPID_SERVER_PUBLIC_KEY?: string;
    VAPID_SERVER_PRIVATE_KEY?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };

export async function identity() {
  const user = await getSessionUser();
  if (!user) throw new Error('SIGN_IN');
  const email = user.email.toLowerCase();
  const legacy = await runtime()
    .DB.prepare('SELECT name FROM profiles WHERE id=?')
    .bind(user.userId)
    .first<{ name: string }>();
  return ensureUser(
    runtime().DB,
    user.userId,
    email,
    legacy?.name || user.fullName || user.displayName || email.split('@')[0],
  );
}

export async function projectFor(id: string, user: Awaited<ReturnType<typeof identity>>) {
  return getProject(runtime().DB, id, user);
}

export function failure(e: unknown) {
  console.error('Teamup request failed', e instanceof Error ? e.message : 'Unknown error');
  const message = e instanceof Error ? e.message : '';
  return Response.json(
    {
      error:
        message === 'SIGN_IN'
          ? 'Sign in to open your workspace.'
          : message === 'NOT_FOUND'
            ? 'Project not found or access denied.'
            : message === 'CONFLICT'
              ? 'A teammate updated this project. Reload before saving again.'
              : 'Unable to complete this request. Please try again.',
    },
    {
      status:
        message === 'SIGN_IN'
          ? 401
          : message === 'NOT_FOUND'
            ? 404
            : message === 'CONFLICT'
              ? 409
              : 500,
    },
  );
}

export function sameOrigin(req: Request) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    throw new Error('Invalid origin');
}
