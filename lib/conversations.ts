import type { Actor } from './store';
export type Message = { id: string; role: 'user' | 'assistant'; content: string; created: string };
export async function conversation(db: D1Database, project: string, u: Actor) {
  const id = project + ':' + u.userId;
  await db
    .prepare(
      'INSERT OR IGNORE INTO conversations(id,project_id,user_id,created_at) VALUES(?,?,?,?)',
    )
    .bind(id, project, u.userId, new Date().toISOString())
    .run();
  const row = await db
    .prepare('SELECT legacy_imported FROM conversations WHERE id=?')
    .bind(id)
    .first<any>();
  if (!row.legacy_imported) {
    const legacy = await db
      .prepare('SELECT messages FROM chats WHERE project_id=? AND user_id=?')
      .bind(project, u.authUserId)
      .first<{ messages: string }>();
    const messages: Message[] = legacy ? JSON.parse(legacy.messages) : [];
    await db.batch([
      ...messages.map((m, i) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO ai_messaging(id,conversation_id,role,contents,created_at,position) VALUES(?,?,?,?,?,?)',
          )
          .bind(id + ':' + m.id, id, m.role, m.content, m.created, i),
      ),
      db.prepare('UPDATE conversations SET legacy_imported=1 WHERE id=?').bind(id),
    ]);
  }
  return id;
}
export async function readMessages(db: D1Database, id: string): Promise<Message[]> {
  const r = await db
    .prepare(
      'SELECT id,role,contents,created_at FROM ai_messaging WHERE conversation_id=? ORDER BY position,id',
    )
    .bind(id)
    .all<any>();
  return r.results.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.contents,
    created: m.created_at,
  }));
}

/** Delete all messages in a conversation and release any answer lock. */
export async function clearMessages(db: D1Database, id: string) {
  await db.batch([
    db.prepare('DELETE FROM ai_messaging WHERE conversation_id=?').bind(id),
    db
      .prepare('UPDATE conversations SET lock_id=NULL,locked_until=0 WHERE id=?')
      .bind(id),
  ]);
}
