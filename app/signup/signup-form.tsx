'use client';

/**
 * Sign up form — create a TeamUP account.
 */

import { FormEvent, useState } from 'react';
import {
  DEFAULT_AFTER_AUTH_PATH,
  readReturnToParam,
  signUpAccount,
} from '../../lib/auth-client';

export default function SignUpForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { returnTo } = await signUpAccount({
        firstName,
        lastName,
        username,
        email,
        password,
        confirmPassword,
        returnTo: readReturnToParam(),
      });
      try {
        window.sessionStorage.removeItem('teamup.workspace.view');
        window.sessionStorage.removeItem('teamup.demo.sessionActive');
      } catch {
        // Keep account creation working if browser storage is unavailable.
      }
      window.location.assign(returnTo || DEFAULT_AFTER_AUTH_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.');
      setBusy(false);
    }
  }

  return (
    <main className='auth-page'>
      <div className='auth-card'>
        <a className='auth-brand' href='/'>
          teamup<span>.</span>
        </a>

        <h1>Create your account</h1>
        <p className='auth-lede'>Pick a username, email, and password to get started.</p>

        <form className='auth-form' onSubmit={handleSubmit}>
          <div className='auth-form-row'>
            <label>
              First name
              <input
                type='text'
                name='firstName'
                autoComplete='given-name'
                required
                maxLength={40}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder='Alex'
              />
            </label>

            <label>
              Last name
              <input
                type='text'
                name='lastName'
                autoComplete='family-name'
                required
                maxLength={40}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder='Kim'
              />
            </label>
          </div>

          <label>
            Username
            <input
              type='text'
              name='username'
              autoComplete='username'
              required
              minLength={3}
              maxLength={24}
              pattern='[a-zA-Z0-9_]+'
              title='3–24 characters: letters, numbers, or underscores'
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder='alexkim'
            />
          </label>

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

          <label>
            Password
            <input
              type='password'
              name='password'
              autoComplete='new-password'
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='At least 8 characters'
            />
          </label>

          <label>
            Confirm password
            <input
              type='password'
              name='confirmPassword'
              autoComplete='new-password'
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder='Re-enter password'
            />
          </label>

          {error ? (
            <p className='auth-error' role='alert'>
              {error}
            </p>
          ) : null}

          <button className='btn primary' type='submit' disabled={busy}>
            {busy ? 'Creating…' : 'Sign up'}
          </button>
        </form>

        <p className='auth-switch'>
          Already have an account? <a href='/signin'>Sign in</a>
        </p>
      </div>
    </main>
  );
}
