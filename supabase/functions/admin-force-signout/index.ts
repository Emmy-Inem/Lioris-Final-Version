// admin-force-signout
//
// Supabase Edge Function behind the admin "Force Sign Out" action: revokes a
// target user's Supabase Auth refresh tokens everywhere (every phone, browser
// and tab they are currently signed into), without suspending or deleting
// their account. They can sign back in immediately - this only kills the
// LIVE session, which is exactly what you want when a session (not the
// password) looks compromised and admin-manage-* actions like suspend/delete
// are too heavy or too slow.
//
// This exists because `supabase.auth.admin.signOut()` requires the
// service-role key, which must NEVER be shipped inside the client app
// (Expo/React Native bundle). This function runs server-side, reads the key
// from a server-only secret, and verifies the caller before doing anything
// privileged.
//
// Guard rails (all enforced server-side):
//   * caller must be a non-suspended admin (AAL2 step-up when they enrolled a factor)
//   * self-signout is refused (use the ordinary "Sign Out All Other Active Sessions"
//     control in Settings instead - this function is for acting on OTHER users)
//   * 30 forced sign-outs per admin per hour
//   * every call is written to audit_logs with the acting admin, win or lose
//
// Request:  POST { targetUserId: uuid }
// Response: { success: true, targetUserId }  or  { error, message }
//
// Deployment (verify_jwt ON):
//   supabase functions deploy admin-force-signout
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key> ALLOWED_ORIGINS=<...>
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically at runtime.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 1024;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-force-signout] Missing required environment secrets.');
    return jsonResponse(req, { error: 'server_misconfigured', message: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  // --- 1. Caller must be an admin (with an MFA step-up if they enrolled a factor) ---
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { user: callerUser } = auth.caller;

  // --- 2. Validate the request body ------------------------------------------------
  const parsed = await readJsonBody<{ targetUserId?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: 'bad_request', message: parsed.error }, parsed.status);

  const targetUserId = parsed.value.targetUserId;
  if (!isUuid(targetUserId)) {
    return jsonResponse(req, { error: 'bad_request', message: 'targetUserId is required and must be a valid user id.' }, 400);
  }

  if (targetUserId === callerUser.id) {
    return jsonResponse(
      req,
      { error: 'bad_request', message: 'You cannot force-sign-out your own session through this action. Use "Sign Out All Other Active Sessions" in Settings instead.' },
      400,
    );
  }

  const limited = await consumeRateLimit(admin, `force-signout:${callerUser.id}`, 30, 3600);
  if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many forced sign-outs. Try again later.' }, 429);
  if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

  try {
    // --- 3. Target must exist ------------------------------------------------------
    const { data: targetProfile, error: profileError } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('id', targetUserId)
      .maybeSingle();
    if (profileError) {
      console.error('[admin-force-signout] profile lookup failed:', profileError.message);
      return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error while signing this user out.' }, 500);
    }
    if (!targetProfile) {
      return jsonResponse(req, { error: 'not_found', message: 'That user does not exist.' }, 404);
    }

    // --- 4. Revoke every refresh token for this user, everywhere --------------------
    const { error: signOutError } = await admin.auth.admin.signOut(targetUserId, 'global');
    if (signOutError) {
      console.error('[admin-force-signout] auth.admin.signOut failed:', signOutError.message);
      return jsonResponse(req, { error: 'server_error', message: 'Could not end that session. Nothing was changed; it is safe to retry.' }, 500);
    }

    // --- 5. Audit (who, whom) --------------------------------------------------------
    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'user_force_signed_out',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Force-signed out ${targetProfile.full_name ?? targetUserId} (all devices, session revoked globally)`,
        targetIdRaw: targetUserId,
        actorRole: 'admin',
        mfa: auth.caller.aal ?? null,
      },
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      // The sign-out already succeeded; surface for visibility, do not fail the request.
      console.error('[admin-force-signout] Failed to write audit log entry:', auditError.message);
    }

    return jsonResponse(req, { success: true, targetUserId }, 200);
  } catch (err) {
    console.error('[admin-force-signout] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error while signing this user out.' }, 500);
  }
});
