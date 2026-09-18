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
    return data === true ? 'allowed' : 'limited';
  } catch (err) {
    console.error('[rate-limit] RPC failure:', err instanceof Error ? err.message : 'unknown');
    return 'error';
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
