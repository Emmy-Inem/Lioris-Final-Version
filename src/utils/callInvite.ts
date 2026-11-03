// Pure helpers behind src/components/IncomingCallListener.tsx.

/** How long a call invitation counts as live, measured from the server's created_at. */
export const CALL_INVITE_MAX_AGE_MS = 3 * 60_000;

/**
 * Milliseconds left before a call invitation is dead, given the server's created_at and this device's clock.
 * Returns 0 for an invitation that is already dead and the full window when the timestamp is missing or
 * unparseable (it cannot be judged, so it rings for the normal window instead of forever).
 */
export function inviteRingMsRemaining(createdAt: unknown, now: number, maxAgeMs: number = CALL_INVITE_MAX_AGE_MS): number {
  const created = typeof createdAt === 'string' || typeof createdAt === 'number' ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(created)) return maxAgeMs;
  return Math.max(0, Math.min(maxAgeMs, created + maxAgeMs - now));
}
