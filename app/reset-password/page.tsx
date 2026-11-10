'use client';

/**
 * Reset password — set a new password from an emailed one-time link.
 */

import { FormEvent, useEffect, useState } from 'react';
import AuthPasswordField from '../auth-password-field';
import { resetAccountPassword } from '../../lib/auth-client';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('This reset link is missing a token. Request a new one from Sign in.');
      return;
    }

    setBusy(true);
    try {
      await resetAccountPassword({ token, password, confirmPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset your password.');
      setBusy(false);
    }
  }

  return (
    <main className='auth-page'>
      <div className='auth-card'>
        <a className='auth-brand' href='/'>
          teamup<span>.</span>
        </a>

        <h1>Choose a new password</h1>
        <p className='auth-lede'>Pick a password you’ll use to sign in to TeamUP.</p>

        {done ? (
          <>
            <p className='auth-success' role='status'>
              Your password was updated. You can sign in with it now.
            </p>
            <p className='auth-switch'>
              <a href='/signin'>Sign in</a>
            </p>
          </>
        ) : (
          <>
            <form className='auth-form' onSubmit={handleSubmit}>
              <AuthPasswordField
                label='New password'
                name='password'
                autoComplete='new-password'
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='At least 8 characters'
              />

              <AuthPasswordField
                label='Confirm password'
                name='confirmPassword'
                autoComplete='new-password'
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder='Repeat your password'
              />

              {error ? (
                <p className='auth-error' role='alert'>
                  {error}
                </p>
              ) : null}

              <button className='btn primary' type='submit' disabled={busy || !token}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </form>

            <p className='auth-switch'>
              <a href='/forgot-password'>Request a new reset link</a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
