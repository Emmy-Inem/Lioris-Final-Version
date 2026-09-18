// Shared authentication / authorisation helpers for Lioris edge functions.

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

export interface AuthedCaller {
  user: User;
  token: string;
  callerClient: SupabaseClient;
  /** JWT `aal` claim: 'aal1' | 'aal2' | undefined */
  aal: string | undefined;
}

export type AuthResult = { ok: true; caller: AuthedCaller } | { ok: false; response: Response };

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/** Decode (NOT verify) the JWT payload. Only call this on a token that getUser() already validated. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Requires a valid, signed-in, NON-anonymous user. The anon/publishable key on its
 * own is not a user and is rejected because Auth's getUser() returns no user for it.
 */
export async function requireUser(req: Request): Promise<AuthResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[auth] Missing SUPABASE_URL / SUPABASE_ANON_KEY.');
    return { ok: false, response: jsonResponse(req, { error: 'Server misconfiguration.' }, 500) };
  }

  const token = bearerToken(req);
  if (!token) {
    return { ok: false, response: jsonResponse(req, { error: 'Missing Authorization header.' }, 401) };
  }

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let user: User | null = null;
  try {
    const { data, error } = await callerClient.auth.getUser(token);
    if (!error) user = data?.user ?? null;
  } catch {
    user = null;
  }
  if (!user?.id || user.is_anonymous === true) {
    return { ok: false, response: jsonResponse(req, { error: 'Invalid or expired session.' }, 401) };
  }

  const payload = decodeJwtPayload(token);
  const aal = typeof payload?.aal === 'string' ? payload.aal : undefined;
  return { ok: true, caller: { user, token, callerClient, aal } };
}

/** Admin-only. Also enforces AAL2 (MFA) unless REQUIRE_ADMIN_MFA === 'false'. */
export async function requireAdmin(req: Request, opts: { requireMfa?: boolean } = {}): Promise<AuthResult> {
  const result = await requireUser(req);
  if (!result.ok) return result;
  const { caller } = result;

  const { data: profile, error } = await caller.callerClient
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', caller.user.id)
    .single();

  if (error || !profile || profile.role !== 'admin' || profile.is_suspended === true) {
    return {
      ok: false,
      response: jsonResponse(req, { error: 'Forbidden. Admin privileges are required to perform this action.' }, 403),
    };
  }

  const requireMfa = opts.requireMfa ?? true;
  if (requireMfa && Deno.env.get('REQUIRE_ADMIN_MFA') !== 'false' && caller.aal !== 'aal2') {
    return { ok: false, response: jsonResponse(req, { error: 'mfa_required' }, 403) };
  }
  return result;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Constant-time string comparison (for shared secrets). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Always iterate over the longer length so timing does not leak the length match.
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
