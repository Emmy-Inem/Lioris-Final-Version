import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) MFA policy.
 *
 * Two-factor authentication (TOTP) is MANDATORY for the privileged roles
 * 'admin' and 'staff'. AuthContext derives `mfaVerified: !roleRequiresMfa(role)`
 * on login, so these accounts are routed to app/(auth)/verify-mfa.tsx until
 * they pass a TOTP challenge (which upgrades the Supabase session to aal2).
 *
 * To avoid locking anyone out, verify-mfa.tsx handles both states:
 *  - the account already has a verified TOTP factor -> 6-digit challenge;
 *  - the account has no verified factor yet -> inline enrollment (QR code /
 *    secret + confirmation code), then the session is marked mfa-verified.
 *
 * Settings > Security (SettingsScreenBase) prevents these roles from turning
 * off their last factor. Students and alumni may still opt in voluntarily
 * from Settings, but are not forced through the challenge.
 *
 * NOTE: this is a client-side gate. Server-side enforcement of aal2 for
 * privileged operations should be done in RLS / edge functions (e.g. by
 * checking `auth.jwt() ->> 'aal'`).
 */
export function roleRequiresMfa(role: UserRole): boolean {
  return role === 'admin' || role === 'staff';
}
