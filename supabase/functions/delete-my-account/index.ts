// delete-my-account
//
// Self-service, irreversible account erasure (GDPR/NDPR "right to erasure" and the
// store-mandated in-app account deletion).
//
// Request:  POST { confirm: 'DELETE', password?: string, captchaToken?: string }
// Response: { success: true }
//
// Recent authentication (stolen / left-open sessions must not be able to erase an account):
//   The call is accepted only when ONE of these holds, otherwise it fails with
//   403 { error: 'reauth_required', code: 'reauth_required', message } and deletes nothing:
//     (a) the user authenticated within the last 10 minutes: the newest `amr[].timestamp` of the
//         access token (the time of the actual sign-in, which survives token refreshes), or the
//         token's `iat` when `amr` is absent;
//     (b) the body carries the user's CURRENT `password`, verified here with a fresh
//         signInWithPassword on an anon client (the throw-away session it creates is closed
//         immediately). If the project has CAPTCHA enabled, also send `captchaToken`.
//   Clients should react to `reauth_required` by asking for the password (and re-sending the
//   request with `password`) or by signing the user in again first. A wrong password answers
//   403 { error: 'invalid_password' }.
//
// Other requirements / guard rails:
//   * a valid, signed-in, NON-anonymous user (the caller can only ever delete themselves;
//     no user id is accepted from the client)
//   * administrator accounts cannot be self-deleted at all (409 admin_must_demote): they must be
//     demoted first. purge_user_data() refuses admin accounts atomically inside the database, so
//     this also guarantees the last admin can never be removed, with no check-then-delete race.
//   * 3 attempts per hour per user (durable rate limit, fails closed)
//
// Erasure order (see _shared/purge.ts). The Auth user is only deleted after the earlier
// steps succeeded, so a failed run leaves the account usable and the call is safe to retry
// (a failed run may already have removed some storage files; retrying completes it):
//   (a) remove every Storage object under `<uid>/` in every bucket
//   (b) purge_user_data(uid) - deletes the user's database rows
//   (c) auth.admin.deleteUser(uid)
//   (d) audit row with actor_id NULL (the actor no longer exists) and only a SHA-256 hash
//       of the user id, so the log holds no personal identifier.
//
// Deployment (verify_jwt ON):
//   supabase functions deploy delete-my-account
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key> ALLOWED_ORIGINS=<...>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { decodeJwtPayload, requireUser } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';
import { eraseUser, sha256Hex } from '../_shared/purge.ts';

const MAX_BODY_BYTES = 4096;
const REAUTH_WINDOW_SECONDS = 10 * 60;

/** Seconds-since-epoch of the user's most recent authentication, from the access token. */
function lastAuthAtSeconds(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  let newest: number | null = null;
  if (Array.isArray(payload.amr)) {
    for (const entry of payload.amr as Array<{ timestamp?: unknown }>) {
      const ts = typeof entry?.timestamp === 'number' ? entry.timestamp : null;
      if (ts !== null && (newest === null || ts > newest)) newest = ts;
    }
  }
  if (newest !== null) return newest;
  return typeof payload.iat === 'number' ? payload.iat : null;
}

