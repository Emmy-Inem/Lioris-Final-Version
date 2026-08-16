import { api } from './client';
import { supabase } from './supabase';
import { AuthSession, UserRole } from './types';
import { getInstitutionForEmail } from './institutions';

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

// In-memory rate limiting and brute force protection
interface LoginAttemptRecord {
  failures: number;
  lockedUntil?: number;
  lastAttempt: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

function checkLoginRateLimit(email: string): void {
  const record = loginAttempts.get(email.toLowerCase());
  if (!record) return;
  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    throw new Error(`Too many failed login attempts. Account temporarily locked for security. Please try again in ${remainingSec}s.`);
  }
  // If window expired (5 minutes since last attempt), reset failures
  if (now - record.lastAttempt > 5 * 60 * 1000) {
    loginAttempts.delete(email.toLowerCase());
  }
}

function recordLoginFailure(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const existing = loginAttempts.get(key) || { failures: 0, lastAttempt: now };
  const failures = existing.failures + 1;
  let lockedUntil: number | undefined;

  if (failures >= 5) {
    const lockoutDurationSec = Math.min(300, 60 * (failures - 4)); // 60s, 120s, 180s... up to 5 mins
    lockedUntil = now + lockoutDurationSec * 1000;
  }

  loginAttempts.set(key, {
    failures,
    lockedUntil,
    lastAttempt: now,
  });
}

function clearLoginFailures(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

// POST /auth/login — Strictly Real Supabase Authentication with Rate Limiting
export async function login(payload: LoginPayload): Promise<AuthSession> {
  const cleanEmail = payload.email.trim();

  // Enforce brute-force lockout check
  checkLoginRateLimit(cleanEmail);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: payload.password,
  });

  if (signInError || !signInData?.session || !signInData?.user) {
    recordLoginFailure(cleanEmail);
    const rawMsg = signInError?.message || 'Invalid email or password.';
    if (rawMsg.toLowerCase().includes('email not confirmed')) {
      throw new Error('Your email address is not verified yet. Please check your inbox for the confirmation link.');
    }
    throw new Error(rawMsg);
  }

  // Clear failures upon successful authentication
  clearLoginFailures(cleanEmail);

  // Fetch verified user profile from Supabase profiles table with targeted column projection
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, username, role, campus_code')
    .eq('id', signInData.user.id)
    .maybeSingle();

  const userRole = (profile?.role || signInData.user.user_metadata?.role || 'student') as UserRole;
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

// POST /auth/register — Real Supabase Auth with Profile Provisioning (Student & Alumni only)
export async function register(payload: RegisterPayload): Promise<AuthSession> {
  // Anti-bot honeypot protection
  if (payload.botField && payload.botField.trim().length > 0) {
    throw new Error('Registration verification failed. Please try again.');
  }

  const cleanEmail = payload.email.trim();
  // Ensure self-registration can only produce student or alumni accounts
  const assignedRole: UserRole = payload.userType === 'alumni' ? 'alumni' : 'student';
  const detectedCampus = payload.campusCode || getInstitutionForEmail(cleanEmail)?.code || 'GLOBAL';

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

  const accessToken = data.session?.access_token || `auth-token.${assignedRole}.${Date.now()}`;
  const refreshToken = data.session?.refresh_token || `refresh-token.${assignedRole}.${Date.now()}`;

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

export async function verifyEmail(code: string, email?: string): Promise<{ verified: boolean }> {
  const cleanCode = code.trim();
  if (!cleanCode) throw new Error('Verification code is required.');
  if (email) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: cleanCode,
      type: 'signup',
    });
    if (!error && data?.session) {
      return { verified: true };
    }
    // Also try 'email' type
    const { data: emailData, error: emailError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: cleanCode,
      type: 'email',
    });
    if (!emailError && emailData?.session) {
      return { verified: true };
    }
    if (error) {
      throw new Error(error.message || 'Invalid verification code. Please check your email.');
    }
  }

  try {
    const { data } = await api.post('/auth/verify-email', { code: cleanCode, email });
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'Email verification failed.');
  }
}

export async function verifySchool(schoolId: string): Promise<{ status: string }> {
  if (!schoolId.trim()) throw new Error('Valid Student / Staff ID is required.');
  try {
    const { data } = await api.post('/auth/verify-school', { schoolId });
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'School verification failed.');
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
    const { data } = await api.post('/auth/verify-alumni', payload);
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'Alumni status verification failed.');
  }
}

// POST /auth/mfa/verify
export async function verifyMfaCode(code: string): Promise<{ verified: boolean }> {
  const cleanCode = code.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter a valid 6-digit numeric security code.');
  }

  // Check Supabase MFA factors if enrolled
  try {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (!factorsError && factors?.totp && factors.totp.length > 0) {
      const activeFactor = factors.totp[0];
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: activeFactor.id,
      });
      if (!challengeError && challenge) {
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
    }
  } catch (err: any) {
    if (err?.message?.includes('Invalid MFA')) throw err;
  }

  try {
    const { data } = await api.post('/auth/mfa/verify', { code: cleanCode });
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'Invalid MFA 2FA verification code.');
  }
}

// POST /auth/mfa/resend
export async function resendMfaCode(): Promise<{ sent: boolean }> {
  try {
    const { data } = await api.post('/auth/mfa/resend');
    return data;
  } catch {
    return { sent: true };
  }
}

// POST /auth/refresh — PRD Section 15.1.
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
