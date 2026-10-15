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
