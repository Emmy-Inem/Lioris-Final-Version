/**
 * Validates and maps a notification's deep link or type to an existing route
 * for the current user's role (student, staff, alumni, admin).
 *
 * This prevents cross-role 404s (e.g. an alumni or staff member receiving a
 * notification with a hardcoded `/(student)/...` path, or a student being sent to
 * an alumni-only route).
 */
export function resolveNotificationRoute(
  rawPath?: string | null,
  notificationType?: string,
  userRole?: string | null,
): string {
  const role = userRole && ['student', 'staff', 'alumni', 'admin'].includes(userRole)
    ? userRole
    : 'student';

  if (rawPath && typeof rawPath === 'string' && rawPath.trim().length > 0) {
    const trimmed = rawPath.trim();

    // Strip any leading /(student|staff|alumni|admin) prefix so both bare and
    // role-prefixed notification URLs go through the same canonical mapper.
    const roleMatch = trimmed.match(/^\/\((student|staff|alumni|admin)\)(.*)$/);
    const subPath = roleMatch ? (roleMatch[2] || '/dashboard') : trimmed;

    // 1. Item-level deep links:
    //   /mentorship/<id> or /mentorship-space/<id>
    const mentorshipMatch = /^\/(?:mentorship|mentorship-space)\/([0-9a-f-]{36})$/i.exec(subPath);
    if (mentorshipMatch) {
      return role === 'student' || role === 'alumni'
        ? `/(${role})/mentorship-space/${mentorshipMatch[1]}`
        : `/(${role})/dashboard`;
    }

    //   /study-groups/<id> or /pod/<id>
    const podMatch = /^\/(?:study-groups|pod)\/([0-9a-f-]{36})$/i.exec(subPath);
    if (podMatch) {
      return role === 'student' ? `/(student)/pod/${podMatch[1]}` : `/(${role})/dashboard`;
    }

    //   /post/<id>
    const postMatch = /^\/post\/([^/?#]+)$/i.exec(subPath);
    if (postMatch) {
      if (role === 'admin') return `/(student)/post/${postMatch[1]}`;
      return `/(${role})/post/${postMatch[1]}`;
    }

    //   /event/<id> or /events/<id>
    const eventMatch = /^\/events?\/([^/?#]+)$/i.exec(subPath);
    if (eventMatch) {
      return `/(${role})/events/${eventMatch[1]}`;
    }

    //   /messages/<id>
    const msgMatch = /^\/messages\/([^/?#]+)$/i.exec(subPath);
    if (msgMatch) {
      return `/(${role})/messages/${msgMatch[1]}`;
    }

    // 2. Section-level deep links:
    if (subPath === '/feed' || subPath === '/forum' || subPath === '/forum/explore') {
      if (subPath === '/forum/explore' && role === 'student') return '/(student)/forum/explore';
      if (role === 'admin') return '/(admin)/forum';
      return role === 'student' ? '/(student)/feed' : `/(${role})/forum`;
    }
    if (subPath === '/connection-requests' || subPath === '/connections') {
      return role === 'alumni' ? '/(alumni)/connection-requests' : `/(${role})/notifications`;
    }
    if (subPath === '/resources') {
      if (role === 'student') return '/(student)/resources';
      if (role === 'staff') return '/(staff)/moderation';
      if (role === 'admin') return '/(admin)/content-desk?tab=resources';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/study-groups') {
      return role === 'student' ? '/(student)/study-groups' : `/(${role})/dashboard`;
    }
    if (subPath === '/announcements') {
      if (role === 'staff') return '/(staff)/announcements';
      if (role === 'admin') return '/(admin)/announcements';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/moderation' || subPath === '/moderation-queue') {
      if (role === 'staff') return '/(staff)/moderation';
      if (role === 'admin') return '/(admin)/moderation-queue';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/jobs') {
      if (role === 'alumni') return '/(alumni)/jobs';
      if (role === 'admin') return '/(admin)/content-desk?tab=jobs';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/mentorship') {
      return role === 'student' || role === 'alumni' ? `/(${role})/mentorship` : `/(${role})/dashboard`;
    }
    if (subPath === '/marketplace' || subPath === '/marketplace-mine') {
      if (role === 'student') return subPath === '/marketplace-mine' ? '/(student)/marketplace?tab=mine' : '/(student)/marketplace';
      if (role === 'admin') return '/(admin)/content-desk?tab=marketplace';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/giving') {
      if (role === 'alumni') return '/(alumni)/giving';
      if (role === 'admin') return '/(admin)/content-desk?tab=donations';
      return `/(${role})/dashboard`;
    }
    if (subPath === '/events' || subPath === '/events-list') {
      return `/(${role})/events-list`;
    }

    const bareRoleRoutes = new Set(['/profile', '/dashboard', '/messages', '/settings', '/notifications', '/saved', '/search']);
    if (bareRoleRoutes.has(subPath)) {
      return `/(${role})${subPath}`;
    }

    if (roleMatch) {
      if (roleMatch[1] === role) return trimmed;
      return `/(${role})${subPath}`;
    }

    // Root paths like '/privacy', '/terms', '/(auth)/login'
    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    return `/${trimmed}`;
  }

  // Intelligent fallback by notification type when no explicit deepLinkPath is set
  switch (notificationType) {
    case 'announcement':
    case 'system_announcement':
      return role === 'staff' ? '/(staff)/announcements' : `/(${role})/dashboard`;
    case 'event':
      return `/(${role})/events-list`;
    case 'message':
      return `/(${role})/messages`;
    case 'moderation':
      if (role === 'staff') return '/(staff)/moderation';
      if (role === 'admin') return '/(admin)/moderation-queue';
      return `/(${role})/dashboard`;
    case 'system':
    default:
      return `/(${role})/dashboard`;
  }
}

/**
 * Returns the primary discussion/feed route for a given user role.
 * Only students have `/(student)/feed`. Alumni, staff, and admin portals use `/forum`.
 */
export function getFeedRoute(userRole?: string | null): string {
  const role = userRole && ['student', 'staff', 'alumni', 'admin'].includes(userRole)
    ? userRole
    : 'student';
  return role === 'student' ? '/(student)/feed' : `/(${role})/forum`;
}
