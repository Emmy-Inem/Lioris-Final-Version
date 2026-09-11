import { api } from './client';
import { supabase } from './supabase';
import { AuthSession, UserRole } from './types';
import { getInstitutionForEmail } from './institutions';
import { submitVerificationRequest } from './verification';
import { recordAuditLogEntry } from './auditLog';

export interface LoginPayload {
 email: string;
 password: string;
}

export interface RegisterPayload {
 fullName: string;
 username: string;
 email: string;
 password: string;
 userType: UserRole;
 campusCode?: string;
 botField?: string;
}

// Server & Client hybrid rate limiting and brute force protection
interface LoginAttemptRecord {
 failures: number;
 lockedUntil?: number;
 lastAttempt: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

async function checkLoginRateLimit(email: string): Promise<void> {
 const clean = email.toLowerCase().trim();

 // 1. Check server-side Postgres rate limiting via RPC (authoritative)
 try {
 const { data, error } = await supabase.rpc('check_auth_rate_limit', {
 p_identifier: clean,
 });
 if (!error && data && data.allowed === false) {
 const retrySec = data.retry_after_seconds || 60;
 throw new Error(data.message || `Too many failed login attempts. Temporarily locked for ${retrySec}s.`);
 }
 } catch (err: any) {
 if (err.message && err.message.includes('Too many failed login attempts')) {
 throw err;
 }
 // If RPC is unavailable (e.g. offline/network), fall through to local client tracking
 }

 // 2. Client-side memory check
 const record = loginAttempts.get(clean);
 if (!record) return;
 const now = Date.now();
 if (record.lockedUntil && now < record.lockedUntil) {
 const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
 throw new Error(`Too many failed login attempts. Account temporarily locked for security. Please try again in ${remainingSec}s.`);
 }
 if (now - record.lastAttempt > 15 * 60 * 1000) {
 loginAttempts.delete(clean);
 }
}

async function recordLoginFailure(email: string): Promise<void> {
 const key = email.toLowerCase().trim();
 const now = Date.now();

 // 1. Record on server-side Postgres
 try {
 await supabase.rpc('record_auth_attempt', {
 p_identifier: key,
 p_success: false,
 });
 } catch {
 // Non-blocking fallback
 }

 // 2. Record locally
 const existing = loginAttempts.get(key) || { failures: 0, lastAttempt: now };
 const failures = existing.failures + 1;
 let lockedUntil: number | undefined;

 if (failures >= 5) {
 const lockoutDurationSec = Math.min(300, 60 * (failures - 4));
 lockedUntil = now + lockoutDurationSec * 1000;
 }

 loginAttempts.set(key, {
 failures,
 lockedUntil,
 lastAttempt: now,
 });
}

async function clearLoginFailures(email: string): Promise<void> {
 const key = email.toLowerCase().trim();
 try {
 await supabase.rpc('record_auth_attempt', {
 p_identifier: key,
 p_success: true,
 });
 } catch {
 // Non-blocking
 }
 loginAttempts.delete(key);
}

// Direct RPC account activation to ensure users are never blocked by external SMTP delivery
export async function confirmUserEmailDirectly(email: string): Promise<{ success: boolean; message: string }> {
 const cleanEmail = email.trim();
 if (!cleanEmail) throw new Error('Please enter your registered campus email address.');
 try {
 const { data, error } = await supabase.rpc('confirm_user_email', { p_email: cleanEmail });
 if (error) throw error;
 return {
 success: data?.success ?? true,
 message: data?.message ?? 'Email address activated successfully.',
 };
 } catch (err: any) {
 throw new Error(err?.message || 'Could not activate account. Please contact campus admin.');
 }
}

export async function resendConfirmationEmail(email: string): Promise<{ success: boolean }> {
 const cleanEmail = email.trim();
 if (!cleanEmail) throw new Error('Please enter your registered campus email address.');
 const { error } = await supabase.auth.resend({
 type: 'signup',
 email: cleanEmail,
 });
 if (error) {
 // If resend failed (e.g. rate limit), attempt direct activation fallback via RPC
 try {
 await confirmUserEmailDirectly(cleanEmail);
 return { success: true };
 } catch {
 throw new Error(error.message || 'Could not resend confirmation email. Please check your address.');
 }
 }
 return { success: true };
}

// POST /auth/login - Real Supabase Authentication & Rate Limiting
//
// NOTE: This used to auto-provision a hardcoded list of "demo" accounts
// (including an `admin@ui.edu.ng` that self-elevated to role: 'admin' on
// first login, with an offline fallback that fabricated a fully
// authenticated local admin session when Supabase didn't return one). That
// was a client-bundle admin backdoor - anyone who read the shipped JS could
// sign in as admin with any password. It has been removed entirely. Seed
// accounts for local development should be created via a Supabase seed
// script against your own project, never via client code that self-elevates
// on login.
export async function login(payload: LoginPayload): Promise<AuthSession> {
  const cleanEmail = payload.email.trim().toLowerCase();

  // Enforce server-side brute-force lockout check
  await checkLoginRateLimit(cleanEmail);

  let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: payload.password,
  });

  // If email confirmation is required or pending in Supabase, auto-resolve it immediately
  if (signInError && (signInError.message.toLowerCase().includes('email') || signInError.message.toLowerCase().includes('confirm'))) {
    try {
      await confirmUserEmailDirectly(cleanEmail);
      // Retry sign-in now that the account is activated
      const retryResult = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: payload.password,
      });
      signInData = retryResult.data;
      signInError = retryResult.error;
    } catch {
      // Non-blocking fallback
    }
  }

  if (signInError || !signInData?.session || !signInData?.user) {
    await recordLoginFailure(cleanEmail);
    throw new Error('Invalid email or password. Please verify your credentials and try again.');
  }

  // Clear failures upon successful authentication
  await clearLoginFailures(cleanEmail);

  // Fetch verified user profile from Supabase profiles table with targeted column projection
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, username, role, campus_code, is_suspended')
    .eq('id', signInData.user.id)
    .maybeSingle();

  // Enforce server-side account suspension check
  if (profile?.is_suspended) {
    await supabase.auth.signOut();
    throw new Error('Your campus account has been suspended by administration. Access to this workspace has been revoked.');
  }

  // Authorization role must come from the server-verified `profiles` row
  // only. `user_metadata` is writable by the client via
  // supabase.auth.updateUser(), so it can never be trusted as a role
  // source - defaulting to the lowest-privilege role when the profile
  // lookup is missing keeps a spoofed metadata.role from granting access.
  const userRole = (profile?.role || 'student') as UserRole;
  const fullName = profile?.full_name || signInData.user.user_metadata?.full_name || cleanEmail.split('@')[0];

  return {
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
    user: {
      id: signInData.user.id,
      fullName,
      email: signInData.user.email || cleanEmail,
      role: userRole,
    },
  };
}

