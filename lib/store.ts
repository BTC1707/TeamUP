import type { Member, Project } from './model';
import { avatarUrlFor } from './avatar';
import { assignMemberColors, canonicalMemberColor } from './availability-calendar';
import { milestonePhotoUrlFor, projectPhotoUrlFor } from './project-media';
export type Actor = { userId: string; authUserId: string; email: string; displayName: string };
export const userKey = (email: string) => 'user:' + email.trim().toLowerCase();
const scoped = (project: string, id: string) =>
  id.startsWith(project + ':') ? id : project + ':' + id;
export async function ensureUser(db: D1Database, authId: string, email: string, name: string) {
  const id = userKey(email);
  // Does not touch username / password_hash — those are set only at signup.
  await db.batch([
    db
      .prepare(
        'INSERT INTO users(id,auth_id,name,email) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET auth_id=excluded.auth_id, name=excluded.name',
      )
      .bind(id, authId, name, email),
    db.prepare('INSERT OR IGNORE INTO settings(user_id) VALUES(?)').bind(id),
  ]);
  const row = await db
    .prepare('SELECT name FROM users WHERE id=?')
    .bind(id)
    .first<{ name: string }>();
  return { userId: id, authUserId: authId, email, displayName: row!.name };
}

/**
 * Upsert the hardcoded localhost test account into D1.
 * Safe to call on every local admin sign-in.
 */
