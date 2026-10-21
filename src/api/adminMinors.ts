import { supabase } from './supabase';
import { assertUuid } from '../utils/postgrest';
import { getFriendlyErrorMessage } from '../utils/errors';
import type { ConsentStatus, GuardianRelationship } from './minors';

/**
 * Administrator side of the age rules (migration 20261111000000_minors_and_guardians.sql). Campus administrators
 * reach members of their own campus, Super Admins every campus; staff, students and alumni get a refusal from the
 * database, so nothing here checks the role. Every decision and every opening of a guardian record is audited by
 * the database.
 */

export type MinorListFilter = 'pending' | 'missing' | 'confirmed' | 'declined' | 'revoked' | 'under_13' | 'all';

export interface MinorListItem {
  minorId: string;
  fullName: string;
  campusCode: string | null;
  role: string;
  ageYears: number | null;
  /** 'under_13' for a blocked member, otherwise the consent status ('missing' = no guardian details yet). */
  consentStatus: ConsentStatus | 'under_13';
  guardianName: string | null;
  guardianRelationship: GuardianRelationship | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  joinedAt: string;
}

export interface MinorGuardianRecord {
  minor: {
    id: string;
    fullName: string;
    campusCode: string | null;
    role: string;
    dateOfBirth: string | null;
    ageYears: number | null;
  };
  consentStatus: ConsentStatus;
  guardian: {
    name: string;
    relationship: GuardianRelationship;
    email: string | null;
    phone: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    decidedByName: string | null;
    method: string | null;
    note: string | null;
  } | null;
}

export type RecordableConsent = 'confirmed' | 'declined' | 'revoked' | 'pending';

export interface RecordConsentInput {
  minorId: string;
  status: RecordableConsent;
  /** How consent was verified (required for confirmed / declined / revoked). */
  note: string;
  /** Needed only when the member never submitted guardian details. */
  guardian?: { name: string; relationship: GuardianRelationship; email?: string; phone?: string };
}

export interface AgeDiagnostics {
  scope: string;
  membersTotal: number;
  missingDateOfBirth: number;
  missingDateOfBirthByRole: Record<string, number>;
  minorsTotal: number;
  minorsByConsent: Record<string, number>;
  under13Blocked: number;
  missingDateOfBirthSample: Array<{ id: string; fullName: string; role: string; campusCode: string | null; createdAt: string }>;
}

export const ADMIN_MINORS_QUERY_KEY = ['admin-minors'] as const;

function fail(error: unknown, fallback: string): never {
  throw new Error(getFriendlyErrorMessage(error, fallback));
}

export async function listMinors(filter: MinorListFilter = 'pending', campus?: string): Promise<MinorListItem[]> {
  const { data, error } = await supabase.rpc('admin_list_minors', {
    p_status: filter,
    p_campus: campus && campus !== 'ALL' ? campus : null,
    p_limit: 200,
    p_offset: 0,
  });
  if (error) fail(error, 'Could not load members under 18. Check your connection and try again.');
  return ((data ?? []) as any[]).map((r) => ({
    minorId: r.minor_id,
    fullName: r.full_name ?? 'Member',
    campusCode: r.campus_code ?? null,
    role: r.role ?? 'student',
    ageYears: typeof r.age_years === 'number' ? r.age_years : null,
    consentStatus: r.consent_status,
    guardianName: r.guardian_name ?? null,
    guardianRelationship: r.guardian_relationship ?? null,
    submittedAt: r.submitted_at ?? null,
    decidedAt: r.consent_decided_at ?? null,
    decidedByName: r.decided_by_name ?? null,
    joinedAt: r.joined_at,
  }));
}

/** Opens one member's guardian record (contact details included). The database logs that it was opened. */
export async function getMinorGuardian(minorId: string): Promise<MinorGuardianRecord> {
  assertUuid(minorId, 'member id');
  const { data, error } = await supabase.rpc('admin_get_minor_guardian', { p_minor: minorId });
  if (error || !data) fail(error, 'Could not open this guardian record. Check your connection and try again.');
  const d = data as any;
  const g = d.guardian;
  return {
    minor: {
      id: d.minor.id,
      fullName: d.minor.full_name ?? 'Member',
      campusCode: d.minor.campus_code ?? null,
      role: d.minor.role ?? 'student',
      dateOfBirth: d.minor.date_of_birth ?? null,
      ageYears: typeof d.minor.age_years === 'number' ? d.minor.age_years : null,
    },
    consentStatus: d.consent_status,
    guardian: g
      ? {
          name: g.name,
          relationship: g.relationship,
          email: g.email ?? null,
          phone: g.phone ?? null,
          submittedAt: g.submitted_at ?? null,
          decidedAt: g.decided_at ?? null,
          decidedByName: g.decided_by_name ?? null,
          method: g.method ?? null,
          note: g.note ?? null,
        }
      : null,
  };
}

/** Records, confirms, declines or revokes guardian consent (or resets a declined / revoked one to pending). */
export async function recordGuardianConsent(input: RecordConsentInput): Promise<ConsentStatus> {
  assertUuid(input.minorId, 'member id');
  const { data, error } = await supabase.rpc('admin_record_guardian_consent', {
    p_minor: input.minorId,
    p_status: input.status,
    p_note: input.note.trim(),
    p_guardian_name: input.guardian?.name.trim() || null,
    p_relationship: input.guardian?.relationship ?? null,
    p_email: input.guardian?.email?.trim() || null,
    p_phone: input.guardian?.phone?.trim() || null,
  });
  if (error) fail(error, 'Could not record the decision. Check your connection and try again.');
  return ((data as any)?.consent_status ?? input.status) as ConsentStatus;
}

/** The only way to change a recorded date of birth. A reason is mandatory and is audited. */
export async function correctDateOfBirth(userId: string, isoDate: string, reason: string): Promise<void> {
  assertUuid(userId, 'member id');
  const { error } = await supabase.rpc('admin_correct_date_of_birth', { p_user: userId, p_dob: isoDate, p_reason: reason.trim() });
  if (error) fail(error, 'Could not correct the date of birth. Check your connection and try again.');
}

/** Counts of members under 18 by consent status, plus the members who have not added a date of birth yet. */
export async function getAgeDiagnostics(campus?: string): Promise<AgeDiagnostics> {
  const { data, error } = await supabase.rpc('admin_age_diagnostics', { p_campus: campus && campus !== 'ALL' ? campus : null });
  if (error || !data) fail(error, 'Could not load the age diagnostics.');
  const d = data as any;
  return {
    scope: d.scope,
    membersTotal: d.members_total ?? 0,
    missingDateOfBirth: d.missing_date_of_birth ?? 0,
    missingDateOfBirthByRole: d.missing_date_of_birth_by_role ?? {},
    minorsTotal: d.minors_total ?? 0,
    minorsByConsent: d.minors_by_consent ?? {},
    under13Blocked: d.under_13_blocked ?? 0,
    missingDateOfBirthSample: ((d.missing_date_of_birth_sample ?? []) as any[]).map((s) => ({
      id: s.id,
      fullName: s.full_name ?? 'Member',
      role: s.role,
      campusCode: s.campus_code ?? null,
      createdAt: s.created_at,
    })),
  };
}