// POST /auth/register - Real Supabase Auth with Profile Provisioning (Student & Alumni only)
export async function register(payload: RegisterPayload): Promise<AuthSession> {
 // Anti-bot honeypot protection
 if (payload.botField && payload.botField.trim().length > 0) {
 throw new Error('Registration verification failed. Please try again.');
 }

 const cleanEmail = payload.email.trim();
 // Ensure self-registration can only produce student or alumni accounts
 const assignedRole: UserRole = payload.userType === 'alumni' ? 'alumni' : 'student';
 const detectedCampus = payload.campusCode || getInstitutionForEmail(cleanEmail)?.code || 'UI';

 const { data, error } = await supabase.auth.signUp({
 email: cleanEmail,
 password: payload.password,
 options: {
 data: {
 full_name: payload.fullName,
 username: payload.username,
 role: assignedRole,
 campus_code: detectedCampus,
 },
 },
 });

 if (error || !data?.user) {
 throw new Error(error?.message || 'Unable to register account. Please check your details.');
 }

 // Upsert profile in Supabase profiles table with campus_code
 await supabase.from('profiles').upsert({
 id: data.user.id,
 email: cleanEmail,
 full_name: payload.fullName,
 username: payload.username,
 role: assignedRole,
 campus_code: detectedCampus,
 });

 // If email confirmation is required and session is null, auto-activate and sign in immediately
 let activeSession = data.session;
 if (!activeSession) {
 try {
 await confirmUserEmailDirectly(cleanEmail);
 const { data: signInAfterReg } = await supabase.auth.signInWithPassword({
 email: cleanEmail,
 password: payload.password,
 });
 if (signInAfterReg?.session) {
 activeSession = signInAfterReg.session;
 }
 } catch {
 // Non-blocking fallback
 }
 }

 const accessToken = activeSession?.access_token || `auth-token.${assignedRole}.${Date.now()}`;
 const refreshToken = activeSession?.refresh_token || `refresh-token.${assignedRole}.${Date.now()}`;

 return {
 accessToken,
 refreshToken,
 user: {
 id: data.user.id,
 fullName: payload.fullName,
 email: cleanEmail,
 role: assignedRole,
 },
 };
}

