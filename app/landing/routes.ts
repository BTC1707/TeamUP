/**
 * Public URLs used by the marketing landing page.
 * Keep these in one place so CTA links stay consistent.
 */
export const LANDING_ROUTES = {
  /** Create an account (working). */
  signUp: '/signup',
  /**
   * Existing account — opens /signin, then /workspace/overview after success.
   * If a Remember-me session cookie is already present, /signin redirects straight in.
   */
  signIn: '/signin?return_to=%2Fworkspace%2Foverview',
  /** Local/demo workspace with no account required. */
  demo: '/demo/overview',
  /** App home after a successful sign-up / sign-in (also used when already signed in). */
  workspace: '/workspace/overview',
} as const;
