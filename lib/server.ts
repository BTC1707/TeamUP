import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { ensureUser, getProject } from './store';
import { recordActivity } from './usage';

const ACTIVITY_COOKIE = 'teamup_active';
const ACTIVITY_GAP_MS = 30 * 60 * 1000;

export const runtime = () =>
  env as unknown as {
    DB: D1Database;
    BUCKET: R2Bucket;
    GEMINI_API_KEY?: string;
    AI_CONFIG_ENCRYPTION_KEY?: string;
    SITE_OWNER_EMAIL?: string;
    AUTH_SECRET?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    GOOGLE_CALENDAR_CLIENT_ID?: string;
  };

export async function identity() {
  const user = await getSessionUser();
  if (!user) throw new Error('SIGN_IN');
  const email = user.email.toLowerCase();
  const legacy = await runtime()
    .DB.prepare('SELECT name FROM profiles WHERE id=?')
    .bind(user.userId)
    .first<{ name: string }>();
  const account = await ensureUser(
    runtime().DB,
    user.userId,
    email,
    legacy?.name || user.fullName || user.displayName || email.split('@')[0],
  );
  await noteDailyActivity(account.userId);
  return account;
}

/** One write per stretch of use. Remembered sessions count as soon as they open the app. */
async function noteDailyActivity(userId: string) {
  try {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const jar = await cookies();
    const [stampDay, stampTime] = (jar.get(ACTIVITY_COOKIE)?.value || '').split('|');
    const stampMs = Date.parse(stampTime || '');
    if (stampDay === day && Number.isFinite(stampMs) && now.getTime() - stampMs < ACTIVITY_GAP_MS) {
      return;
    }
    await recordActivity(runtime().DB, userId, now);
    jar.set(ACTIVITY_COOKIE, `${day}|${now.toISOString()}`, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
      secure: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    console.error('Activity tracking failed', error);
  }
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
              : message === 'LEAVE_OWNER'
                ? 'Project owners can’t leave. Delete the project if the team is finished.'
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
              : message === 'LEAVE_OWNER'
                ? 400
                : 500,
    },
  );
}

export function sameOrigin(req: Request) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    throw new Error('Invalid origin');
}