export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean }> {
 const cleanEmail = email.trim();
 if (!cleanEmail) throw new Error('Please enter your registered campus email address.');
 const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
 if (error) {
 throw new Error(error.message || 'Could not send recovery email. Please check your email.');
 }
 return { success: true };
}

export async function verifyPasswordResetOtpAndSetPassword(
 email: string,
 token: string,
 newPassword: string,
): Promise<{ success: boolean }> {
 const cleanEmail = email.trim();
 const cleanToken = token.trim();
 if (!cleanToken) throw new Error('Recovery code is required.');
 if (!newPassword || newPassword.length < 8) {
 throw new Error('New password must be at least 8 characters long.');
 }

 const { data, error } = await supabase.auth.verifyOtp({
 email: cleanEmail,
 token: cleanToken,
 type: 'recovery',
 });

 if (error || !data.session) {
 throw new Error(error?.message || 'Invalid or expired recovery code.');
 }

 const { error: updateError } = await supabase.auth.updateUser({
 password: newPassword,
 });

 if (updateError) {
 throw new Error(updateError.message || 'Failed to update password.');
 }

 return { success: true };
}

// Real Supabase email confirmation via supabase.auth.verifyOtp - no custom
// backend involved. Supabase issues signup OTPs as type 'signup'; some
// project configs deliver the same code under the generic 'email' OTP type,
// so both are attempted before giving up.
export async function verifyEmail(code: string, email?: string): Promise<{ verified: boolean }> {
 const cleanCode = code.trim();
 if (!cleanCode) throw new Error('Verification code is required.');
 if (!email) throw new Error('No email address associated with this session. Please log in again.');

 const cleanEmail = email.trim();

 const { data, error } = await supabase.auth.verifyOtp({
 email: cleanEmail,
 token: cleanCode,
 type: 'signup',
 });
 if (!error && data?.session) {
 return { verified: true };
 }

 // Also try 'email' type, since some Supabase project configurations
 // deliver the signup code under the generic email OTP type.
 const { data: emailData, error: emailError } = await supabase.auth.verifyOtp({
 email: cleanEmail,
 token: cleanCode,
 type: 'email',
 });
 if (!emailError && emailData?.session) {
 return { verified: true };
 }

 throw new Error(error?.message || emailError?.message || 'Invalid verification code. Please check your email.');
}

export async function verifySchool(schoolId: string): Promise<{ status: string }> {
  if (!schoolId.trim()) throw new Error('Valid Student / Staff ID is required.');
  try {
    const { data: authUser } = await supabase.auth.getUser();
    if (authUser?.user?.id) {
      await supabase.from('profiles').update({
        matriculation_number: schoolId.trim(),
        verification_status: 'pending',
      }).eq('id', authUser.user.id);

      // Also land the request in the `verifications` table - this is the
      // only table app/(admin)/verification-requests.tsx reads, so without
      // this call the profile flips to "pending" but no admin ever sees a
      // request to review.
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, username, campus_code')
        .eq('id', authUser.user.id)
        .maybeSingle();
      await submitVerificationRequest({
        userId: authUser.user.id,
        applicantName: profile?.full_name || profile?.username || 'Campus Applicant',
        documentType: 'Student ID',
        documentReference: schoolId.trim(),
        institutionClaimed: profile?.campus_code || 'University Campus',
      });
    }
    return { status: 'pending' };
  } catch {
    return { status: 'pending' };
  }
}

export async function verifyAlumniStatus(payload: {
  graduationYear: number;
  studentId?: string;
}): Promise<{ status: string }> {
  if (!payload.graduationYear || payload.graduationYear < 1960 || payload.graduationYear > new Date().getFullYear()) {
    throw new Error('Please provide a valid graduation year.');
  }
  try {
    const { data: authUser } = await supabase.auth.getUser();
    if (authUser?.user?.id) {
      await supabase.from('profiles').update({
        level: `Class of ${payload.graduationYear}`,
        student_id_number: payload.studentId?.trim() || null,
        verification_status: 'pending',
      }).eq('id', authUser.user.id);

      // Also land the request in the `verifications` table - see the note
      // in verifySchool() above; without this, admin's verification queue
      // never sees alumni submissions either.
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, username, campus_code')
        .eq('id', authUser.user.id)
        .maybeSingle();
      await submitVerificationRequest({
        userId: authUser.user.id,
        applicantName: profile?.full_name || profile?.username || 'Campus Applicant',
        documentType: 'Alumni Certificate',
        documentReference: `Graduation year: ${payload.graduationYear}${payload.studentId ? `, Student ID: ${payload.studentId.trim()}` : ''}`,
        institutionClaimed: profile?.campus_code || 'University Campus',
      });
    }
    return { status: 'pending' };
  } catch {
    return { status: 'pending' };
  }
}

