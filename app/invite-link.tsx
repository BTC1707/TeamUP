'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function InviteLink({
  project,
  emailReady: emailReadyProp,
}: {
  project: string;
  emailReady?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [expires, setExpires] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [emailReady, setEmailReady] = useState(!!emailReadyProp);

  async function request(action: string, extra: Record<string, string> = {}) {
    const r = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, project, ...extra }),
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }

  useEffect(() => {
    let active = true;
    request('status')
      .then((d) => {
        if (!active) return;
        setExpires(d.expiresAt);
        if (typeof d.emailReady === 'boolean') setEmailReady(d.emailReady);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project]);

  useEffect(() => {
    if (typeof emailReadyProp === 'boolean') setEmailReady(emailReadyProp);
  }, [emailReadyProp]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const d = await request('create');
      setUrl(window.location.origin + '/join#' + d.token);
      setExpires(d.expiresAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailInvite() {
    setBusy(true);
    setError('');
    try {
      const d = await request('send', { email: email.trim() });
      setUrl(window.location.origin + '/join#' + d.token);
      setExpires(d.expiresAt);
      setEmail('');
      toast.success('Invitation email sent.');
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='panel invite-panel'>
      <div>
        <h2>Invite teammates</h2>
        <p className='subtext'>
          Anyone with this link can sign in and join this project. Share it only with your
          teammates.
        </p>
      </div>
      {error && <p className='error'>{error}</p>}
      {!emailReady && (
        <div className='notice'>
          Email delivery isn’t connected yet. You can still copy an invite link. Ask the site owner
          to add Resend (<code>RESEND_API_KEY</code> + <code>EMAIL_FROM</code>).
        </div>
      )}
      {emailReady && (
        <label>
          Email an invitation
          <div className='invite-email-row'>
            <input
              type='email'
              value={email}
              maxLength={254}
              placeholder='teammate@school.edu'
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className='btn primary'
              type='button'
              disabled={busy || !email.trim()}
              onClick={() => void sendEmailInvite()}
            >
              {busy ? 'Sending…' : 'Send invite email'}
            </button>
          </div>
        </label>
      )}
      {url && (
        <label className='invite-url'>
          Invitation link
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <div className='flex flex-wrap gap-3'>
        {url && (
          <button
            className='btn primary'
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success('Invitation link copied.');
              } catch {
                setError('Select the link above and copy it manually.');
              }
            }}
          >
            Copy invite link
          </button>
        )}
        <button className='btn' disabled={busy} onClick={create}>
          {busy ? 'Updating…' : expires ? 'Replace invite link' : 'Create invite link'}
        </button>
        {expires && (
          <button
            className='btn subtle'
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request('revoke');
                setUrl('');
                setExpires(null);
                setError('');
                toast.success('Invitation link revoked.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Revoke link
          </button>
        )}
      </div>
      {expires && (
        <small>
          Expires {new Date(expires).toLocaleString()}. Replacing or emailing a new invite disables
          the previous link. Revoking a link does not remove teammates who already joined.
        </small>
      )}
    </section>
  );
}
