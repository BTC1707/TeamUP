import { identity, runtime, failure, sameOrigin } from '@/lib/server';
import { avatarObjectKey, avatarUrlFor, AVATAR_MAX_BYTES, isAllowedAvatarType } from '@/lib/avatar';

export async function GET(req: Request) {
  try {
    await identity();
    const userId = new URL(req.url).searchParams.get('user') || '';
    if (!userId || userId.length > 100)
      return new Response('Not found', { status: 404 });

    const { DB, BUCKET } = runtime();
    const row = await DB.prepare('SELECT avatar_key FROM users WHERE id=?')
      .bind(userId)
      .first<{ avatar_key: string | null }>();
    if (!row?.avatar_key) return new Response('Not found', { status: 404 });

    const blob = await BUCKET.get(row.avatar_key);
    if (!blob) return new Response('Not found', { status: 404 });

    const contentType = blob.httpMetadata?.contentType || 'image/jpeg';
    return new Response(blob.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    if (Number(req.headers.get('content-length')) > AVATAR_MAX_BYTES + 50_000)
      return Response.json({ error: 'Photos must be under 2 MB.' }, { status: 413 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size)
      return Response.json({ error: 'Choose a photo before uploading.' }, { status: 400 });
    if (file.size > AVATAR_MAX_BYTES)
      return Response.json({ error: 'Photos must be under 2 MB.' }, { status: 413 });
    if (!isAllowedAvatarType(file.type))
      return Response.json(
        { error: 'Use a JPEG, PNG, WebP, or GIF photo.' },
        { status: 400 },
      );

    const { DB, BUCKET } = runtime();
    const existing = await DB.prepare('SELECT avatar_key FROM users WHERE id=?')
      .bind(user.userId)
      .first<{ avatar_key: string | null }>();

    const objectId = crypto.randomUUID();
    const key = avatarObjectKey(user.userId, objectId);
    await BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    try {
      await DB.prepare('UPDATE users SET avatar_key=? WHERE id=?')
        .bind(key, user.userId)
        .run();
    } catch (error) {
      await BUCKET.delete(key);
      throw error;
    }

    if (existing?.avatar_key && existing.avatar_key !== key) {
      try {
        await BUCKET.delete(existing.avatar_key);
      } catch {
        // Old object cleanup is best-effort.
      }
    }

    return Response.json({
      ok: true,
      avatarUrl: avatarUrlFor(user.userId, key),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const { DB, BUCKET } = runtime();
    const existing = await DB.prepare('SELECT avatar_key FROM users WHERE id=?')
      .bind(user.userId)
      .first<{ avatar_key: string | null }>();

    await DB.prepare('UPDATE users SET avatar_key=NULL WHERE id=?').bind(user.userId).run();
    if (existing?.avatar_key) {
      try {
        await BUCKET.delete(existing.avatar_key);
      } catch {
        // Best-effort cleanup.
      }
    }

    return Response.json({ ok: true, avatarUrl: '' });
  } catch (error) {
    return failure(error);
  }
}
