/**
 * Helpers for safely interpolating values into PostgREST filter strings
 * (`.or(...)`, `.ilike(...)`). Never interpolate raw user input into these.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the id when it is a well-formed UUID, otherwise throws. */
export function assertUuid(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

/** Alias that reads well inside `.or(...)` template strings. */
export const escapePostgrestId = assertUuid;

/**
 * Escapes free text for use inside an ilike pattern that is itself embedded in a
 * PostgREST filter: neutralises LIKE wildcards (% _ \) and the filter-grammar
 * characters (, ( ) ") so input cannot add extra conditions.
 */
export function escapePostgrestLike(value: string): string {
  return String(value)
    .replace(/[\%_]/g, (c) => `\${c}`)
    .replace(/[,()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
