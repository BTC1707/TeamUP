'use client';

/**
 * Sign in — email or username + password.
 *
 * TODO(teammate): polish visual design / copy.
 * Safe to edit: headings, labels, placeholders, classNames, surrounding markup.
 * Prefer keeping handleSubmit + signInAccount as-is so auth keeps working.
 *
 * On localhost, a hardcoded test account works (admin / teamup) — local DB only.
 *
 * Forgot-password link is gated by SHOW_FORGOT_PASSWORD in lib/auth-features.ts.
 */

import { FormEvent, useEffect, useState } from 'react';
import { SHOW_FORGOT_PASSWORD } from '../../lib/auth-features';
import {
  DEFAULT_AFTER_AUTH_PATH,
  readReturnToParam,
  signInAccount,
} from '../../lib/auth-client';

export default function SignInPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLocalHint, setShowLocalHint] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setShowLocalHint(host === 'localhost' || host === '127.0.0.1');
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { returnTo } = await signInAccount({
        login,
        password,
        remember,
        returnTo: readReturnToParam(),
      });
      try {
        window.sessionStorage.removeItem('teamup.workspace.view');
        window.sessionStorage.removeItem('teamup.demo.sessionActive');
      } catch {
        // Keep sign-in working if browser storage is unavailable.
      }
      window.location.assign(returnTo || DEFAULT_AFTER_AUTH_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
      setBusy(false);
    }
  }

  return (
    <main className='auth-page'>
      <div className='auth-card'>
        {/* TODO(teammate): restyle this card as you like */}
        <a className='auth-brand' href='/'>
          teamup<span>.</span>
        </a>

        <h1>Welcome back</h1>
        <p className='auth-lede'>Sign in with your email or username and password.</p>

        {showLocalHint ? (
          <p className='auth-local-hint'>
            Local test login: <code>admin</code> / <code>teamup</code>
            <br />
            <span>Uses this machine only — not the live Cloudflare database.</span>
          </p>
        ) : null}

        <form className='auth-form' onSubmit={handleSubmit}>
          <label>
            Email or username
            <input
              type='text'
              name='login'
              autoComplete='username'
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder='you@school.edu or alexkim'
            />
          </label>

          <label>
            Password
            <input
              type='password'
              name='password'
              autoComplete='current-password'
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='Your password'
            />
          </label>

          <div className='auth-form-meta'>
            <label className='auth-check'>
              <input
                type='checkbox'
                name='remember'
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            {SHOW_FORGOT_PASSWORD ? (
              <a className='auth-forgot' href='/forgot-password'>
                Forgot your password?
              </a>
            ) : null}
          </div>

          {error ? (
            <p className='auth-error' role='alert'>
              {error}
            </p>
          ) : null}

          <button className='btn primary' type='submit' disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className='auth-switch'>
          New here? <a href='/signup'>Create an account</a>
        </p>
      </div>
    </main>
  );
}
