# Moderation runbook

> **DRAFT - needs review by qualified legal counsel before launch.** This document describes an operating procedure, not legal advice. The child-safety section (section 9) and the retention/evidence rules (section 7) in particular touch Nigerian criminal law (Cybercrimes Act 2015 as amended, Child's Rights Act 2003 and state equivalents, the Trafficking in Persons (Prohibition) Enforcement and Administration Act 2015), the Nigeria Data Protection Act 2023 (NDPA), and US reporting rules. Counsel must confirm the reporting duties, the evidence-handling steps and the retention periods that apply to Lioris as a Nigerian operator before this is treated as final.

Applies to: all user-generated content and behaviour on Lioris (posts, comments, chat messages, events, marketplace and job listings, resources, profiles, communities). Companion documents: `docs/compliance/incident-response.md` (data breaches), `docs/compliance/retention-and-deletion.md` (retention schedule), `docs/operations/monitoring.md`.

## 1. Owner-fill contact sheet

Every item below must be completed by the owner before launch. Nothing in this runbook should be relied on until these are filled.

| Item | Value |
| --- | --- |
| Trust & Safety lead (final decision maker) | TODO(owner): name, phone, email |
| Trust & Safety backup | TODO(owner) |
| Legal counsel (Nigeria) | TODO(owner): firm, named contact, out-of-hours number |
| Privacy lead / DPO | OWNER ACTION: appoint a competent person where required, record their verified contact route, and monitor Privacy & Data tickets |
| Nigeria Police Force - National Cybercrime Centre (NPF-NCCC) | TODO(owner): current report channel (email/portal/phone) - verify on the NPF website |
| NAPTIP (National Agency for the Prohibition of Trafficking in Persons) | TODO(owner): current hotline/email |
| NCMEC CyberTipline (US) | https://report.cybertip.org - TODO(owner): create the Electronic Service Provider (ESP) registration and record the account contact |
| Nigeria Data Protection Commission | https://ndpc.gov.ng - TODO(owner): breach-report channel |
| Per-campus staff moderators | TODO(owner): one named primary and one backup per campus (UNILAG, UI, FUNAAB, others as added) |
| Staff wellness / counselling contact | TODO(owner): see section 10 |
| Out-of-hours escalation phone | TODO(owner) |

## 2. Severity levels and response targets (SLAs)

Lioris does not store a severity field on reports today (the queue holds `pending`, `approved` = resolved, `rejected` = dismissed, with a free-text `reason`). Moderators assign severity by reading the report and applying the table below; note it in the moderator note field so it lands in the audit log.

| Severity | What it is | First action within | Resolved within |
| --- | --- | --- | --- |
| **Critical** | Child sexual abuse material or any sexualisation of minors; credible threat to life or self-harm; sexual extortion; human-trafficking indicators; doxxing that exposes someone to immediate danger; non-consensual intimate imagery | **1 hour**, 24/7 (see sections 8-9) | Content removed and escalated within 1 hour; case closed within 24 hours |
| **High** | Harassment/bullying campaigns, hate speech, targeted threats without immediate danger, impersonation of staff/admin, exam-paper leaks, scams and advance-fee fraud, account takeover reports | **24 hours** | 72 hours |
| **Normal** | Spam, off-topic content, mild abuse, low-quality listings, copyright complaints from individuals, duplicate reports | **72 hours** | 7 days |

Rules of thumb:
- If in doubt between two levels, take the higher one.
- The clock starts when the report reaches the queue (`created_at` on the report).
- Weekends and public holidays count for Critical. For High and Normal, the owner may agree in writing that the clock pauses on public holidays. TODO(owner): decide and record.
- A backlog of open reports older than their SLA is an operational alert: the Trust & Safety lead must be told the same day.

## 3. Roles and who triages what

| Role | Scope | Can do | Cannot do |
| --- | --- | --- | --- |
| **Staff moderator (campus)** | Their own campus (the queue is filtered by `institutionCode`) | Review reports on their campus; dismiss; official warning; purge/take down content; 24-hour mute label; **escalate to admin**; review student verification and resource approvals | Suspend, shadowban or terminate accounts (admin-only: the UI hides these options and the server-side `suspend_user_account` function enforces campus and role limits); see other campuses |
| **Admin (platform)** | All campuses | Everything staff can do, plus account suspension / termination via the moderation queue, suspend/restore accounts in the User Directory, resolve support tickets, view the full audit log | Suspend themselves or the last active admin (enforced server-side) |
| **Trust & Safety lead** | Platform | Owns Critical cases, appeals, law-enforcement contact, evidence store | - |
| **Owner / legal counsel** | Platform | Decides on external reporting obligations when unclear | - |

Triage flow:
1. Staff moderators own the queue for their campus and clear Normal and High reports themselves.
2. Anything Critical, anything involving a staff member or admin as the subject, anything needing an account suspension, and anything the moderator is unsure of is **escalated to an admin** the same working hour (Critical: immediately by phone, do not wait for the queue).
3. Conflicts of interest: a moderator never handles a report about themselves, a relative or a close associate; hand it to another moderator or an admin and record that in the note.
4. Two-person rule for permanent account termination: the acting admin records the reasoning and a second admin or the Trust & Safety lead acknowledges it in the audit log note.

## 4. In-app tooling (as built)

All paths are in the `app/(admin)` and `app/(staff)` route groups. Admin routes require MFA (see the Supabase dashboard checklist).

| Tool | Where | What it does |
| --- | --- | --- |
| **Report entry points** | Post "..." menu > "Report Thread to Moderation" (free-text reason); event menu > "Report Event"; "Block" for organisers and authors | Creates a row in `moderation_queue` with `reporter_id`, `item_type`, `item_id`, `reason`, `campus_code`, status `pending`. Blocking (`user_blocks`) is available to any user without moderator involvement. |
| **Moderation queue (staff)** | Staff Workdesk > Moderation (`app/(staff)/moderation.tsx`, component `ModerationQueue`) with tabs for reports and approvals | Lists open reports for the moderator's campus. Per report: Dismiss, or Take Action. Staff actions: Official Warning, Purge and Take Down Content, Temporary 24-Hour Mute, Escalate to Admin. |
| **Moderation queue (admin)** | Admin > Safety > Reports (`app/(admin)/moderation-queue.tsx`) | Same list across campuses. Admin actions: Official Warning, Purge and Take Down Content, 7-Day Account Shadowban, Permanent Account Termination. Actions that target a user call `suspend_user_account` (records the reason, writes an audit row). |
| **Moderator note** | Field in the action dialog | Free text stored as the `reason` in the audit entry. Always write: severity, what rule was broken, evidence reference. |
| **Copyright takedown requests** | Any shared resource: flag (Report) button on the resource card or reader. Admin > Takedown Requests (`app/(admin)/takedown-requests.tsx`) | A rights holder / agent request ("This is my work" / "Acting for the rights holder") hides the resource immediately (`resources.takedown_status = 'disabled'`, uploader notified) and records the claimant's name, email, role and good-faith confirmation in `resource_takedown_requests`. An admin then chooses **Remove permanently** (deletes the resource row and its file in the `resources` bucket) or **Decline & restore**. Other report types (someone else's work, inappropriate, inaccurate) are queued without hiding. Target: decide within 5 working days. Policy text: `app/copyright.tsx`; contact address for people without an account: set `COPYRIGHT_TAKEDOWN.email` in `src/constants/legal.ts`. |
| **Audit log** | Admin > Safety > Audit Log (`app/(admin)/audit-logs.tsx`) | One ledger with filters: Moderation, Verification, Accounts, Support, Platform. Each entry has actor, action, target, campus, reason and timestamp; the filtered view can be exported to CSV. |
| **System audit log** | Admin > Audit logs (`app/(admin)/audit-logs.tsx`) | Append-only `audit_logs` table (UPDATE/DELETE blocked by trigger), including server-side triggers for privileged changes. Retained 24 months (`RETENTION.auditLogsMonths`). |
| **User Directory** | Admin > User Directory (`user-directory.tsx`) | Search users; edit role/status; suspend or restore an account (with reason); bulk suspend/verify; impersonation for support (requires a stated reason, produces a `impersonation_started` High-Risk audit entry). |
| **Verification requests** | Admin > Verification requests; Staff Workdesk > approvals | Review student ID / matric evidence; approve or reject. Documents are deleted 30 days after the decision. |
| **Support desk** | Admin > Support desk (`support-desk.tsx`) | User tickets, including appeals (section 6) and "my account was suspended" messages. |
| **Feature controls** | Admin > Feature controls | Kill-switches for features being abused (for example switch off marketplace or messaging while an incident is handled). |