export async function ensureLocalDevUser(
  db: D1Database,
  input: {
    authId: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    name: string;
    passwordHash: string;
  },
) {
  const id = userKey(input.email);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users(id,auth_id,name,first_name,last_name,username,email,password_hash)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           auth_id=excluded.auth_id,
           name=excluded.name,
           first_name=excluded.first_name,
           last_name=excluded.last_name,
           username=excluded.username,
           password_hash=excluded.password_hash`,
      )
      .bind(
        id,
        input.authId,
        input.name,
        input.firstName,
        input.lastName,
        input.username,
        input.email,
        input.passwordHash,
      ),
    db.prepare('INSERT OR IGNORE INTO settings(user_id) VALUES(?)').bind(id),
  ]);
  return { userId: id, authUserId: input.authId, email: input.email, displayName: input.name };
}

export type PasswordUserRow = {
  id: string;
  auth_id: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string;
  password_hash: string | null;
};

/** Look up a password account by email or username. */
export async function findUserByLogin(
  db: D1Database,
  login: { email: string | null; username: string | null },
) {
  if (login.email) {
    return db
      .prepare(
        'SELECT id, auth_id, name, first_name, last_name, username, email, password_hash FROM users WHERE email=? LIMIT 1',
      )
      .bind(login.email)
      .first<PasswordUserRow>();
  }
  if (login.username) {
    return db
      .prepare(
        'SELECT id, auth_id, name, first_name, last_name, username, email, password_hash FROM users WHERE username=? LIMIT 1',
      )
      .bind(login.username)
      .first<PasswordUserRow>();
  }
  return null;
}

/** Create a new password account. Throws CONFLICT if email or username is taken. */
export async function createPasswordUser(
  db: D1Database,
  input: {
    authId: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    username: string;
    passwordHash: string;
  },
) {
  const id = userKey(input.email);

  const emailTaken = await db
    .prepare('SELECT 1 AS ok FROM users WHERE email=? OR id=? LIMIT 1')
    .bind(input.email, id)
    .first();
  if (emailTaken) throw new Error('EMAIL_TAKEN');

  const usernameTaken = await db
    .prepare('SELECT 1 AS ok FROM users WHERE username=? LIMIT 1')
    .bind(input.username)
    .first();
  if (usernameTaken) throw new Error('USERNAME_TAKEN');

  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO users(id,auth_id,name,first_name,last_name,username,email,password_hash) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          input.authId,
          input.name,
          input.firstName,
          input.lastName,
          input.username,
          input.email,
          input.passwordHash,
        ),
      db.prepare('INSERT OR IGNORE INTO settings(user_id) VALUES(?)').bind(id),
    ]);
  } catch (err) {
    // Unique-index race: map to a friendly conflict.
    const message = err instanceof Error ? err.message : '';
    if (/UNIQUE|constraint/i.test(message)) {
      if (/username/i.test(message)) throw new Error('USERNAME_TAKEN');
      throw new Error('EMAIL_TAKEN');
    }
    throw err;
  }

  return { userId: id, authUserId: input.authId, email: input.email, displayName: input.name };
}

/** Replace a user's password hash (password-reset flow). */
export async function updateUserPasswordHash(
  db: D1Database,
  userId: string,
  passwordHash: string,
) {
  const result = await db
    .prepare('UPDATE users SET password_hash=? WHERE id=?')
    .bind(passwordHash, userId)
    .run();
  if (!result.meta.changes) throw new Error('NOT_FOUND');
}

export async function authorized(db: D1Database, id: string, u: Actor) {
  return db
    .prepare(
      `SELECT * FROM projects p WHERE p.id=? AND ((p.normalized=1 AND EXISTS(SELECT 1 FROM group_members g WHERE g.group_id=p.group_id AND g.user_id=?)) OR (p.normalized=0 AND (p.owner=? OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.email=?))))`,
    )
    .bind(id, u.userId, u.authUserId, u.email)
    .first<any>();
}
// Lazy, atomic migration: legacy rows are kept as a backup; normalized rows become authoritative.
export async function migrateProject(db: D1Database, row: any, u: Actor) {
  if (row.normalized) return;
  const old = JSON.parse(row.data) as Project;
  const p = { ...old, id: row.id, version: row.version };
  const profile = await db
    .prepare('SELECT * FROM profiles WHERE id=?')
    .bind(row.owner)
    .first<any>();
  const ownerEmail =
    p.members.find((m) => m.id === row.owner)?.email ||
    profile?.email ||
    (row.owner === u.authUserId ? u.email : '');
  if (!ownerEmail)
    throw new Error(
      'Legacy project owner could not be resolved. Please ask the creator to open this project.',
    );
  const owner = userKey(ownerEmail);
  const map = new Map(p.members.filter((m) => m.email).map((m) => [m.id, userKey(m.email)]));
  p.members = p.members
    .filter((m) => m.email)
    .map((m) => ({ ...m, id: userKey(m.email), email: m.email.toLowerCase() }));
  if (!p.members.some((m) => m.id === owner))
    p.members.push({
      id: owner,
      name: profile?.name || u.displayName,
      email: ownerEmail.toLowerCase(),
    });
  p.members = Array.from(new Map(p.members.map((m) => [m.id, m])).values());
  p.milestones = p.milestones.map((m) => ({ ...m, id: scoped(p.id, m.id) }));
  p.tasks = p.tasks.map((t) => ({
    ...t,
    id: scoped(p.id, t.id),
    assignee: map.get(t.assignee) || '',
    milestone: p.milestones.find((m) => m.title === t.milestone)?.id || '',
  }));
  p.availability = Object.fromEntries(
    Object.entries(p.availability)
      .filter(([id]) => map.has(id))
      .map(([id, slots]) => [map.get(id)!, slots]),
  );
  const token = crypto.randomUUID();
  const group = 'group:' + p.id;
  const statements = [
    db.prepare('INSERT OR IGNORE INTO groups(id,name) VALUES(?,?)').bind(group, p.name),
    db
      .prepare(
        'UPDATE projects SET group_id=?,title=?,description=?,course=?,deadline=?,reminder_hours=?,owner=?,normalized=1,write_token=? WHERE id=? AND normalized=0',
      )
      .bind(
        group,
        p.name,
        p.description || '',
        p.course || '',
        p.due,
        p.reminderHours || 24,
        owner,
        token,
        p.id,
      ),
    ...replaceRows(db, p, group, owner, token, true),
  ];
  statements.push(
    db
      .prepare('UPDATE files SET storage_key=id WHERE project_id=? AND storage_key IS NULL')
      .bind(p.id),
  );
  await db.batch(statements);
}
export function replaceRows(
  db: D1Database,
  p: Project,
  group: string,
  owner: string,
  token: string,
  members: boolean,
  availabilityUser?: string,
) {
  const guard = 'EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)';
  const q = (sql: string, args: any[] = []) => db.prepare(sql).bind(...args, p.id, token);
  const out: D1PreparedStatement[] = [];
  if (members) {
    for (const m of p.members) {
      out.push(
        q(
          `INSERT INTO users(id,name,email) SELECT ?,?,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`,
          [m.id, m.name, m.email.toLowerCase()],
        ),
      );
      out.push(q(`INSERT OR IGNORE INTO settings(user_id) SELECT ? WHERE ${guard}`, [m.id]));
    }
    out.push(q(`DELETE FROM group_members WHERE group_id=? AND ${guard}`, [group]));
    for (const m of assignMemberColors(p.members))
      out.push(
        q(
          `INSERT INTO group_members(group_id,user_id,role,color,nickname) SELECT ?,?,?,?,? WHERE ${guard}`,
          [
            group,
            m.id,
            m.id === owner ? 'owner' : m.role === 'admin' ? 'admin' : 'member',
            m.color,
            m.nickname?.trim().slice(0, 80) || null,
          ],
        ),
      );
  }
  out.push(q(`DELETE FROM tasks WHERE project_id=? AND ${guard}`, [p.id]));
  out.push(q(`DELETE FROM milestones WHERE project_id=? AND ${guard}`, [p.id]));
  for (const m of p.milestones)
    out.push(
      q(
        `INSERT INTO milestones(id,project_id,title,description,due_date,status,photo_key) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        [
          m.id,
          p.id,
          m.title,
          m.description || '',
          m.due,
          m.done ? 'done' : 'todo',
          m.photoKey || null,
        ],
      ),
    );
  for (const t of p.tasks)
    out.push(
      q(
        `INSERT INTO tasks(id,project_id,assigned_user_id,milestone_id,title,description,due_date,status) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,
        [
          t.id,
          p.id,
          t.assignee || null,
          t.milestone || null,
          t.title,
          t.description || '',
          t.due,
          t.status,
        ],
      ),
    );
  if (availabilityUser)
    out.push(
      q(`DELETE FROM availability WHERE project_id=? AND user_id=? AND ${guard}`, [
        p.id,
        availabilityUser,
      ]),
    );
  else out.push(q(`DELETE FROM availability WHERE project_id=? AND ${guard}`, [p.id]));
  for (const [id, slots] of Object.entries(p.availability)) {
    if (availabilityUser && id !== availabilityUser) continue;
    for (const slot of slots)
      out.push(
        q(
          `INSERT INTO availability(id,user_id,project_id,start_at,end_at) SELECT ?,?,?,?,? WHERE ${guard}`,
          [crypto.randomUUID(), id, p.id, slot, new Date(Date.parse(slot) + 3600000).toISOString()],
        ),
      );
  }
  // Remove availability belonging to users removed from this project's group.
  if (members)
    out.push(
      q(
        `DELETE FROM availability WHERE project_id=? AND user_id NOT IN (SELECT user_id FROM group_members WHERE group_id=?) AND ${guard}`,
        [p.id, group],
      ),
    );
  return out;
}
async function memberColors(
  db: D1Database,
  groupId: string | null,
  rows: {
    id: string;
    name: string;
    email: string;
    avatar_key?: string | null;
    color?: string | null;
    role?: string | null;
    nickname?: string | null;
  }[],
) {
  const current: Member[] = rows.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role === 'admin' ? 'admin' : member.role === 'owner' ? 'owner' : 'member',
    color: member.color || undefined,
    ...(member.nickname?.trim() ? { nickname: member.nickname.trim() } : {}),
    ...(member.avatar_key ? { avatarUrl: avatarUrlFor(member.id, member.avatar_key) } : {}),
  }));
  const assigned = assignMemberColors(current);
  const repairs = assigned.filter(
    (member, index) => canonicalMemberColor(current[index]?.color) !== member.color,
  );
  if (groupId && repairs.length) {
    await db.batch(
      repairs.map((member) =>
        db
          .prepare('UPDATE group_members SET color=? WHERE group_id=? AND user_id=?')
          .bind(member.color, groupId, member.id),
      ),
    );
  }
  return assigned;
}
export async function readProject(db: D1Database, id: string): Promise<Project> {
  const r = await db.prepare('SELECT * FROM projects WHERE id=?').bind(id).first<any>();
  const results = await db.batch([
    db
      .prepare(
        'SELECT u.id,u.name,u.email,u.avatar_key,g.color,g.role,g.nickname FROM users u JOIN group_members g ON g.user_id=u.id WHERE g.group_id=? ORDER BY CASE g.role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END,u.name',
      )
      .bind(r.group_id),
    db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY due_date,id').bind(id),
    db.prepare('SELECT * FROM milestones WHERE project_id=? ORDER BY due_date,id').bind(id),
    db.prepare('SELECT * FROM availability WHERE project_id=? ORDER BY start_at').bind(id),
  ]);
  const slots: Record<string, string[]> = {};
  for (const a of results[3].results as any[]) (slots[a.user_id] ??= []).push(a.start_at);
  return {
    id,
    name: r.title,
    description: r.description,
    course: r.course,
    due: r.deadline,
    owner: r.owner,
    version: r.version,
    groupId: r.group_id,
    reminderHours: r.reminder_hours,
    ...(r.photo_key
      ? { photoKey: r.photo_key, photoUrl: projectPhotoUrlFor(id, r.photo_key) }
      : {}),
    members: await memberColors(db, r.group_id, results[0].results as any[]),
    tasks: (results[1].results as any[]).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignee: t.assigned_user_id || '',
      milestone: t.milestone_id || '',
      due: t.due_date,
      status: t.status,
    })),
    milestones: (results[2].results as any[]).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      due: m.due_date,
      done: m.status === 'done',
      ...(m.photo_key
        ? {
            photoKey: m.photo_key,
            photoUrl: milestonePhotoUrlFor(id, m.id, m.photo_key),
          }
        : {}),
    })),
    availability: slots,
  };
}
export async function getProject(db: D1Database, id: string, u: Actor) {
  const row = await authorized(db, id, u);
  if (!row) throw new Error('NOT_FOUND');
  await migrateProject(db, row, u);
  return readProject(db, id);
}
export async function listProjects(db: D1Database, u: Actor) {
  const rows = await db
    .prepare(
      `SELECT p.id FROM projects p WHERE (p.normalized=1 AND EXISTS(SELECT 1 FROM group_members g WHERE g.group_id=p.group_id AND g.user_id=?)) OR (p.normalized=0 AND (p.owner=? OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.email=?)))`,
    )
    .bind(u.userId, u.authUserId, u.email)
    .all<{ id: string }>();
  const out: Project[] = [];
  for (const r of rows.results) out.push(await getProject(db, r.id, u));
  return out;
}

export async function deleteProject(db: D1Database, id: string, u: Actor, version: number) {
  const p = await getProject(db, id, u);
  if (p.owner !== u.userId) throw new Error('NOT_FOUND');
  const token = crypto.randomUUID();
  const guard = 'EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)';
  const q = (sql: string, args: any[] = []) => db.prepare(sql).bind(...args, id, token);
  const statements = [
    db
      .prepare('UPDATE projects SET write_token=? WHERE id=? AND owner=? AND version=?')
      .bind(token, id, u.userId, version),
    q(
      `INSERT OR IGNORE INTO file_cleanup(storage_key,user_id) SELECT COALESCE(storage_key,id),? FROM files WHERE project_id=? AND ${guard}`,
      [u.userId, id],
    ),
    q(
      `DELETE FROM ai_messaging WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id=?) AND ${guard}`,
      [id],
    ),
  ];
  for (const table of [
    'project_invites',
    'conversations',
    'chats',
    'availability',
    'tasks',
    'milestones',
    'files',
    'memberships',
  ])
    statements.push(q(`DELETE FROM ${table} WHERE project_id=? AND ${guard}`, [id]));
  statements.push(q(`DELETE FROM projects WHERE id=? AND ${guard}`, [id]));
  statements.push(
    db
      .prepare(
        'DELETE FROM group_members WHERE group_id=? AND NOT EXISTS(SELECT 1 FROM projects WHERE group_id=?)',
      )
      .bind(p.groupId, p.groupId),
  );
  statements.push(
    db
      .prepare(
        'DELETE FROM groups WHERE id=? AND NOT EXISTS(SELECT 1 FROM projects WHERE group_id=?)',
      )
      .bind(p.groupId, p.groupId),
  );
  const results = await db.batch(statements);
  if (!results[0].meta.changes) throw new Error('CONFLICT');
}
export async function leaveProject(db: D1Database, id: string, u: Actor) {
  const p = await getProject(db, id, u);
  if (p.owner === u.userId) throw new Error('LEAVE_OWNER');
  const token = crypto.randomUUID();
  const guard = 'EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)';
  const results = await db.batch([
    db
      .prepare('UPDATE projects SET version=version+1, write_token=? WHERE id=? AND version=?')
      .bind(token, id, p.version),
    db
      .prepare(
        `DELETE FROM group_members WHERE group_id=? AND user_id=? AND ${guard}`,
      )
      .bind(p.groupId, u.userId, id, token),
    db
      .prepare(`DELETE FROM memberships WHERE project_id=? AND lower(email)=? AND ${guard}`)
      .bind(id, u.email.toLowerCase(), id, token),
    db
      .prepare(
        `UPDATE tasks SET assigned_user_id=? WHERE project_id=? AND assigned_user_id=? AND ${guard}`,
      )
      .bind(p.owner, id, u.userId, id, token),
    db
      .prepare(`DELETE FROM availability WHERE project_id=? AND user_id=? AND ${guard}`)
      .bind(id, u.userId, id, token),
  ]);
  if (!results[0].meta.changes) throw new Error('CONFLICT');
  if (!results[1].meta.changes) throw new Error('NOT_FOUND');
  return { ownerId: p.owner || '', projectName: p.name };
}
export async function cleanupFiles(db: D1Database, bucket: R2Bucket, userId: string) {
  const rows = await db
    .prepare('SELECT storage_key FROM file_cleanup WHERE user_id=? LIMIT 30')
    .bind(userId)
    .all<{ storage_key: string }>();
  for (const row of rows.results) {
    try {
      await bucket.delete(row.storage_key);
      await db.prepare('DELETE FROM file_cleanup WHERE storage_key=?').bind(row.storage_key).run();
    } catch {
      console.error('Deferred deleted-file cleanup');
      break;
    }
  }
}
