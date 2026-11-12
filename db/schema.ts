import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    authId: text('auth_id'),
    /** Full display name — kept in sync as "first last" for existing UI. */
    name: text('name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    /** Login handle — unique, separate from display name. */
    username: text('username'),
    email: text('email').notNull(),
    /** PBKDF2 hash blob from lib/password.ts; null for legacy passwordless rows. */
    passwordHash: text('password_hash'),
    address: text('address'),
    phone: text('phone'),
    /** R2 object key for profile photo; null when using initials. */
    avatarKey: text('avatar_key'),
    /** 1 when this account can open the admin page. */
    admin: integer('admin').notNull().default(0),
  },
  (t) => [
    uniqueIndex('users_email').on(t.email),
    uniqueIndex('users_auth').on(t.authId),
    uniqueIndex('users_username').on(t.username),
  ],
);
/** Single row `site`. `projects_created` is every project ever created on TeamUP. */
export const siteStats = sqliteTable('site_stats', {
  id: text('id').primaryKey(),
  projectsCreated: integer('projects_created').notNull().default(0),
});
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});
export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull().default('member'),
    /** Unique calendar color for this person on the project. */
    color: text('color'),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user').on(t.userId)],
);
/**
 * One row per account per UTC day they used TeamUP.
 * `actions` counts separate stretches of use, not background refreshes.
 */
export const accountActivity = sqliteTable(
  'account_activity',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    day: text('day').notNull(),
    actions: integer('actions').notNull().default(0),
    lastSeen: text('last_seen').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index('account_activity_day').on(t.day)],
);
export const settings = sqliteTable('settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  tutorialSeen: integer('tutorial_seen').notNull().default(0),
  language: text('language').notNull().default('en'),
  timeZone: text('time_zone').notNull().default('UTC'),
  notifications: integer('notifications', { mode: 'boolean' }).notNull().default(true),
});
// data is retained as a read-only legacy migration backup, never used for normalized saves.
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(0),
  groupId: text('group_id').references(() => groups.id),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  course: text('course').notNull().default(''),
  deadline: text('deadline').notNull().default(''),
  reminderHours: integer('reminder_hours').notNull().default(24),
  normalized: integer('normalized').notNull().default(0),
  writeToken: text('write_token'),
  /** R2 object key for project cover photo. */
  photoKey: text('photo_key'),
  /** Tasks ever added to this project. Deletes do not reduce it. */
  tasksCreated: integer('tasks_created').notNull().default(0),
  /** Milestones ever added to this project. Deletes do not reduce it. */
  milestonesCreated: integer('milestones_created').notNull().default(0),
});
export const milestones = sqliteTable(
  'milestones',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('todo'),
    /** R2 object key for milestone photo. */
    photoKey: text('photo_key'),
  },
  (t) => [uniqueIndex('milestone_project_id').on(t.projectId, t.id)],
);
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    assignedUserId: text('assigned_user_id').references(() => users.id),
    milestoneId: text('milestone_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('todo'),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.milestoneId],
      foreignColumns: [milestones.projectId, milestones.id],
    }),
    index('task_project').on(t.projectId),
    index('task_assignee').on(t.assignedUserId),
  ],
);
export const availability = sqliteTable(
  'availability',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    startAt: text('start_at').notNull(),
    endAt: text('end_at').notNull(),
  },
  (t) => [uniqueIndex('availability_slot').on(t.projectId, t.userId, t.startAt)],
);
export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    type: text('type').notNull(),
    created: text('created').notNull(),
    uploadedBy: text('uploaded_by').references(() => users.id),
    storageKey: text('storage_key'),
  },
  (t) => [index('file_project').on(t.projectId)],
);
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    lockId: text('lock_id'),
    lockedUntil: integer('locked_until').notNull().default(0),
    legacyImported: integer('legacy_imported').notNull().default(0),
  },
  (t) => [uniqueIndex('conversation_project_user').on(t.projectId, t.userId)],
);
export const messages = sqliteTable(
  'ai_messaging',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role').notNull(),
    contents: text('contents').notNull(),
    createdAt: text('created_at').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [index('message_conversation_position').on(t.conversationId, t.position)],
);
// Legacy tables retained for safe, idempotent backfill of existing production records.
export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    email: text('email').notNull(),
  },
  (t) => [index('membership_email').on(t.email), index('membership_project').on(t.projectId)],
);
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  userId: text('user_id').notNull(),
  messages: text('messages').notNull().default('[]'),
  lockId: text('lock_id'),
  lockedUntil: integer('locked_until').notNull().default(0),
});
export const aiConfig = sqliteTable('ai_config', {
  id: text('id').primaryKey(),
  sealedKey: text('sealed_key').notNull(),
  updated: text('updated').notNull(),
});
export const projectMemberInvites = sqliteTable(
  'project_member_invites',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id),
    inviteeId: text('invitee_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('member_invite_project_user').on(t.projectId, t.inviteeId)],
);
export const projectInvites = sqliteTable(
  'project_invites',
  {
    projectId: text('project_id')
      .primaryKey()
      .references(() => projects.id),
    tokenHash: text('token_hash').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [uniqueIndex('invite_token_hash').on(t.tokenHash)],
);
export const fileCleanup = sqliteTable('file_cleanup', {
  storageKey: text('storage_key').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
});
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    projectId: text('project_id'),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    meta: text('meta').notNull().default('{}'),
  },
  (t) => [index('notification_user_created').on(t.userId, t.createdAt)],
);
export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: text('used_at'),
  },
  (t) => [
    uniqueIndex('password_reset_token_hash').on(t.tokenHash),
    index('password_reset_user').on(t.userId),
  ],
);
