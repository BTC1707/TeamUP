import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import { identity, runtime, projectFor, sameOrigin } from '@/lib/server';

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
      if (!projectId || !recipientId || recipientId === user.userId)
        return Response.json({ error: 'Choose a teammate to nudge.' }, { status: 400 });

      const project = await projectFor(projectId, user);
      if (!project.members.some((member) => member.id === recipientId))
        return Response.json({ error: 'That teammate is not in this project.' }, { status: 403 });

      const preference = await DB.prepare('SELECT notifications FROM settings WHERE user_id=?')
        .bind(recipientId)
        .first<{ notifications: number }>();
      if (!preference?.notifications)
        return Response.json({ error: 'That teammate has notifications turned off.' }, { status: 409 });

      const vapid = vapidConfig();
      if (!vapid.subject || !vapid.publicKey || !vapid.privateKey)
        return Response.json({ error: 'Push delivery is not configured for this deployment yet.' }, { status: 503 });

      const rows = await DB.prepare(
        'SELECT id,endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=?',
      )
        .bind(recipientId)
        .all<{ id: string; endpoint: string; p256dh: string; auth_secret: string }>();
      if (!rows.results.length)
        return Response.json({ error: 'That teammate has not enabled push notifications on a device.' }, { status: 409 });

      const message = {
        data: {
          title: `${user.displayName} sent you a nudge`,
          body: `Check in on ${project.name.slice(0, 100)} when you have a moment.`,
          url: '/workspace',
        },
        options: { ttl: 60 * 60, urgency: 'normal' as const },
      };
      let delivered = 0;
      const deadIds: string[] = [];
      for (const row of rows.results) {
        const subscription: PushSubscription = {
          endpoint: row.endpoint,
          expirationTime: null,
          keys: { p256dh: row.p256dh, auth: row.auth_secret },
        };
        try {
          const request = await buildPushPayload(message, subscription, vapid);
          const response = await fetch(subscription.endpoint, request);
          if (response.ok || response.status === 201 || response.status === 202) delivered += 1;
          else if (response.status === 404 || response.status === 410) deadIds.push(row.id);
        } catch {
          // Keep transiently failing subscriptions so a later nudge can retry them.
        }
      }
      if (deadIds.length) {
        const statements = deadIds.map((id) =>
          DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(id),
        );
        await DB.batch(statements);
      }
      if (!delivered)
        return Response.json({ error: 'The push service could not deliver the nudge. Ask them to re-enable notifications.' }, { status: 502 });
      return Response.json({ ok: true, delivered });
    }

    return Response.json({ error: 'Unknown push action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'SIGN_IN' ? 401 : message === 'NOT_FOUND' ? 404 : 500;
    return Response.json({ error: status === 401 ? 'Sign in to send a nudge.' : status === 404 ? 'Project not found or access denied.' : 'Unable to complete this push request.' }, { status });
  }
}
