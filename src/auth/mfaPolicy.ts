import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) MFA policy.
 *
 * Two-factor authentication (TOTP) is required for Staff and Admin accounts,
 * which hold elevated access to campus data. Student/alumni accounts may
 * still turn it on voluntarily in Settings > Security, but it is not forced
 * on them. A staff/admin account with no verified factor yet is routed into
 * forced enrollment (see app/(auth)/verify-mfa.tsx), not locked out.
 */
export function roleRequiresMfa(role: UserRole): boolean {
  return role === 'admin' || role === 'staff';
}

