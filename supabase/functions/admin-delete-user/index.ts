// admin-delete-user
//
// Supabase Edge Function that permanently deletes a user's Auth account
// (login credentials) in addition to their `profiles` row.
//
// This exists because `supabase.auth.admin.deleteUser()` requires the
// service-role key, and a service-role key must NEVER be shipped inside the
// client app (Expo/React Native bundle) - anyone with the compiled app could
// extract it and gain full database admin rights. Instead this function runs
// server-side, reads the service-role key from a server-only secret, and the
// client calls it via `supabase.functions.invoke()` passing only the
// caller's own auth token. The function verifies that token and the
// caller's admin role before doing anything privileged.
//
// Deployment:
//   supabase functions deploy admin-delete-user
//
// Required secret (set once per project, never committed to the repo and
// never added to any client-side .env file):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
//
// SUPABASE_URL is provided automatically to Edge Functions at runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    console.error('[admin-delete-user] Missing required environment secrets.');
    return jsonResponse({ error: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  // --- 1. Extract and verify the caller's JWT ---------------------------
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401);
  }

  // Client scoped to the CALLER's own JWT - used only to verify identity
  // and role. This client must never be used to perform privileged writes.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: callerUser },
    error: callerAuthError,
  } = await callerClient.auth.getUser();

  if (callerAuthError || !callerUser) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401);
  }

  // --- 2. Verify caller is an admin --------------------------------------
  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerUser.id)
    .single();

  if (callerProfileError || !callerProfile || callerProfile.role !== 'admin') {
    return jsonResponse({ error: 'Forbidden. Admin privileges are required to perform this action.' }, 403);
  }

  // --- 3. Parse and validate the request body ----------------------------
  let body: { targetUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  const targetUserId = body?.targetUserId;
  if (typeof targetUserId !== 'string' || targetUserId.trim().length === 0) {
    return jsonResponse({ error: 'targetUserId is required and must be a non-empty string.' }, 400);
  }

  if (targetUserId === callerUser.id) {
    return jsonResponse(
      { error: 'You cannot delete your own account through this action. Use account settings instead.' },
      400,
    );
  }

  // --- 4. Perform the privileged deletion with a service-role client -----
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // (a) Delete the Auth user FIRST. If this fails nothing has changed, whereas
    // deleting the profile first used to leave a login with no profile behind
    // whenever the Auth deletion failed. profiles -> auth.users is ON DELETE
    // CASCADE, so this normally removes the profile row too.
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (authDeleteError) {
      console.error('[admin-delete-user] Failed to delete auth user:', authDeleteError);
      return jsonResponse({ error: `Failed to delete auth account: ${authDeleteError.message}` }, 500);
    }

    // (b) Explicit cleanup in case that cascade ever changes (no-op otherwise).
    const { error: profileDeleteError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (profileDeleteError) {
      console.error('[admin-delete-user] Failed to delete profile row:', profileDeleteError);
      return jsonResponse({ error: `Auth account deleted but profile cleanup failed: ${profileDeleteError.message}` }, 500);
    }

    // (c) Record an audit log entry for who performed the deletion and when.
    const { error: auditError } = await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'user_account_deleted',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Fully deleted account ${targetUserId} (profile + Auth login) via admin-delete-user Edge Function`,
        reason: 'Admin-initiated full account deletion',
        targetIdRaw: targetUserId,
        actorRole: 'admin',
      },
      created_at: new Date().toISOString(),
    });

    if (auditError) {
      // The deletion itself already succeeded; do not fail the request over
      // a logging error, but surface it server-side for visibility.
      console.error('[admin-delete-user] Failed to write audit log entry:', auditError);
    }

    return jsonResponse({ success: true, deletedUserId: targetUserId }, 200);
  } catch (err) {
    console.error('[admin-delete-user] Unexpected error:', err);
    return jsonResponse({ error: 'Unexpected server error while deleting the account.' }, 500);
  }
});
