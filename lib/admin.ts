/**
 * Admin page access and account CRUD.
 *
 * An account can open /admin when users.admin is 1, when their email matches
 * the SITE_OWNER_EMAIL secret, or on localhost when it is the local test account.
 */

import { headers } from 'next/headers';
import {
  displayNameFromParts,
  getSessionUser,
  validatePassword,
  validateUsername,
} from './auth';
import { LOCAL_DEV_ACCOUNT } from './local-dev-account';
import { hashPassword } from './password';
import { runtime } from './server';
import { createPasswordUser, userKey } from './store';

export type AdminAccount = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  admin: boolean;
  daysUsed: number;
  lastSeen: string | null;
  actions: number;
  /** Projects this person has created. Deletes do not reduce it. */
  projectsCreated: number;
  /** Projects they still belong to. */
  projects: number;
};

export type AdminStats = {
  projectsCreated: number;
  accounts: number;
  activeToday: number;
  tasksCreated: number;
  milestonesCreated: number;
};

type UserRow = {
  id: string;
  auth_id: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string;
  admin: number;
  password_hash?: string | null;
};

function cleanName(raw: unknown) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

function namesFrom(row: { name: string; first_name: string | null; last_name: string | null }) {
  if (row.first_name && row.last_name) {
    return { firstName: row.first_name, lastName: row.last_name };
  }
  const parts = row.name.trim().split(/\s+/);
  return { firstName: parts[0] || row.name, lastName: parts.slice(1).join(' ') };
}

function mapAccount(
  row: UserRow & {
    days_used: number;
    last_seen: string | null;
    actions: number;
    projects_created: number;
    projects: number;
  },
): AdminAccount {
  const names = namesFrom(row);
  return {
    id: row.id,
    name: row.name,
    firstName: names.firstName,
    lastName: names.lastName,
    username: row.username || '',
    email: row.email,
    admin: row.admin === 1,
    daysUsed: row.days_used,
    lastSeen: row.last_seen,
    actions: row.actions,
    projectsCreated: row.projects_created,
    projects: row.projects,
  };
}

export function siteOwnerEmail() {
  const email = runtime().SITE_OWNER_EMAIL?.trim().toLowerCase();
  return email || null;
}

async function requestHost() {
  try {
    return (await headers()).get('host')?.split(':')[0] || '';
  } catch {
    return '';
  }
}

/** Localhost test account is an admin only on this machine. */
export async function isLocalAdminEmail(email: string) {
  const host = await requestHost();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  return local && email.trim().toLowerCase() === LOCAL_DEV_ACCOUNT.email;
}

export function isSiteOwnerEmail(email: string) {
  const owner = siteOwnerEmail();
  return !!owner && owner === email.trim().toLowerCase();
}

export async function markAdmin(db: D1Database, userId: string) {
  await db.prepare('UPDATE users SET admin=1 WHERE id=?').bind(userId).run();
}

