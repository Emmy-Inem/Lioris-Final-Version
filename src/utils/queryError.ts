// Pure helpers that turn a failed query into screen copy (no react-native imports, so node --test can run it).

export type QueryErrorKind = 'offline' | 'permission' | 'generic';

export interface QueryErrorCopy {
  kind: QueryErrorKind;
  title: string;
  message: string;
  icon: 'cloud-offline-outline' | 'lock-closed-outline' | 'alert-circle-outline';
}

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: unknown; error_description?: unknown };
    return String(e.message ?? e.error_description ?? '');
  }
  return '';
}

/**
 * Offline / network failures vs. permission refusals vs. anything else. Works on Error objects, PostgREST errors
 * ({ code, message, status }) and plain strings.
 */
export function classifyQueryError(error: unknown): QueryErrorKind {
  if (!error) return 'generic';
  const text = errorText(error).toLowerCase();
  const obj = typeof error === 'object' ? (error as { code?: unknown; status?: unknown }) : {};
  const code = obj.code === undefined ? '' : String(obj.code).toLowerCase();
  const status = obj.status === undefined ? '' : String(obj.status);

  if (
    code === '42501' ||
    status === '401' ||
    status === '403' ||
    /row-level security|permission denied|not authorized|jwt expired|forbidden/.test(text)
  ) {
    return 'permission';
  }
  if (
    /network request failed|failed to fetch|load failed|networkerror|network connection was lost|internet|offline|timeout|timed out|etimedout|econnreset|econnrefused|enetunreach|err_connection|err_network|socket hang up|aborterror/.test(
      text,
    ) ||
    code === 'econnrefused' ||
    code === 'enetunreach'
  ) {
    return 'offline';
  }
  return 'generic';
}

/** Friendly copy for a failed load. Never echoes the raw error text (it can be SQL or PostgREST wording). */
export function queryErrorCopy(error: unknown, subject = 'this content'): QueryErrorCopy {
  const kind = classifyQueryError(error);
  if (kind === 'offline') {
    return {
      kind,
      title: "You're offline",
      message: 'Check your internet connection or mobile data, then try again.',
      icon: 'cloud-offline-outline',
    };
  }
  if (kind === 'permission') {
    return {
      kind,
      title: 'Access not available',
      message: `Your account can't view ${subject} right now. Sign in again or check your verification status, then try again.`,
      icon: 'lock-closed-outline',
    };
  }
  return {
    kind,
    title: `Couldn't load ${subject}`,
    message: 'Something went wrong on our side. Please try again in a moment.',
    icon: 'alert-circle-outline',
  };
}

export type QueryErrorMode = 'none' | 'blocking' | 'inline';

/**
 * How a screen should show a failed query: a full error state when there is nothing cached to show, or a small
 * inline banner (the cached data stays on screen) when a refetch failed behind existing data.
 */
export function queryErrorMode(query: { isError?: boolean; data?: unknown }, hasData?: boolean): QueryErrorMode {
  if (!query.isError) return 'none';
  const cached = hasData ?? (query.data !== undefined && query.data !== null);
  return cached ? 'inline' : 'blocking';
}

export interface QueryErrorSource {
  isError?: boolean;
  data?: unknown;
  error?: unknown;
  refetch?: () => unknown;
}

/**
 * For a screen built from several queries (a dashboard): nothing when all is well, a blocking error when at least
 * one failed and none of them has anything to show, and an inline notice when something failed but other
 * sections (or cached data) can still be shown. `error` is the first failure, for choosing the copy.
 */
export function summarizeQueryErrors(queries: QueryErrorSource[]): { mode: QueryErrorMode; error: unknown } {
  const failed = queries.filter((q) => q.isError);
  if (failed.length === 0) return { mode: 'none', error: null };
  const anyData = queries.some((q) => q.data !== undefined && q.data !== null);
  return { mode: anyData ? 'inline' : 'blocking', error: failed[0].error };
}

/** Retries only the queries that failed (the healthy ones are left alone). */
export async function refetchFailedQueries(queries: QueryErrorSource[]): Promise<void> {
  await Promise.all(queries.filter((q) => q.isError && q.refetch).map((q) => q.refetch!()));
}
