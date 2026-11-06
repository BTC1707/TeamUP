/**
 * Auth UI feature flags.
 *
 * Flip SHOW_FORGOT_PASSWORD to true once Resend can deliver mail to any
 * account address (verified domain / production sender). The forgot- and
 * reset-password routes already work behind the scenes.
 */
export const SHOW_FORGOT_PASSWORD = false;
