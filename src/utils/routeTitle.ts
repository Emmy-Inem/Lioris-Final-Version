/**
 * Browser-tab titles for the web app. Pure (no react / react-native imports) so it is unit tested with
 * `node --test`; the hook that applies it is src/hooks/useRouteTitle.ts.
 *
 * The site is a single HTML file, so without this every tab says the same thing. Titles name the SECTION,
 * never the content: a detail route such as /post/<id> or /messages/<id> becomes "Post" / "Conversation",
 * so a conversation id, a person's name or a post title never lands in browser history, tab lists or
 * screenshots shared for support.
 *
 * The four public legal pages get their (richer) title from public/pwa-boot.js before the app boots, along
 * with their description / canonical / og tags. They are listed here with the SAME titles so that navigating
 * away and back inside the app restores them instead of leaving the previous screen's title; on first load
 * the hook therefore writes the value pwa-boot already set (no fight). A unit test reads pwa-boot.js and
 * fails if the two tables drift apart.
 */

export const SITE_NAME = 'Lioris';
/** Title of the landing page and the fallback for any path that is not in the table below. */
export const DEFAULT_TITLE = 'Lioris | The Unified Campus Network';

/** Public legal pages. MUST match the PAGES table in public/pwa-boot.js (enforced by routeTitle.test.ts). */
export const LEGAL_TITLES: Record<string, string> = {
  '/terms': 'Terms of Service | Lioris',
  '/privacy': 'Privacy Policy | Lioris',
  '/copyright': 'Copyright and Takedown Policy | Lioris',
  '/community-rules': 'Community Rules | Lioris',
};

/** Section titles keyed by the first URL segment (route groups like "(student)" never appear in the URL). */
const SECTION_TITLES: Record<string, string> = {
  // Auth
  login: 'Sign in',
  register: 'Create your account',
  'reset-password': 'Reset password',
  'verify-email': 'Verify your email',
  'verify-mfa': 'Two-factor verification',
  // Shared by the student / alumni / staff / admin / ambassador workspaces
  dashboard: 'Dashboard',
  feed: 'Feed',
  calendar: 'Calendar',
  'events-list': 'Events',
  events: 'Events',
  forum: 'Forum',
  discussions: 'Discussions',
  messages: 'Messages',
  notifications: 'Notifications',
  post: 'Post',
  profile: 'Profile',
  saved: 'Saved',
  search: 'Search',
  settings: 'Settings',
  analytics: 'Analytics',
  announcements: 'Announcements',
  // Student
  marketplace: 'Marketplace',
  'marketplace-mine': 'My listings',
  mentorship: 'Mentorship',
  'mentorship-space': 'Mentorship space',
  pod: 'Study group',
  resources: 'Resources',
  'study-groups': 'Study groups',
  // Alumni
  'connection-requests': 'Connection requests',
  giving: 'Giving',
  jobs: 'Jobs',
  network: 'Network',
  // Staff
  moderation: 'Moderation',
  // Ambassador
  'student-portal': 'Student portal',
};

/** Admin-only screens: titled "Admin | <name> | Lioris". */
const ADMIN_TITLES: Record<string, string> = {
  'audit-logs': 'Audit logs',
  'content-desk': 'Content desk',
  'feature-controls': 'Feature controls',
  'minors-consent': 'Minors consent',
  'moderation-queue': 'Moderation queue',
  'platform-config': 'Platform config',
  'role-permissions': 'Role permissions',
  'super-admin-config': 'Super admin config',
  'support-desk': 'Support desk',
  'system-health': 'System health',
  'takedown-requests': 'Takedown requests',
  'user-directory': 'User directory',
  'verification-requests': 'Verification requests',
};

/** Detail routes (".../<id>"): the generic name of what is being shown, never the id. */
const DETAIL_TITLES: Record<string, string> = {
  events: 'Event details',
  messages: 'Conversation',
  post: 'Post',
  pod: 'Study group',
  'mentorship-space': 'Mentorship space',
};

/** Sub-pages of /forum. */
const FORUM_TITLES: Record<string, string> = {
  explore: 'Explore forum',
};

/** Onboarding steps (/onboarding/<step>). */
const ONBOARDING_TITLES: Record<string, string> = {
  'get-started': 'Get started',
  'build-profile': 'Build your profile',
  'guardian-details': 'Guardian details',
  'join-waitlist': 'Join the waitlist',
  'select-interests': 'Select your interests',
  verify: 'Verify your account',
};

const has = (table: Record<string, string>, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key);

function withSite(name: string): string {
  return `${name} | ${SITE_NAME}`;
}

/** Lower-cased path segments with the query/hash, empty segments and "(group)" segments removed. */
function segmentsOf(pathname: string): string[] {
  const clean = String(pathname ?? '').split(/[?#]/)[0].toLowerCase();
  return clean.split('/').filter((s) => s.length > 0 && !(s.startsWith('(') && s.endsWith(')')));
}

/**
 * The document title for a web pathname.
 *  - public legal pages -> the title public/pwa-boot.js uses
 *  - known screens -> "<Section> | Lioris" (admin screens: "Admin | <Section> | Lioris")
 *  - "/" and any unknown path -> DEFAULT_TITLE
 */
export function routeTitle(pathname: string): string {
  const segments = segmentsOf(pathname);
  const legal = LEGAL_TITLES['/' + segments.join('/')];
  if (legal) return legal;
  const [first, second, third] = segments;
  if (!first) return DEFAULT_TITLE;

  if (has(ADMIN_TITLES, first) && segments.length === 1) return `Admin | ${withSite(ADMIN_TITLES[first])}`;

  if (first === 'onboarding') {
    if (second && has(ONBOARDING_TITLES, second) && segments.length === 2) return withSite(ONBOARDING_TITLES[second]);
    return DEFAULT_TITLE;
  }

  if (first === 'forum') {
    if (segments.length === 1) return withSite(SECTION_TITLES.forum);
    if (segments.length === 2 && has(FORUM_TITLES, second)) return withSite(FORUM_TITLES[second]);
    return DEFAULT_TITLE;
  }

  // "<parent>/<id>" detail routes.
  if (has(DETAIL_TITLES, first) && second && !third) {
    return withSite(second === 'index' ? SECTION_TITLES[first] : DETAIL_TITLES[first]);
  }

  if (has(SECTION_TITLES, first) && segments.length === 1) return withSite(SECTION_TITLES[first]);
  return DEFAULT_TITLE;
}
