/**
 * Single source of truth for legal/compliance constants.
 *
 * The Privacy Policy (app/privacy.tsx), Terms of Service (app/terms.tsx),
 * registration consent (app/(auth)/register.tsx), Settings > Privacy & Data
 * and docs/compliance/** all reference these values so that the policy text,
 * the UI and the documentation cannot drift apart.
 *
 * Fields marked TODO(owner) are placeholders that the business owner must
 * confirm/fill before public launch. They are deliberately visible in the
 * rendered policy so they cannot be missed.
 */

/** Bump when the Terms of Service change materially (re-consent may be required). */
export const TERMS_VERSION = '2026-09-18';
/** Bump when the Privacy Policy changes materially. */
export const PRIVACY_VERSION = '2026-09-18';

/** Minimum age to use Lioris. NDPA 2023 treats under-18s as children. */
export const MIN_AGE = 18;

export const DATA_CONTROLLER = {
  name: 'Lioris',
  /** Legal entity name as displayed in the app footer today. TODO(owner): confirm registered legal name. */
  legalName: 'Lioris Campus Technologies',
  /** Currently published administrator contact (kept from the previous policy). */
  contactEmail: 'inememmanuel@gmail.com',
  contactPhone: '+2349076664049',
  /** TODO(owner): insert the registered physical address. */
  address: '[TODO(owner): registered physical address]',
  /** TODO(owner): insert the NDPC registration / DPCO filing reference once registered. */
  ndpcRegistration: '[TODO(owner): NDPC registration number, if applicable]',
} as const;

/** TODO(owner): confirm this mailbox exists and is monitored before launch. */
export const DPO_EMAIL = 'privacy@lioris.app';

/** Statutory response window for data-subject requests (NDPA 2023 / GDPR). */
export const DSR_RESPONSE_DAYS = 30;

/** Breach notification window to the NDPC (NDPA 2023, s.40). */
export const BREACH_NOTIFICATION_HOURS = 72;

export const NDPC = {
  name: 'Nigeria Data Protection Commission (NDPC)',
  website: 'https://ndpc.gov.ng',
} as const;

/** Retention schedule. Keep in sync with docs/compliance/retention-and-deletion.md. */
export const RETENTION = {
  verificationDocumentsDaysAfterDecision: 30,
  chatMessages: 'until you delete your account (or the conversation)',
  auditLogsMonths: 24,
  accountData: 'until you delete your account',
  deletedAccountPurge: 'immediately upon account deletion',
  backupRollOffDays: 30,
  aiPrompts: 'not stored by Lioris beyond the request; see Google Gemini terms for provider-side handling',
} as const;

export const LEGAL_ROUTES = {
  privacy: '/privacy',
  terms: '/terms',
  communityRules: '/community-rules',
} as const;
