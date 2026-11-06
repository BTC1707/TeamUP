import type { Project } from '@/lib/model';

export type NotificationType = 'nudge' | 'task_created' | 'task_completed';

export type AppNotification = {
  id: string;
  userId: string;
  projectId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  meta: Record<string, string>;
};

export function createNotificationRows(
  db: D1Database,
  items: (Omit<AppNotification, 'read' | 'createdAt'> & { createdAt?: string })[],
) {
  const now = new Date().toISOString();
  return items.map((item) =>
    db
      .prepare(
        `INSERT INTO notifications(id,user_id,project_id,type,title,body,read,created_at,meta)
         VALUES(?,?,?,?,?,?,0,?,?)`,
      )
      .bind(
        item.id,
        item.userId,
        item.projectId,
        item.type,
        item.title.slice(0, 200),
        item.body.slice(0, 2000),
        item.createdAt || now,
        JSON.stringify(item.meta || {}),
      ),
  );
}

export async function insertNotifications(
  db: D1Database,
  items: {
    userId: string;
    projectId: string | null;
    type: NotificationType;
    title: string;
    body: string;
    meta?: Record<string, string>;
  }[],
) {
  if (!items.length) return 0;
  const stmts = createNotificationRows(
    db,
    items.map((item) => ({
      id: crypto.randomUUID(),
      userId: item.userId,
      projectId: item.projectId,
      type: item.type,
      title: item.title,
      body: item.body,
      meta: item.meta || {},
    })),
  );
  await db.batch(stmts);
  return stmts.length;
}

export async function listNotifications(db: D1Database, userId: string, limit = 50) {
  const rows = await db
    .prepare(
      `SELECT id,user_id,project_id,type,title,body,read,created_at,meta
       FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, Math.min(Math.max(limit, 1), 100))
    .all<{
      id: string;
      user_id: string;
      project_id: string | null;
      type: string;
      title: string;
      body: string;
      read: number;
      created_at: string;
      meta: string;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    read: !!row.read,
    createdAt: row.created_at,
    meta: safeMeta(row.meta),
  })) satisfies AppNotification[];
}

export async function markNotificationsRead(
  db: D1Database,
  userId: string,
  ids: string[] | 'all',
) {
  if (ids === 'all') {
    await db.prepare('UPDATE notifications SET read=1 WHERE user_id=? AND read=0').bind(userId).run();
    return;
  }
  const clean = ids.filter((id) => typeof id === 'string' && id.length <= 80).slice(0, 100);
  if (!clean.length) return;
  await db.batch(
    clean.map((id) =>
      db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').bind(id, userId),
    ),
  );
}

export function taskActivityNotifications(
  previous: Project | null,
  next: Project,
  actorId: string,
  actorName: string,
) {
  const prevById = new Map((previous?.tasks || []).map((t) => [t.id, t]));
  const recipients = next.members.map((m) => m.id).filter((id) => id && id !== actorId);
  if (!recipients.length) return [] as Parameters<typeof insertNotifications>[1];

  const items: Parameters<typeof insertNotifications>[1] = [];
  for (const task of next.tasks) {
    const prior = prevById.get(task.id);
    if (!prior) {
      for (const userId of recipients) {
        items.push({
          userId,
          projectId: next.id,
          type: 'task_created',
          title: 'New task',
          body: `${actorName} added “${task.title}” to ${next.name}.`,
          meta: { taskId: task.id, actorId, actorName },
        });
      }
      continue;
    }
    if (prior.status !== 'done' && task.status === 'done') {
      for (const userId of recipients) {
        items.push({
          userId,
          projectId: next.id,
          type: 'task_completed',
          title: 'Task completed',
          body: `${actorName} completed “${task.title}” on ${next.name}.`,
          meta: { taskId: task.id, actorId, actorName },
        });
      }
    }
  }
  return items.slice(0, 100);
}

export function localTaskActivityNotifications(
  previous: Project | null,
  next: Project,
  actorId: string,
  actorName: string,
): AppNotification[] {
  const now = new Date().toISOString();
  return taskActivityNotifications(previous, next, actorId, actorName).map((item) => ({
    id: crypto.randomUUID(),
    userId: item.userId,
    projectId: item.projectId,
    type: item.type,
    title: item.title,
    body: item.body,
    read: false,
    createdAt: now,
    meta: item.meta || {},
  }));
}

export function localNudgeNotification(opts: {
  recipientId: string;
  senderName: string;
  projectId: string;
  projectName: string;
}): AppNotification {
  return {
    id: crypto.randomUUID(),
    userId: opts.recipientId,
    projectId: opts.projectId,
    type: 'nudge',
    title: 'Nudge',
    body: `${opts.senderName} sent you a nudge on your ${opts.projectName} project. Go in and get your work done!`,
    read: false,
    createdAt: new Date().toISOString(),
    meta: { actorName: opts.senderName },
  };
}

function safeMeta(raw: string) {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value.slice(0, 200);
    }
    return out;
  } catch {
    return {};
  }
}
