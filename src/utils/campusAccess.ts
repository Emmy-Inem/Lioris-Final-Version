export interface CampusAccessIdentity {
  role?: string | null;
  adminRole?: string | null;
  campusCode?: string | null;
  email?: string | null;
}

export function isSuperAdminIdentity(identity?: CampusAccessIdentity | null): boolean {
  if (!identity) return false;
  const email = identity.email?.trim().toLowerCase();
  return (
    email === 'inememmanuel@gmail.com' ||
    (identity.role === 'admin' && identity.adminRole === 'super_admin')
  );
}

function normalizedCampus(value?: string | null): string | undefined {
  const code = value?.trim().toUpperCase();
  return code || undefined;
}

/**
 * Resolves the campus a list API may read. Caller input is never authority:
 * students and campus admins are pinned to the campus on their database
 * profile. Only a verified super admin may request ALL or another campus.
 */
export function resolveCampusReadScope(
  identity: CampusAccessIdentity | null | undefined,
  requestedCampus?: string | null,
): string {
  if (isSuperAdminIdentity(identity)) {
    return normalizedCampus(requestedCampus) || 'ALL';
  }

  const ownCampus = normalizedCampus(identity?.campusCode);
  return ownCampus && ownCampus !== 'ALL' ? ownCampus : 'GLOBAL';
}

