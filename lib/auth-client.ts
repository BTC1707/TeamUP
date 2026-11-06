/**
 * Browser-side helpers for TeamUP account auth.
 *
 * Sign up  → POST /api/auth/signup
 * Sign in  → POST /api/auth/signin
 */

import {
  clearLocalAdminSession,
  matchesLocalDevAccount,
  rememberLocalAdminSession,
} from './local-dev-account';

export const DEFAULT_AFTER_AUTH_PATH = '/workspace/overview';

type AuthResult = {
  returnTo: string;
};

async function readAuthResponse(response: Response): Promise<AuthResult> {
  const data: { error?: string; returnTo?: string } = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to continue. Please try again.');
  }
  return { returnTo: data.returnTo || DEFAULT_AFTER_AUTH_PATH };
}

/** Create a new account and start a session. */
export async function signUpAccount(input: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  returnTo?: string;
}): Promise<AuthResult> {
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      email: input.email,
      password: input.password,
      confirmPassword: input.confirmPassword,
      returnTo: input.returnTo || DEFAULT_AFTER_AUTH_PATH,
    }),
  });
  return readAuthResponse(response);
}

/** Sign in with email or username + password. */
export async function signInAccount(input: {
  login: string;
  password: string;
  remember?: boolean;
  returnTo?: string;
}): Promise<AuthResult> {
  const response = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: input.login,
      password: input.password,
      remember: input.remember !== false,
      returnTo: input.returnTo || DEFAULT_AFTER_AUTH_PATH,
    }),
  });
  const result = await readAuthResponse(response);
  // Remember local admin in sessionStorage so the sidebar can show "admin"
  // (the real session cookie is HttpOnly and invisible to page JS).
  if (matchesLocalDevAccount(input.login, input.password)) {
    rememberLocalAdminSession();
  } else {
    clearLocalAdminSession();
  }
  return result;
}

/** Request a password-reset email. */
export async function requestPasswordResetEmail(email: string): Promise<{ message: string }> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data: { error?: string; message?: string } = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to start a password reset. Please try again.');
  }
  return {
    message:
      data.message ||
      'If an account exists for that email, a reset link is on its way. Check your inbox.',
  };
}

/** Set a new password with a reset token from email. */
export async function resetAccountPassword(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<void> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data: { error?: string } = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to reset your password. Please try again.');
  }
}

/** Read ?return_to= from the current URL, falling back to the workspace. */
export function readReturnToParam(): string {
  if (typeof window === 'undefined') return DEFAULT_AFTER_AUTH_PATH;
  const params = new URLSearchParams(window.location.search);
  return params.get('return_to') || DEFAULT_AFTER_AUTH_PATH;
}
