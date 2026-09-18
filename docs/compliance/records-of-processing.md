# Records of processing activities (NDPA 2023 / GDPR Art. 30)

Controller: Lioris (`DATA_CONTROLLER` in `src/constants/legal.ts`). DPO: `DPO_EMAIL` (TODO(owner): confirm). Retention values reference `RETENTION` in the same file. Review whenever a feature is added.

| # | Activity | Data categories | Purpose | Lawful basis | Retention | Processors / recipients | Transfers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Account registration and authentication | Email, username, full name, password hash, role, MFA factor metadata, IP | Create and secure accounts | Contract; legal obligation (security) | Until account deletion | Supabase (Auth, DB), Vercel | Outside Nigeria - TODO(owner): regions |
| 2 | Consent and age confirmation | Terms version, 18+ confirmation, timestamp | Evidence of acceptance and eligibility | Legal obligation; legitimate interest | Until account deletion | Supabase | as above |
| 3 | Profile and directory | Institution, department, level, bio, interests, avatar/banner | Provide the social/academic profile | Contract | Until account deletion | Supabase (DB, Storage) | as above |
| 4 | Institutional verification | University email domain; uploaded ID/admission document; decision and reviewer | Confirm affiliation, verified badge | Contract; legitimate interest; consent for voluntary document upload | Document: 30 days after decision (`verificationDocumentsDaysAfterDecision`); decision record until account deletion | Supabase (Storage, DB); authorised admins | as above |
| 5 | Forums, resources, events, marketplace, mentorship, jobs | User-generated content, files, listings, registrations | Provide community features | Contract | Until deleted by user or account deletion | Supabase; other users (per chosen audience) | as above |
| 6 | Messaging and calls | Chat messages, attachments, read status; call room metadata | Private/group communication | Contract | Until account/conversation deletion | Supabase; Jitsi Meet (calls) | Jitsi - TODO(owner): confirm instance/region |
| 7 | Push notifications | Push token, device platform | Deliver alerts | Consent | Until token invalidated, opt-out or account deletion | Expo push service / Apple / Google - TODO(owner): confirm | Outside Nigeria |
| 8 | AI Study Copilot | Prompts, images submitted, generated answer | Provide AI study help | Consent (per submission) | Not stored by Lioris beyond the request - TODO(owner): verify `gemini-proxy` and any chat-history table; provider-side retention per Google terms | Google Gemini API via `gemini-proxy` edge function | Outside Nigeria (Google) |
| 9 | Moderation, reports and support tickets | Reports, reasons, target content, ticket text, actor IDs | Keep the community safe; support | Legitimate interest; legal obligation | Until account deletion / resolution - TODO(owner): define closed-ticket retention | Supabase; moderators/admins | as above |
| 10 | Audit logging | Actor, action, target, timestamp, institution | Accountability, security investigations | Legitimate interest; legal obligation | 24 months (`auditLogsMonths`) | Supabase | as above |
| 11 | Security and abuse prevention | IP, request metadata, rate-limit counters, honeypot signals | Protect the service | Legitimate interest; legal obligation | Provider log retention - TODO(owner): confirm Supabase/Vercel log windows | Supabase, Vercel | as above |
| 12 | Public-data lookups (weather, Open Library, Semantic Scholar/OpenAlex, radio-browser, OpenStreetMap/Overpass) | IP address and query (and chosen location) sent to the provider | Provide reference features | Legitimate interest / contract | Not retained by Lioris; provider policies apply | Respective third-party APIs (recipients, not processors) | Various |
| 13 | Data subject requests | Requester identity, request, response log | Fulfil rights | Legal obligation | TODO(owner): e.g. 3 years | DPO, Supabase | - |
| 14 | Local device storage | Session tokens, theme/notification preferences | Keep signed in; preferences | Strictly necessary / contract | Until sign-out or clearing storage | On-device only | - |

## Special categories and high-risk flags

* No special-category data is intentionally collected. ID documents and free-text may incidentally contain such data (photo, religion via content) - see the DPIA.
* Activities 4 and 8 are assessed in [dpia-ai-copilot-and-id-verification.md](dpia-ai-copilot-and-id-verification.md).

## Security measures (all activities)

TLS in transit; encryption at rest by Supabase/Vercel; row-level security; hashed passwords; role-based access; mandatory MFA for admin/staff; audit logging of privileged actions; secrets kept server-side (edge functions); rate limiting/bot honeypot.
