import type { Actor } from './store';
import { getProject } from './store';
import { nextMemberColor } from '@/lib/availability-calendar';
import { emailConfigured, inviteEmailContent, sendEmail } from '@/lib/email';
import { insertNotifications } from '@/lib/notifications';
import { avatarUrlFor } from '@/lib/avatar';

export async function hashInvite(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function createInvite(db: D1Database, projectId: string, u: Actor) {
  const p = await getProject(db, projectId, u);
  if (p.owner !== u.userId) throw new Error('NOT_FOUND');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const expires = Date.now() + 7 * 86400000;
  const hash = await hashInvite(token);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM project_invites WHERE project_id=?').bind(projectId),
    db
      .prepare(
        'INSERT INTO project_invites(project_id,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?)',
      )
      .bind(projectId, hash, u.userId, now, expires),
  ]);
  return { token, expiresAt: expires, projectName: p.name };
}

/** Create (or rotate) an invite and email the join link. */
export async function sendInviteEmail(
  db: D1Database,
  projectId: string,
  u: Actor,
  email: string,
  origin: string,
) {
  if (!emailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  const to = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254)
    throw new Error('EMAIL_INVALID');
  if (to === u.email.toLowerCase()) throw new Error('EMAIL_SELF');

  const invite = await createInvite(db, projectId, u);
  const joinUrl = `${origin.replace(/\/$/, '')}/join#${invite.token}`;
  const content = inviteEmailContent({
    inviterName: u.displayName,
    projectName: invite.projectName,
    joinUrl,
    expiresAt: invite.expiresAt,
  });
  await sendEmail({ to, ...content });
  return { sent: true as const, expiresAt: invite.expiresAt, token: invite.token };
}
export async function previewInvite(db: D1Database, token: string, u: Actor) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('INVITE_INVALID');
  const r = await db
    .prepare(
      'SELECT p.id,p.title,p.group_id FROM project_invites i JOIN projects p ON p.id=i.project_id WHERE i.token_hash=? AND i.expires_at>?',
    )
    .bind(await hashInvite(token), Date.now())
    .first<any>();
  if (!r) throw new Error('INVITE_INVALID');
  const member = await db
    .prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?')
    .bind(r.group_id, u.userId)
    .first();
  return { projectId: r.id, name: r.title, groupId: r.group_id, alreadyMember: !!member };
}
export async function acceptInvite(db: D1Database, token: string, u: Actor) {
  const p = await previewInvite(db, token, u);
  if (p.alreadyMember) return { projectId: p.projectId };
  const hash = await hashInvite(token);
  const now = Date.now();
  const color = await unusedGroupColor(db, p.groupId);
  const allowed = `EXISTS(SELECT 1 FROM project_invites WHERE project_id=? AND token_hash=? AND expires_at>?) AND (SELECT count(*) FROM group_members WHERE group_id=?)<30`;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE projects SET version=version+1 WHERE id=? AND ${allowed} AND NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=? AND user_id=?)`,
      )
      .bind(p.projectId, p.projectId, hash, now, p.groupId, p.groupId, u.userId),
    db
      .prepare(
        `INSERT OR IGNORE INTO group_members(group_id,user_id,role,color) SELECT ?,?,'member',? WHERE ${allowed}`,
      )
      .bind(p.groupId, u.userId, color, p.projectId, hash, now, p.groupId),
  ]);
  if (!results[1].meta.changes) {
    const member = await db
      .prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?')
      .bind(p.groupId, u.userId)
      .first();
    if (!member) throw new Error('INVITE_UNAVAILABLE');
  }
  return { projectId: p.projectId };
}
async function unusedGroupColor(db: D1Database, groupId: string) {
  const rows = await db
    .prepare('SELECT color FROM group_members WHERE group_id=?')
    .bind(groupId)
    .all<{ color: string | null }>();
  return nextMemberColor(rows.results.map((row) => row.color));
}
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Find existing accounts by email or username. Does not include the current project members. */
export async function searchInvitees(db: D1Database, projectId: string, u: Actor, rawQuery: string) {
  const project = await getProject(db, projectId, u);
  if (project.owner !== u.userId) throw new Error('NOT_FOUND');
  const query = rawQuery.trim().toLowerCase().slice(0, 80);
  if (query.length < 2) return [];
  const prefix = `${escapeLike(query)}%`;
  const rows = await db
    .prepare(
      `SELECT id, name, username, email, avatar_key FROM users
       WHERE lower(email)=? OR lower(username)=? OR lower(email) LIKE ? ESCAPE '\\' OR lower(username) LIKE ? ESCAPE '\\'
       LIMIT 8`,
    )
    .bind(query, query, prefix, prefix)
    .all<{
      id: string;
      name: string;
      username: string | null;
      email: string;
      avatar_key: string | null;
    }>();
  const memberIds = new Set(project.members.map((member) => member.id));
  return rows.results
    .filter((row) => row.id !== u.userId && !memberIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username || '',
      email: row.email,
      avatarUrl: avatarUrlFor(row.id, row.avatar_key) || undefined,
    }));
}

/** Ask an existing account to join. They accept or decline from notifications. */
export async function inviteMember(db: D1Database, projectId: string, u: Actor, inviteeId: string) {
  const project = await getProject(db, projectId, u);
  if (project.owner !== u.userId) throw new Error('NOT_FOUND');
  if (!inviteeId || inviteeId === u.userId) throw new Error('INVITE_USER');
  if (project.members.some((member) => member.id === inviteeId)) throw new Error('INVITE_MEMBER');
  const person = await db
    .prepare('SELECT id, name FROM users WHERE id=?')
    .bind(inviteeId)
    .first<{ id: string; name: string }>();
  if (!person) throw new Error('INVITE_USER');

  const existing = await db
    .prepare('SELECT id, status FROM project_member_invites WHERE project_id=? AND invitee_id=?')
    .bind(projectId, inviteeId)
    .first<{ id: string; status: string }>();
  if (existing?.status === 'pending') throw new Error('INVITE_PENDING');

  const id = existing?.id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (existing) {
    await db
      .prepare(
        'UPDATE project_member_invites SET status=?, inviter_id=?, created_at=? WHERE id=?',
      )
      .bind('pending', u.userId, createdAt, id)
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO project_member_invites(id,project_id,inviter_id,invitee_id,status,created_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(id, projectId, u.userId, inviteeId, 'pending', createdAt)
      .run();
  }

  await insertNotifications(db, [
    {
      userId: inviteeId,
      projectId,
      type: 'project_invite',
      title: 'Project invite',
      body: `${u.displayName} invited you to join ${project.name}.`,
      meta: {
        inviteId: id,
        actorId: u.userId,
        actorName: u.displayName,
        projectName: project.name,
        state: 'pending',
      },
    },
  ]);
  return { id, name: person.name };
}

export async function respondToMemberInvite(
  db: D1Database,
  u: Actor,
  inviteId: string,
  decision: 'accept' | 'reject',
) {
  const invite = await db
    .prepare(
      `SELECT i.id, i.project_id, i.inviter_id, i.invitee_id, i.status, p.title, p.group_id
       FROM project_member_invites i JOIN projects p ON p.id=i.project_id WHERE i.id=?`,
    )
    .bind(inviteId)
    .first<{
      id: string;
      project_id: string;
      inviter_id: string;
      invitee_id: string;
      status: string;
      title: string;
      group_id: string;
    }>();
  if (!invite || invite.invitee_id !== u.userId) throw new Error('INVITE_INVALID');
  if (invite.status !== 'pending') return { status: invite.status, projectId: invite.project_id };

  if (decision === 'reject') {
    await db
      .prepare('UPDATE project_member_invites SET status=? WHERE id=? AND status=?')
      .bind('rejected', invite.id, 'pending')
      .run();
    await insertNotifications(db, [
      {
        userId: invite.inviter_id,
        projectId: invite.project_id,
        type: 'invite_response',
        title: 'Invite declined',
        body: `${u.displayName} declined the invite to ${invite.title}.`,
        meta: { inviteId: invite.id, actorName: u.displayName, projectName: invite.title },
      },
    ]);
    return { status: 'rejected', projectId: invite.project_id };
  }

  const color = await unusedGroupColor(db, invite.group_id);
  const accepted = await db
    .prepare(
      `UPDATE project_member_invites SET status='accepted' WHERE id=? AND status='pending' AND (SELECT count(*) FROM group_members WHERE group_id=?)<30`,
    )
    .bind(invite.id, invite.group_id)
    .run();
  if (!accepted.meta.changes) throw new Error('INVITE_UNAVAILABLE');
  await db
    .prepare(
      `INSERT OR IGNORE INTO group_members(group_id,user_id,role,color) VALUES(?,?,'member',?)`,
    )
    .bind(invite.group_id, u.userId, color)
    .run();
  await insertNotifications(db, [
    {
      userId: invite.inviter_id,
      projectId: invite.project_id,
      type: 'invite_response',
      title: 'Invite accepted',
      body: `${u.displayName} joined ${invite.title}.`,
      meta: { inviteId: invite.id, actorName: u.displayName, projectName: invite.title },
    },
  ]);
  return { status: 'accepted', projectId: invite.project_id };
}

export async function revokeInvite(db: D1Database, project: string, u: Actor) {
  const p = await getProject(db, project, u);
  if (p.owner !== u.userId) throw new Error('NOT_FOUND');
  await db.prepare('DELETE FROM project_invites WHERE project_id=?').bind(project).run();
}
