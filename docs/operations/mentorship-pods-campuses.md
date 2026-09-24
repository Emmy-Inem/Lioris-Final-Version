# Mentorship, study pods, events and campuses (Sept 2026 rebuild)

Three migrations and one edge function back this work. Apply in order with
`npx supabase db push --project-ref fdtnbluslkabwsmspbem` (dry-run first with `--dry-run`), then
`supabase functions deploy admin-manage-institution`.

| Migration | What it does |
| --- | --- |
| `20260925100000_mentorship_v2.sql` | Mentor profiles, structured mentorships, sessions, goals, journal, feedback; state-changing functions; mentor directory; cron for stale requests + session reminders. |
| `20260925110000_study_pods_v2.sql` | Pod roles, private-pod approval, pod discussion, sessions + RSVPs, unread counts; discovery function; cron for session reminders. |
| `20260925130000_normalise_tags_keep_first.sql` | Tag clean-up keeps the first spelling/order a person typed. |
| `20260925120000_events_portals_campuses.sql` | Spotlight/sponsored are admin-only; no global events while the Global toggle is off; seeds the portal links the client only knew as defaults; campus email-domain guard; `admin_campus_overview()`. |

## Design rules

- **Clients cannot write these tables directly.** Every change is a `SECURITY DEFINER` function that checks who is
  asking, the current state and capacity, writes the row and notifies the other person in one transaction. Errors are
  raised as `code` or `code: sentence for people` and turned into readable text by `src/utils/rpcErrors.ts`.
- **Notifications** are inserted by those functions (`type = 'system'`, `action_url = /mentorship/<id>` or
  `/study-groups/<id>`); the existing `trg_notifications_send_push` trigger delivers the push, and
  `src/utils/notificationRouter.ts` opens the right screen.
- **Discovery goes through functions** (`mentor_directory`, `list_study_groups`) so the campus wall and private-pod
  privacy are enforced in one place. `study_groups` and `study_group_members` are no longer readable by non-members.

## Mentorship

`mentor_profiles` (opt-in) -> `mentor_directory()` -> `request_mentorship()` -> `respond_mentorship()` ->
`propose_mentorship_session()` / `respond_mentorship_session()` / goals / `post_mentorship_update()` ->
`end_mentorship()` -> `submit_mentorship_feedback()`.

Statuses: `pending`, `active`, `completed`, `declined`, `withdrawn`, `ended`. One open (pending/active) request per
student-mentor pair; a student can have 5 pending requests; a declined mentor cannot be asked again for 7 days; a
mentor's `max_mentees` is enforced on request and on accept. Unanswered requests close after 21 days
(`lioris_expire_mentorship_requests`, 04:13 daily); confirmed sessions get reminders 24 h and 1 h ahead
(`lioris_mentorship_reminders`, every 10 min).

Video sessions use the existing call room derived from the mentorship id (`getCallRoomName`), authorised by the
`mentorships` table, so only the two participants can join.

## Study pods

Roles `owner` / `moderator` / `member`; membership status `active` / `pending` (private pod awaiting approval) /
`banned`. Functions: `create_study_group`, `update_study_group`, `join_study_group`, `leave_study_group` (an owner
leaving hands the pod on; the last member closes it), `respond_study_group_join`, `remove_study_group_member`,
`set_study_group_member_role`, `post_to_study_group`, `moderate_study_group_post`, `schedule_study_group_session`,
`cancel_study_group_session`, `rsvp_study_group_session`, `mark_study_group_read`, `report_study_group_post`.
Reminders one hour before a session (`lioris_study_pod_reminders`).

**Reporting:** a member can report another member's post; it goes into the normal moderation queue as item type
`pod_post` on the pod's campus, where admins (and campus staff, once the staff portal is on) see the real post text and
can take it down (staff have a delete policy on pod posts for their own campus).

The pod's meeting link is returned only to active members.

## Events

`enforce_event_privileged_columns` lets only an **admin** change `is_spotlight` and `sponsored` (and only on an
existing event: the insert always stores `false` for everyone else). `events_keep_campus_when_global_off` keeps a
non-admin's event on their own campus while `feature_flags.global_workspace` is off; the create popup hides the
"Global network" option under the same flag.

## Campuses

`campuses.email_domains` drives auto-verification at signup (`campus_for_email()`), so it is guarded twice:
`campuses_guard()` (well-formed, not a public mailbox provider or bare suffix like `gmail.com` / `edu.ng`, not
overlapping another campus) and the `admin-manage-institution` edge function, which also checks the domain exists in
DNS (override with `allowUnresolvedDomains`), writes the audit trail and can seed portal links and approve the
university request. Actions: `create`, `update`, `set_active` (turning off a campus with members needs `confirm`).
Rate limit: 30 changes per admin per hour. Same MFA policy as the other admin functions (`REQUIRE_ADMIN_MFA`).

`useCampusRegistry()` loads campuses from the database at app start, so a campus added here appears in sign-up,
onboarding and the landing page without an app update.

Portal links are read from `portal_links` (seeded by the migration); the built-in defaults in
`src/api/portalLinks.ts` are only a fallback for members when the database cannot be reached or a campus has no rows.
Titles are unique per campus.

## Verification (2026-09-25)

After applying, a throwaway-account suite (6 real logins over HTTP: student, alumni, staff, admin, two campuses) ran
147 checks through PostgREST + RLS + the deployed edge function, including a real TOTP step-up for the admin and a real
DNS lookup; all passed. The same screens were then driven in a browser against live data. `audit_logs` is append-only,
so the test run's audit entries (about 8, all naming the `E2ETEST` campus, actor anonymised on account deletion)
remain by design.

## Not covered

- Mentors are alumni only in the UI (the database allows staff/admin profiles; staff have no mentorship desk).
- The admin "Add campus" form calls the edge function from the browser, which only accepts the origins in
  `ALLOWED_ORIGINS` (production site). From a `localhost` dev origin the form shows the "site's address may not be on
  the ALLOWED_ORIGINS list" message.
