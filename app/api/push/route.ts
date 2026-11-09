import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import { identity, runtime, projectFor, sameOrigin } from '@/lib/server';
import { insertNotifications, nudgeNotificationBody } from '@/lib/notifications';
import { emailConfigured } from '@/lib/email';

function vapidConfig() {
  const env = runtime();
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY,
  };
}

async function subscriptionId(endpoint: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

function trustedPushEndpoint(endpoint: URL) {
  const host = endpoint.hostname.toLowerCase();
  return (
    endpoint.protocol === 'https:' &&
    !endpoint.username &&
    !endpoint.password &&
    (!endpoint.port || endpoint.port === '443') &&
    (host === 'fcm.googleapis.com' ||
      host === 'web.push.apple.com' ||
      host === 'push.services.mozilla.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host === 'notify.windows.com' ||
      host.endsWith('.notify.windows.com') ||
      host.endsWith('.wns.windows.com'))
  );
}

export async function GET() {
  try {
    const user = await identity();
    const { DB } = runtime();
    const subscription = await DB.prepare(
      'SELECT id FROM push_subscriptions WHERE user_id=? LIMIT 1',
    )
      .bind(user.userId)
      .first();
    const vapid = vapidConfig();
    return Response.json({
      enabled: !!(vapid.subject && vapid.publicKey && vapid.privateKey),
      publicKey: vapid.publicKey || null,
      subscribed: !!subscription,
      emailReady: emailConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json(
      { error: message === 'SIGN_IN' ? 'Sign in to manage push notifications.' : 'Unable to load push settings.' },
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

    if (body.action === 'subscribe') {
      const subscription = body.subscription as Partial<PushSubscription> | undefined;
      let endpoint: URL;
      try {
        endpoint = new URL(String(subscription?.endpoint || ''));
      } catch {
        return Response.json({ error: 'The browser returned an invalid push endpoint.' }, { status: 400 });
      }
      if (
        !trustedPushEndpoint(endpoint) ||
        !validKey(subscription?.keys?.p256dh) ||
        !validKey(subscription?.keys?.auth)
      ) {
        return Response.json({ error: 'The browser returned an invalid push subscription.' }, { status: 400 });
      }
      const id = await subscriptionId(endpoint.href);
      await DB.prepare(
        `INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth_secret,created_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(user_id,endpoint) DO UPDATE SET
           id=excluded.id,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,created_at=excluded.created_at`,
      )
        .bind(id, user.userId, endpoint.href, subscription.keys.p256dh, subscription.keys.auth, new Date().toISOString())
        .run();
      return Response.json({ ok: true, subscribed: true });
    }

    if (body.action === 'unsubscribe') {
      let endpoint: URL;
      try {
        endpoint = new URL(String(body.endpoint || ''));
      } catch {
        return Response.json({ error: 'The browser returned an invalid push endpoint.' }, { status: 400 });
      }
      const id = await subscriptionId(endpoint.href);
      await DB.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?')
        .bind(id, user.userId)
        .run();
      return Response.json({ ok: true, subscribed: false });
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

      // Email + browser push are paused for now; in-app bell notifications only.
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
    return Response.json({ error: status === 401 ? 'Sign in to send a nudge.' : status === 404 ? 'Project not found or access denied.' : 'Unable to complete this push request.' }, { status });
  }
}