Known limitations to be aware of (verify before launch, owner/engineering):
- "Temporary 24-Hour Mute" and "7-Day Account Shadowban" are UI labels in the queue. In the current code the only server-side enforcement for user-level action is `suspend_user_account` (an indefinite suspension until manually restored). A timed mute or shadowban is **not** automatically lifted - moderators must diary a restore date. TODO(engineering): confirm and either implement timed enforcement or rename the options.
- "Permanent Account Termination" text says it wipes the account and blacklists the email domain. Confirm what the code actually does before relying on that wording; use the User Directory suspension plus the account-purge process in `docs/compliance/retention-and-deletion.md`.
- There is no in-app severity field, SLA timer or assignment queue. Use the notes and a shared tracker (spreadsheet or issue tracker) for Critical and High cases. TODO(owner): choose the tracker.
- Messages: moderators do not have a general inbox reader. Chat evidence comes from reports (reporter-supplied) or, for Critical cases, from an admin using the database under the incident process below. Do not browse private messages without a report or legal basis.

## 5. Handling a report - step by step

1. Open the report; read the reason and the reported item in full context (thread, comments, attachments).
2. Assign severity (section 2) and write it in the moderator note.
3. **Preserve evidence first** if the report is High or Critical or may become a police matter (section 7). Deleting content before capturing it destroys the record.
4. Decide against the Community Rules (`/community-rules`) and Terms:
   - No violation: **Dismiss**. If the report looks abusive or malicious, note it (repeat false reporters are treated under section 8).
   - Minor violation, first time: **Official Warning** (content may stay or be removed).
   - Clear violation: **Purge and Take Down Content** (creates a community strike, see section 8).
   - Needs account-level action or staff is unsure: **Escalate to Admin** (staff) or apply suspension (admin).
