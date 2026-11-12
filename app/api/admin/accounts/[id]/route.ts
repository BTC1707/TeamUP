/** One account: days used, current projects, edits, and deletion. */

import { adminAccountDetail, deleteAdminAccount, requireAdmin, updateAdminAccount } from '@/lib/admin';

type RouteContext = { params: Promise<{ id: string }> };

function accountId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_req: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  try {
    const detail = await adminAccountDetail(access.db, accountId(id));
    if (!detail) return Response.json({ error: 'Account not found.' }, { status: 404 });
    return Response.json(detail, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Admin account failed', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Unable to load that account.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  try {
    const body = (await req.json()) as {
      firstName?: unknown;
      lastName?: unknown;
      username?: unknown;
      password?: unknown;
      admin?: boolean;
    };
    const result = await updateAdminAccount(access.db, access.adminId, accountId(id), {
      firstName: body.firstName,
      lastName: body.lastName,
      username: body.username,
      password: body.password,
      admin: body.admin === true,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Admin update failed', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Unable to update that account.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  try {
    const result = await deleteAdminAccount(access.db, access.adminId, accountId(id));
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Admin delete failed', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Unable to delete that account.' }, { status: 500 });
  }
}
