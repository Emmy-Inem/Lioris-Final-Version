export interface CampusPortalFilterOption {
  code: string;
  label: string;
}

/**
 * Returns allowed portal filters based on user role.
 * Regular students are strictly constrained to their selected campus and National Portals.
 * Admins/staff retain the full multi-university directory.
 */
export function resolveAllowedPortalFilters(
  userRole: string | undefined,
  effectiveCampus: string,
  institutionName?: string,
): CampusPortalFilterOption[] {
  const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';
  if (isStaffOrAdmin) {
    return [
      { code: 'CURRENT', label: `My Campus (${effectiveCampus})` },
      { code: 'ALL', label: 'All Universities' },
      { code: 'UNILAG', label: 'UNILAG' },
      { code: 'UI', label: 'UI' },
      { code: 'FUNAAB', label: 'FUNAAB' },
      { code: 'UNN', label: 'UNN' },
      { code: 'OAU', label: 'OAU' },
      { code: 'CU', label: 'Covenant (CU)' },
      { code: 'GLOBAL', label: 'National Portals' },
    ];
  }

  const campusLabel = institutionName || (effectiveCampus !== 'GLOBAL' ? effectiveCampus : 'Campus');
  return [
    { code: 'CURRENT', label: `${campusLabel} Portals` },
    { code: 'GLOBAL', label: 'National Portals' },
  ];
}

/**
 * Resolves the query campus target for portal links.
 * Guarantees that regular students can never access or query 'ALL' or other universities.
 */
export function resolveActivePortalTarget(
  userRole: string | undefined,
  selectedFilter: string,
  effectiveCampus: string,
): string {
  const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';
  if (isStaffOrAdmin) {
    if (selectedFilter === 'CURRENT') {
      return effectiveCampus !== 'GLOBAL' ? effectiveCampus : 'ALL';
    }
    return selectedFilter || 'ALL';
  }

  // Regular students can NEVER query 'ALL' or other universities
  if (selectedFilter === 'GLOBAL') {
    return 'GLOBAL';
  }
  return effectiveCampus && effectiveCampus !== 'GLOBAL' ? effectiveCampus : 'GLOBAL';
}