5. Record the note, apply the action. The decision is written to the audit ledger automatically.
6. Notify: the reported user is told the content was removed and the rule that applied; the reporter is told the report was reviewed (do not disclose the outcome for the reported user beyond "action was taken" or "no violation found").
7. Close within the SLA. Where the case was Critical, send a written summary to the Trust & Safety lead the same day.

## 6. Appeals

- Who can appeal: any user whose content was removed or whose account was warned, suspended or terminated.
- How: reply through the in-app Support Desk within **14 days** of the notice, stating why the decision was wrong. TODO(owner): confirm the window.
- Who decides: a moderator or admin who was **not** involved in the original decision. Terminations and suspensions of more than 7 days are decided by an admin or the Trust & Safety lead.
- Timing: acknowledge within 3 working days, decide within **7 days**.
- Outcomes: upheld, reduced (for example suspension converted to a warning), or overturned (content restored, strike removed, account restored via User Directory). Record the outcome in the audit note and tell the user in plain language.
- Not appealable through this route: removals of Critical child-safety content (these are handled with law enforcement), and decisions that a court or authority has directed.
- A user may also complain to the NDPC about personal-data handling; the privacy policy says so.

## 7. Evidence handling and retention

**Goal:** keep enough to act, defend a decision and assist lawful investigations, and no more.

What to capture (High and Critical, or any case that may involve police, a lawsuit or a repeat offender):
- Report ID, reporter ID, target type and ID, campus, timestamps (UTC) and the reason text.
- The content itself: for **non-CSAM** material, a screenshot plus the raw record (post/comment/message row) exported by an admin; include the author ID and account creation date.
- Account context: email domain, verification status, prior strikes and audit entries.
- Moderator actions and notes (the audit log already holds these).

How to store:
- A restricted, access-logged folder (or encrypted vault) owned by the Trust & Safety lead. Not email attachments, not chat apps, not personal devices, not the public repository.
- Name files by report ID; keep a chain-of-custody note (who captured it, when, from where, hash of the file if practical).
- Access limited to the Trust & Safety lead, the acting admin and legal counsel.

