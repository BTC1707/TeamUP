import { identity, runtime, failure, sameOrigin, projectFor } from '@/lib/server';
import {
  isAllowedProjectMediaType,
  PROJECT_MEDIA_MAX_BYTES,
  milestonePhotoObjectKey,
  milestonePhotoUrlFor,
} from '@/lib/project-media';

export async function GET(req: Request) {
  try {
    const user = await identity();
    const url = new URL(req.url);
    const projectId = url.searchParams.get('project') || '';
    const milestoneId = url.searchParams.get('milestone') || '';
    if (!projectId || projectId.length > 100 || !milestoneId || milestoneId.length > 120)
      return new Response('Not found', { status: 404 });

    await projectFor(projectId, user);
    const { DB, BUCKET } = runtime();
    const row = await DB.prepare('SELECT photo_key FROM milestones WHERE id=? AND project_id=?')
      .bind(milestoneId, projectId)
      .first<{ photo_key: string | null }>();
    if (!row?.photo_key) return new Response('Not found', { status: 404 });

    const blob = await BUCKET.get(row.photo_key);
    if (!blob) return new Response('Not found', { status: 404 });

    return new Response(blob.body, {
      headers: {
        'Content-Type': blob.httpMetadata?.contentType || 'image/jpeg',
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
    if (Number(req.headers.get('content-length')) > PROJECT_MEDIA_MAX_BYTES + 50_000)
      return Response.json({ error: 'Photos must be under 2 MB.' }, { status: 413 });

    const form = await req.formData();
    const projectId = String(form.get('project') || '').slice(0, 100);
    const milestoneId = String(form.get('milestone') || '').slice(0, 120);
    const file = form.get('file');
    if (!projectId || !milestoneId)
      return Response.json({ error: 'Choose a milestone first.' }, { status: 400 });
    await projectFor(projectId, user);

    if (!(file instanceof File) || !file.size)
      return Response.json({ error: 'Choose a photo before uploading.' }, { status: 400 });
    if (file.size > PROJECT_MEDIA_MAX_BYTES)
      return Response.json({ error: 'Photos must be under 2 MB.' }, { status: 413 });
    if (!isAllowedProjectMediaType(file.type))
      return Response.json({ error: 'Use a JPEG, PNG, WebP, or GIF photo.' }, { status: 400 });

    const { DB, BUCKET } = runtime();
    const existing = await DB.prepare('SELECT photo_key FROM milestones WHERE id=? AND project_id=?')
      .bind(milestoneId, projectId)
      .first<{ photo_key: string | null }>();
    if (!existing) return Response.json({ error: 'Milestone not found.' }, { status: 404 });

    const key = milestonePhotoObjectKey(projectId, milestoneId, crypto.randomUUID());
    await BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    try {
      await DB.prepare('UPDATE milestones SET photo_key=? WHERE id=? AND project_id=?')
        .bind(key, milestoneId, projectId)
        .run();
    } catch (error) {
      await BUCKET.delete(key);
      throw error;
    }

    if (existing.photo_key && existing.photo_key !== key) {
      try {
        await BUCKET.delete(existing.photo_key);
      } catch {
        // Best-effort cleanup.
      }
    }

    return Response.json({
      ok: true,
      photoUrl: milestonePhotoUrlFor(projectId, milestoneId, key),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json().catch(() => ({}))) as {
      project?: unknown;
      milestone?: unknown;
    };
    const projectId = typeof body.project === 'string' ? body.project.slice(0, 100) : '';
    const milestoneId = typeof body.milestone === 'string' ? body.milestone.slice(0, 120) : '';
    if (!projectId || !milestoneId)
      return Response.json({ error: 'Choose a milestone first.' }, { status: 400 });
    await projectFor(projectId, user);

    const { DB, BUCKET } = runtime();
    const existing = await DB.prepare('SELECT photo_key FROM milestones WHERE id=? AND project_id=?')
      .bind(milestoneId, projectId)
      .first<{ photo_key: string | null }>();
    if (!existing) return Response.json({ error: 'Milestone not found.' }, { status: 404 });

    await DB.prepare('UPDATE milestones SET photo_key=NULL WHERE id=? AND project_id=?')
      .bind(milestoneId, projectId)
      .run();
    if (existing.photo_key) {
      try {
        await BUCKET.delete(existing.photo_key);
      } catch {
        // Best-effort cleanup.
      }
    }

    return Response.json({ ok: true, photoUrl: '' });
  } catch (error) {
    return failure(error);
  }
}
