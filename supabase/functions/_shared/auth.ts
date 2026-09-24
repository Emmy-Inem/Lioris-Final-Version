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

/**
 * True when the user has a verified MFA factor. Fails CLOSED (returns true) when that
 * cannot be determined, so an outage never turns into "no MFA needed".
 */
async function hasVerifiedMfaFactor(user: User): Promise<boolean> {
  if (Array.isArray(user.factors)) {
    return user.factors.some((f) => f.status === 'verified');
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return true;
  try {
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    if (error) return true;
    return (data?.factors ?? []).some((f) => f.status === 'verified');
  } catch {
    return true;
  }
}

/**
 * Admin-only, with an MFA (AAL2) check controlled by the REQUIRE_ADMIN_MFA secret:
 *   'true'   - always require AAL2.
 *   'false'  - never require it.
 *   unset    - require AAL2 only for admins who have enrolled a TOTP factor.
 *
 * The unset default matches the app's own policy (src/auth/mfaPolicy.ts: two-factor is
 * voluntary and not forced on any role). The old default was "always", which made every
 * admin action fail with `mfa_required` for admins who never enrolled - and the login
 * flow never steps a session up to AAL2, so those admins had no way to satisfy it.
 * An admin who has enrolled a factor is still required to prove it (the app prompts for
 * the 6-digit code and retries).
 */
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
  const mfaMode = Deno.env.get('REQUIRE_ADMIN_MFA');
  if (requireMfa && mfaMode !== 'false' && caller.aal !== 'aal2') {
    const mustStepUp = mfaMode === 'true' || (await hasVerifiedMfaFactor(caller.user));
    if (mustStepUp) {
      return { ok: false, response: jsonResponse(req, { error: 'mfa_required' }, 403) };
    }
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
