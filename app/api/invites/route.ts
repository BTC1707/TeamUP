import { identity, runtime, sameOrigin, failure, projectFor } from '@/lib/server';
import {
  createInvite,
  previewInvite,
  acceptInvite,
  revokeInvite,
  sendInviteEmail,
  searchInvitees,
  inviteMember,
  respondToMemberInvite,
  listPendingMemberInvites,
} from '@/lib/invites';
import { EmailError, emailConfigured } from '@/lib/email';

export async function GET(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const pending = new URL(req.url).searchParams.get('pending') === '1';
    if (pending) {
      return Response.json(
        { invites: await listPendingMemberInvites(runtime().DB, u.userId) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json({ emailReady: emailConfigured() });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const db = runtime().DB;
    const raw = await req.text();
    if (raw.length > 2048) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    const b = JSON.parse(raw);
    let result: unknown;
    switch (b.action) {
      case 'create':
        result = await createInvite(db, String(b.project || ''), u);
        break;
      case 'search':
        result = await searchInvitees(db, String(b.project || ''), u, String(b.query || ''));
        break;
      case 'invite':
        result = await inviteMember(db, String(b.project || ''), u, String(b.userId || ''));
        break;
      case 'respond':
        result = await respondToMemberInvite(
          db,
          u,
          String(b.inviteId || ''),
          b.decision === 'reject' ? 'reject' : 'accept',
        );
        break;
      case 'send': {
        const origin = new URL(req.url).origin;
        result = await sendInviteEmail(
          db,
          String(b.project || ''),
          u,
          String(b.email || ''),
          origin,
        );
        break;
      }
      case 'revoke':
        await revokeInvite(db, String(b.project || ''), u);
        result = { ok: true };
        break;
      case 'preview': {
        const p = await previewInvite(db, String(b.token || ''), u);
        result = { projectId: p.projectId, name: p.name, alreadyMember: p.alreadyMember };
        break;
      }
      case 'accept':
        result = await acceptInvite(db, String(b.token || ''), u);
        break;
      case 'status': {
        const p = await projectFor(String(b.project || ''), u);
        if (p.owner !== u.userId) throw new Error('NOT_FOUND');
        const row = await db
          .prepare('SELECT expires_at FROM project_invites WHERE project_id=? AND expires_at>?')
          .bind(p.id, Date.now())
          .first<{ expires_at: number }>();
        result = { expiresAt: row?.expires_at || null, emailReady: emailConfigured() };
        break;
      }
      default:
        return Response.json({ error: 'Invalid action.' }, { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof EmailError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === 'EMAIL_NOT_CONFIGURED')
      return Response.json(
        { error: 'Email delivery is not configured yet. Copy the invite link instead.' },
        { status: 503 },
      );
    if (e instanceof Error && e.message === 'EMAIL_INVALID')
      return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
    if (e instanceof Error && e.message === 'EMAIL_SELF')
      return Response.json({ error: 'Send the invite to a teammate’s email, not your own.' }, { status: 400 });
    if (e instanceof Error && e.message === 'INVITE_USER')
      return Response.json({ error: 'Choose a TeamUP account to invite.' }, { status: 400 });
    if (e instanceof Error && e.message === 'INVITE_MEMBER')
      return Response.json({ error: 'That person is already on this project.' }, { status: 409 });
    if (e instanceof Error && e.message === 'INVITE_PENDING')
      return Response.json({ error: 'They already have a pending invite.' }, { status: 409 });
    if (e instanceof Error && /no such table: project_member_invites/i.test(e.message))
      return Response.json(
        { error: 'Invites need a database update before they can be sent. Apply the latest migration, then try again.' },
        { status: 503 },
      );
    if (e instanceof Error && e.message.startsWith('INVITE_'))
      return Response.json(
        {
          error:
            e.message === 'INVITE_INVALID'
              ? 'This invitation has expired or been revoked. Ask the project owner for a new link.'
              : 'This invitation is no longer available, or the team has reached its 30-member limit.',
        },
        { status: 410 },
      );
    return failure(e);
  }
}
