/**
 * The mentorship and study-pod database functions raise errors shaped like
 *   "<code>"                      e.g. mentor_full
 *   "<code>: <sentence for people>"  e.g. invalid_input: tell the mentor a little about yourself
 * Turn either into something a member can read, and expose the code so screens can react to it.
 */

const KNOWN_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in again to continue.',
  account_suspended: 'Your account is suspended, so you cannot do that right now.',
  not_allowed: 'You are not allowed to do that.',
  not_found: 'That item no longer exists. Pull down to refresh.',
  mentor_unavailable: 'This mentor is not taking requests right now.',
  mentor_full: 'This mentor has no free mentee slots at the moment.',
  already_requested: 'You already have an open request with this mentor.',
  cooldown: 'This mentor declined recently. Please wait a week before asking again.',
  too_many_pending: 'You have 5 requests waiting for an answer. Wait for a reply or withdraw one first.',
  pod_full: 'This study pod is full.',
  wrong_state: 'That is no longer possible - the item has already changed. Pull down to refresh.',
  too_early: 'That has not started yet.',
  rate_limited: 'You are doing that too quickly. Please wait a moment.',
  too_many_sessions: 'Too many upcoming sessions. Finish or cancel one first.',
  too_many_goals: 'A mentorship can have at most 12 goals.',
  not_verified: 'Verify your account first to do that.',
  already_reported: 'You already reported this. A moderator will review it.',
  event_full: 'This event is full.',
  booking_closed: 'Registration for this event has closed.',
  event_not_open: 'This event is not open for registration.',
  ack_required: 'Please confirm you understand how paid events work on Lioris.',
  payment_not_ready: 'The payment details for this event are still being checked.',
  paid_events_disabled: 'Paid events are paused right now.',
  checkin_closed: 'Check-in is not open for this event right now.',
  ticket_not_found: 'Nobody registered for this event with that code.',
  not_checked_in: 'Check the person in first.',
  already_checked_in: 'You were already checked in, so this registration cannot be cancelled.',
};

export interface ParsedRpcError {
  code: string;
  message: string;
}

/** Postgres/PostgREST raise errors carry the text in `.message`; edge functions use `.error`/`.message`. */
export function parseRpcError(err: unknown, fallback = 'Something went wrong. Please try again.'): ParsedRpcError {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object'
      ? String((err as any).message ?? (err as any).error_description ?? '')
      : '';
  const text = raw.trim();
  const match = /^([a-z_]+)(?::\s*([\s\S]*))?$/.exec(text);
  if (match && (match[1] in KNOWN_MESSAGES || match[2])) {
    const code = match[1];
    const detail = (match[2] ?? '').trim();
    // A sentence written for people wins over the generic wording for the code.
    if (detail) return { code, message: detail.charAt(0).toUpperCase() + detail.slice(1) };
    return { code, message: KNOWN_MESSAGES[code] ?? fallback };
  }
  if (/failed to fetch|network request failed|networkerror|load failed/i.test(text)) {
    return { code: 'network', message: 'Could not reach Lioris. Check your connection and try again.' };
  }
  if (/permission denied|row-level security|violates row-level/i.test(text)) {
    return { code: 'not_allowed', message: KNOWN_MESSAGES.not_allowed };
  }
  if (/could not find the function|schema cache/i.test(text)) {
    return { code: 'not_deployed', message: 'This feature is being updated on the server. Please try again in a few minutes.' };
  }
  return { code: 'unknown', message: fallback };
}

/** Throwable error that keeps the code, so callers can branch (`err.code === 'mentor_full'`). */
export class RpcError extends Error {
  code: string;
  constructor(parsed: ParsedRpcError) {
    super(parsed.message);
    this.name = 'RpcError';
    this.code = parsed.code;
  }
}

/** Throw a friendly RpcError for a supabase-js `{ error }` result; do nothing when there is none. */
export function throwIfRpcError(error: unknown, fallback?: string): void {
  if (!error) return;
  throw new RpcError(parseRpcError(error, fallback));
}
