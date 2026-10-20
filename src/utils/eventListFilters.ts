// PostgREST `or=` filters that mirror, in the database, what listEvents() used to do after downloading every row.
// Pure (no supabase / react-native imports) so node --test can cover it.

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const CAMPUS_CODE_SAFE = /^[A-Za-z0-9_-]+$/;

/** Escapes LIKE wildcards so ilike() behaves as a case-insensitive equality. */
export function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Each returned string is one `.or(...)` call (the calls are ANDed together):
 *  - the 5-day window: an event is kept while (end_time, else start_time) is within the last 5 days;
 *  - strict campus isolation: ALL sees everything, GLOBAL sees global events, a campus sees its own plus GLOBAL
 *    (a missing campus_code counts as GLOBAL, like the JavaScript pass).
 * The JavaScript filters still run afterwards, so these only ever remove rows that pass would have removed too.
 */
export function buildEventListFilters(opts: { skipEndedWindow: boolean; activeCampus: string; now?: number }): string[] {
  const filters: string[] = [];
  if (!opts.skipEndedWindow) {
    const cutoff = new Date((opts.now ?? Date.now()) - FIVE_DAYS_MS).toISOString();
    filters.push(`end_time.gte.${cutoff},and(end_time.is.null,start_time.gte.${cutoff})`);
  }
  const campus = (opts.activeCampus || 'GLOBAL').toUpperCase();
  if (campus === 'GLOBAL') {
    filters.push('campus_code.is.null,campus_code.ilike.GLOBAL,visibility_scope.eq.global');
  } else if (campus !== 'ALL' && CAMPUS_CODE_SAFE.test(campus)) {
    filters.push(`campus_code.is.null,campus_code.ilike.GLOBAL,campus_code.ilike.${ilikeLiteral(campus)}`);
  }
  return filters;
}
