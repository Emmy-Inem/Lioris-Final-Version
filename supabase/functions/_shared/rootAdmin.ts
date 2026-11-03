// Pure helper (no Deno / network imports, so node --test can import it).
//
// The root Super Admin bootstrap: the account that owns this e-mail address is a Super Admin even before
// (or without) a profile row saying so. The database side (auth_is_super_admin(), migration
// 20261106000000_access_control_hardening.sql section 10) only honours it for a CONFIRMED e-mail
// (auth.users.email_confirmed_at IS NOT NULL), because otherwise whoever registers the address first with
// e-mail confirmation off or bypassed would become Super Admin. The edge functions must apply the same rule.

export const ROOT_ADMIN_EMAIL = 'inememmanuel@gmail.com';

export interface RootCandidateUser {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/** True for the root e-mail itself, confirmed or not. Used to PROTECT that account (never to grant power). */
export function isRootEmail(value: string | null | undefined): boolean {
  return normaliseEmail(value) === ROOT_ADMIN_EMAIL;
}

/**
 * True when the authenticated user may use the root-e-mail bootstrap: the Auth user's e-mail is confirmed AND
 * either the Auth e-mail or the (server-protected) profile e-mail is the root address.
 */
export function isConfirmedRootUser(user: RootCandidateUser, profileEmail?: string | null): boolean {
  const confirmed = Boolean(user.email_confirmed_at ?? user.confirmed_at);
  if (!confirmed) return false;
  return isRootEmail(user.email) || isRootEmail(profileEmail);
}
