// Rate limiting via the public.consume_rate_limit(p_key, p_limit, p_window_seconds)
// RPC (service_role only; returns true when the call is allowed).
//
// Callers choose the failure policy:
//   'allowed' -> proceed
//   'limited' -> respond 429
//   'error'   -> RPC/network failure: sensitive endpoints fail CLOSED (503),
//                public best-effort endpoints (overpass-proxy) fail OPEN.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type RateLimitResult = 'allowed' | 'limited' | 'error';

export function createServiceClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function consumeRateLimit(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('[rate-limit] RPC error:', error.message);
      return 'error';
    }
    if (data === true) return 'allowed';

    // Deny path only (never on an allowed call, so this adds no overhead to normal
    // traffic): leave a trail an admin can later search so a pattern of repeated
    // rate-limit hits by one user/IP is traceable, not just a line in server logs
    // that nobody is watching in real time.
    await recordRateLimitAudit(admin, key, limit, windowSeconds);
    return 'limited';
  } catch (err) {
    console.error('[rate-limit] RPC failure:', err instanceof Error ? err.message : 'unknown');
    return 'error';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best-effort audit trail for a tripped rate limit. `key` is always
 * `<action>:<identifier>` (a user id or an IP - see call sites across
 * supabase/functions), so it is split back into the two for the log.
 *
 * Awaited (matches the rest of this file, and the admin-force-signout /
 * admin-delete-user audit writes this mirrors) rather than fired detached,
 * since an un-awaited promise is not guaranteed to finish before a Supabase
 * Edge Function's isolate is torn down after the response is sent. It is a
 * single small insert on the rare deny path, so it stays low-overhead. Its
 * own failure is logged, never thrown - the 429/503 the caller already
 * decided on must not turn into a 500.
 */
async function recordRateLimitAudit(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  try {
    const separatorIndex = key.indexOf(':');
    const action = separatorIndex === -1 ? key : key.slice(0, separatorIndex);
    const identifier = separatorIndex === -1 ? null : key.slice(separatorIndex + 1);
    const actorId = identifier && UUID_RE.test(identifier) ? identifier : null;

    const { error } = await admin.from('audit_logs').insert({
      actor_id: actorId,
      action: 'rate_limit_exceeded',
      entity_type: 'system',
      entity_id: null,
      metadata: {
        summary: `Rate limit exceeded for "${action}"${actorId ? '' : identifier ? ` (identifier: ${identifier})` : ''}`,
        limitKey: key,
        limitAction: action,
        identifier,
        limit,
        windowSeconds,
      },
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[rate-limit] Failed to write audit log entry:', error.message);
    }
  } catch (err) {
    console.error('[rate-limit] Audit log write failed:', err instanceof Error ? err.message : 'unknown');
  }
}

/** First hop of x-forwarded-for (Supabase's edge proxy sets it). Falls back to 'unknown'. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  return req.headers.get('cf-connecting-ip')?.slice(0, 64) ?? 'unknown';
}
