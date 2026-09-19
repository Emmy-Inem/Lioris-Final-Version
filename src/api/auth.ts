import { api } from './client';
import { supabase } from './supabase';
import { AuthSession, UserRole } from './types';
import { getInstitutionForEmail } from './institutions';
import { recordAuditLogEntry } from './auditLog';
import { unregisterDevicePushToken } from './notifications';
import { checkPassword, isPasswordValid } from '../utils/validation';

export interface LoginPayload {
 email: string;
 password: string;
 captchaToken?: string;
}

export interface RegisterPayload {
 fullName: string;
 username: string;
 email: string;
 password: string;
 userType: UserRole;
 campusCode?: string;
 botField?: string;
 /** Version of the Terms/Privacy the user accepted at sign-up (stored as auth metadata). */
 acceptedTermsVersion?: string;
 /** User confirmed they are 18 or older. */
 confirmedAge18?: boolean;
 captchaToken?: string;
}

/**
 * Thrown when an account exists but its email address has not been confirmed yet.
 * Screens catch it to send the user to the verify-email step instead of showing a
 * generic "wrong password" error.
 */
export class EmailConfirmationRequiredError extends Error {
  readonly email: string;
  constructor(email: string) {
    super('Please confirm your email address with the 6-digit code we sent you.');
    this.name = 'EmailConfirmationRequiredError';
    this.email = email;
  }
}

/** Name check as well as instanceof: subclassed Errors can lose their prototype after transpilation. */
export function isEmailConfirmationRequired(err: unknown): err is EmailConfirmationRequiredError {
  return err instanceof EmailConfirmationRequiredError || (err as any)?.name === 'EmailConfirmationRequiredError';
}

function isEmailNotConfirmedError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  const code = (error.code ?? '').toLowerCase();
  return (
    code === 'email_not_confirmed' ||
    code === 'email_unconfirmed' ||
    msg.includes('email not confirmed') ||
    msg.includes('email has not been confirmed') ||
    msg.includes('confirm your email') ||
    msg.includes('not confirmed')
  );
}

/**
 * Checks if a username is available (case-insensitive).
 * Calls the `check_username_available` RPC with fallback to querying `profiles`.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.trim().replace(/^@/, '').toLowerCase();
  if (!clean || clean.length < 3 || clean.length > 24) return false;

  try {
    const { data, error } = await supabase.rpc('check_username_available', { p_username: clean });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // RPC may not be deployed yet; fall through to query
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', clean)
      .limit(1);

    if (!error) {
      return !data || data.length === 0;
    }
  } catch {
    // Fallback: assume available to not block user if offline/unreachable
  }

  return true;
}

/**
 * Resolves a username handle to its registered email address.
 * Allows users to log in using either their campus email or their @handle.
 */
export async function getEmailForUsername(username: string): Promise<string | null> {
  const clean = username.trim().replace(/^@/, '').toLowerCase();
  if (!clean || clean.includes('@')) return null;

  try {
    const { data, error } = await supabase.rpc('get_email_for_username', { p_username: clean });
    if (!error && typeof data === 'string' && data.length > 0) {
      return data;
    }
  } catch {
    // RPC may not be deployed yet; fall through
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .ilike('username', clean)
      .maybeSingle();

    if (!error && data?.email) {
      return data.email;
    }
  } catch {
    // Fall through
  }

  return null;
}

// Client-side login throttle. This is only a UX nicety (it slows down accidental
// hammering from this tab); real brute-force protection is Supabase Auth's own
// rate limits. There is deliberately no server-side per-email lockout: it would
// let anyone lock a victim out of their account.
interface LoginAttemptRecord {
 failures: number;
 lockedUntil?: number;
 lastAttempt: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

function checkLoginRateLimit(email: string): void {
 const clean = email.toLowerCase().trim();

 // Client-side memory check
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

function recordLoginFailure(email: string): void {
 const key = email.toLowerCase().trim();
 const now = Date.now();

 // Record locally
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

function clearLoginFailures(email: string): void {
 const key = email.toLowerCase().trim();
 loginAttempts.delete(key);
}

// Sends a fresh 6-digit confirmation code. Delivery is real email (Supabase custom SMTP);
// there is deliberately no server-side "just activate it" fallback any more.
export async function resendConfirmationEmail(email: string): Promise<{ success: boolean }> {
  const cleanEmail = email.trim();
  if (!cleanEmail) throw new Error('Please enter your registered email address.');
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: cleanEmail,
  });
  if (error) {
    throw new Error(
      /rate|seconds|too many/i.test(error.message)
        ? 'Please wait a minute before requesting another code.'
        : 'We could not send the code right now. Please check the address and try again.',
    );
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
  const cleanInput = payload.email.trim();
  let cleanEmail = cleanInput.toLowerCase();

  // If user entered a username instead of email (e.g. 'ineme' or '@ineme'), resolve to their registered email
  if (!cleanEmail.includes('@')) {
    const resolved = await getEmailForUsername(cleanEmail);
    if (resolved) {
      cleanEmail = resolved.toLowerCase();
    } else {
      const handle = cleanInput.replace(/^@/, '');
      throw new Error(`No account found with username @${handle}. Please check the username or sign in with your campus email.`);
    }
  }

  // Client-side throttle (UX only; Supabase Auth enforces the real limits)
  checkLoginRateLimit(cleanEmail);

  let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: payload.password,
    options: payload.captchaToken ? { captchaToken: payload.captchaToken } : undefined,
  });

