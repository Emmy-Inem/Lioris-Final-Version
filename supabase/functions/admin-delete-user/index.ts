// admin-delete-user
//
// Supabase Edge Function that permanently and completely erases another user's
// account: Storage objects, all database rows (purge_user_data) and the Auth login.
//
// This exists because `supabase.auth.admin.deleteUser()` requires the
// service-role key, and a service-role key must NEVER be shipped inside the
// client app (Expo/React Native bundle). This function runs server-side, reads the
// key from a server-only secret, and verifies the caller before doing anything
// privileged.
//
// Guard rails (all enforced server-side):
//   * caller must be a non-suspended admin AND have an AAL2 (MFA) session
//     (403 { error: 'mfa_required' } otherwise; set REQUIRE_ADMIN_MFA=false to disable)
//   * body must include `reason` (string, >= 10 characters) - written to the audit log
//   * self-deletion is refused (use delete-my-account)
//   * admin accounts cannot be deleted here: demote first. This also guarantees the
//     last admin can never be removed through this function.
//   * shares its erasure routine (_shared/purge.ts) with delete-my-account so admin
//     deletions never orphan storage files or database rows. Retrying is safe.
//
// Request:  POST { targetUserId: uuid, reason: string }
// Response: { success: true, deletedUserId }
//
// Deployment (verify_jwt ON):
//   supabase functions deploy admin-delete-user
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key> ALLOWED_ORIGINS=<...>
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically at runtime.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { createServiceClient } from '../_shared/ratelimit.ts';
import { eraseUser } from '../_shared/purge.ts';

const MAX_BODY_BYTES = 4096;
const MIN_REASON_CHARS = 10;
const MAX_REASON_CHARS = 500;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-delete-user] Missing required environment secrets.');
    return jsonResponse(req, { error: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  // --- 1. Caller must be an admin with an MFA (AAL2) session ----------------
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { user: callerUser } = auth.caller;

  // --- 2. Validate the request body -----------------------------------------
  const parsed = await readJsonBody<{ targetUserId?: unknown; reason?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);

  const targetUserId = parsed.value.targetUserId;
  if (!isUuid(targetUserId)) {
    return jsonResponse(req, { error: 'targetUserId is required and must be a valid user id.' }, 400);
  }
  const reason = typeof parsed.value.reason === 'string' ? parsed.value.reason.trim() : '';
  if (reason.length < MIN_REASON_CHARS || reason.length > MAX_REASON_CHARS) {
    return jsonResponse(
      req,
      { error: `reason is required (${MIN_REASON_CHARS}-${MAX_REASON_CHARS} characters).` },
      400,
    );
  }

  if (targetUserId === callerUser.id) {
    return jsonResponse(
      req,
      { error: 'You cannot delete your own account through this action. Use account settings instead.' },
      400,
    );
  }

  try {
    // --- 3. Target checks (service role: bypasses RLS) ----------------------
    const { data: targetProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .maybeSingle();
    if (profileError) {
      console.error('[admin-delete-user] profile lookup failed:', profileError.message);
      return jsonResponse(req, { error: 'Unexpected server error while deleting the account.' }, 500);
    }

    // Admins must be demoted first. Because no admin can be deleted here, this
    // function can never remove the last remaining admin either.
    if (targetProfile?.role === 'admin') {
      return jsonResponse(
        req,
        { error: 'Admin accounts cannot be deleted directly. Demote the user first.' },
        409,
      );
    }

    // --- 4. Erase: storage -> DB rows -> Auth user --------------------------
    try {
      await eraseUser(admin, targetUserId);
    } catch (err) {
      const step = err instanceof Error ? err.message : 'unknown';
      const cause = (err as { cause?: { message?: string } })?.cause?.message;
      console.error(`[admin-delete-user] erase failed at ${step}:`, cause ?? '');
      return jsonResponse(
        req,
        { error: 'Failed to fully delete the account. Nothing further was removed; it is safe to retry.', step },
        500,
      );
    }

    // --- 5. Audit (who, whom, why) ------------------------------------------
    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'user_account_deleted',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Fully deleted account ${targetUserId} (storage + data + Auth login) via admin-delete-user`,
        reason,
        method: 'admin_delete',
        targetIdRaw: targetUserId,
        targetRole: targetProfile?.role ?? null,
        actorRole: 'admin',
        mfa: auth.caller.aal ?? null,
      },
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      // The deletion already succeeded; surface for visibility, do not fail the request.
      console.error('[admin-delete-user] Failed to write audit log entry:', auditError.message);
    }

    return jsonResponse(req, { success: true, deletedUserId: targetUserId }, 200);
  } catch (err) {
    console.error('[admin-delete-user] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'Unexpected server error while deleting the account.' }, 500);
  }
});