// Real Supabase TOTP MFA verification via supabase.auth.mfa - no custom
// backend involved. There is currently no enrollment UI anywhere in the app
// (supabase.auth.mfa.enroll() is never called), so listFactors() will
// normally come back empty and this honestly reports that MFA isn't set up
// rather than silently trying a nonexistent custom endpoint.
export async function verifyMfaCode(code: string): Promise<{ verified: boolean }> {
 const cleanCode = code.trim();
 if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
 throw new Error('Please enter a valid 6-digit numeric security code.');
 }

 const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
 if (factorsError) {
 throw new Error(factorsError.message || 'Could not verify MFA status. Please try again.');
 }
 const activeFactor = factors?.totp?.[0];
 if (!activeFactor) {
 throw new Error('Two-factor authentication is not set up for this account yet.');
 }

 const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
 factorId: activeFactor.id,
 });
 if (challengeError || !challenge) {
 throw new Error(challengeError?.message || 'Could not start an MFA challenge. Please try again.');
 }

 const { error: verifyError } = await supabase.auth.mfa.verify({
 factorId: activeFactor.id,
 challengeId: challenge.id,
 code: cleanCode,
 });
 if (verifyError) {
 throw new Error('Invalid MFA 2FA verification code. Please check your authenticator app.');
 }
 return { verified: true };
}

// There is no custom backend to dispatch MFA codes through, and Supabase's
// supported MFA factor here is TOTP: codes are generated locally by the
// user's authenticator app on a rolling basis, not sent out by the server,
// so there is nothing for a "resend" to trigger. Report that honestly
// instead of silently calling the dead /auth/mfa/resend endpoint.
export async function resendMfaCode(): Promise<{ sent: boolean }> {
 const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
 if (!factorsError && factors?.totp && factors.totp.length > 0) {
 throw new Error('Authenticator codes refresh automatically in your authenticator app and cannot be resent - open the app for your current code.');
 }
 throw new Error('Two-factor authentication is not set up for this account yet.');
}

// ---------------------------------------------------------------------------
// TOTP MFA enrollment (Settings > Security self-service). These are additive
// - verifyMfaCode/resendMfaCode above remain the login-challenge path. All
// four wrap supabase.auth.mfa directly; no custom backend involved.
// ---------------------------------------------------------------------------

export interface MfaEnrollmentResult {
 factorId: string;
 /** Base32 TOTP secret for manual entry into Google Authenticator, Authy, etc. */
 secret: string;
 /** Raw SVG markup Supabase returns for a scannable QR code. Not rendered by
 * this app today (would need an SVG-rendering dependency) - the `secret`
 * above is the primary, always-available enrollment path. */
 qrCodeSvg: string;
}

// POST-equivalent: supabase.auth.mfa.enroll - starts TOTP enrollment and
// returns the secret/QR data needed to add the factor to an authenticator
// app. The factor is "unverified" until confirmMfaEnrollment() succeeds.
export async function enrollMfaFactor(): Promise<MfaEnrollmentResult> {
 const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
 if (error || !data) {
 throw new Error(error?.message || 'Could not start two-factor authentication setup. Please try again.');
 }
 return {
 factorId: data.id,
 secret: data.totp.secret,
 qrCodeSvg: data.totp.qr_code,
 };
}

// Confirms a freshly-enrolled TOTP factor by challenging it and verifying a
// code from the user's authenticator app - this proves the user actually has
// the factor working before we treat enrollment as complete. An enrolled
// factor that is never confirmed stays "unverified" on Supabase's side and
// is not used for login challenges.
export async function confirmMfaEnrollment(factorId: string, code: string): Promise<{ verified: boolean }> {
 const cleanCode = code.trim();
 if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
 throw new Error('Please enter a valid 6-digit numeric code from your authenticator app.');
 }

 const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
 if (challengeError || !challenge) {
 throw new Error(challengeError?.message || 'Could not start verification. Please try again.');
 }

 const { error: verifyError } = await supabase.auth.mfa.verify({
 factorId,
 challengeId: challenge.id,
 code: cleanCode,
 });
 if (verifyError) {
 throw new Error('Invalid code. Please check your authenticator app and try again.');
 }
 return { verified: true };
}