  // The password was right but the inbox has not been proven yet - not a failed login.
  if (isEmailNotConfirmedError(signInError)) {
    throw new EmailConfirmationRequiredError(cleanEmail);
  }

  if (signInError || !signInData?.session || !signInData?.user) {
    recordLoginFailure(cleanEmail);
    if (signInError?.code === 'captcha_failed' || signInError?.message?.toLowerCase().includes('captcha')) {
      const err: any = new Error('Security verification failed or expired. Please complete the security check again.');
      err.code = 'captcha_failed';
      throw err;
    }
    throw new Error(signInError?.message || 'Invalid email or password. Please verify your credentials and try again.');
  }

  // Clear failures upon successful authentication
  clearLoginFailures(cleanEmail);

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
  const cleanUsername = payload.username.trim().replace(/^@/, '').toLowerCase();

  // Validate username format
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
    throw new Error('Username must be 3-24 characters (letters, numbers, dots, underscores).');
  }

  // Pre-check username availability to prevent duplicate handles
  const isAvailable = await checkUsernameAvailable(cleanUsername);
  if (!isAvailable) {
    throw new Error(`The username @${cleanUsername} is already taken. Please choose another username.`);
  }

  // Ensure self-registration can only produce student or alumni accounts
  const assignedRole: UserRole = payload.userType === 'alumni' ? 'alumni' : 'student';
  const detectedCampus = payload.campusCode || getInstitutionForEmail(cleanEmail)?.code || 'UI';

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: payload.password,
    options: {
      data: {
        full_name: payload.fullName,
        username: cleanUsername,
        role: assignedRole,
        campus_code: detectedCampus,
        terms_version: payload.acceptedTermsVersion ?? null,
        terms_accepted_at: payload.acceptedTermsVersion ? new Date().toISOString() : null,
        age_confirmed_18: payload.confirmedAge18 === true,
      },
      captchaToken: payload.captchaToken,
    },
  });

  if (error || !data?.user) {
    throw new Error(error?.message || 'Unable to register account. Please check your details.');
  }

  // Supabase returns an empty identities array if the email is already registered (user enumeration protection)
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error('An account with this email address already exists. Please sign in or reset your password.');
  }

  // With email confirmation on, signUp returns no session: the profile is created server-side
  // (auth trigger) and the user must enter the 6-digit code we emailed to confirm their address.
  let activeSession = data.session;
  if (!activeSession) {
    throw new EmailConfirmationRequiredError(cleanEmail);
  }

 // The profile row is created server-side by the auth trigger; the client never
 // writes role / campus_code for itself.

 const accessToken = activeSession.access_token;
 const refreshToken = activeSession.refresh_token;

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

export async function sendPasswordResetEmail(email: string, captchaToken?: string): Promise<{ success: boolean }> {
  const cleanEmail = email.trim();
  if (!cleanEmail) throw new Error('Please enter your registered campus email address.');
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    captchaToken,
  });
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
 if (!newPassword || !isPasswordValid(newPassword)) {
 const unmet = checkPassword(newPassword ?? '')
 .filter((c) => !c.met)
 .map((c) => c.label.toLowerCase());
 throw new Error(`New password does not meet the password policy: ${unmet.join(', ')}.`);
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
 // Must run BEFORE signOut: the push_tokens row is owner-only, so it can only be deleted while
 // still authenticated. Otherwise the next person on a shared phone would receive this user's pushes.
 await unregisterDevicePushToken().catch(() => {});
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

export const IMPERSONATION_REASON_MIN_LENGTH = 10;

export async function startImpersonation(targetUserId: string, reason: string): Promise<StartImpersonationResult> {
 const cleanTargetUserId = targetUserId?.trim();
 if (!cleanTargetUserId) {
 throw new Error('A target user is required to start impersonation.');
 }
 const cleanReason = reason?.trim() ?? '';
 if (cleanReason.length < IMPERSONATION_REASON_MIN_LENGTH) {
 throw new Error(`A reason of at least ${IMPERSONATION_REASON_MIN_LENGTH} characters is required to start impersonation.`);
 }

 const { data, error } = await supabase.functions.invoke('admin-impersonate-user', {
 body: { targetUserId: cleanTargetUserId, reason: cleanReason },
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

 // The function returns generateLink's `hashed_token`, which verifyOtp accepts as
 // `token_hash` (the `{ email, token }` form expects the 6-digit code instead).
 const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
 token_hash: tokenHash,
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

/**
 * Best-effort: asks the edge function to write the `impersonation_ended` audit
 * entry. Must be called AFTER the admin session has been restored (the function
 * authenticates the caller as the admin). Never throws.
 */
export async function endImpersonationAudit(targetUserId: string): Promise<void> {
 try {
 await supabase.functions.invoke('admin-impersonate-user', {
 body: { action: 'end', targetUserId },
 });
 } catch (err) {
 console.warn('[Auth] Could not record impersonation end:', err);
 }
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
