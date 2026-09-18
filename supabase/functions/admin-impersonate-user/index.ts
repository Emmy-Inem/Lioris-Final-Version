// admin-impersonate-user
//
// Supabase Edge Function that lets an admin "view as user" for support purposes
// (the same idea as Intercom/Zendesk "log in as user"). It mints a one-time
// magic-link token for the target user's own email address.
//
// This exists because generating a session for another user requires the
// service-role key, which must NEVER be shipped inside the client app. This
// function runs server-side, reads the key from a server-only secret, and
// verifies the caller before doing anything privileged.
//
// Request (start):  POST { targetUserId: uuid, reason: string (>= 10 chars) }
// Response (start): { email, tokenHash, targetUserId, targetName, expiresAt }
// Request (end):    POST { action: 'end', targetUserId: uuid }
// Response (end):   { success: true }   (audit only; no token is minted)
//
// Guard rails (all enforced server-side):
//   * caller must be a non-suspended admin AND hold an AAL2 (MFA) session
//     (403 { error: 'mfa_required' }; REQUIRE_ADMIN_MFA=false disables this)
//   * `reason` (>= 10 chars) is mandatory and stored in the audit log
//   * only NON-ADMIN targets can be impersonated (students, alumni, staff); admins
//     cannot impersonate other admins, and cannot impersonate themselves
//   * 10 impersonations per admin per hour (durable rate limit, fails closed)
//   * the audit row is written BEFORE the token is returned; if it cannot be
//     written no token is handed out
//   * 'end' must be called with the ADMIN's own session (the client has to restore
//     the admin session first), so it needs admin + AAL2 as well.
//
// IMPORTANT LIMITATION: the session created from `tokenHash` is a REAL Supabase Auth
// session (access + refresh token) for the target user. It cannot be time-limited
// server-side: `expiresAt` is advisory for the client UI only, and the magic-link
// token itself expires per the project's OTP expiry setting. The compensating
// control is the append-only audit trail (impersonation_started / impersonation_ended
// with actor, target, reason and timestamps) plus the admin-only + MFA gate above.
//
// The token is intentionally NOT a full session: the client exchanges it with
//   supabase.auth.verifyOtp({ email, token_hash: tokenHash, type: 'magiclink' })
//
// Deployment (verify_jwt ON):
//   supabase functions deploy admin-impersonate-user
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key> ALLOWED_ORIGINS=<...>

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 4096;
const MIN_REASON_CHARS = 10;
const MAX_REASON_CHARS = 500;
const IMPERSONATION_LIMIT = 10;
const IMPERSONATION_WINDOW_SECONDS = 60 * 60;
const ADVISORY_TTL_MS = 15 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-impersonate-user] Missing required environment secrets.');
    return jsonResponse(req, { error: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  // --- 1. Caller must be an admin with an MFA (AAL2) session ----------------
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { user: callerUser } = auth.caller;

  // --- 2. Validate the request body -----------------------------------------
  const parsed = await readJsonBody<{ action?: unknown; targetUserId?: unknown; reason?: unknown }>(
    req,
    MAX_BODY_BYTES,
  );
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  const { action, targetUserId } = parsed.value;

  if (!isUuid(targetUserId)) {
    return jsonResponse(req, { error: 'targetUserId is required and must be a valid user id.' }, 400);
  }
  if (targetUserId === callerUser.id) {
    return jsonResponse(
      req,
      { error: 'You cannot impersonate your own account. You are already viewing the app as yourself.' },
      400,
    );
  }

  // --- 3a. End of an impersonation: audit only, no token ---------------------
  if (action === 'end') {
    const { error: endAuditError } = await admin.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'impersonation_ended',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Admin ${callerUser.id} ended impersonation of user ${targetUserId}`,
        targetIdRaw: targetUserId,
        actorRole: 'admin',
      },
      created_at: new Date().toISOString(),
    });
    if (endAuditError) {
      console.error('[admin-impersonate-user] Failed to write end audit entry:', endAuditError.message);
      return jsonResponse(req, { error: 'Failed to record the end of impersonation.' }, 500);
    }
    return jsonResponse(req, { success: true }, 200);
  }
  if (action !== undefined && action !== 'start') {
    return jsonResponse(req, { error: 'Unknown action.' }, 400);
  }

  // --- 3b. Start: reason + rate limit ---------------------------------------
  const reason = typeof parsed.value.reason === 'string' ? parsed.value.reason.trim() : '';
  if (reason.length < MIN_REASON_CHARS || reason.length > MAX_REASON_CHARS) {
    return jsonResponse(
      req,
      { error: `reason is required (${MIN_REASON_CHARS}-${MAX_REASON_CHARS} characters).` },
      400,
    );
  }

  const verdict = await consumeRateLimit(
    admin,
    `impersonate:${callerUser.id}`,
    IMPERSONATION_LIMIT,
    IMPERSONATION_WINDOW_SECONDS,
  );
  if (verdict === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (verdict === 'limited') {
    return jsonResponse(req, { error: 'Impersonation rate limit reached. Try again later.' }, 429, {
      'Retry-After': '3600',
    });
  }

  // --- 4. Look up the target and mint a one-time token ------------------------
  try {
    const { data: targetProfile, error: profileError } = await admin
      .from('profiles')
      .select('role, full_name')
      .eq('id', targetUserId)
      .maybeSingle();
    if (profileError || !targetProfile) {
      return jsonResponse(req, { error: 'Target user not found.' }, 404);
    }
    if (targetProfile.role === 'admin') {
      return jsonResponse(req, { error: 'Admin accounts cannot be impersonated.' }, 403);
    }

    // The Auth admin API is the authoritative source for the actual login email.
    const { data: targetAuthData, error: targetAuthError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuthData?.user?.email) {
      return jsonResponse(req, { error: 'Target user not found.' }, 404);
    }
    const targetEmail = targetAuthData.user.email;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });
    if (linkError || !linkData?.properties) {
      console.error('[admin-impersonate-user] Failed to generate impersonation link:', linkError?.message);
      return jsonResponse(req, { error: 'Failed to generate an impersonation session for this user.' }, 500);
    }

    // supabase-js v2's generateLink response shape has shifted across versions;
    // check both known field names defensively.
    const props = linkData.properties as Record<string, unknown>;
    const tokenHash = props.hashed_token ?? props.email_otp;
    if (typeof tokenHash !== 'string' || tokenHash.length === 0) {
      console.error('[admin-impersonate-user] generateLink response missing a usable token.');
      return jsonResponse(req, { error: 'Failed to generate an impersonation session for this user.' }, 500);
    }

    const expiresAt = new Date(Date.now() + ADVISORY_TTL_MS).toISOString();

    // --- 5. Audit BEFORE handing the token out (fail closed) --------------------
    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'impersonation_started',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Admin ${callerUser.id} started impersonating user ${targetUserId} via admin-impersonate-user`,
        reason,
        targetIdRaw: targetUserId,
        targetRole: targetProfile.role,
        actorRole: 'admin',
        mfa: auth.caller.aal ?? null,
        expiresAt,
      },
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      console.error('[admin-impersonate-user] Failed to write audit entry, withholding token:', auditError.message);
      return jsonResponse(req, { error: 'Failed to record the impersonation. Not started.' }, 500);
    }

    return jsonResponse(
      req,
      {
        email: targetEmail,
        tokenHash,
        targetUserId,
        targetName: targetProfile.full_name ?? null,
        expiresAt,
      },
      200,
    );
  } catch (err) {
    console.error('[admin-impersonate-user] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'Unexpected server error while starting impersonation.' }, 500);
  }
});
