import { identity, runtime, projectFor, sameOrigin } from '@/lib/server';
import { insertNotifications, nudgeNotificationBody } from '@/lib/notifications';
import { emailConfigured } from '@/lib/email';

export async function GET() {
  try {
    await identity();
    return Response.json({
      enabled: false,
      publicKey: null,
      subscribed: false,
      emailReady: emailConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json(
      { error: message === 'SIGN_IN' ? 'Sign in to continue.' : 'Unable to load notification settings.' },
      { status: message === 'SIGN_IN' ? 401 : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const { DB } = runtime();
    const text = await req.text();
    if (text.length > 12_000) return Response.json({ error: 'Invalid push request.' }, { status: 413 });
    const body = JSON.parse(text);

    if (body.action === 'subscribe' || body.action === 'unsubscribe') {
      return Response.json({ error: 'That action is not available.' }, { status: 410 });
    }

    if (body.action === 'nudge') {
      const projectId = typeof body.projectId === 'string' ? body.projectId.slice(0, 100) : '';
      const recipientId = typeof body.recipientId === 'string' ? body.recipientId.slice(0, 100) : '';
      const customMessage =
        typeof body.message === 'string' ? body.message.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
      if (!projectId || !recipientId || recipientId === user.userId)
        return Response.json({ error: 'Choose a teammate to nudge.' }, { status: 400 });

      const project = await projectFor(projectId, user);
      const recipient = project.members.find((member) => member.id === recipientId);
      if (!recipient)
        return Response.json({ error: 'That teammate is not in this project.' }, { status: 403 });

      const preference = await DB.prepare('SELECT notifications FROM settings WHERE user_id=?')
        .bind(recipientId)
        .first<{ notifications: number }>();
      // No settings row yet → allow; signed-in users who opted out stay opted out.
      if (preference && !preference.notifications)
        return Response.json({ error: 'That teammate has notifications turned off.' }, { status: 409 });

      // Nudges are stored as in-app notifications.
      const notificationBody = nudgeNotificationBody({
        senderName: user.displayName,
        projectName: project.name,
        message: customMessage,
      });

      try {
        await insertNotifications(DB, [
          {
            userId: recipientId,
            projectId: project.id,
            type: 'nudge',
            title: 'Nudge',
            body: notificationBody,
            meta: {
              actorId: user.userId,
              actorName: user.displayName,
              ...(customMessage ? { message: customMessage } : {}),
            },
          },
        ]);
      } catch (error) {
        console.error('In-app nudge notification failed', error);
        return Response.json(
          { error: 'Could not deliver the nudge. Please try again.' },
          { status: 502 },
        );
      }

      return Response.json({
        ok: true,
        delivered: 0,
        pushDelivered: false,
        emailSent: false,
        inApp: true,
      });
    }

    return Response.json({ error: 'Unknown push action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'SIGN_IN' ? 401 : message === 'NOT_FOUND' ? 404 : 500;
    return Response.json({ error: status === 401 ? 'Sign in to send a nudge.' : status === 404 ? 'Project not found or access denied.' : 'Unable to send that nudge.' }, { status });
  }
}
