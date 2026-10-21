import { getFriendlyErrorMessage, isMinorRestrictedError } from './errors';

/**
 * The database refuses a write the Super Admin's Role Permissions switched off (and blocked / suspended
 * accounts) with an RLS violation. That used to surface as a generic "please try again", so the person kept
 * retrying something that could never work.
 */
export function isPermissionRefusal(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '');
}

export function refusalMessage(what: string): string {
  return `${what} has been turned off for your account by campus administration. If you think this is a mistake, contact support.`;
}

/**
 * The message for a refused write. The age rules (members under 18, migration 20261111000000) are refused with the
 * same SQLSTATE as a switched-off permission but carry their own sentence, which must reach the member instead of
 * "turned off by campus administration".
 */
export function refusalMessageFor(error: { code?: string; message?: string } | null | undefined, what: string): string {
  return isMinorRestrictedError(error) ? getFriendlyErrorMessage(error) : refusalMessage(what);
}
