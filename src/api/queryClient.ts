import { focusManager, QueryClient } from '@tanstack/react-query';

// React Query's default focus detection listens to the browser's `visibilitychange`, which never fires in a React Native
// app, so on a phone `refetchOnWindowFocus` and refetch intervals never knew about foreground / background. Wire it to
// AppState instead. (Online / offline tracking is wired to NetInfo by setupNetworkAwareQueries() in OfflineBanner.tsx.)
// react-native is required lazily and only inside a React Native runtime: the web build keeps React Query's own
// visibilitychange handling, and the node unit tests (which import this module) never load react-native.
if (typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative') {
  const { AppState } = require('react-native') as typeof import('react-native');
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => subscription.remove();
  });
}

// Retry decision for reads (pure: unit-tested in src/utils/retryPolicy.test.ts).
const MAX_RETRIES = 2;

/**
 * True when repeating the request cannot succeed: the server understood it and refused or rejected it.
 *
 * supabase-js does not put an HTTP `status` on database errors (PostgrestError carries `code`/`message`/`details`), so a
 * check on `error.status` alone never recognised an RLS refusal, a missing table or a bad filter, and each of those
 * was retried twice with 1s + 2s back-off before the screen showed its error.
 */
export function isPermanentQueryError(error: unknown): boolean {
  const err = error as { status?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (!err || typeof err !== 'object') return false;

  const status = typeof err.status === 'number' ? err.status : Number(err.status);
  if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;

  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  // PostgREST's own codes: PGRST000-003 are connection / pool-timeout problems (transient); the rest are request,
  // schema-cache or auth problems that a retry cannot fix.
  if (code.startsWith('PGRST')) return !/^PGRST00[0-3]$/.test(code);
  // SQLSTATE classes that mean "your request is wrong or not allowed": 22 data exception, 23 integrity constraint,
  // 28 invalid authorisation, 42 syntax error / access rule violation (42501 = RLS / permission denied).
  if (/^(22|23|28|42)[0-9A-Z]{3}$/.test(code)) return true;

  return false;
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isPermanentQueryError(error)) return false;
  return failureCount < MAX_RETRIES;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Permanent refusals (RLS / permission, bad request, missing table, 4xx) are not retried; transient network
      // dropouts, timeouts and 5xx are retried up to 2 times.
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      staleTime: 30_000,
      // Keep unused results for 10 minutes so going back to a screen shows data instantly.
      gcTime: 10 * 60_000,
      // A polling query must not keep waking the radio while the app is backgrounded.
      refetchIntervalInBackground: false,
      refetchOnReconnect: true,
      // Queries keep the default networkMode ('online'): while offline a query is PAUSED (fetchStatus === 'paused')
      // and resumes by itself on reconnect; screens show "You're offline" via useIsOfflinePaused().
    },
    mutations: {
      // A mutation fires immediately and fails fast with its own error instead of hanging "pending" until the
      // connection returns (callers already toast their errors).
      networkMode: 'offlineFirst',
    },
  },
});

// The header badges use one shared ['unread-counts'] query. Whenever the notifications or conversations/messages caches
// are invalidated (marking read, opening a chat, a realtime event ...) the badge counts are refreshed with them, so every
// existing `invalidateQueries({ queryKey: ['notifications'] })` call keeps the badges truthful without being edited.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
  const head = event.query.queryKey[0];
  if (head === 'notifications' || head === 'conversations' || head === 'messages') {
    void queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
  }
});
