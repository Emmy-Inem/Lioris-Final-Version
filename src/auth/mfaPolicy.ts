import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) MFA policy.
 *
 * A real TOTP enrollment flow now exists (Settings > Security > Two-Factor
 * Authentication, backed by enrollMfaFactor/confirmMfaEnrollment in
 * src/api/auth.ts), so admins/staff can self-enroll. This is still hardcoded
 * to `false` for every role, though, because flipping it to `true` for
 * 'admin'/'staff' before those accounts have actually enrolled would lock
 * them out: AuthContext derives `mfaVerified: !roleRequiresMfa(role)` on
 * login, so any admin/staff account with zero enrolled factors would be
 * routed to app/(auth)/verify-mfa.tsx, which calls verifyMfaCode() - and
 * that throws "Two-factor authentication is not set up for this account
 * yet." with no in-flow way to enroll from that screen. There is currently
 * no way to know, ahead of flipping this flag, that every existing
 * admin/staff account has already enrolled.
 *
 * Do NOT flip this to `true` for 'admin'/'staff' in code as a silent
 * default. It should only change once account holders/ops have confirmed
 * (e.g. via listMfaFactors() run against production, or direct
 * coordination) that all admin/staff accounts have enrolled a working TOTP
 * factor through the new Settings flow - otherwise this change ships a
 * login lockout, not a security improvement.
 */
export function roleRequiresMfa(_role: UserRole): boolean {
 return false;
}
