/** GET /api/admin/overview — site totals and one row per account. */

import { adminOverview, requireAdmin } from '@/lib/admin';

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  try {
    const overview = await adminOverview(access.db, access.adminId);
    return Response.json(overview, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Admin overview failed', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Unable to load accounts.' }, { status: 500 });
  }
}