function reauthRequired(req: Request): Response {
  return jsonResponse(
    req,
    {
      error: 'reauth_required',
      code: 'reauth_required',
      message: 'For your security, please confirm your password (or sign in again) before deleting your account.',
    },
    403,
  );
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[delete-my-account] Missing required environment secrets.');
    return jsonResponse(req, { error: 'Server misconfiguration.' }, 500);
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.caller.user.id;

  const parsed = await readJsonBody<{ confirm?: unknown; password?: unknown; captchaToken?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  if (parsed.value.confirm !== 'DELETE') {
    return jsonResponse(req, { error: 'Confirmation required: send { "confirm": "DELETE" }.' }, 400);
  }

  const callerEmail = (auth.caller.user.email ?? '').toLowerCase().trim();
  if (callerEmail === 'inememmanuel@gmail.com') {
    return jsonResponse(
      req,
      { error: 'The primary root administrator account cannot be deleted.' },
      403,
    );
  }

  // --- Recent authentication ------------------------------------------------------------------
  const password = typeof parsed.value.password === 'string' ? parsed.value.password : '';
  const lastAuth = lastAuthAtSeconds(auth.caller.token);
  const recentlyAuthenticated = lastAuth !== null && Date.now() / 1000 - lastAuth <= REAUTH_WINDOW_SECONDS;
  // Cheap refusal first: no password and no fresh sign-in means nothing is consumed or checked.
  if (!recentlyAuthenticated && (!password || password.length > 256)) return reauthRequired(req);

  const verdict = await consumeRateLimit(admin, `delete-account:${uid}`, 3, 60 * 60);
  if (verdict === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (verdict === 'limited') {
    return jsonResponse(req, { error: 'Too many attempts. Please try again later.' }, 429, {
      'Retry-After': '3600',
    });
  }

  if (!recentlyAuthenticated) {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey || !callerEmail) {
      console.error('[delete-my-account] Cannot verify the password (missing configuration or e-mail).');
      return reauthRequired(req);
    }
    const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const captchaToken =
      typeof parsed.value.captchaToken === 'string' && parsed.value.captchaToken ? parsed.value.captchaToken : undefined;
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: callerEmail,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (signInError || signIn?.user?.id !== uid) {
      if (signIn?.session) await anon.auth.signOut({ scope: 'local' }).catch(() => {});
      return jsonResponse(req, { error: 'invalid_password', message: 'That password is not correct.' }, 403);
    }
    // Close the throw-away session this check created (local scope: the user's other sessions are untouched).
    await anon.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  try {
    // Super-admin & admin guards:
    // Root Super Admin and Super Admins cannot be deleted via self-service deletion, and no
    // administrator can (demote first; purge_user_data() enforces the same rule in the database).
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role, admin_role, email')
      .eq('id', uid)
      .maybeSingle();
    if (profileError) throw profileError;

    if (
      profile?.admin_role === 'super_admin' ||
      profile?.email?.toLowerCase().trim() === 'inememmanuel@gmail.com'
    ) {
      return jsonResponse(
        req,
        { error: 'Super Administrator accounts cannot be deleted through self-service deletion.' },
        403,
      );
    }

    if (profile?.role === 'admin') {
      return jsonResponse(
        req,
        {
          error: 'admin_must_demote',
          message: 'Administrator accounts cannot be deleted directly. Ask another administrator to remove your admin role first.',
        },
        409,
      );
    }

    // (a)-(c) storage -> database rows -> Auth user. Throws before deleting the
    // Auth user if an earlier step failed.
    try {
      await eraseUser(admin, uid);
    } catch (err) {
      const step = err instanceof Error ? err.message : 'unknown';
      const cause = (err as { cause?: { message?: string } })?.cause?.message;
      console.error(`[delete-my-account] erase failed at ${step}:`, cause ?? '');
      return jsonResponse(
        req,
        {
          error:
            'We could not finish deleting your account. Some of your files may already have been removed, but your account is still active. Please try again; retrying is safe and will complete the deletion.',
        },
        500,
      );
    }

    // (d) audit. The actor is gone, so actor_id/entity_id are NULL and only a hash of
    // the id is kept.
    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: null,
      action: 'account_self_deleted',
      entity_type: 'user',
      entity_id: null,
      metadata: { deletedUserIdHash: await sha256Hex(uid), method: 'self_service' },
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      console.error('[delete-my-account] Failed to write audit log entry:', auditError.message);
    }

    return jsonResponse(req, { success: true }, 200);
  } catch (err) {
    console.error('[delete-my-account] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'We could not delete your account right now. Please try again.' }, 500);
  }
});
