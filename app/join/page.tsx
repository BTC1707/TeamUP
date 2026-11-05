'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
export default function Join() {
  const [token, setToken] = useState('');
  const [project, setProject] = useState<{
    name: string;
    projectId: string;
    alreadyMember: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signIn, setSignIn] = useState(false);
  async function request(action: string, t: string) {
    const r = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: t }),
    });
    const d: any = await r.json();
    if (r.status === 401) {
      setSignIn(true);
      return null;
    }
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  useEffect(() => {
    const t = window.location.hash.slice(1);
    setToken(t);
    if (!t) {
      setError('Open the complete invitation link shared by your teammate.');
      setLoading(false);
      return;
    }
    request('preview', t)
      .then(setProject)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className='join-page'>
      <section className='welcome-panel'>
        <span className='eyebrow'>TEAMUP INVITATION</span>
        <h1>
          {loading
            ? 'Checking your invitation…'
            : project
              ? `Join ${project.name}`
              : 'You’re invited to a project'}
        </h1>
        {error ? (
          <p role='alert'>{error}</p>
        ) : signIn ? (
          <>
            <p>Sign in to review the invitation and join your team.</p>
            <a
              className='btn primary'
              href={'/signin?return_to=' + encodeURIComponent('/join#' + token)}
            >
              Sign in
            </a>
          </>
        ) : project ? (
          <>
            <p>
              {project.alreadyMember
                ? 'You’re already a member of this project.'
                : 'Joining gives you access to this project’s tasks, files, and team workspace.'}
            </p>
            <button
              className='btn primary'
              disabled={busy}
              onClick={async () => {
                if (project.alreadyMember) {
                  window.location.assign(
                    '/workspace/overview?project=' + encodeURIComponent(project.projectId),
                  );
                  return;
                }
                setBusy(true);
                try {
                  const d = await request('accept', token);
                  if (d)
                    window.location.assign(
                      '/workspace/overview?project=' + encodeURIComponent(d.projectId),
                    );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Joining…' : project.alreadyMember ? 'Open project' : 'Accept invitation'}
            </button>
          </>
        ) : null}
        <Link className='btn subtle' href='/workspace/overview'>
          Back to workspace
        </Link>
      </section>
    </main>
  );
}
