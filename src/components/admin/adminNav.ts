import type { Ionicons } from '@expo/vector-icons';

/**
 * The admin area's information architecture, in one place.
 *
 * Five groups, each with one job, and every capability lives in exactly one of them:
 *   Overview - what needs attention right now (read-only summary that links into the groups)
 *   People   - accounts: the directory, ID verification, support tickets
 *   Content  - what members publish: threads/communities, events, resources, comments
 *   Safety   - reports, copyright takedowns, the audit trail
 *   Platform - feature switches, campuses & security, broadcasts, portal links, system health
 *
 * The bottom bar and the desktop sidebar link to a group; the pages inside a group are reached
 * with <AdminSectionTabs/> at the top of each page.
 */
export type AdminGroupKey = 'overview' | 'people' | 'content' | 'safety' | 'platform';

export interface AdminSection {
  key: string;
  label: string;
  /** expo-router path used to navigate. */
  route: string;
  /** Pathname (as usePathname() reports it, without group segments) when this section is showing. */
  path: string;
}

export interface AdminGroup {
  key: AdminGroupKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sections: AdminSection[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'grid-outline',
    sections: [{ key: 'overview', label: 'Overview', route: '/(admin)/dashboard', path: '/dashboard' }],
  },
  {
    key: 'people',
    label: 'People',
    icon: 'people-outline',
    sections: [
      { key: 'members', label: 'Members', route: '/(admin)/user-directory', path: '/user-directory' },
      { key: 'verification', label: 'ID Verification', route: '/(admin)/verification-requests', path: '/verification-requests' },
      { key: 'support', label: 'Support', route: '/(admin)/support-desk', path: '/support-desk' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    icon: 'layers-outline',
    sections: [{ key: 'content', label: 'Content', route: '/(admin)/content-desk', path: '/content-desk' }],
  },
  {
    key: 'safety',
    label: 'Safety',
    icon: 'shield-checkmark-outline',
    sections: [
      { key: 'reports', label: 'Reports', route: '/(admin)/moderation-queue', path: '/moderation-queue' },
      { key: 'takedowns', label: 'Takedowns', route: '/(admin)/takedown-requests', path: '/takedown-requests' },
      { key: 'audit', label: 'Audit Log', route: '/(admin)/audit-logs', path: '/audit-logs' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    icon: 'settings-outline',
    sections: [
      { key: 'console', label: 'Console', route: '/(admin)/platform-config', path: '/platform-config' },
      { key: 'features', label: 'Features', route: '/(admin)/feature-controls', path: '/feature-controls' },
      { key: 'campuses', label: 'Campuses & Security', route: '/(admin)/super-admin-config', path: '/super-admin-config' },
      { key: 'health', label: 'Health', route: '/(admin)/system-health', path: '/system-health' },
    ],
  },
];

/** Removes expo-router group segments: '/(admin)/user-directory' -> '/user-directory'. */
export function stripGroups(path: string): string {
  return path.replace(/\/\([^)]+\)/g, '') || '/';
}

/** Which group a pathname belongs to, or null (profile, settings, messages, ...). */
export function adminGroupForPath(pathname: string): AdminGroup | null {
  const path = stripGroups(pathname);
  return (
    ADMIN_GROUPS.find((group) =>
      group.sections.some((section) => path === section.path || path.startsWith(`${section.path}/`)),
    ) ?? null
  );
}