Retention (draft - counsel to confirm and align `retention-and-deletion.md`):
| Record | Keep |
| --- | --- |
| Moderation queue rows and audit entries | 24 months (existing audit-log purge) |
| Evidence packages for closed Normal/High cases | 12 months after closure, then securely delete |
| Evidence for repeat-offender or contested cases | 24 months after closure |
| Evidence connected to a police/regulator request or a Critical case | Until the authority confirms it is no longer needed, or as counsel directs; **do not delete while a request is open** |
| Reporter identity | Not shown to the reported user; kept only as long as the case record |

Legal requests: only counsel or the Trust & Safety lead answers a police or court request. Verify the request is genuine (official channel, written, signed), log it, disclose only what it covers.

## 8. Enforcement ladder and repeat offenders

| Stage | Trigger | Consequence |
| --- | --- | --- |
| 1 | First minor violation | Official Warning; content removed if it broke a rule |
| 2 | Second violation within 90 days, or a clear violation | Content removed + community strike; short suspension (up to 7 days) at admin discretion |
| 3 | Third strike within 12 months, or serious harassment/fraud | Suspension of at least 30 days; the campus staff lead is informed |
| 4 | Continued abuse, ban evasion, fraud, or any Critical-category conduct | Permanent termination; admin decision with second sign-off; evidence retained |

- Strikes expire after 12 months without a further violation (except Critical-category conduct, which never expires).
- Ban evasion (new account by a terminated user) is itself a Stage 4 violation. Compare email domain, device/behaviour patterns and reports; do not publish the link between accounts.
- Malicious repeat reporters: warning, then suspension of reporting rights or account.
- Impersonation of staff/admin or misuse of admin tools by a moderator: treat as a security incident (`docs/compliance/incident-response.md`) as well as a conduct matter; suspend the moderator's role first, investigate second.
- Every stage-3 and stage-4 decision must be appealable (section 6) and recorded in the audit note.

## 9. CSAM and child-safety procedure

> **Draft - needs review by qualified legal counsel.** Creating, possessing, sharing or knowingly failing to act on child sexual abuse material is a serious crime in Nigeria (Cybercrimes (Prohibition, Prevention, etc.) Act 2015, Child's Rights Act 2003 and state Child's Rights laws) and in many other countries. Handling instructions here are designed to protect the child first and the staff second. Counsel must confirm the exact reporting obligations, the wording, and whether a preservation-in-place approach differs from what Nigerian law requires of a service provider.

### 9.1 Principles (never break these)

1. **Do not forward, download, copy, screenshot, print or share the material.** Not to colleagues, not to law enforcement by email attachment, not to your phone, not in a chat. Sending it - even to report it - can itself be an offence and re-victimises the child. Authorities and NCMEC will collect it through their own lawful process.
2. **Do not investigate on your own.** Do not contact the suspected offender, the child or the child's family, and do not search for more material.
3. **Look only as much as you must** to confirm the report and identify the content ID. If the thumbnail or title is enough, stop there.
4. **Speed matters.** Critical SLA: remove within 1 hour of the report reaching a staff member.
5. **Preserve records, not the images.** Keep identifiers and logs (below), not the material.

### 9.2 Steps

