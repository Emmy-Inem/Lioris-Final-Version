import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) MFA policy.
 *
 * Two-factor authentication (TOTP) is voluntary and user-controlled.
 * It is NOT forced on any role by default. Users can turn it on or off
 * in their Settings > Security.
 */
export function roleRequiresMfa(_role: UserRole): boolean {
  return false;
}

