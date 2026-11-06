import type { Actor } from './store';
import { getProject } from './store';
import { emailConfigured, inviteEmailContent, sendEmail } from '@/lib/email';

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
  await db
    .prepare(
      'INSERT INTO project_invites(project_id,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET token_hash=excluded.token_hash,created_by=excluded.created_by,created_at=excluded.created_at,expires_at=excluded.expires_at',
    )
    .bind(projectId, await hashInvite(token), u.userId, new Date().toISOString(), expires)
    .run();
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
  const allowed = `EXISTS(SELECT 1 FROM project_invites WHERE project_id=? AND token_hash=? AND expires_at>?) AND (SELECT count(*) FROM group_members WHERE group_id=?)<30`;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE projects SET version=version+1 WHERE id=? AND ${allowed} AND NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=? AND user_id=?)`,
      )
      .bind(p.projectId, p.projectId, hash, now, p.groupId, p.groupId, u.userId),
    db
      .prepare(
        `INSERT OR IGNORE INTO group_members(group_id,user_id,role) SELECT ?,?,'member' WHERE ${allowed}`,
      )
      .bind(p.groupId, u.userId, p.projectId, hash, now, p.groupId),
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
export async function revokeInvite(db: D1Database, project: string, u: Actor) {
  const p = await getProject(db, project, u);
  if (p.owner !== u.userId) throw new Error('NOT_FOUND');
  await db.prepare('DELETE FROM project_invites WHERE project_id=?').bind(project).run();
}
