'use client';

/**
 * Forgot password — request a reset email.
 *
 * The sign-in link is hidden until SHOW_FORGOT_PASSWORD is flipped on
 * (lib/auth-features.ts). This page still works if you navigate here directly.
 */

import { FormEvent, useState } from 'react';
import { requestPasswordResetEmail } from '../../lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await requestPasswordResetEmail(email);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start a password reset.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className='auth-page'>
      <div className='auth-card'>
        <a className='auth-brand' href='/'>
          TeamUP<span>.</span>
        </a>

        <h1>Forgot your password?</h1>
        <p className='auth-lede'>
          Enter the email for your account and we’ll send a link to choose a new password.
        </p>

        {message ? (
          <p className='auth-success' role='status'>
            {message}
          </p>
        ) : (
          <form className='auth-form' onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type='email'
                name='email'
                autoComplete='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='you@school.edu'
              />
            </label>

            {error ? (
              <p className='auth-error' role='alert'>
                {error}
              </p>
            ) : null}

            <button className='btn primary' type='submit' disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className='auth-switch'>
          <a href='/signin'>Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
