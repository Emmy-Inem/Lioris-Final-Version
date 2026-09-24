/** How long a notification that has already been viewed stays in the list. */
export const VIEWED_NOTIFICATION_RETENTION_DAYS = 30;
export const VIEWED_NOTIFICATION_RETENTION_MS = VIEWED_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * True when a notification was viewed more than 30 days ago and should no longer be shown.
 * `openedAt` is the moment it was viewed; an unviewed notification (null/undefined) never expires,
 * and an unparseable timestamp is kept rather than silently hidden.
 */
export function isViewedNotificationExpired(openedAt?: string | null, now: number = Date.now()): boolean {
  if (!openedAt) return false;
  const viewedAt = new Date(openedAt).getTime();
  if (Number.isNaN(viewedAt)) return false;
  return now - viewedAt > VIEWED_NOTIFICATION_RETENTION_MS;
}
