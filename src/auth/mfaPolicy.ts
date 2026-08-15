import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) MFA policy.
 * Staff and Admin MFA enforcement is currently set to false for launch until
 * dedicated TOTP/SMS hardware backend infrastructure is provisioned, preventing
 * admin and staff login lockouts.
 */
export function roleRequiresMfa(_role: UserRole): boolean {
  return false;
}
