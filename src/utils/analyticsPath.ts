/**
 * Page-view paths are sent to analytics. A raw pathname such as `/messages/3f2a...` or `/post/812` puts
 * private object ids (a conversation, a post, a member) into the analytics table, so dynamic segments
 * are replaced with placeholders before anything is recorded. Pure: no react-native imports.
 */

/**
 * Parents of a dynamic `[id]` route in app/ (events/[id], messages/[id], post/[id], pod/[id],
 * mentorship-space/[id]) plus profile-style parents. The segment after one of these is an id unless it
 * is a known static sub-page.
 */
const ID_PARENTS = new Set([
  'messages',
  'post',
  'posts',
  'events',
  'profile',
  'user',
  'users',
  'pod',
  'mentorship-space',
]);

const STATIC_SUBPAGES = new Set([
  'new',
  'create',
  'edit',
  'saved',
  'search',
  'settings',
  'calendar',
  'my',
  'mine',
  'archive',
  'requests',
  'following',
  'followers',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Looks like an identifier by itself: uuid, number, long hex, or a long token mixing letters and digits. */
function looksLikeId(segment: string): boolean {
  if (UUID.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true;
  return segment.length >= 12 && /\d/.test(segment) && /[a-z]/i.test(segment) && /^[\w-]+$/.test(segment);
}

export function normalizeAnalyticsPath(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  const bare = pathname.split(/[?#]/)[0] || '/';
  const segments = bare.split('/').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const prev = i > 0 ? segments[i - 1].toLowerCase() : '';
    const isGroup = /^\(.*\)$/.test(segment);
    const afterIdParent = ID_PARENTS.has(prev) && !STATIC_SUBPAGES.has(segment.toLowerCase());
    if (!isGroup && (looksLikeId(segment) || afterIdParent)) {
      out.push('[id]');
    } else {
      out.push(segment);
    }
  }
  return `/${out.join('/')}`;
}

/**
 * Pages anybody can open without an account. Signed-out visits are counted for these and ONLY these (the
 * database enforces the same list in record_public_page_view), so an anonymous visitor never reveals which
 * private screen or object they were sent to by a deep link.
 */
export const PUBLIC_ANALYTICS_PATHS: readonly string[] = [
  '/',
  '/login',
  '/register',
  '/reset-password',
  '/verify-email',
  '/privacy',
  '/terms',
  '/copyright',
  '/community-rules',
];

export function isPublicAnalyticsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = normalizeAnalyticsPath(pathname).replace(/\/\(auth\)(?=\/|$)/g, '') || '/';
  return PUBLIC_ANALYTICS_PATHS.includes(normalized);
}
