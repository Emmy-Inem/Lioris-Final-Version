// admin-create-user
//
// Provisions an account for somebody else (Admin > User Directory > "Create user"). This used to run in
// the browser: it called signUp() with the public key (so CAPTCHA, per-IP sign-up limits and the
// "confirm your e-mail" message all applied to the ADMIN's request), then upserted the profile with the
// admin's own session, with a random invented matric number. All of it is now done here with the
// service role, and the caller's authority is checked on the server:
//
//   * Super Admin: any campus, any role (including admin with an explicit tier).
//   * Campus Admin: ONLY their own campus, and only student / alumni / staff.
//   * nobody else.
//
// Request:  POST { email, fullName, role, campusCode, department?, matricNo?, adminRole?, redirectTo? }
// Success:  200 { userId, inviteSent }
// Errors:   { error: '<code>', message } - 400 validation, 403 scope, 409 email_exists, 429 rate_limited
//
// Deployment:
//   supabase functions deploy admin-create-user
//   (verify_jwt = true in supabase/config.toml; needs SUPABASE_SERVICE_ROLE_KEY and ALLOWED_ORIGINS.)

import { allowedOrigins, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isCallerSuperAdmin, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 4096;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Role = 'student' | 'alumni' | 'staff' | 'admin';
const ROLES: Role[] = ['student', 'alumni', 'staff', 'admin'];

function cleanUsername(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 18);
  return base.length >= 3 ? base : `user${base}`.slice(0, 18);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-create-user] Missing required environment secrets.');
    return jsonResponse(req, { error: 'server_error', message: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;
  const callerIsSuper = isCallerSuperAdmin(caller);
  const callerCampus = (caller.profile?.campus_code ?? '').toUpperCase();

  const parsed = await readJsonBody<Record<string, unknown>>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: 'bad_request', message: parsed.error }, parsed.status);
  const body = parsed.value;

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const role = (typeof body.role === 'string' ? body.role.trim().toLowerCase() : '') as Role;
  const campusCode = (typeof body.campusCode === 'string' ? body.campusCode.trim().toUpperCase() : '');
  const department = typeof body.department === 'string' ? body.department.trim().slice(0, 120) : '';
  const matricNo = typeof body.matricNo === 'string' ? body.matricNo.trim().slice(0, 40) : '';
  const adminRole = typeof body.adminRole === 'string' ? body.adminRole.trim() : '';

  if (!EMAIL_RE.test(email) || email.length > 254) return jsonResponse(req, { error: 'invalid_email', message: 'Enter a valid e-mail address.' }, 400);
  if (fullName.length < 2 || fullName.length > 120) return jsonResponse(req, { error: 'invalid_name', message: 'Enter the person\'s full name.' }, 400);
  if (!ROLES.includes(role)) return jsonResponse(req, { error: 'invalid_role', message: 'Unknown role.' }, 400);

  // ---- authority ----------------------------------------------------------------------------
  if (!callerIsSuper) {
    if (role === 'admin') {
      return jsonResponse(req, { error: 'forbidden', message: 'Only a Super Admin can create administrator accounts.' }, 403);
    }
    if (!callerCampus || callerCampus === 'GLOBAL') {
      return jsonResponse(req, { error: 'forbidden', message: 'Your account has no campus assignment, so it cannot create members.' }, 403);
    }
    if (campusCode !== callerCampus) {
      return jsonResponse(req, { error: 'forbidden', message: 'You can only create members for your own campus.' }, 403);
    }
  }
  if (role === 'admin' && adminRole !== 'super_admin' && adminRole !== 'campus_admin') {
    return jsonResponse(req, { error: 'invalid_admin_role', message: 'Choose Super Admin or Campus Admin.' }, 400);
  }
  if (role === 'admin' && adminRole === 'campus_admin' && (campusCode === '' || campusCode === 'GLOBAL')) {
    return jsonResponse(req, { error: 'campus_required', message: 'A Campus Admin needs a real campus.' }, 400);
  }
  if (!campusCode) return jsonResponse(req, { error: 'campus_required', message: 'Choose a campus.' }, 400);

  const { data: campusRow } = await admin.from('campuses').select('code, is_active').eq('code', campusCode).maybeSingle();
  if (!campusRow || (campusCode !== 'GLOBAL' && campusRow.is_active === false)) {
    return jsonResponse(req, { error: 'invalid_campus', message: 'That campus does not exist or is not active.' }, 400);
  }

  const limited = await consumeRateLimit(admin, `admin-create-user:${caller.user.id}`, 30, 3600);
  if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many accounts created. Try again later.' }, 429);
  if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

  // ---- create the login ------------------------------------------------------------------------
  // The sign-up trigger builds the profile (role is only ever student/alumni there; the real role is set below).
  const baseHandle = cleanUsername(email);
  const metadata = {
    full_name: fullName,
    username: baseHandle,
    role: role === 'alumni' ? 'alumni' : 'student',
    campus_code: campusCode,
    provisioned_by: caller.user.id,
  };
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });
  if (created.error || !created.data?.user) {
    const msg = (created.error?.message ?? '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || (created.error as { code?: string } | null)?.code === 'email_exists') {
      return jsonResponse(req, { error: 'email_exists', message: 'An account with that e-mail address already exists.' }, 409);
    }
    console.error('[admin-create-user] createUser failed:', created.error?.message);
    return jsonResponse(req, { error: 'server_error', message: 'The account could not be created. Please try again.' }, 500);
  }
  const userId = created.data.user.id;

  // ---- finish the profile (service role: the escalation guard lets server-side writes through) ----
  const update: Record<string, unknown> = {
    full_name: fullName,
    role,
    admin_role: role === 'admin' ? adminRole : null,
    campus_code: campusCode,
    department: department || null,
    // A person an administrator vouched for in person; students still verify normally if left unverified.
    verification_status: 'verified',
    onboarding_complete: role === 'admin' || role === 'staff',
    student_id_number: matricNo || null, // never invented
  };
  let profileError = (await admin.from('profiles').update(update).eq('id', userId)).error;
  if (profileError) {
    // Most likely a taken username default; the profile row exists, so retry once without touching it.
    console.error('[admin-create-user] profile update failed:', profileError.message);
    profileError = (await admin.from('profiles').update({ ...update, student_id_number: null }).eq('id', userId)).error;
  }
  if (profileError) {
    // Do not leave a half-built account behind.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return jsonResponse(req, { error: 'server_error', message: 'The profile could not be completed, so nothing was created. Please try again.' }, 500);
  }

  // ---- invitation: the person chooses their own password ---------------------------------------
  const requested = typeof body.redirectTo === 'string' ? body.redirectTo.trim() : '';
  const origins = allowedOrigins();
  let redirectTo = origins.find((o) => o.startsWith('https://')) ? `${origins.find((o) => o.startsWith('https://'))}/reset-password` : undefined;
  try {
    if (requested && origins.includes(new URL(requested).origin)) redirectTo = requested;
  } catch {
    // ignore a malformed redirect and keep the default
  }
  const { error: inviteError } = await admin.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (inviteError) console.error('[admin-create-user] invite e-mail failed:', inviteError.message);

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action: 'user_created',
    entity_type: 'user',
    entity_id: userId,
    metadata: {
      summary: `Created a ${role}${role === 'admin' ? ` (${adminRole})` : ''} account for ${fullName} on ${campusCode}`,
      institutionCode: campusCode,
      targetRole: role,
      actorRole: callerIsSuper ? 'super_admin' : 'campus_admin',
    },
    created_at: new Date().toISOString(),
  });
  if (auditError) console.error('[admin-create-user] audit write failed:', auditError.message);

  return jsonResponse(req, { userId, inviteSent: !inviteError }, 200);
});
