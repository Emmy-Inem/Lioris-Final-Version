import { supabase } from './supabase';
import { getFriendlyErrorMessage } from '../utils/errors';

/**
 * The member's side of the age rules (migration 20261111000000_minors_and_guardians.sql):
 *   - public.check_signup_dob(date)            sign-up pre-check (the sign-up trigger is the enforcement)
 *   - public.set_my_date_of_birth(date)        the one-time "add your date of birth" write
 *   - public.get_my_minor_status()             age band, consent status and what is limited, computed server-side
 *   - public.submit_guardian_details(...)      a 13-17 member records / re-submits their guardian
 * The member can never set the consent status; an administrator records it (src/api/adminMinors.ts).
 * Age is never stored on the client: the status is fetched, not derived from a cached date of birth.
 */

export type ConsentStatus = 'not_required' | 'missing' | 'pending' | 'confirmed' | 'declined' | 'revoked';

export type GuardianRelationship = 'parent' | 'legal_guardian' | 'grandparent' | 'other_relative' | 'other';

export const GUARDIAN_RELATIONSHIPS: Array<{ value: GuardianRelationship; label: string }> = [
  { value: 'parent', label: 'Parent' },
  { value: 'legal_guardian', label: 'Legal guardian' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'other_relative', label: 'Other relative' },
  { value: 'other', label: 'Someone else' },
];

export function relationshipLabel(value: string | null | undefined): string {
  return GUARDIAN_RELATIONSHIPS.find((r) => r.value === value)?.label ?? 'Guardian';
}

/** What the database limits for this member (see MinorStatus.restrictions). */
export type MinorRestriction = 'marketplace_listings' | 'giving' | 'job_postings' | 'direct_messages' | 'discoverability';

export interface GuardianDetails {
  name: string;
  relationship: GuardianRelationship;
  email: string | null;
  phone: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
}

export interface MinorStatus {
  /** False for members who signed up before the age rules and have not added one yet (treated as adults). */
  dateOfBirthSet: boolean;
  ageYears: number | null;
  /** Under 18 (13-17 for a member who may use the app). */
  isMinor: boolean;
  /** The date of birth is under 13: the account is blocked. */
  isUnder13: boolean;
  consentStatus: ConsentStatus;
  /** Under 18 without confirmed guardian consent. */
  isLimited: boolean;
  restrictions: MinorRestriction[];
  guardian: GuardianDetails | null;
}

export const MINOR_STATUS_QUERY_KEY = ['minor-status'] as const;

function mapStatus(row: any): MinorStatus {
  const g = row?.guardian;
  return {
    dateOfBirthSet: row?.date_of_birth_set === true,
    ageYears: typeof row?.age_years === 'number' ? row.age_years : null,
    isMinor: row?.is_minor === true,
    isUnder13: row?.is_under_13 === true,
    consentStatus: (row?.consent_status ?? 'not_required') as ConsentStatus,
    isLimited: row?.is_limited === true,
    restrictions: Array.isArray(row?.restrictions) ? (row.restrictions as MinorRestriction[]) : [],
    guardian: g
      ? {
          name: String(g.name ?? ''),
          relationship: (g.relationship ?? 'other') as GuardianRelationship,
          email: g.email ?? null,
          phone: g.phone ?? null,
          submittedAt: g.submitted_at ?? null,
          decidedAt: g.decided_at ?? null,
        }
      : null,
  };
}

/**
 * The signed-in member's own age / consent status. Returns null when it cannot be read (signed out, database not
 * migrated, offline): callers must then do nothing rather than guess - the server enforces the rules either way.
 */
export async function getMyMinorStatus(): Promise<MinorStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_minor_status');
    if (error || !data) return null;
    return mapStatus(data);
  } catch {
    return null;
  }
}

export type SignupDobCheck = 'adult' | 'minor' | 'under_13' | 'invalid' | 'missing';

/**
 * Asks the database how it classifies a date of birth before sign-up is attempted. Best effort: null on any
 * failure, because the sign-up trigger refuses an under-13 date anyway.
 */
export async function checkSignupDob(isoDate: string): Promise<SignupDobCheck | null> {
  try {
    const { data, error } = await supabase.rpc('check_signup_dob', { p_dob: isoDate });
    if (error || typeof data !== 'string') return null;
    return data as SignupDobCheck;
  } catch {
    return null;
  }
}

export interface SetDateOfBirthResult extends MinorStatus {
  /** True when the date made the member under 13: the account is now blocked and the member must sign out. */
  blocked: boolean;
}

/** One-time write of the member's own date of birth (isoDate = yyyy-mm-dd). Cannot be changed afterwards. */
export async function setMyDateOfBirth(isoDate: string): Promise<SetDateOfBirthResult> {
  const { data, error } = await supabase.rpc('set_my_date_of_birth', { p_dob: isoDate });
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'We could not save your date of birth. Check your connection and try again.'));
  }
  return { ...mapStatus(data), blocked: (data as any)?.blocked === true };
}

export interface GuardianInput {
  name: string;
  relationship: GuardianRelationship;
  email?: string;
  phone?: string;
}

/** Client-side check before sending; the database validates again. Returns an error sentence or null. */
export function validateGuardianInput(input: GuardianInput): string | null {
  if (input.name.trim().length < 2) return "Enter your parent or guardian's full name.";
  const email = (input.email ?? '').trim();
  const phone = (input.phone ?? '').trim();
  if (!email && !phone) return 'Give an e-mail address or a phone number so we can reach your guardian.';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That e-mail address does not look right.';
  if (phone && !/^\+?[0-9][0-9 ()-]{5,19}$/.test(phone)) return 'That phone number does not look right (digits, spaces, + ( ) - only).';
  return null;
}

/** Records or re-submits the guardian's details. Changed details restart the consent check (status back to pending). */
export async function submitGuardianDetails(input: GuardianInput): Promise<MinorStatus> {
  const problem = validateGuardianInput(input);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.rpc('submit_guardian_details', {
    p_name: input.name.trim(),
    p_relationship: input.relationship,
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
  });
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'We could not save your guardian details. Check your connection and try again.'));
  }
  return mapStatus(data);
}

/** Plain-language line for each limit (what the member cannot do, and for how long). */
export function restrictionText(restriction: MinorRestriction): string {
  switch (restriction) {
    case 'marketplace_listings':
      return 'Marketplace listings: members under 18 cannot create them.';
    case 'giving':
      return 'Giving: members under 18 cannot start or give to giving campaigns.';
    case 'job_postings':
      return 'Job posts: not until a parent or guardian has confirmed consent.';
    case 'direct_messages':
      return 'Direct messages: only people you are connected with, until a parent or guardian has confirmed consent.';
    case 'discoverability':
      return 'Adult members cannot find you in search or suggestions until a parent or guardian has confirmed consent.';
  }
}

/** One line for a member's own consent status. */
export function consentStatusLabel(status: ConsentStatus): string {
  switch (status) {
    case 'missing':
      return 'Guardian details needed';
    case 'pending':
      return 'Waiting for guardian consent';
    case 'confirmed':
      return 'Guardian consent confirmed';
    case 'declined':
      return 'Guardian consent declined';
    case 'revoked':
      return 'Guardian consent withdrawn';
    default:
      return 'No guardian consent needed';
  }
}
