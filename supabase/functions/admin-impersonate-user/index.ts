// admin-impersonate-user
//
// Supabase Edge Function that lets an admin "view as user" for support
// purposes (the same idea as Intercom/Zendesk "log in as user"). It mints a
// one-time magic-link token for the target user's own email address.
//
// This exists because generating a session for another user requires the
// service-role key, and a service-role key must NEVER be shipped inside the
// client app (Expo/React Native bundle) - anyone with the compiled app could
// extract it and gain full database admin rights. Instead this function runs
// server-side, reads the service-role key from a server-only secret, and the
// client calls it via `supabase.functions.invoke()` passing only the
// caller's own auth token. The function verifies that token and the
// caller's admin role before doing anything privileged.
//
// SECURITY NOTE: this function deliberately does NOT hand back a full
// session for the target user - that would mean shipping a live refresh
// token through this response. Instead it only mints a one-time token
// (`tokenHash`, the `hashed_token`/`email_otp` from `generateLink`). The
// client is expected to immediately exchange it for a real session via:
//
//   supabase.auth.verifyOtp({ email, token: tokenHash, type: 'magiclink' })
//
// which keeps the privileged, service-role-only operation in this function
// to the smallest possible surface (minting the token), while the actual
// session exchange happens client-side using the public anon client, exactly
// like a normal magic-link login.
//
// Deployment:
//   supabase functions deploy admin-impersonate-user
//
// Required secret (already set for admin-delete-user, reused here - never
// committed to the repo and never added to any client-side .env file):
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
    console.error('[admin-impersonate-user] Missing required environment secrets.');
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
      { error: 'You cannot impersonate your own account. You are already viewing the app as yourself.' },
      400,
    );
  }

  // --- 4. Look up the target user and mint a one-time token --------------
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // The Auth admin API is the authoritative source for the actual login
    // email (it reflects what auth.users has, including any email changes
    // that may not yet be mirrored into profiles.email), so prefer it over
    // reading profiles.email directly.
    const { data: targetAuthData, error: targetAuthError } = await adminClient.auth.admin.getUserById(
      targetUserId,
    );

    if (targetAuthError || !targetAuthData?.user?.email) {
      return jsonResponse({ error: 'Target user not found.' }, 404);
    }

    const targetEmail = targetAuthData.user.email;

    // Best-effort lookup of a display name for the response; not required
    // for the impersonation flow itself, so failures here are non-fatal.
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', targetUserId)
      .maybeSingle();

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });

    if (linkError || !linkData?.properties) {
      console.error('[admin-impersonate-user] Failed to generate impersonation link:', linkError);
      return jsonResponse({ error: 'Failed to generate an impersonation session for this user.' }, 500);
    }

    // supabase-js v2's generateLink response shape has shifted slightly
    // across versions; check both known field names defensively.
    const tokenHash =
      (linkData.properties as Record<string, unknown>).hashed_token ??
      (linkData.properties as Record<string, unknown>).email_otp;

    if (typeof tokenHash !== 'string' || tokenHash.length === 0) {
      console.error('[admin-impersonate-user] generateLink response missing a usable token:', linkData.properties);
      return jsonResponse({ error: 'Failed to generate an impersonation session for this user.' }, 500);
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // --- 5. Record an audit log entry for who impersonated whom, and when.
    const { error: auditError } = await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'impersonation_started',
      entity_type: 'user',
      entity_id: targetUserId,
      metadata: {
        summary: `Admin ${callerUser.id} started impersonating user ${targetUserId} via admin-impersonate-user Edge Function`,
        reason: 'Admin-initiated support impersonation ("view as user")',
        targetIdRaw: targetUserId,
        targetEmail,
        actorRole: 'admin',
        expiresAt,
      },
      created_at: new Date().toISOString(),
    });

    if (auditError) {
      // The token has already been minted; do not fail the request over a
      // logging error, but surface it server-side for visibility.
      console.error('[admin-impersonate-user] Failed to write audit log entry:', auditError);
    }

    return jsonResponse(
      {
        email: targetEmail,
        tokenHash,
        targetUserId,
        targetName: targetProfile?.full_name ?? null,
        expiresAt,
      },
      200,
    );
  } catch (err) {
    console.error('[admin-impersonate-user] Unexpected error:', err);
    return jsonResponse({ error: 'Unexpected server error while starting impersonation.' }, 500);
  }
});
