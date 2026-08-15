import { UserRole } from '@/api/types';

/**
 * PRD Section 11 (Security Requirements) requires MFA for staff/admin
 * accounts at minimum. Student/alumni aren't in scope for now — if that
 * ever widens, this is the single place to change it. Everything that
 * needs to know "does this session need an MFA challenge" (AuthContext,
 * the auth-group layout, the root resolver, RoleGate) imports this
 * instead of re-checking role strings inline.
 */
export function roleRequiresMfa(role: UserRole): boolean {
  return role === 'staff' || role === 'admin';
}
