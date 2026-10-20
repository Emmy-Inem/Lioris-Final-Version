// Rate limiting via the public.consume_rate_limit_ex(p_key, p_limit, p_window_seconds) RPC
// (service_role only; returns { allowed, count }) with a fallback to the original boolean
// public.consume_rate_limit(...) when the newer function is not deployed yet.
//
// Callers choose the failure policy:
//   'allowed' -> proceed
//   'limited' -> respond 429
//   'error'   -> RPC/network failure: sensitive endpoints fail CLOSED (503),
//                public best-effort endpoints decide for themselves.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

export type RateLimitResult = 'allowed' | 'limited' | 'error';

export function createServiceClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** True when a PostgREST error means "that RPC is not deployed yet" (migration not applied). */
function isMissingRpc(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || msg.includes('could not find the function');
}

// Isolate-local memory of keys whose denial was already audited in this window. Only the fallback
// dedupe for when consume_rate_limit_ex (which returns a hit count) is not deployed yet.
const auditedDenials = new Map<string, number>();

function markAuditedOnce(key: string, windowSeconds: number): boolean {
  const now = Date.now();
  if (auditedDenials.size > 500) {
    for (const [k, exp] of auditedDenials) if (exp <= now) auditedDenials.delete(k);
    if (auditedDenials.size > 500) auditedDenials.clear();
  }
  const exp = auditedDenials.get(key);
  if (exp && exp > now) return false;
  auditedDenials.set(key, now + windowSeconds * 1000);
  return true;
}

export async function consumeRateLimit(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
  opts: { audit?: boolean } = {},
): Promise<RateLimitResult> {
  try {
    let allowed: boolean;
    let count: number | null = null;

    const ex = await admin.rpc('consume_rate_limit_ex', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (!ex.error && ex.data && typeof ex.data === 'object') {
      const d = ex.data as { allowed?: unknown; count?: unknown };
      allowed = d.allowed === true;
      count = typeof d.count === 'number' ? d.count : null;
    } else {
      if (ex.error && !isMissingRpc(ex.error)) {
        console.error('[rate-limit] RPC error:', ex.error.message);
        return 'error';
      }
      const { data, error } = await admin.rpc('consume_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) {
        console.error('[rate-limit] RPC error:', error.message);
        return 'error';
      }
      allowed = data === true;
    }
    if (allowed) return 'allowed';

    // Deny path only (never on an allowed call). ONE audit row per window - the first denial - so
    // a flood of denied requests cannot grow audit_logs without bound.
    // (Pass { audit: false } for pure de-duplication keys such as push:<id>, where a denial is routine.)
    const first = count !== null ? count === limit + 1 : markAuditedOnce(key, windowSeconds);
    if (first && opts.audit !== false) await recordRateLimitAudit(admin, key, limit, windowSeconds);
    return 'limited';
  } catch (err) {
    console.error('[rate-limit] RPC failure:', err instanceof Error ? err.message : 'unknown');
    return 'error';
  }
}

/**
 * Read the current hit count of a key WITHOUT consuming it (0 when the window has expired or the
 * key was never used). Lets a caller count only some outcomes (e.g. failed logins): check with this
 * before the action, then call consumeRateLimit() only on failure. Returns null on any error so the
 * caller can apply its own fail-open / fail-closed policy.
 */
export async function peekRateLimit(
  admin: SupabaseClient,
  key: string,
  windowSeconds: number,
): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from('api_rate_limits')
      .select('window_start, count')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      console.error('[rate-limit] peek error:', error.message);
      return null;
    }
    if (!data) return 0;
    const started = Date.parse(String(data.window_start));
    if (!Number.isFinite(started) || Date.now() - started >= windowSeconds * 1000) return 0;
    return typeof data.count === 'number' ? data.count : 0;
  } catch (err) {
    console.error('[rate-limit] peek failure:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short, non-reversible tag for an identifier that must not be stored raw (an IP address, a handle). */
async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Best-effort audit trail for a tripped rate limit. `key` is always
 * `<action>:<identifier>` (a user id, or an IP / handle - see call sites across
 * supabase/functions), so it is split back into the two for the log. A user id is kept as the
 * actor; any other identifier (IP address, handle) is stored only as a short hash so the audit
 * log holds no raw IPs.
 *
 * Awaited (an un-awaited promise is not guaranteed to finish before a Supabase Edge Function's
 * isolate is torn down after the response is sent). Its own failure is logged, never thrown - the
 * 429/503 the caller already decided on must not turn into a 500.
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
    const idTag = identifier && !actorId ? await shortHash(identifier) : null;
    const safeKey = actorId ? key : idTag ? `${action}:${idTag}` : key;

    const { error } = await admin.from('audit_logs').insert({
      actor_id: actorId,
      action: 'rate_limit_exceeded',
      entity_type: 'system',
      entity_id: null,
      metadata: {
        summary: `Rate limit exceeded for "${action}"${idTag ? ` (identifier hash: ${idTag})` : ''}`,
        limitKey: safeKey,
        limitAction: action,
        identifierHash: idTag,
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

function cleanIp(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().slice(0, 64);
  // Hex digits, dots and colons (IPv4 / IPv6) only; anything else is not an IP address.
  return v && /^[0-9a-fA-F:.]+$/.test(v) ? v.toLowerCase() : null;
}

/**
 * Best-effort client IP. The leftmost x-forwarded-for entry is whatever the CLIENT sent, so it is
 * never used. Order: cf-connecting-ip (set by Cloudflare, which fronts Supabase Edge), x-real-ip,
 * then the LAST x-forwarded-for hop (appended by the closest trusted proxy). Falls back to 'unknown'.
 */
export function clientIp(req: Request): string {
  const cf = cleanIp(req.headers.get('cf-connecting-ip'));
  if (cf) return cf;
  const real = cleanIp(req.headers.get('x-real-ip'));
  if (real) return real;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const last = cleanIp(hops[hops.length - 1]);
    if (last) return last;
  }
  return 'unknown';
}
