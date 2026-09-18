# Lioris compliance pack

Working documents supporting Lioris' compliance with the Nigeria Data Protection Act 2023 (NDPA) and, for EU/UK users, the GDPR / UK GDPR. These are engineering-side records; **they are not legal advice** - have Nigerian counsel review before relying on them.

Policy values (versions, retention periods, contacts) live in one place in code: `src/constants/legal.ts`. The in-app Privacy Policy (`app/privacy.tsx`), Terms (`app/terms.tsx`), sign-up consent (`app/(auth)/register.tsx`) and these documents must all agree with it. Change the constant first, then update the docs.

| Document | Purpose |
| --- | --- |
| [ndpa-checklist.md](ndpa-checklist.md) | NDPA obligations mapped to what the app does now and what the owner must still do |
| [incident-response.md](incident-response.md) | Breach roles, severity levels, 72-hour NDPC workflow, stack-specific containment |
| [records-of-processing.md](records-of-processing.md) | Register of processing activities (data, purpose, lawful basis, retention, processors) |
| [dpia-ai-copilot-and-id-verification.md](dpia-ai-copilot-and-id-verification.md) | Pre-filled DPIAs for the two high-risk processes |
| [retention-and-deletion.md](retention-and-deletion.md) | Retention schedule and how deletion/export are implemented |

## Implementation map (user-facing rights)

| Right / duty | Where implemented |
| --- | --- |
| Notice / transparency | `/privacy`, `/terms`, `/community-rules` |
| Age gate (18+) and consent evidence | Register screen checkboxes; `TERMS_VERSION` + `confirmedAge18` sent with sign-up (stored as auth metadata; `consent_records` table) |
| Access and portability | Settings > Privacy & Data > Export my data (`exportMyData()` -> RPC `export_my_data`) |
| Erasure | Settings > Privacy & Data > Delete my account (`deleteMyAccount()` -> edge function `delete-my-account`) |
| Security (mandatory MFA for admin/staff) | `src/auth/mfaPolicy.ts`, `app/(auth)/verify-mfa.tsx` |

## Owner TODO summary

Everything marked `TODO(owner)` in these documents and in `src/constants/legal.ts` must be resolved before public launch. The most important: NDPC registration status, DPO appointment and mailbox, registered address, signed DPAs with Supabase/Vercel/Google, hosting regions, and counsel review of Terms (liability cap, governing law).
