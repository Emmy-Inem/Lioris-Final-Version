/**
 * Single source of truth for legal/compliance constants.
 *
 * The Privacy Policy (app/privacy.tsx), Terms of Service (app/terms.tsx),
 * registration consent (app/(auth)/register.tsx), Settings > Privacy & Data
 * and docs/compliance/** all reference these values so that the policy text,
 * the UI and the documentation cannot drift apart.
 *
 * Do not add registration numbers, addresses or legal-entity names here until
 * the operator has verified them. The product must never publish placeholders
 * or imply that a regulatory registration has been issued when it has not.
 */

/** Bump when the Terms of Service change materially (re-consent may be required). */
export const TERMS_VERSION = '2026-09-24';
/** Bump when the Privacy Policy changes materially. */
export const PRIVACY_VERSION = '2026-09-24';
export const COMMUNITY_RULES_VERSION = '2026-09-24';
export const COPYRIGHT_POLICY_VERSION = '2026-09-24';

/**
 * Copyright notice-and-takedown (app/copyright.tsx, the in-app "Report" on resources).
 * `email` is deliberately empty: add the operator's real copyright/legal address here once it
 * exists and it appears on the policy page. Lecturers without an account can already reach the
 * team through the Support Desk. Never put a placeholder address here.
 */
export const COPYRIGHT_TAKEDOWN = {
  email: null as string | null,
  reviewTargetDays: 5,
} as const;

/** Minimum eligible age. Users aged 16–17 must have a parent/guardian's authorisation. */
export const MIN_AGE = 16;
export const INDEPENDENT_AGE = 18;

export const DATA_CONTROLLER = {
  name: 'Lioris',
  legalName: 'Lioris',
  supportChannel: 'the in-app Support Desk (Settings → Support)',
  privacyChannel: 'the in-app Support Desk (select Privacy & Data)',
} as const;

export const HOSTING_REGIONS = {
  web: 'Vercel global edge network (the site is served from the point of presence nearest you, including locations in Africa such as Cape Town, as well as Europe and the United States)',
  database:
    'Supabase, hosted on Amazon Web Services in the eu-north-1 region (Stockholm, Sweden) - database, authentication and file storage',
  ai: "Google's infrastructure (Gemini API) - the processing location is determined by Google and may be outside Nigeria and the EU",
} as const;

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
  chatMessages: 'while your account or the conversation remains active, subject to safety, legal and backup exceptions',
  auditLogsMonths: 24,
  accountData: 'until you delete your account',
  deletedAccountPurge: 'from the active service after a valid deletion request is completed',
  backupRollOffDays: 30,
  aiPrompts: 'handled for the request and subject to the AI provider’s applicable retention and safety practices',
} as const;

export const LEGAL_ROUTES = {
  privacy: '/privacy',
  terms: '/terms',
  communityRules: '/community-rules',
  copyright: '/copyright',
} as const;
