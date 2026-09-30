// A small ring buffer of recent user actions/navigation/API failures, so a
// crash report (src/monitoring/errorReporter.ts) carries not just the error
// itself but what the user was doing right before it - the single biggest
// gap in diagnosing a report that's just a stack trace and a URL. Nothing
// here is sent anywhere on its own; it only rides along inside the `context`
// of the next reportError()/reportMessage() call.
//
// Kept deliberately tiny and dependency-free (no store, no React) so it can
// be called from anywhere - API modules, route-change effects, error
// handlers - without import cycles.

export type BreadcrumbCategory = 'navigation' | 'action' | 'api' | 'auth';

export interface Breadcrumb {
  category: BreadcrumbCategory;
  message: string;
  data?: Record<string, unknown>;
  /** ms since page/app load - cheap, monotonic, and never leaks wall-clock/timezone. */
  t: number;
}

const MAX_BREADCRUMBS = 20;
const MAX_MESSAGE_CHARS = 200;
const buffer: Breadcrumb[] = [];
const startedAt = Date.now();

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Best-effort shallow scrub so an accidental secret/token doesn't ride along. */
function safeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  try {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (/token|password|secret|jwt|apikey/i.test(key)) continue;
      if (typeof value === 'string') out[key] = truncate(value, 120);
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
      // objects/arrays/functions are dropped - breadcrumbs are for context, not payloads
    }
    return out;
  } catch {
    return undefined;
  }
}

export function addBreadcrumb(category: BreadcrumbCategory, message: string, data?: Record<string, unknown>): void {
  try {
    buffer.push({
      category,
      message: truncate(message, MAX_MESSAGE_CHARS),
      data: safeData(data),
      t: Date.now() - startedAt,
    });
    if (buffer.length > MAX_BREADCRUMBS) buffer.shift();
  } catch {
    // breadcrumbs must never throw into a caller's happy path
  }
}

/** Snapshot for attaching to an error report. Never throws. */
export function getBreadcrumbs(): Breadcrumb[] {
  return buffer.slice();
}

/**
 * Records that an API call failed without throwing (the dominant pattern in
 * this codebase: `console.warn(...); return []`). Call this alongside the
 * existing console.warn at a call site you want visible in diagnostics -
 * it does not change that function's behaviour or its return value.
 */
export function logApiError(source: string, error: unknown): void {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  addBreadcrumb('api', `${source} failed`, { message: truncate(message, 160) });
}
