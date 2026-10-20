import { onlineManager } from '@tanstack/react-query';

/**
 * True when a query has no data to show because it is paused waiting for a connection
 * (React Query reports `fetchStatus === 'paused'` while offline). Use it so a heavy list screen shows
 * "You're offline" instead of an empty state that reads as "nothing here".
 *
 *   const offline = useIsOfflinePaused(query);
 *   if (offline) return <OfflineNotice />;
 */
export function isOfflinePaused(query: { fetchStatus?: string; data?: unknown; isError?: boolean }): boolean {
  return query.fetchStatus === 'paused' && query.data === undefined;
}

export function useIsOfflinePaused(query: { fetchStatus?: string; data?: unknown; isError?: boolean }): boolean {
  // Also true when the connection dropped but React Query has not paused a fetch yet.
  return isOfflinePaused(query) || (!onlineManager.isOnline() && query.data === undefined && query.isError === true);
}
