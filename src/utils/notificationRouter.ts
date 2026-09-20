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

    // Check if the path starts with a role group e.g. /(student)/..., /(alumni)/...
    const roleMatch = trimmed.match(/^\/\((student|staff|alumni|admin)\)(.*)$/);
    if (roleMatch) {
      const subPath = roleMatch[2]; // e.g. '/dashboard', '/events/123', '/feed'

      // Sub-path specific role adaptations
      if (subPath === '/feed' || subPath === '/forum') {
        return role === 'student' ? '/(student)/feed' : `/(${role})/forum`;
      }
      if (subPath === '/connection-requests' || subPath === '/connections') {
        return role === 'alumni' ? '/(alumni)/connection-requests' : `/(${role})/notifications`;
      }
      if (subPath === '/resources') {
        return role === 'student' ? '/(student)/resources' : `/(${role})/dashboard`;
      }
      if (subPath === '/study-groups') {
        return role === 'student' ? '/(student)/study-groups' : `/(${role})/dashboard`;
      }
      if (subPath === '/announcements') {
        return role === 'staff' ? '/(staff)/announcements' : `/(${role})/dashboard`;
      }
      if (subPath === '/moderation' || subPath === '/moderation-queue') {
        if (role === 'staff') return '/(staff)/moderation';
        if (role === 'admin') return '/(admin)/moderation-queue';
        return `/(${role})/dashboard`;
      }
      if (subPath === '/jobs') {
        return (role === 'student' || role === 'alumni') ? `/(${role})/jobs` : `/(${role})/dashboard`;
      }
      if (subPath === '/mentorship') {
        return (role === 'student' || role === 'alumni') ? `/(${role})/mentorship` : `/(${role})/dashboard`;
      }
      if (subPath === '/marketplace') {
        return (role === 'student' || role === 'alumni') ? `/(${role})/marketplace` : `/(${role})/dashboard`;
      }
      if (subPath.startsWith('/events')) {
        return `/(${role})${subPath}`;
      }
      if (subPath === '/profile') {
        return `/(${role})/profile`;
      }
      if (subPath === '/settings') {
        return `/(${role})/settings`;
      }
      if (subPath === '/dashboard') {
        return `/(${role})/dashboard`;
      }

      // If user's role matches the origin role prefix, preserve the exact path
      if (roleMatch[1] === role) {
        return trimmed;
      }

      // Default replacement of role prefix
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
