import { api } from './client';
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

// Until a real backend exists, mock logins/registrations infer a role
// from the email address (containing "admin", "staff", or "alumni"),
// defaulting to "student" — so every one of the four dashboards built
// in this app is reachable without a server. See README's "Mock data
// fallback" section.
function guessRoleFromEmail(email: string): UserRole {
  const lower = email.toLowerCase();
  if (lower.includes('admin')) return 'admin';
  if (lower.includes('staff')) return 'staff';
  if (lower.includes('alumni')) return 'alumni';
  return 'student';
}

function mockSession(fullName: string, role: UserRole): AuthSession {
  return {
    accessToken: `mock-access-token.${role}`,
    refreshToken: `mock-refresh-token.${role}`,
    user: {
      id: `mock-${role}`,
      fullName,
      role,
    },
  };
}

// POST /auth/login — PRD Section 15.1
export async function login(payload: LoginPayload): Promise<AuthSession> {
  return withMockFallback(
    async () => {
      const { data } = await api.post<AuthSession>('/auth/login', payload);
      return data;
    },
    mockSession(payload.email.split('@')[0] || 'Demo User', guessRoleFromEmail(payload.email)),
  );
}

// POST /auth/register — not in Section 15's excerpted contracts but
// implied by the onboarding flows in Section 5; shape follows the same
// convention as /auth/login.
export async function register(payload: RegisterPayload): Promise<AuthSession> {
  return withMockFallback(async () => {
    const { data } = await api.post<AuthSession>('/auth/register', payload);
    return data;
  }, mockSession(payload.fullName, payload.userType));
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
