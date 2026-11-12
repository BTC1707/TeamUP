/** Lifetime creation counts and daily product use. Deletes do not reduce the counts. */

/** Another stretch of use counts only after this much quiet time. */
const ACTIVITY_GAP_MS = 30 * 60 * 1000;

export function countNewRecords(next: { id: string }[], previous: { id: string }[] = []) {
  const known = new Set(previous.map((item) => item.id));
  let created = 0;
  for (const item of next) {
    if (!known.has(item.id)) created += 1;
  }
  return created;
}

export function creationStatements(
  db: D1Database,
  projectId: string,
  token: string,
  tasksCreated: number,
  milestonesCreated: number,
) {
  if (tasksCreated <= 0 && milestonesCreated <= 0) return [];
  return [
    db
      .prepare(
        `UPDATE projects
         SET tasks_created = tasks_created + ?, milestones_created = milestones_created + ?
         WHERE id = ? AND write_token = ?`,
      )
      .bind(tasksCreated, milestonesCreated, projectId, token),
  ];
}

/** Add one to the sitewide count and to the creator's own count after that project row exists. */
export function projectCreatedStatements(db: D1Database, ownerId: string, projectId: string, token: string) {
  const created = `EXISTS (SELECT 1 FROM projects WHERE id = ? AND write_token = ?)`;
  return [
    db
      .prepare(
        `UPDATE site_stats SET projects_created = projects_created + 1
         WHERE id = 'site' AND ${created}`,
      )
      .bind(projectId, token),
    db
      .prepare(
        `UPDATE users SET projects_created = projects_created + 1
         WHERE id = ? AND ${created}`,
      )
      .bind(ownerId, projectId, token),
  ];
}

/**
 * Remember that this account used TeamUP today.
 * A row means they were active that UTC day, including a remembered session.
 * `actions` goes up when the next use is at least 30 minutes after the last one.
 */
export async function recordActivity(db: D1Database, userId: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const seen = now.toISOString();
  const gapStart = new Date(now.getTime() - ACTIVITY_GAP_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO account_activity(user_id, day, actions, last_seen) VALUES(?, ?, 1, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         actions = CASE WHEN account_activity.last_seen <= ? THEN account_activity.actions + 1 ELSE account_activity.actions END,
         last_seen = CASE WHEN account_activity.last_seen <= ? THEN ? ELSE account_activity.last_seen END`,
    )
    .bind(userId, day, seen, gapStart, gapStart, seen)
    .run();
}
