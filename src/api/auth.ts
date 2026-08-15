import { api } from './client';
import { supabase } from './supabase';
import { AuthSession, UserRole } from './types';
import { withMockFallback } from './withMockFallback';

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

function guessRoleFromEmail(email: string): UserRole {
  const lower = email.toLowerCase();
  if (lower.includes('admin')) return 'admin';
  if (lower.includes('staff')) return 'staff';
  if (lower.includes('alumni')) return 'alumni';
  return 'student';
}

function mockSession(email: string, role: UserRole, customName?: string): AuthSession {
  const derivedName =
    customName || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    accessToken: `auth-token.${role}.${Date.now()}`,
    refreshToken: `refresh-token.${role}.${Date.now()}`,
    user: {
      id: `user-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      fullName: derivedName,
      email: email.trim(),
      role,
    },
  };
}

// POST /auth/login — Real Supabase Auth with Mock Fallback
export async function login(payload: LoginPayload): Promise<AuthSession> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email.trim(),
      password: payload.password,
    });

    if (!error && data?.session && data?.user) {
      // Fetch user profile from Supabase
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      const userRole = (profile?.role || data.user.user_metadata?.role || guessRoleFromEmail(payload.email)) as UserRole;
      const fullName = profile?.full_name || data.user.user_metadata?.full_name || payload.email.split('@')[0];

      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user.id,
          fullName,
          email: data.user.email || payload.email,
          role: userRole,
        },
      };
    }
  } catch (err) {
    console.warn('[Auth] Supabase login error:', err);
  }

  // Fallback to API/mock path
  return withMockFallback(
    async () => {
      const { data } = await api.post<AuthSession>('/auth/login', payload);
      return data;
    },
    mockSession(payload.email, guessRoleFromEmail(payload.email)),
  );
}

// POST /auth/register — Real Supabase Auth with Profile Provisioning
export async function register(payload: RegisterPayload): Promise<AuthSession> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim(),
      password: payload.password,
      options: {
        data: {
          full_name: payload.fullName,
          username: payload.username,
          role: payload.userType,
        },
      },
    });

    if (!error && data?.user) {
      // Upsert profile in Supabase
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: payload.email.trim(),
        full_name: payload.fullName,
        username: payload.username,
        role: payload.userType,
      });

      const accessToken = data.session?.access_token || `auth-token.${payload.userType}.${Date.now()}`;
      const refreshToken = data.session?.refresh_token || `refresh-token.${payload.userType}.${Date.now()}`;

      return {
        accessToken,
        refreshToken,
        user: {
          id: data.user.id,
          fullName: payload.fullName,
          email: payload.email.trim(),
          role: payload.userType,
        },
      };
    }
  } catch (err) {
    console.warn('[Auth] Supabase register error:', err);
  }

  return withMockFallback(async () => {
    const { data } = await api.post<AuthSession>('/auth/register', payload);
    return data;
  }, mockSession(payload.email, payload.userType, payload.fullName));
}

export async function verifyEmail(code: string): Promise<{ verified: boolean }> {
  return withMockFallback(async () => {
    const { data } = await api.post('/auth/verify-email', { code });
    return data;
  }, { verified: true });
}

export async function verifySchool(schoolId: string): Promise<{ status: string }> {
  return withMockFallback(async () => {
    const { data } = await api.post('/auth/verify-school', { schoolId });
    return data;
  }, { status: 'verified' });
}

export async function verifyAlumniStatus(payload: {
  graduationYear: number;
  studentId?: string;
}): Promise<{ status: string }> {
  return withMockFallback(async () => {
    const { data } = await api.post('/auth/verify-alumni', payload);
    return data;
  }, { status: 'verified' });
}

// POST /auth/mfa/verify — PRD Section 11 requires staff/admin to clear
// an MFA challenge at every sign-in. Not in Section 15's excerpted
// contracts, so this follows the same shape as the other verify-*
// endpoints above. Mocked identically to verifyEmail: any well-formed
// code succeeds since there's no backend to actually issue/check one.
export async function verifyMfaCode(code: string): Promise<{ verified: boolean }> {
  return withMockFallback(async () => {
    const { data } = await api.post('/auth/mfa/verify', { code });
    return data;
  }, { verified: true });
}

// POST /auth/mfa/resend — same mock convention: fabricates success
// since there's no real delivery channel (SMS/email/authenticator) yet.
export async function resendMfaCode(): Promise<{ sent: boolean }> {
  return withMockFallback(async () => {
    const { data } = await api.post('/auth/mfa/resend');
    return data;
  }, { sent: true });
}

// POST /auth/refresh — PRD Section 15.1. Normally called only by the
// axios interceptor in client.ts, exposed here for completeness/testing.
export async function refresh(refreshToken: string) {
  const { data } = await api.post<{ accessToken: string; refreshToken: string }>(
    '/auth/refresh',
    { refreshToken },
  );
  return data;
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {
    // Best-effort — token is cleared client-side regardless (see AuthContext).
  });
}
