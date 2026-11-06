import { normalizeEmail } from '@/lib/auth';
import { emailConfigured, passwordResetEmailContent, sendEmail } from '@/lib/email';
import { hashPassword } from '@/lib/password';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Start a password reset for an email address.
 * Returns a generic outcome so callers never reveal whether the account exists.
 */
export async function requestPasswordReset(db: D1Database, rawEmail: string, origin: string) {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('EMAIL_INVALID');
  }
  if (!emailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');

  const user = await db
    .prepare('SELECT id, email, name, password_hash FROM users WHERE email=? LIMIT 1')
    .bind(email)
    .first<{ id: string; email: string; name: string; password_hash: string | null }>();

  // Same outer success path whether or not the account exists / has a password.
  if (!user?.password_hash) return { sent: true as const };

  const token = newToken();
  const expiresAt = Date.now() + RESET_TTL_MS;
  const id = crypto.randomUUID();

  await db.batch([
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(user.id),
    db
      .prepare(
        'INSERT INTO password_reset_tokens(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)',
      )
      .bind(id, user.id, await hashToken(token), new Date().toISOString(), expiresAt),
  ]);

  const resetUrl = `${origin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const content = passwordResetEmailContent({
    name: user.name,
    resetUrl,
    expiresAt,
  });
  await sendEmail({ to: user.email, ...content });
  return { sent: true as const };
}

/** Consume a reset token and set a new password. */
export async function completePasswordReset(
  db: D1Database,
  rawToken: string,
  password: string,
) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('TOKEN_INVALID');

  const row = await db
    .prepare(
      `SELECT t.id, t.user_id, t.expires_at, t.used_at
       FROM password_reset_tokens t
       WHERE t.token_hash=?
       LIMIT 1`,
    )
    .bind(await hashToken(token))
    .first<{ id: string; user_id: string; expires_at: number; used_at: string | null }>();

  if (!row || row.used_at || row.expires_at < Date.now()) {
    throw new Error('TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(password);
  const usedAt = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        'UPDATE password_reset_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?',
      )
      .bind(usedAt, row.id, Date.now()),
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(passwordHash, row.user_id),
    db
      .prepare('DELETE FROM password_reset_tokens WHERE user_id=? AND id!=?')
      .bind(row.user_id, row.id),
  ]);

  if (!results[0]?.meta?.changes) throw new Error('TOKEN_INVALID');
  return { ok: true as const };
}
