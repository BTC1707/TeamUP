import { identity, runtime, projectFor, failure, sameOrigin } from '@/lib/server';
export async function GET(req: Request) {
  try {
    const user = await identity();
    const url = new URL(req.url);
    const project = url.searchParams.get('project') || '';
    await projectFor(project, user);
    const { DB, BUCKET } = runtime();
    const id = url.searchParams.get('id');
    if (id) {
      const row = await DB.prepare('SELECT * FROM files WHERE id=? AND project_id=?')
        .bind(id, project)
        .first<{ id: string; name: string; type: string }>();
      if (!row) return new Response('Not found', { status: 404 });
      const blob = await BUCKET.get((row as any).storage_key || row.id);
      if (!blob) return new Response('Not found', { status: 404 });
      return new Response(blob.body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const rows = await DB.prepare('SELECT * FROM files WHERE project_id=? ORDER BY created DESC')
      .bind(project)
      .all();
    return Response.json({ files: rows.results });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    if (Number(req.headers.get('content-length')) > 11000000)
      return Response.json({ error: 'Files must be under 10 MB.' }, { status: 413 });
    const form = await req.formData();
    const project = String(form.get('project') || '');
    await projectFor(project, user);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size)
      return Response.json({ error: 'Choose a file before uploading.' }, { status: 400 });
    if (file.size > 10000000)
      return Response.json({ error: 'Files must be under 10 MB.' }, { status: 413 });
    const id = crypto.randomUUID();
    const { DB, BUCKET } = runtime();
    await BUCKET.put(id, await file.arrayBuffer());
    try {
      await DB.prepare(
        'INSERT INTO files(id,project_id,name,size,type,created,uploaded_by,storage_key) VALUES (?,?,?,?,?,?,?,?)',
      )
        .bind(
          id,
          project,
          file.name.slice(0, 200),
          file.size,
          file.type,
          new Date().toISOString(),
          user.userId,
          id,
        )
        .run();
    } catch (e) {
      await BUCKET.delete(id);
      throw e;
    }
    return Response.json({
      ok: true,
      id,
      name: file.name.slice(0, 200),
      type: file.type,
      size: file.size,
    });
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json().catch(() => ({}))) as {
      project?: unknown;
      id?: unknown;
      name?: unknown;
    };
    const project = typeof body.project === 'string' ? body.project.slice(0, 100) : '';
    const id = typeof body.id === 'string' ? body.id.slice(0, 100) : '';
    const name =
      typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!project || !id) return Response.json({ error: 'Choose a file to rename.' }, { status: 400 });
    if (!name) return Response.json({ error: 'Enter a file name.' }, { status: 400 });
    await projectFor(project, user);

    const { DB } = runtime();
    const result = await DB.prepare('UPDATE files SET name=? WHERE id=? AND project_id=?')
      .bind(name, id, project)
      .run();
    if (!result.meta.changes) return Response.json({ error: 'File not found.' }, { status: 404 });
    return Response.json({ ok: true, id, name });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await identity();
    const body = (await req.json().catch(() => ({}))) as {
      project?: unknown;
      id?: unknown;
    };
    const project = typeof body.project === 'string' ? body.project.slice(0, 100) : '';
    const id = typeof body.id === 'string' ? body.id.slice(0, 100) : '';
    if (!project || !id) return Response.json({ error: 'Choose a file to delete.' }, { status: 400 });
    await projectFor(project, user);

    const { DB, BUCKET } = runtime();
    const row = await DB.prepare('SELECT storage_key FROM files WHERE id=? AND project_id=?')
      .bind(id, project)
      .first<{ storage_key: string | null }>();
    if (!row) return Response.json({ error: 'File not found.' }, { status: 404 });

    await DB.prepare('DELETE FROM files WHERE id=? AND project_id=?').bind(id, project).run();
    const key = row.storage_key || id;
    try {
      await BUCKET.delete(key);
    } catch {
      // Best-effort R2 cleanup.
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