| # | Action | Who | Target time |
| --- | --- | --- | --- |
| 1 | Any moderator who sees suspected CSAM (from a report or by chance) stops, tells the Trust & Safety lead and an admin **by phone**, and marks the queue item Critical. | Moderator | Immediately |
| 2 | **Remove from view immediately**: use Purge and Take Down Content (admin) or, if staff, ask the admin to do it now. Make sure the file is unreachable to other users, including through any storage URL or cached copy. If a storage object must be removed, an admin with database/storage access does it and records the object path first. | Admin | Within 1 hour |
| 3 | **Suspend the uploader's account** (User Directory > Suspend, reason: "Critical - child safety, under investigation"). Do not delete the account: deleting destroys evidence. Revoke sessions if you can. | Admin | Within 1 hour |
| 4 | **Preserve evidence by identifier, not by copying the material.** Record: report ID, content ID/URL and storage path, uploader user ID, account creation date, email and IP addresses from auth/API logs, timestamps (UTC), the reporter ID, and the log lines. Export the relevant Supabase auth/API/Postgres logs and `audit_logs` rows to the restricted evidence store. **Do not delete the underlying storage object or database row permanently** until counsel/law enforcement says so; instead make it inaccessible (quarantine: move to a private, access-restricted location or set a hold flag, per counsel's instruction). TODO(counsel): confirm quarantine-in-place vs deletion. | Trust & Safety lead + admin | Same day |
| 5 | **Report to law enforcement**: Nigeria Police Force National Cybercrime Centre (NPF-NCCC) and **NAPTIP** where there are trafficking, exploitation or sextortion indicators involving a child. Provide the identifiers and logs, not the material. Get a reference number. | Trust & Safety lead (with counsel) | Within 24 hours; sooner if a child is in immediate danger (then call the police directly first) |
| 6 | **Report to NCMEC's CyberTipline** (report.cybertip.org) where applicable - in practice, where the material or the platform's infrastructure has a US nexus (hosting on US providers, US-based users, or content matched to known material). Submit as a registered Electronic Service Provider, giving identifiers and, only through NCMEC's own secure upload, any material NCMEC requests. Keep the report ID. | Trust & Safety lead | Within 24 hours of confirmation |
| 7 | **Notify the hosting providers' abuse channels only if instructed by counsel** (Supabase, Vercel); they have their own obligations and may need to preserve data. | Trust & Safety lead | As advised |
| 8 | **Assess personal-data implications** with the DPO (data disclosed to authorities, any breach angle). | DPO | Within 72 hours |
| 9 | **Do not tell the uploader why beyond a neutral notice** ("your account was suspended for a serious policy violation under review"); a detailed tip-off can prejudice an investigation. Follow law enforcement's advice on communication. | Trust & Safety lead | - |
| 10 | Log the case in the evidence store and audit log; brief the owner. | Trust & Safety lead | Same day |
| 11 | **After-action review** within 2 weeks: how did it reach the platform, could upload controls have caught it, what changes are needed. | Trust & Safety lead + engineering | 2 weeks |

Immediate danger to a child (for example a live-abuse threat, a child asking for help, sextortion in progress): call the police emergency line first (112 / 199 in Nigeria - TODO(owner): verify the current numbers) then follow the steps above.

Reports involving a minor as a victim of non-sexual content (bullying, self-harm) are Critical if there is a threat to life, otherwise High; involve the campus welfare/counselling office where one exists. TODO(owner): list each campus's welfare contact.

### 9.3 Access restrictions

- Only the Trust & Safety lead, one named admin and legal counsel may open a CSAM case record. Moderators outside that group escalate and stop.
- No staff member is required to view the material. Anyone may decline without penalty.
- All access to case files is logged.

### 9.4 Prevention notes for engineering (not part of this doc's operational steps)

- Consider hash-matching (for example the NCMEC/IWF hash lists via a vendor or Cloudflare's CSAM scanning tool if the CDN is placed in front) and image moderation on upload once the owner has decided on cost and privacy trade-offs. TODO(owner/engineering).
- Age gate and student-with-consent rules are in `src/constants/legal.ts` (18+, or admitted students aged 16–17 with parent/guardian authorisation).

## 10. Moderator wellbeing

- Exposure to abusive material is harmful. Rotate moderators; nobody should be the only person facing Critical content.
- Provide a named counselling or employee-assistance contact (TODO(owner)) and let staff take time out after a Critical case with no questions asked.
- Provide a written way to opt out of viewing graphic content; the escalation route in section 3 is designed so no one has to.
- Brief every new staff moderator on this runbook, on the Community Rules and on data-protection duties (moderators see personal data: use it only for moderation, never copy it out of the platform except into the evidence store).

## 11. Review and drills

- Owner reviews this runbook every 6 months and after every Critical case.
- Run a tabletop exercise before launch: a mock Critical report goes through steps 1-11 with timings; note where the tool or the contact sheet is missing something.
- Check monthly: open reports older than their SLA, appeals outstanding, strikes near expiry, contact sheet still correct.