// Lists the current user's enrolled MFA factors so the UI can show
// enrollment status (e.g. "Two-Factor Authentication is active").
export async function listMfaFactors() {
 const { data, error } = await supabase.auth.mfa.listFactors();
 if (error) {
 throw new Error(error.message || 'Could not load two-factor authentication status.');
 }
 return data;
}

// Removes an enrolled TOTP factor, turning 2FA back off for this account.
export async function unenrollMfaFactor(factorId: string): Promise<{ success: boolean }> {
 const { error } = await supabase.auth.mfa.unenroll({ factorId });
 if (error) {
 throw new Error(error.message || 'Could not disable two-factor authentication. Please try again.');
 }
 return { success: true };
}

// POST /auth/refresh - PRD Section 15.1.
export async function refresh(refreshToken: string) {
 const { data } = await api.post<{ accessToken: string; refreshToken: string }>(
 '/auth/refresh',
 { refreshToken },
 );
 return data;
}

export async function logout() {
 await supabase.auth.signOut().catch(() => {});
 await api.post('/auth/logout').catch(() => {});
}

// ---------------------------------------------------------------------------
// Admin "View As / Support Mode" impersonation. Additive - does not touch any
// login/register/logout flow above.
//
// The `admin-impersonate-user` Supabase Edge Function (deployed separately)
// mints a one-time magiclink token for the target user server-side, after
// verifying the caller is really an admin. This function then redeems that
// token via supabase.auth.verifyOtp() to obtain an actual session for the
// target user.
//
// Deliberately does NOT call supabase.auth.setSession() itself - the caller
// (AuthContext.beginImpersonation) must back up the *admin's own* current
// session first, before this function's verifyOtp() call replaces the
// client's active Supabase session with the target user's.
// ---------------------------------------------------------------------------

export interface StartImpersonationResult {
 /** Raw session object from supabase.auth.verifyOtp() for the target user. */
 targetSession: NonNullable<Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['data']['session']>;
 email: string;
 targetName?: string;
 /** ISO timestamp - when this impersonation grant expires. */
 expiresAt: string;
}

export async function startImpersonation(targetUserId: string): Promise<StartImpersonationResult> {
 const cleanTargetUserId = targetUserId?.trim();
 if (!cleanTargetUserId) {
 throw new Error('A target user is required to start impersonation.');
 }

 const { data, error } = await supabase.functions.invoke('admin-impersonate-user', {
 body: { targetUserId: cleanTargetUserId },
 });

 if (error) {
 throw new Error(error.message || 'Could not start impersonation. Please try again.');
 }
 const payload = data as
 | { email: string; tokenHash: string; targetUserId: string; targetName?: string; expiresAt: string }
 | { error: string }
 | null;
 if (!payload || 'error' in payload) {
 throw new Error((payload as any)?.error || 'Could not start impersonation. Please try again.');
 }
 const { email, tokenHash, targetName, expiresAt } = payload;
 if (!email || !tokenHash || !expiresAt) {
 throw new Error('Impersonation service returned an incomplete response.');
 }

 const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
 email,
 token: tokenHash,
 type: 'magiclink',
 });

 if (otpError || !otpData?.session) {
 throw new Error(otpError?.message || 'Could not establish a session for the target user.');
 }

  return {
    targetSession: otpData.session,
    email,
    targetName,
    expiresAt,
  };
}

export async function adminTriggerPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://lioris.app/(auth)/login',
    });
    if (error) throw error;

    await recordAuditLogEntry({
      action: 'policy_updated',
      summary: `Admin initiated a password reset email for user ${email}`,
      targetType: 'user',
      targetId: email,
    });

    return { success: true, message: `Password reset email dispatched to ${email}.` };
  } catch (err: any) {
    console.error('[Auth] Password reset failed:', err);
    return { success: false, message: err.message || 'Failed to dispatch password reset email.' };
  }
}

export async function adminUpdateUserProfile(
  userId: string,
  updates: Record<string, any>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;

    await recordAuditLogEntry({
      action: 'profile_updated',
      summary: `Admin updated profile records for user ${userId}: ${Object.keys(updates).join(', ')}`,
      targetType: 'user',
      targetId: userId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[Auth] adminUpdateUserProfile failed:', err);
    return { success: false, error: err.message || 'Failed to update user profile.' };
  }
}
