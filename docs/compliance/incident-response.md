# Incident response and breach notification

Applies to any suspected loss, unauthorised access, alteration or disclosure of personal data held by Lioris (NDPA 2023). Notification to the NDPC is due **within 72 hours** of becoming aware of a breach likely to risk individuals' rights and freedoms (`BREACH_NOTIFICATION_HOURS` in `src/constants/legal.ts`).

## Roles

| Role | Responsibility | Holder |
| --- | --- | --- |
| Incident Lead | Owns the incident, decides severity, coordinates everything below | TODO(owner) |
| DPO | Assesses risk to individuals, decides on NDPC / user notification, keeps the breach register | TODO(owner) (see `DPO_EMAIL`) |
| Technical Lead | Containment, forensics, recovery | TODO(owner) |
| Communications | Drafts user/NDPC/institution messages | TODO(owner) |

## Severity levels

| Level | Definition | Examples | Target response |
| --- | --- | --- | --- |
| SEV1 | Confirmed exposure of personal data at scale, or of verification documents / credentials | Leaked service-role key, public storage bucket, DB dump exposed | Start immediately; contain within 1 hour |
| SEV2 | Suspected or limited exposure; a privileged account compromised | Stolen admin session, RLS bug allowing cross-user reads | Contain within 4 hours |
| SEV3 | No evidence of personal data exposure | Failed attack, vulnerability found without exploitation | Fix in normal cycle; log it |

## Workflow (72-hour clock)

1. **T0 - Detect and log.** Record time of awareness (the 72 hours run from here), who reported it and what is known. Open an entry in the breach register (even if later ruled out).
2. **Triage (within 1-2 h).** Incident Lead assigns severity; DPO starts the risk assessment (what data, how many people, sensitivity, likelihood of harm, whether data was encrypted/unusable).
3. **Contain** (see below). Preserve evidence: export Supabase logs (auth, API, Postgres, edge function logs), Vercel logs, `audit_logs` rows, before rotating anything that destroys them.
4. **Assess notification duty (by ~T+24 h).** DPO decides: (a) NDPC notification required? (b) high risk to individuals so users must be told? Document the reasoning either way.
5. **Notify the NDPC (by T+72 h).** Include: nature of the breach, categories and approximate number of people and records, likely consequences, measures taken/proposed, DPO contact details. If full details are not yet known, notify in phases rather than miss the deadline. TODO(owner): record the NDPC breach-reporting channel/portal and contact here.
6. **Notify affected users (without undue delay when risk is high).** Plain language: what happened, what data, what we have done, what they should do (change password, watch for phishing), DPO contact. Use in-app announcement, email and, where relevant, the affected institution's contact.
7. **Recover and verify.** Restore from clean state, confirm fix, monitor for recurrence.
8. **Post-incident review (within 2 weeks).** Root cause, timeline, decisions, corrective actions with owners and dates; update the DPIA/records if processing changed.

## Containment steps specific to this stack

| Situation | Actions |
| --- | --- |
| Supabase keys or JWT secret leaked | Rotate the `service_role` key and anon key; rotate the JWT secret (Project Settings > API) which invalidates all sessions; redeploy Vercel with new env vars and redeploy edge functions (secrets are set with `supabase secrets set`); rotate DB password |
| Suspected account takeover / mass compromise | Revoke sessions (sign users out globally via Auth admin API or by rotating the JWT secret); force password resets; for admin/staff confirm MFA factors are theirs and unenrol unknown factors |
| Gemini key exposed or abused | Revoke the key in Google AI Studio / Cloud console, create a new one, update the `gemini-proxy` edge function secret, redeploy; check usage logs for abuse |
| Edge function is the vector | Disable it (delete or replace with a stub returning 503; `supabase functions delete <name>`), especially `delete-my-account`, `admin-delete-user`, `gemini-proxy` |
| Storage exposure | Set buckets private, review storage policies, rotate signed-URL usage, list objects accessed in logs |
| RLS / SQL bug | Apply a corrective SQL migration immediately (or temporarily revoke table grants for `anon`/`authenticated`); review `pg_stat_statements` and API logs |
| Vercel / deployment compromised | Rotate Vercel tokens and environment secrets; redeploy from a known-good commit; review team access |
| Malicious content (CSAM, credible threats) | Remove content, preserve evidence, report to law enforcement (do not distribute); this is not only a data breach process |

## Templates

Breach register columns: ID, detected at, reported by, description, data categories, number of people, severity, containment actions, NDPC notified (date/ref), users notified (date), root cause, corrective actions, closed date.
