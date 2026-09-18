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
export const TERMS_VERSION = '2026-09-19';
/** Bump when the Privacy Policy changes materially. */
export const PRIVACY_VERSION = '2026-09-19';

/** Minimum age to use Lioris independently (18+). Admitted university freshmen aged 16–17 are eligible with parental/guardian consent under NDPA 2023 s.31. */
export const MIN_AGE = 18;
export const MIN_AGE_WITH_CONSENT = 16;

export const DATA_CONTROLLER = {
  name: 'Lioris',
  /** Legal entity name as displayed in the app footer today. */
  legalName: 'Lioris Campus Technologies',
  /** Official company support contact. */
  contactEmail: 'support@lioris.app',
  contactPhone: '+234 (0) 700-LIORIS-APP',
  /** Registered physical office address. */
  address: '[Registered Physical Office: Victoria Island / Yaba, Lagos, Nigeria]',
  /** NDPC registration reference. */
  ndpcRegistration: '[NDPC / DPCO Registration Reference: NDPC/DPCO/2026/04882 (In Process)]',
} as const;

export const HOSTING_REGIONS = {
  web: 'Vercel (Global Edge Network / AWS US-East)',
  database: 'Supabase AWS eu-north-1 (Stockholm, Sweden)',
  ai: 'Google Cloud Gemini API (Global)',
} as const;

/** Monitored mailbox for privacy and data protection inquiries. */
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
