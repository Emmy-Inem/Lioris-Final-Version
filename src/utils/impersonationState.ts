/**
 * Pure helpers for the persisted "View As" (admin impersonation) state. No react-native imports.
 *
 * The persisted record is NOT a secret (ids and an expiry); the admin's own backed-up tokens live in a
 * separate secure-storage key managed by AuthContext.
 */

/** A View As session never lasts longer than this, whatever the server's grant says. */
export const IMPERSONATION_MAX_MS = 15 * 60 * 1000;

export interface PersistedImpersonation {
  targetId: string;
  adminId: string;
  /** ISO timestamp */
  expiresAt: string;
  targetName?: string | null;
}

/** The earlier of the server's expiry and now + 15 minutes (an unusable server value falls back to the cap). */
export function clampImpersonationExpiry(serverExpiresAt: string | null | undefined, now: number = Date.now()): string {
  const cap = now + IMPERSONATION_MAX_MS;
  const server = serverExpiresAt ? Date.parse(serverExpiresAt) : NaN;
  return new Date(Number.isFinite(server) ? Math.min(server, cap) : cap).toISOString();
}

export function parsePersistedImpersonation(raw: string | null | undefined): PersistedImpersonation | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || p.active === false) return null;
    if (typeof p.targetId !== 'string' || !p.targetId) return null;
    if (typeof p.adminId !== 'string' || !p.adminId) return null;
    if (typeof p.expiresAt !== 'string' || !Number.isFinite(Date.parse(p.expiresAt))) return null;
    return {
      targetId: p.targetId,
      adminId: p.adminId,
      expiresAt: p.expiresAt,
      targetName: typeof p.targetName === 'string' ? p.targetName : null,
    };
  } catch {
    return null;
  }
}

export function serializeImpersonation(p: PersistedImpersonation): string {
  return JSON.stringify({ active: true, ...p });
}

export function isImpersonationExpired(p: Pick<PersistedImpersonation, 'expiresAt'>, now: number = Date.now()): boolean {
  return Date.parse(p.expiresAt) <= now;
}

/**
 * What to do with a persisted record at startup, given the id of the live Supabase session (if any):
 *  - resume: still valid and the live session really is the target's
 *  - end: expired, or the live session is the target's but the grant is over
 *  - discard: the record does not match the live session at all (nothing to restore, just forget it)
 */
export function decideStartupImpersonation(
  persisted: PersistedImpersonation | null,
  liveUserId: string | null | undefined,
  now: number = Date.now(),
): 'none' | 'resume' | 'end' | 'discard' {
  if (!persisted) return 'none';
  if (!liveUserId || liveUserId !== persisted.targetId) return 'discard';
  return isImpersonationExpired(persisted, now) ? 'end' : 'resume';
}
