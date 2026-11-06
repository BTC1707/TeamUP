import { runtime } from '@/lib/server';

/** Public OAuth client ID used by the browser-based Google Identity Services flow. */
export async function GET() {
  const clientId = runtime().GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  return Response.json(
    { clientId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