export async function requireAdmin() {
  const session = await getSessionUser();
  if (!session) {
    return {
      ok: false as const,
      response: Response.json(
        { error: 'Sign in with an admin account.' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    };
  }

  const db = runtime().DB;
  const row = await db
    .prepare('SELECT id, email, admin FROM users WHERE id=? OR email=? LIMIT 1')
    .bind(userKey(session.email), session.email)
    .first<{ id: string; email: string; admin: number }>();

  if (!row) {
    return {
      ok: false as const,
      response: Response.json(
        { error: 'Sign in with an admin account.', signedInAs: session.email },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    };
  }

  const allowed = row.admin === 1 || isSiteOwnerEmail(row.email) || (await isLocalAdminEmail(row.email));
  if (!allowed) {
    return {
      ok: false as const,
      response: Response.json(
        { error: 'This account can’t open the admin page.', signedInAs: session.email },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    };
  }

  if (row.admin !== 1) await markAdmin(db, row.id);
  return { ok: true as const, db, adminId: row.id, email: row.email };
}

const ACCOUNT_SELECT = `
  SELECT
    u.id, u.auth_id, u.name, u.first_name, u.last_name, u.username, u.email, u.admin,
    u.projects_created AS projects_created,
    (SELECT count(*) FROM account_activity a WHERE a.user_id = u.id) AS days_used,
    (SELECT max(a.last_seen) FROM account_activity a WHERE a.user_id = u.id) AS last_seen,
    (SELECT coalesce(sum(a.actions), 0) FROM account_activity a WHERE a.user_id = u.id) AS actions,
    (
      SELECT count(DISTINCT p.id) FROM projects p
      LEFT JOIN group_members g ON g.group_id = p.group_id AND g.user_id = u.id
      WHERE p.owner = u.id OR p.owner = coalesce(u.auth_id, '') OR g.user_id IS NOT NULL
    ) AS projects
  FROM users u
`;

export async function adminOverview(db: D1Database, viewerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [site, accountsRow, active, created, people] = await db.batch([
    db.prepare("SELECT projects_created FROM site_stats WHERE id='site'").bind(),
    db.prepare('SELECT count(*) AS n FROM users').bind(),
    db.prepare('SELECT count(DISTINCT user_id) AS n FROM account_activity WHERE day=?').bind(today),
    db
      .prepare(
        'SELECT coalesce(sum(tasks_created), 0) AS tasks, coalesce(sum(milestones_created), 0) AS milestones FROM projects',
      )
      .bind(),
    db.prepare(`${ACCOUNT_SELECT} ORDER BY last_seen DESC, u.name COLLATE NOCASE`).bind(),
  ]);

  const siteRow = site.results?.[0] as { projects_created?: number } | undefined;
  const stats: AdminStats = {
    projectsCreated: siteRow?.projects_created ?? 0,
    accounts: (accountsRow.results?.[0] as { n: number } | undefined)?.n ?? 0,
    activeToday: (active.results?.[0] as { n: number } | undefined)?.n ?? 0,
    tasksCreated: (created.results?.[0] as { tasks: number } | undefined)?.tasks ?? 0,
    milestonesCreated: (created.results?.[0] as { milestones: number } | undefined)?.milestones ?? 0,
  };

  const accounts = (
    (people.results || []) as (UserRow & {
      days_used: number;
      last_seen: string | null;
      actions: number;
      projects_created: number;
      projects: number;
    })[]
  ).map(mapAccount);

  return { viewerId, stats, accounts };
}

export async function adminAccountDetail(db: D1Database, userId: string) {
  const account = await db
    .prepare(`${ACCOUNT_SELECT} WHERE u.id=? LIMIT 1`)
    .bind(userId)
    .first<
      UserRow & {
        days_used: number;
        last_seen: string | null;
        actions: number;
        projects_created: number;
        projects: number;
      }
    >();
  if (!account) return null;

  const activity = await db
    .prepare(
      'SELECT day, actions, last_seen FROM account_activity WHERE user_id=? ORDER BY day DESC',
    )
    .bind(userId)
    .all<{ day: string; actions: number; last_seen: string }>();

  const projects = await db
    .prepare(
      `SELECT DISTINCT p.id, p.title, p.tasks_created, p.milestones_created,
              CASE WHEN p.owner = ? OR p.owner = ? THEN 'Owner' ELSE 'Member' END AS role
       FROM projects p
       LEFT JOIN group_members g ON g.group_id = p.group_id AND g.user_id = ?
       WHERE p.owner = ? OR p.owner = ? OR g.user_id = ?
       ORDER BY p.title COLLATE NOCASE`,
    )
    .bind(
      account.id,
      account.auth_id || '',
      userId,
      account.id,
      account.auth_id || '',
      userId,
    )
    .all<{
      id: string;
      title: string;
      tasks_created: number;
      milestones_created: number;
      role: string;
    }>();

  return {
    account: mapAccount(account),
    activity: (activity.results || []).map((row) => ({
      day: row.day,
      actions: row.actions,
      lastSeen: row.last_seen,
    })),
    projects: (projects.results || []).map((row) => ({
      id: row.id,
      title: row.title.trim() || 'Untitled project',
      role: row.role === 'Owner' ? 'Owner' : 'Member',
      tasksCreated: row.tasks_created,
      milestonesCreated: row.milestones_created,
    })),
  };
}

export async function createAdminAccount(
  db: D1Database,
  input: {
    authId: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    username: string;
    passwordHash: string;
    admin: boolean;
  },
) {
  const created = await createPasswordUser(db, input);
  if (input.admin) await markAdmin(db, created.userId);
  return created;
}

export async function updateAdminAccount(
  db: D1Database,
  actorId: string,
  userId: string,
  input: {
    firstName: unknown;
    lastName: unknown;
    username: unknown;
    password?: unknown;
    admin: boolean;
  },
) {
  const existing = await db
    .prepare('SELECT id, email, admin FROM users WHERE id=?')
    .bind(userId)
    .first<{ id: string; email: string; admin: number }>();
  if (!existing) return { ok: false as const, status: 404, error: 'Account not found.' };

  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  if (!firstName) return { ok: false as const, status: 400, error: 'Enter a first name.' };
  if (!lastName) return { ok: false as const, status: 400, error: 'Enter a last name.' };
  const name = displayNameFromParts(firstName, lastName);
  if (name.length > 80) return { ok: false as const, status: 400, error: 'Name is too long.' };

  const usernameResult = validateUsername(input.username);
  if (!usernameResult.ok) return { ok: false as const, status: 400, error: usernameResult.error };

  const taken = await db
    .prepare('SELECT 1 AS ok FROM users WHERE username=? AND id<>? LIMIT 1')
    .bind(usernameResult.username, userId)
    .first();
  if (taken) return { ok: false as const, status: 409, error: 'That username is taken.' };

  let passwordHash: string | null = null;
  if (typeof input.password === 'string' && input.password.length > 0) {
    const passwordResult = validatePassword(input.password);
    if (!passwordResult.ok) return { ok: false as const, status: 400, error: passwordResult.error };
    passwordHash = await hashPassword(passwordResult.password);
  }

  const owner = isSiteOwnerEmail(existing.email);
  if (!input.admin && (userId === actorId || owner)) {
    return {
      ok: false as const,
      status: 400,
      error: owner
        ? 'The site owner stays an admin.'
        : 'You can’t remove your own admin access.',
    };
  }

  if (passwordHash) {
    await db
      .prepare(
        'UPDATE users SET name=?, first_name=?, last_name=?, username=?, admin=?, password_hash=? WHERE id=?',
      )
      .bind(name, firstName, lastName, usernameResult.username, input.admin ? 1 : 0, passwordHash, userId)
      .run();
  } else {
    await db
      .prepare('UPDATE users SET name=?, first_name=?, last_name=?, username=?, admin=? WHERE id=?')
      .bind(name, firstName, lastName, usernameResult.username, input.admin ? 1 : 0, userId)
      .run();
  }

  return { ok: true as const };
}

export async function deleteAdminAccount(db: D1Database, actorId: string, userId: string) {
  if (actorId === userId) {
    return { ok: false as const, status: 400, error: 'You can’t delete the account you’re signed in with.' };
  }

  const user = await db
    .prepare('SELECT id, auth_id, email FROM users WHERE id=?')
    .bind(userId)
    .first<{ id: string; auth_id: string | null; email: string }>();
  if (!user) return { ok: false as const, status: 404, error: 'Account not found.' };
  if (isSiteOwnerEmail(user.email)) {
    return { ok: false as const, status: 400, error: 'The site owner account can’t be deleted.' };
  }

  const owned = await db
    .prepare('SELECT count(*) AS n FROM projects WHERE owner=? OR owner=?')
    .bind(user.id, user.auth_id || '')
    .first<{ n: number }>();
  if ((owned?.n || 0) > 0) {
    const count = owned?.n || 0;
    return {
      ok: false as const,
      status: 400,
      error: `This account still owns ${count} project${count === 1 ? '' : 's'}. Delete those projects before deleting the account.`,
    };
  }

  const id = user.id;
  const authId = user.auth_id || '';
  const fileOwner = await db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('files') WHERE name='uploaded_by'")
    .first<{ ok: number }>();
  const statements = [
    db.prepare('UPDATE tasks SET assigned_user_id=NULL WHERE assigned_user_id=?').bind(id),
  ];
  if (fileOwner) {
    statements.push(db.prepare('UPDATE files SET uploaded_by=NULL WHERE uploaded_by=?').bind(id));
  }
  statements.push(
    db
      .prepare(
        'DELETE FROM ai_messaging WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=?)',
      )
      .bind(id),
    db.prepare('DELETE FROM conversations WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM chats WHERE user_id=? OR user_id=?').bind(id, authId),
    db.prepare('DELETE FROM availability WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM group_members WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM account_activity WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM settings WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM project_member_invites WHERE inviter_id=? OR invitee_id=?').bind(id, id),
    db.prepare('DELETE FROM project_invites WHERE created_by=?').bind(id),
    db.prepare('DELETE FROM file_cleanup WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM notifications WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM memberships WHERE email=?').bind(user.email),
    db.prepare('DELETE FROM profiles WHERE id=? OR email=?').bind(authId, user.email),
    db.prepare('DELETE FROM users WHERE id=?').bind(id),
  );
  await db.batch(statements);

  return { ok: true as const };
}
