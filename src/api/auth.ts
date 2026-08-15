import { api } from './client';
import { supabase } from './supabase';
import { AuthSession, UserRole } from './types';

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
}

// POST /auth/login — Real Supabase Auth (Strict)
export async function login(payload: LoginPayload): Promise<AuthSession> {
  const cleanEmail = payload.email.trim();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: payload.password,
  });

  if (signInError || !signInData?.session || !signInData?.user) {
    throw new Error(signInError?.message || 'Invalid email or password.');
  }

  // Fetch verified user profile from Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
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
  const cleanEmail = payload.email.trim();
  // Ensure self-registration can only produce student or alumni accounts
  const assignedRole: UserRole = payload.userType === 'alumni' ? 'alumni' : 'student';

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: payload.password,
    options: {
      data: {
        full_name: payload.fullName,
        username: payload.username,
        role: assignedRole,
      },
    },
  });

  if (error || !data?.user) {
    throw new Error(error?.message || 'Unable to register account. Please check your details.');
  }

  // Upsert profile in Supabase profiles table
  await supabase.from('profiles').upsert({
    id: data.user.id,
    email: cleanEmail,
    full_name: payload.fullName,
    username: payload.username,
    role: assignedRole,
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

// POST /auth/mfa/verify — PRD Section 11 requires staff/admin to clear
// an MFA challenge at every sign-in.
export async function verifyMfaCode(code: string): Promise<{ verified: boolean }> {
  const cleanCode = code.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter a valid 6-digit numeric security code.');
  }
  try {
    const { data } = await api.post('/auth/mfa/verify', { code: cleanCode });
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'Invalid MFA security code.');
  }
}

// POST /auth/mfa/resend
export async function resendMfaCode(): Promise<{ sent: boolean }> {
  try {
    const { data } = await api.post('/auth/mfa/resend');
    return data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message || err?.message || 'Could not resend MFA code.');
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
