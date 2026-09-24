# NDPA 2023 checklist

Status legend: DONE = implemented in the app/repo; PARTIAL = implemented in part; OWNER = action for the business owner (cannot be done in code).
Section references are indicative; confirm against the Act and current NDPC guidance with counsel.

| # | Obligation | What the app does now | What the OWNER must still do |
| --- | --- | --- | --- |
| 1 | Lawful basis and purpose limitation (Part V) | DONE - lawful basis per purpose documented in the Privacy Policy and [records-of-processing.md](records-of-processing.md) | Have counsel confirm the bases, especially legitimate interest for moderation/verification |
| 2 | Consent is freely given, specific, recorded | PARTIAL - separate age-eligibility and Terms/Privacy checkboxes at sign-up; `TERMS_VERSION` and `confirmedAgeEligible` stored; consent per AI Copilot submission | OWNER - implement appropriate guardian-consent verification for users aged 16–17 and decide when re-consent is required |
| 3 | Privacy notice to data subjects | PARTIAL - `/privacy` covers categories, purposes, recipients, transfers, retention, rights and complaints without publishing invented details | OWNER - provide verified legal operator identity, service address and DPO/privacy contact; have Nigerian counsel approve the notice |
| 4 | Register with NDPC as data controller/processor of major importance (DCPMI) | n/a | OWNER - determine whether Lioris meets the DCPMI threshold (number of data subjects / nature of processing) and register / pay the fee; file annual compliance audit return if applicable. TODO(owner) |
| 5 | Appoint and publish a Data Protection Officer where required | OPEN - the app routes requests to the in-app Privacy & Data support category and does not claim an unverified DPO | OWNER - appoint a competent DPO/privacy lead, establish a monitored contact route, and publish verified details |
| 6 | Data protection impact assessment for high-risk processing | PARTIAL - draft in [dpia-ai-copilot-and-id-verification.md](dpia-ai-copilot-and-id-verification.md) | OWNER - complete, approve and sign; review annually |
| 7 | Records of processing | PARTIAL - draft in [records-of-processing.md](records-of-processing.md) | OWNER - keep up to date when features change |
| 8 | Data processing agreements with processors | n/a | OWNER - execute/confirm DPAs with Supabase, Vercel and Google (Gemini API); check sub-processor lists; keep copies. TODO(owner) |
| 9 | Cross-border transfers (Part VIII) | PARTIAL - policy discloses transfers and safeguards | OWNER - complete a transfer assessment for each processor/region; document safeguards (SCCs / adequacy); state regions in the policy |
| 10 | Data subject rights: access, rectification, erasure, restriction, portability, objection, withdraw consent, no solely-automated decisions | DONE for access/portability (Export my data), erasure (Delete my account), rectification (profile edit), consent withdrawal (Settings toggles). Restriction/objection via DPO email | OWNER - run the DSR process: log requests, verify identity, respond within 30 days (`DSR_RESPONSE_DAYS`) |
| 11 | Data minimisation and retention limits | DONE - schedule in `src/constants/legal.ts` and [retention-and-deletion.md](retention-and-deletion.md) | Confirm scheduled jobs for verification-document (30-day) and audit-log (24-month) purges actually exist and run (see retention doc) |
| 12 | Security of processing (s.39) | DONE/PARTIAL - TLS, hashed passwords (Supabase Auth), RLS, mandatory MFA for admin/staff, audit logging, server-side secret keys, rate limiting | OWNER - periodic security review / penetration test; enforce aal2 in RLS for privileged tables; access reviews |
| 13 | Breach notification: NDPC within 72 hours, notify affected data subjects (s.40) | PARTIAL - procedure in [incident-response.md](incident-response.md); policy commitment | OWNER - designate incident lead, keep NDPC contact/portal details, maintain a breach register |
| 14 | Children (under 18) | PARTIAL - only admitted students aged 16–17 with guardian authorisation are eligible; policy and sign-up record the attestation | OWNER - implement and document an appropriate age/guardian verification process under NDPA section 31; promptly handle ineligible-account reports |
| 15 | Data protection audit / compliance return (annual, for DCPMI) | n/a | OWNER - engage a licensed Data Protection Compliance Organisation (DPCO) if required |
| 16 | Training and governance | n/a | OWNER - train admins/moderators who access personal data or verification documents; least-privilege access |
| 17 | Cookies / trackers | DONE - only strictly necessary session and preference storage; no ad trackers | Re-assess before adding analytics |
| 18 | Apple/Google store privacy disclosures | DONE - `app.config.ts` iOS privacy manifest; Android permissions minimised | Complete Play Data Safety and App Store privacy nutrition labels consistently with the records of processing |
