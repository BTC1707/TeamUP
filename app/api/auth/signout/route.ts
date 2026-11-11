/**
 * Sign out — clears the session cookie.
 *
 * GET  /api/auth/signout?return_to=/  → redirect after clearing (used by links)
 * POST /api/auth/signout             → JSON ok (used by fetch clients)
 */

import { clearSessionCookie, requestIsSecure, safeReturnPath } from '@/lib/auth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secure = requestIsSecure(req);
  // Prefer explicit home (/) after logout; otherwise sanitize return_to.
  const requested = url.searchParams.get('return_to');
  const returnTo = requested === '/' || requested === null ? '/' : safeReturnPath(requested);

  const cookie = await clearSessionCookie(secure);

  return new Response(null, {
    status: 302,
    headers: {
      Location: returnTo,
      'Set-Cookie': cookie,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(req: Request) {
  const cookie = await clearSessionCookie(requestIsSecure(req));
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': cookie,
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
