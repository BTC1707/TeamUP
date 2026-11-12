import { aiConfigured, isSiteOwner } from '@/lib/ai-config';
import { getSessionUser, refreshSessionCookieIfNeeded, requestIsSecure } from '@/lib/auth';
import { emailConfigured } from '@/lib/email';
import { identity, runtime, projectFor, failure, sameOrigin } from '@/lib/server';
import {
  listProjects,
  readProject,
  replaceRows,
  userKey,
  deleteProject,
  leaveProject,
  cleanupFiles,
} from '@/lib/store';
import { insertNotifications, taskActivityNotifications } from '@/lib/notifications';
import { avatarUrlFor } from '@/lib/avatar';
import { availabilitySlotsError } from '@/lib/availability-calendar';
import { countNewRecords, creationStatements, projectCreatedStatement } from '@/lib/usage';
import type { Project } from '@/lib/model';
export async function GET(req: Request) {
  try {
    const u = await identity();
    const session = await getSessionUser();
    const refreshedCookie = session
      ? await refreshSessionCookieIfNeeded(session, { secure: requestIsSecure(req) })
      : null;
    const { DB } = runtime();
    await cleanupFiles(DB, runtime().BUCKET, u.userId);
    const profile = await DB.prepare(
      'SELECT u.*,s.language,s.time_zone,s.notifications,s.tutorial_seen FROM users u JOIN settings s ON s.user_id=u.id WHERE u.id=?',
    )
      .bind(u.userId)
      .first<any>();
    return Response.json(
      {
        user: {
          id: u.userId,
          // Prefer username for local admin so the sidebar shows "admin".
          name: profile.username || profile.name || u.displayName,
          username: profile.username || '',
          email: u.email,
          address: profile.address || '',
          phone: profile.phone || '',
          language: profile.language,
          timeZone: profile.time_zone,
          notifications: !!profile.notifications,
          tutorialSeen: !!profile.tutorial_seen,
          avatarUrl: avatarUrlFor(u.userId, profile.avatar_key) || undefined,
        },
        projects: await listProjects(DB, u),
        aiReady: await aiConfigured(),
        canConfigureAI: isSiteOwner(u.email),
        emailReady: emailConfigured(),
      },
      refreshedCookie ? { headers: { 'Set-Cookie': refreshedCookie } } : undefined,
    );
  } catch (e) {
    return failure(e);
  }
}
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const str = (v: unknown, n: number) => typeof v === 'string' && v.length <= n;
const unique = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const { DB } = runtime();
    const raw = await req.text();
    if (raw.length > 300000)
      return Response.json({ error: 'Project is too large.' }, { status: 400 });
    const body = JSON.parse(raw);
    if (body.action === 'tutorial') {
      await DB.prepare('UPDATE settings SET tutorial_seen=1 WHERE user_id=?').bind(u.userId).run();
      return Response.json({ ok: true });
    }
    if (body.action === 'profile') {
      const name = String(body.name || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 80),
        zone = String(body.timeZone || 'UTC');
      if (!name) return Response.json({ error: 'Enter your name.' }, { status: 400 });
      const nameParts = name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ');
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
      } catch {
        return Response.json(
          { error: 'Enter a valid timezone, such as America/Denver.' },
          { status: 400 },
        );
      }
      await DB.batch([
        DB.prepare(
          'UPDATE users SET name=?,first_name=?,last_name=?,address=?,phone=? WHERE id=?',
        ).bind(
          name,
          firstName,
          lastName,
          String(body.address || '').slice(0, 300),
          String(body.phone || '').slice(0, 40),
          u.userId,
        ),
        DB.prepare(
          'UPDATE settings SET language=?,time_zone=?,notifications=? WHERE user_id=?',
        ).bind(
          String(body.language || 'en').slice(0, 20),
          zone,
          body.notifications === false ? 0 : 1,
          u.userId,
        ),
      ]);
      return Response.json({ ok: true });
    }
    if (body.action === 'leave') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'Choose a project to leave.' }, { status: 400 });
      const current = await projectFor(id, u);
      if (!Number.isInteger(body.version) || body.version !== current.version) throw new Error('CONFLICT');
      const left = await leaveProject(DB, id, u);
      if (left.ownerId) {
        try {
          await insertNotifications(DB, [
            {
              userId: left.ownerId,
              projectId: id,
              type: 'member_left',
              title: 'Teammate left',
              body: `${u.displayName} left ${left.projectName}. Their tasks are unassigned.`,
              meta: { actorName: u.displayName, projectName: left.projectName },
            },
          ]);
        } catch (error) {
          console.error('Leave notification failed', error);
        }
      }
      return Response.json({ ok: true });
    }
    if (!['create', 'update'].includes(body.action))
      return Response.json({ error: 'Unknown action.' }, { status: 400 });
    const p = body.project as Project;
    if (
      !p ||
      !str(p.name, 200) ||
      !p.name.trim() ||
      !date(p.due) ||
      !str(p.description ?? '', 30000) ||
      !str(p.course ?? '', 200) ||
      !Array.isArray(p.tasks) ||
      p.tasks.length > 500 ||
      !Array.isArray(p.members) ||
      p.members.length > 30 ||
      !Array.isArray(p.milestones) ||
      p.milestones.length > 100 ||
      !p.availability ||
      typeof p.availability !== 'object' ||
      Array.isArray(p.availability) ||
      !Number.isInteger(p.reminderHours) ||
      p.reminderHours < 1 ||
      p.reminderHours > 168 ||
      !Number.isInteger(p.version)
    )
      return Response.json({ error: 'Check the project details.' }, { status: 400 });
    if (
      p.tasks.some(
        (t) =>
          !t ||
          !str(t.id, 300) ||
          !t.id ||
          !str(t.title, 200) ||
          !t.title.trim() ||
          !str(t.description ?? '', 5000) ||
          !date(t.due) ||
          !['todo', 'progress', 'done'].includes(t.status),
      ) ||
      p.milestones.some(
        (m) =>
          !m ||
          !str(m.id, 300) ||
          !m.id ||
          !str(m.title, 200) ||
          !m.title.trim() ||
          !str(m.description ?? '', 5000) ||
          !date(m.due) ||
          typeof m.done !== 'boolean',
      ) ||
      p.members.some(
        (m) =>
          !m ||
          !str(m.id, 300) ||
          !str(m.name, 80) ||
          !m.name.trim() ||
          !str(m.email, 254) ||
          !/^\S+@\S+\.\S+$/.test(m.email),
      ) ||
      !unique(p.tasks) ||
      !unique(p.milestones)
    )
      return Response.json(
        { error: 'Check task, milestone, and member details.' },
        { status: 400 },
      );
    const create = body.action === 'create';
    let previous: Project | undefined;
    if (create) {
      p.id = crypto.randomUUID();
      p.version = 0;
      p.owner = u.userId;
      p.groupId = 'group:' + p.id;
      p.members = [{ id: u.userId, name: u.displayName, email: u.email }];
      p.availability = {};
    } else {
      previous = await projectFor(p.id, u);
      if (previous.version !== p.version) throw new Error('CONFLICT');
      p.owner = previous.owner;
      p.groupId = previous.groupId;
      if (previous.owner !== u.userId) p.members = previous.members;
    }
    const owner = p.owner!;
    if (!p.members.some((m) => userKey(m.email) === owner))
      return Response.json({ error: 'The group owner cannot be removed.' }, { status: 400 });
    const ids = new Map(p.members.map((m) => [m.id, userKey(m.email)]));
    p.members = p.members.map((m) => ({
      ...m,
      id: userKey(m.email),
      email: m.email.toLowerCase(),
    }));
    if (!unique(p.members))
      return Response.json({ error: 'Each teammate needs a different email.' }, { status: 400 });
    const scope = (id: string) => (id.startsWith(p.id + ':') ? id : p.id + ':' + id);
    const ms = new Map(p.milestones.map((m) => [m.id, scope(m.id)]));
    const previousPhotoKeys = new Map(
      (previous?.milestones || []).map((m) => [m.id, m.photoKey || ''] as const),
    );
    p.milestones = p.milestones.map((m) => {
      const id = scope(m.id);
      const photoKey = previousPhotoKeys.get(id) || previousPhotoKeys.get(m.id) || m.photoKey;
      return { ...m, id, ...(photoKey ? { photoKey } : { photoKey: undefined }) };
    });
    for (const t of p.tasks) {
      t.id = scope(t.id);
      t.assignee = ids.get(t.assignee) || '';
      if (t.milestone && !ms.has(t.milestone))
        return Response.json({ error: 'Choose a milestone from this project.' }, { status: 400 });
      t.milestone = ms.get(t.milestone) || '';
    }
    const slots = p.availability[u.userId] || [];
    const slotError = availabilitySlotsError(slots, previous?.availability[u.userId] || []);
    if (slotError) return Response.json({ error: slotError }, { status: 400 });
    p.availability = { ...(previous?.availability || {}), [u.userId]: slots };
    const token = crypto.randomUUID();
    const group = p.groupId!;
    const stmts: D1PreparedStatement[] = [];
    if (create) {
      stmts.push(DB.prepare('INSERT INTO groups(id,name) VALUES(?,?)').bind(group, p.name));
      stmts.push(
        DB.prepare(
          'INSERT INTO projects(id,owner,data,version,group_id,title,description,course,deadline,reminder_hours,normalized,write_token) VALUES(?,?,?,0,?,?,?,?,?,?,1,?)',
        ).bind(
          p.id,
          owner,
          '{}',
          group,
          p.name,
          p.description || '',
          p.course || '',
          p.due,
          p.reminderHours,
          token,
        ),
      );
    } else
      stmts.push(
        DB.prepare(
          'UPDATE projects SET title=?,description=?,course=?,deadline=?,reminder_hours=?,version=version+1,write_token=? WHERE id=? AND version=?',
        ).bind(
          p.name,
          p.description || '',
          p.course || '',
          p.due,
          p.reminderHours,
          token,
          p.id,
          p.version,
        ),
      );
    stmts.push(...replaceRows(DB, p, group, owner, token, create || owner === u.userId, u.userId));
    stmts.push(
      ...creationStatements(
        DB,
        p.id,
        token,
        countNewRecords(p.tasks, previous?.tasks),
        countNewRecords(p.milestones, previous?.milestones),
      ),
    );
    if (create) stmts.push(projectCreatedStatement(DB, p.id, token));
    const results = await DB.batch(stmts);
    if (!create && !results[0].meta.changes) throw new Error('CONFLICT');
    const saved = await readProject(DB, p.id);
    try {
      const activity = taskActivityNotifications(
        previous || null,
        saved,
        u.userId,
        u.displayName,
      );
      if (activity.length) await insertNotifications(DB, activity);
    } catch (error) {
      console.error('Project activity notifications failed', error);
    }
    return Response.json({ project: saved });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const body = (await req.json()) as { id: string; name: string; version: number };
    const p = await projectFor(body.id, u);
    if (p.owner !== u.userId) throw new Error('NOT_FOUND');
    if (body.name !== p.name || !Number.isInteger(body.version))
      return Response.json(
        { error: 'Type the project name to confirm deletion.' },
        { status: 400 },
      );
    await deleteProject(runtime().DB, p.id, u, body.version);
    await cleanupFiles(runtime().DB, runtime().BUCKET, u.userId);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
