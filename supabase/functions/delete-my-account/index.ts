// delete-my-account
//
// Self-service, irreversible account erasure (GDPR/NDPR "right to erasure" and the
// store-mandated in-app account deletion).
//
// Request:  POST { confirm: 'DELETE' }   (exactly that string)
// Response: { success: true }
//
// Requirements / guard rails:
//   * a valid, signed-in, NON-anonymous user (the caller can only ever delete themselves;
//     no user id is accepted from the client)
//   * the last remaining active admin cannot delete themselves (promote someone else first)
//   * 3 attempts per hour per user (durable rate limit, fails closed)
//
// Erasure order (see _shared/purge.ts). The Auth user is only deleted after the earlier
// steps succeeded, so a failed run leaves the account usable and the call is safe to retry:
//   (a) remove every Storage object under `<uid>/` in avatars, resources, campus-media,
//       verifications
//   (b) purge_user_data(uid) - deletes the user's database rows
//   (c) auth.admin.deleteUser(uid)
//   (d) audit row with actor_id NULL (the actor no longer exists) and only a SHA-256 hash
//       of the user id, so the log holds no personal identifier.
//
// Deployment (verify_jwt ON):
//   supabase functions deploy delete-my-account
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key> ALLOWED_ORIGINS=<...>

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';
import { countActiveAdmins, eraseUser, sha256Hex } from '../_shared/purge.ts';

const MAX_BODY_BYTES = 1024;

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

  const parsed = await readJsonBody<{ confirm?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  if (parsed.value.confirm !== 'DELETE') {
    return jsonResponse(req, { error: 'Confirmation required: send { "confirm": "DELETE" }.' }, 400);
  }

  const verdict = await consumeRateLimit(admin, `delete-account:${uid}`, 3, 60 * 60);
  if (verdict === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (verdict === 'limited') {
    return jsonResponse(req, { error: 'Too many attempts. Please try again later.' }, 429, {
      'Retry-After': '3600',
    });
  }

  try {
    // Last-admin guard: the platform must always keep at least one active admin.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role === 'admin') {
      const others = await countActiveAdmins(admin, uid);
      if (others < 1) {
        return jsonResponse(
          req,
          { error: 'You are the last active admin. Promote another admin before deleting your account.' },
          409,
        );
      }
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
        { error: 'We could not delete your account right now. Nothing was lost; please try again.' },
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
