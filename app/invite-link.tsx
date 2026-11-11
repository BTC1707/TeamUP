'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Person = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
};

export default function InviteLink({ project }: { project: string }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState('');
  const [url, setUrl] = useState('');
  const [expires, setExpires] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState('');

  async function request(action: string, extra: Record<string, string> = {}) {
    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, project, ...extra }),
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update invites.');
    return data;
  }

  useEffect(() => {
    let active = true;
    request('status')
      .then((data) => {
        if (active) setExpires(data.expiresAt);
      })
      .catch(() => {
        // A missing link is fine; creating one still works.
      });
    return () => {
      active = false;
    };
  }, [project]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      request('search', { query: trimmed })
        .then((data) => {
          if (active) setPeople(Array.isArray(data.people) ? data.people : []);
        })
        .catch((searchError) => {
          if (active) setError((searchError as Error).message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [project, query]);

  async function invite(person: Person) {
    setInvitingId(person.id);
    setError('');
    try {
      await request('invite', { userId: person.id });
      setPeople((current) => current.filter((entry) => entry.id !== person.id));
      setQuery('');
      toast.success(`Invite sent to ${person.name}.`);
    } catch (inviteError) {
      const message = (inviteError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setInvitingId('');
    }
  }

  async function create() {
    setLinkBusy(true);
    setError('');
    try {
      const data = await request('create');
      setUrl(`${window.location.origin}/join#${data.token}`);
      setExpires(data.expiresAt);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <section className='panel invite-panel'>
      <div>
        <h2>Invite teammates</h2>
        <p className='subtext'>
          Search by email or username. They get a notification and can accept or decline.
        </p>
      </div>
      {error ? <p className='error'>{error}</p> : null}
      <label>
        Find a teammate
        <input
          id='invite-search'
          value={query}
          maxLength={80}
          placeholder='Email or username'
          autoComplete='off'
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {query.trim().length >= 2 ? (
        <div className='invite-results'>
          {searching ? <p className='form-note'>Searching…</p> : null}
          {!searching && people.length === 0 ? (
            <p className='form-note'>No TeamUP account matches that email or username.</p>
          ) : null}
          {people.map((person) => (
            <div className='invite-result' key={person.id}>
              <div>
                <strong>{person.name}</strong>
                <small className='block'>
                  {person.username ? `@${person.username} · ` : ''}
                  {person.email}
                </small>
              </div>
              <button
                type='button'
                className='btn primary'
                disabled={invitingId === person.id}
                onClick={() => void invite(person)}
              >
                {invitingId === person.id ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className='form-note'>Type at least 2 characters.</p>
      )}

      <div className='invite-link-fallback'>
        <p className='form-note'>Or share a link. Anyone with the link can sign in and join.</p>
        {url ? (
          <label className='invite-url'>
            Invitation link
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
          </label>
        ) : null}
        <div className='flex flex-wrap gap-3'>
          {url ? (
            <button
              className='btn primary'
              type='button'
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
          ) : null}
          <button className='btn' type='button' disabled={linkBusy} onClick={() => void create()}>
            {linkBusy ? 'Creating…' : expires ? 'Replace invite link' : 'Create invite link'}
          </button>
          {expires ? (
            <button
              className='btn subtle'
              type='button'
              disabled={linkBusy}
              onClick={async () => {
                setLinkBusy(true);
                try {
                  await request('revoke');
                  setUrl('');
                  setExpires(null);
                  setError('');
                  toast.success('Invitation link revoked.');
                } catch (revokeError) {
                  setError((revokeError as Error).message);
                } finally {
                  setLinkBusy(false);
                }
              }}
            >
              Revoke link
            </button>
          ) : null}
        </div>
        {expires ? (
          <small>
            Expires {new Date(expires).toLocaleString()}. Replacing the link disables the previous
            one. Revoking a link does not remove teammates who already joined.
          </small>
        ) : null}
      </div>
    </section>
  );
}
