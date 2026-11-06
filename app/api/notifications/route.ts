import { identity, runtime, sameOrigin, failure } from '@/lib/server';
import { listNotifications, markNotificationsRead } from '@/lib/notifications';

export async function GET() {
  try {
    const user = await identity();
    const items = await listNotifications(runtime().DB, user.userId, 50);
    return Response.json({
      notifications: items,
      unread: items.filter((n) => !n.read).length,
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json()) as { action?: string; ids?: string[] };
    if (body.action === 'readAll') {
      await markNotificationsRead(runtime().DB, user.userId, 'all');
      return Response.json({ ok: true });
    }
    if (body.action === 'read' && Array.isArray(body.ids)) {
      await markNotificationsRead(runtime().DB, user.userId, body.ids);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Invalid notification action.' }, { status: 400 });
  } catch (e) {
    return failure(e);
  }
}
