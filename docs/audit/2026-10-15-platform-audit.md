# Platform audit - onboarding, verification, authentication, student role, resources, admin sync

Date: 2026-10-15. Scope: everything in this repository that touches sign-up, sign-in, onboarding,
verification, the student role, resource upload/download, and the Campus Admin / Super Admin split.

## How this was done, and its limits

* Every claim below was traced to a file and line in the repository **and, wherever it is a database
  rule, reproduced by executing the repository's real SQL** (root `supabase_*.sql` files plus every file in
  `supabase/migrations/`) in an in-memory Postgres 17 (PGlite) and probing it as `anon`, a student, staff,
  a Campus Admin and a Super Admin. `tools/sql-harness/audit-remediation.mjs --before` reruns those probes
  against the pre-fix state: **29 of 40 probes fail there** (those are the holes); all 42 pass after the fix
  (the two extra checks cover the new functions).
* **I could not reach your live Supabase project** from the sandbox (the network proxy returns 403 for
  `*.supabase.co`). So "reproduced" means "reproduced on the SQL this repo defines". Whether production
  really matches depends on which of the ~100 SQL files were applied and in what order, because the repo
  has **two un-reconciled migration systems** (root `supabase_*.sql`, applied by hand, and
  `supabase/migrations/`, applied by the CLI) and `handle_new_user_profile()` alone is defined five times.
  `supabase/diagnostics/audit_live_state.sql` is a read-only script that answers this for the live database
  in one run - see "What I need from you".

Legend: **[fixed]** code/SQL in this change, covered by tests. **[confirm]** needs the live diagnostic.
**[open]** not fixed here, with the reason.

---

## Critical

### C1 - Anyone with the public key can read every member's e-mail, student ID and push token  [fixed] [confirm]
* `supabase/migrations/20260929000000_close_open_security_findings.sql` had restricted `profiles` to safe
  columns. `20261023000000_repair_profiles_grants_and_rls.sql` then ran `GRANT SELECT ON public.profiles TO
  authenticated` **and `TO anon`** "to fix 42501 errors", and added an anon policy
  `campus_code = 'GLOBAL' OR directory_discoverable = TRUE`. `directory_discoverable` defaults to **TRUE**.
* Reproduced: with only the anon key, `SELECT email, student_id_number FROM profiles` returned all 28
  fixture rows; a classmate could read a peer's `email`, `push_token`, `last_login_at`, `suspension_reason`.
* Why it was "repaired" that way: two RLS policies (`resources`, `audit_logs`) and **six client queries**
  (`marketplace.ts`, `events.ts`, `resources.ts`, `studyGroups.ts`, `communities.ts`, `posts.ts`) selected
  `profiles.email`; with the column privileged they failed with 42501, which also broke posting/uploading for
  every student. The band-aid reopened the data instead of fixing the readers.
* Fix: column-level grants restored with an explicit, tested list (anon gets 11 public columns and only
  GLOBAL-campus rows); the two policies and six client reads no longer need `email`
  (`get_my_profile()` serves the caller's own row); `public_profiles` (no row filter, owner privileges)
  revoked from anon/authenticated. **Rule for the future:** a new `profiles` column is unreadable until it is
  added to the grant list in the migration - the harness checks every table stays readable.

### C2 - Every Campus Admin is a Super Admin inside the database  [fixed] [confirm]
* `is_super_admin()` (last defined in `20261026010000_remove_fake_seeded_events.sql`) returns TRUE for
  `role = 'admin'`; a second, strict function `auth_is_super_admin()` exists beside it. They disagree.
* `"Admins have full profile access" FOR ALL ... role = 'admin'` plus the profiles SELECT policy
  (`auth_profile_role() IN ('admin','staff')`) mean a Campus Admin could **read, edit and delete users of
  any campus** through the REST API (reproduced: update and delete of a UI student by a UNILAG admin both
  affected 1 row) and any staff member could read every campus's profiles.
* The same "any admin = global" rule is in **97 policies on 44 tables** (posts, announcements, jobs,
  marketplace, support tickets, ...). This is the root of the "campus ambassador admin vs super admin out of
  sync" reports: the UI scopes by campus, the database does not, so the two roles see different numbers
  depending on which screen/RPC they hit.
* Fix: one definition of super admin; `can_admin_campus(campus)` (Super Admin = all; Campus Admin/staff =
  only their own real campus, never GLOBAL/NULL, never while suspended); profiles, verifications,
  resources, events, audit_logs, campuses and storage rewritten on it; Campus Admins can no longer delete or
  transfer members; admin tier is normalised (an admin with NULL `admin_role` becomes `campus_admin`).
* The remaining 89 policies were closed by migration `20261029000000_admin_scope_completion.sql`
  [fixed] [confirm]: instead of rewriting each one it adds a RESTRICTIVE policy per table (ANDed with the
  existing permissive ones) so a Campus Admin / staff member can only read or write rows of their own
  campus (posts, events, announcements, jobs, marketplace, study groups, moderation queue, analytics, portal
  links, giving campaigns, communities, plus their child tables), and only a Super Admin touches push
  tokens, client errors, consent records, waitlist, blocks and partnerships. Students are unaffected.
  chat_* tables stay membership-governed on purpose.

### C3 - Resource files: cross-campus leak, and "unable to download"  [fixed] [confirm]
Database:
* Storage SELECT policy `"Campus media and resources viewable by verified members"` is
  `auth_is_verified_member()` - **campus-agnostic and approval-agnostic**. A verified UNILAG student can read
  (and list) every file in the `resources` bucket, including UI's and including unapproved uploads.
* The same policy gives **unverified members nothing**, while `resources` rows for GLOBAL material (and,
  via `20261015`, their own campus) are visible. So the list shows a card and `createSignedUrl` fails:
  this is the "I cannot download" report. Guests see GLOBAL rows too (`20261023010000`) but cannot sign them.
* Fix: file access now follows the *row* (`can_read_resource_object`): uploader, Super Admin, Campus
  Admin/staff of that campus, or an approved row visible to the reader under the campus wall, and the
  `can_download_resources` permission. The row policy follows the wall (`auth_campus_access`), restoring the
  approved plan in `docs/security/campus-access-control.md` ("an unverified campus user reads zero campus
  ... resources"; `20261015` had switched it to the *claimed* campus, so unverified members saw campus lists
  they could not open).
Client (`ResourceCard`, `ResourceReaderModal`, `createResource`):
* "Download" was `window.open`/`Linking.openURL` after an `await`: popup blockers (iOS Safari, Android
  Chrome) silently dropped it, yet the app toasted "Download started", showed "Saved" and bumped the counter.
  Nothing was ever saved to the device, and the file was named after its storage path.
* The preview iframe used a **Google Docs viewer URL built from the stored (non-public) address** - Google
  fetched an error page. "Open file" for any non-PDF opened the dead public URL of the now-private bucket.
* `createResource` inserted the row even when the file blob could not be read (the "fake resource with a
  missing file" that `20261026000000` had to clean up by hand), stored `.docx` content as `.pdf`, labelled
  every file "PDF", and accepted webp/gif that the bucket rejects.
* Fix: `src/utils/downloadFile.ts` (web: `<a download>` on a signed URL minted with
  `{ download: <title>.<ext> }`; native: real download into cache, then the share/save sheet),
  `src/api/resourceFiles.ts` (clear errors: sign in / verify / removed / offline), `useResourceDownload`
  shared by card and reader (counts only after a real hand-off, once per person), PDF preview through a
  signed URL (CSP `frame-src` now allows the project origin), uploads require the file and derive extension
  and label from the real type.

### C4 - Any handle -> its owner's e-mail address, for anyone  [fixed]
* `get_email_for_username()` is `SECURITY DEFINER` and granted to `anon`; the login screen calls it to turn
  `@handle` into an e-mail. Reproduced. Usernames are shown all over the app, so this is bulk e-mail harvesting.
* Fix: new `login-with-username` edge function signs the user in server-side and returns only the session;
  the RPC is service-role only. Unknown handle and wrong password are indistinguishable; per-IP and
  per-handle rate limits. **Deploy the function before applying the migration.**

---

## High

### H1 - Verified members can change campus; members can edit the fields that make them "verified"  [fixed]
* The self-update guard let a *verified* member whose address is not institutional move to any campus
  (verification is campus-agnostic, so it unlocked the new campus). Reproduced.
* `profiles.is_bot` and `profiles.email` are self-editable; `is_profile_verified()` accepted
  `is_bot = TRUE` and **any** `*.edu.ng` address. Reproduced: set `is_bot`, or set the profile e-mail to
  `x@anything.edu.ng`, then `is_profile_verified()` is TRUE (study pods, resource upload).
* Fix: one rewritten guard (replacing eleven definitions): role/tier/suspension/trust/ambassador/`is_bot`/
  e-mail frozen for self-edits; verified membership is locked to its campus; a verified member of no campus
  who joins one starts unverified; a pending request follows a campus change; institutional e-mail =
  campus fixed by the server. `is_profile_verified()` now equals the server's `verification_status`.

### H2 - Admin directory leaks across campuses and mislabels admins  [fixed]
* `admin_get_user_profiles()` scoped only `admin_role = 'campus_admin'`: **staff** and admins with NULL
  `admin_role` got every campus (with e-mail and student ID) and the latest version *labelled NULL-tier
  admins "super_admin"*. Reproduced. `admin_search_profiles` and analytics scoped correctly - so the same
  person saw different populations in different tabs.
* `set_campus_ambassador_status()` skipped its campus check for callers with no/GLOBAL campus.
* Fix: one rule for all admin RPCs (Super Admin = all; everyone else pinned to their own real campus).

### H3 - Verification is easy to fake, impossible to review safely, and drifts out of sync  [fixed]
* `INSERT` policy was `WITH CHECK (auth.uid() = user_id)`: a student can insert a row already `approved`,
  for another campus. Reproduced.
* The review wrote `verifications` and then `profiles` as two client calls; if the second failed the request
  left the queue (the queue lists only `pending`) while the student stayed `pending` forever.
* The client guessed the request's campus from the typed university name with substring matches
  (`includes('UI')`) and fell back to `GLOBAL`, which **no Campus Admin can see**; new campuses (JSIIT, ...)
  were not in the list at all. Evidence was always stored as `image/jpeg`/`.jpg`.
* Any admin could review any campus; nothing stopped two open requests for one person.
* Fix: `submit_verification_request()` (campus/role from the profile, evidence path must be the caller's,
  idempotent, profile -> pending in the same transaction) and `review_verification_request()` (campus scope,
  `can_verify_students`, no self-review, reason required to reject, atomic, audited); strict policies; one
  open request per person; evidence stored under its real type (JPG/PNG/WebP/PDF); dedicated
  `rejection_reason`. Both client calls fall back to the old path if the database is not migrated yet.

### H4 - Any admin can rewrite the campus list  [fixed]
`campuses` was writable by every `role = 'admin'`. Campus e-mail domains drive **auto-verification**, and
deleting a row sets members' `campus_code` to NULL. Now Super Admin only.

### H5 - The Role Permissions matrix does nothing  [fixed for 3 keys, open for the rest]
`can_download_resources`, `can_upload_resources`, `can_verify_students`... are read only by the editor screen.
No client code or SQL consulted them, so the Super Admin could toggle a permission and nothing changed - an
"admin sync" illusion. `has_role_permission()` now enforces download, upload and verify in the database.
Migration `20261029` also enforces `can_post_forum`, `can_comment_forum`, `can_list_marketplace` and
`can_send_messages` on insert. **[open, deliberately]** the other ~15 keys stay decorative: the seeded
defaults contradict shipped behaviour (e.g. students can propose events although `can_create_events` is
false for students), so enforcing them would break working features. Decide each default, then add its
`role_permission_insert` policy (one line per table in the migration).

### H6 - Onboarding / authentication client bugs  [fixed]
| Symptom reported | Cause | Fix |
|---|---|---|
| Finished accounts sent through onboarding again; admins dropped into the student portal | profile read had a single 3 s attempt; on a miss the code used the default `student`/`onboarding_complete = false` **and persisted it** | bounded read + retry via `get_my_profile()`; a miss keeps the cached projection |
| Onboarding loop | `completeOnboarding` set the local flag first; the DB write's failure was only logged, so the next sign-in/device saw `false` (and 20261021-20261025 additionally threw an enum error on *every* profile update - already fixed by 20261025) | `complete_my_onboarding()`; nothing is marked complete until the server says so; errors shown |
| Chosen campus differs from the one used for access | institutional e-mail / verified members are silently reverted by the guard; the app kept the requested campus; `set_my_campus_code` errors ignored; failed writes reported success (zero-row `UPDATE`, "fetch" errors swallowed) | `save_academic_profile()` returns what was stored; UI explains the lock up front; `updateMyProfile` reads back and throws |
| Logged out on slow networks | 4 s `getSession` timeout treated as "signed out" | a timeout keeps the cached session; the cache shows immediately |
| "Incorrect password" during an outage; lockout from own connection | every sign-in error recorded a failed attempt | only wrong credentials count; transport/429 get their own messages |
| Landing page flashes after entering the e-mail code | `router.replace('/')` before the session existed | "Signing you in..." until the listener has the user |
| Stale menus after a role change | realtime listener followed `role` only | follows admin tier, campus, verification; 60 s poll + foreground refresh (Realtime only delivers to roles with table-level SELECT) |
| Confirmation link opens the wrong site | `signUp` had no `emailRedirectTo` | set |

### H7 - Sign-up trigger: five definitions, wrong age flag  [fixed] [confirm]
One historical definition (`supabase_email_confirmation_2026.sql`) elevates `inememmanuel@gmail.com` to admin
**at sign-up, before the address is confirmed**. And every version reads `age_confirmed_18` while the app
sends `age_eligibility_confirmed`, so every consent record since the age gate changed says "age NOT
confirmed" (a compliance record). One canonical definition now (role never from metadata; age flag read from
both keys). The diagnostic reports both facts for production.

---

## Medium

* **M1** Resource `INSERT` did not bind `campus_code`: a student could file material into another campus's
  moderation queue. [fixed]
* **M2** Download counter incremented on every tap and before the download. [fixed]
* **M3** Six client gates re-implemented verification with "any `*.edu.ng` address is verified". The server
  only auto-verifies launched campuses' domains, so e.g. `@abu.edu.ng` members saw no prompt while every
  campus query returned nothing. Removed; members who confirmed an institutional address before
  auto-verify existed are backfilled. [fixed]
* **M4** `getMyProfile()` wrote the campus kept in device storage onto whichever account signed in next
  (shared phones), and tried to write `verified` to the profile. [fixed]
* **M5** Admin "create user" fabricated a random `CAMPUS/2026/NNNN` student number and stored it. [fixed]
  It also creates accounts with the public key (`signUp`), so captcha / rate limits / two e-mails apply.
  Now the `admin-create-user` edge function [fixed]: authority is checked on the server (Super Admin: any
  campus/role; Campus Admin: own campus, student/alumni/staff only), the account is created with the
  service role and confirmed, the profile is completed or the user is rolled back, the person gets a
  "choose your password" e-mail, no matric number is invented, and an audit row is written.
  **Deploy it** (`supabase functions deploy admin-create-user`); the admin screen no longer creates users
  from the browser.
* **M6** `audit_logs` policy treated GLOBAL-campus admins as super admins and read `profiles.email`. [fixed]

## Needs a decision or live access  [open]

1. **Migration provenance.** Two migration systems and no single baseline. Once the live schema is
   readable, take a `supabase db pull` baseline and retire the root files. (The harness cannot know which
   were applied.)
2. ~~89 other policies~~ [fixed] and ~~`campus-media` bucket~~ [fixed] by migration `20261029`
   (`can_read_media_object()`: own folder, own-campus admin, own campus, or referenced by a global post /
   event / marketplace listing / giving campaign / chat the caller belongs to).
3. **Owner e-mail hard-coded** in 5 SQL functions, the client and the edge functions as a Super Admin
   bootstrap. Convenient, but the mailbox is a master key; prefer `admin_role` alone once the roster is
   confirmed (then delete the e-mail comparison in `auth_is_super_admin()`).
4. **Native sign-up/sign-in and CAPTCHA.** The Turnstile widget is web-only. If Supabase CAPTCHA protection
   is ON, native sign-ups and logins cannot succeed. Dashboard check (not visible from SQL): leave CAPTCHA
   OFF for native or ship a WebView widget (react-native-webview is already installed) - not done here
   because it cannot be tested without a device and the live CAPTCHA keys.
5. **MFA** is now optional in the database [fixed, off by default]: migration `20261030` adds
   `admin_aal2_ok()`; once every admin has enrolled (diagnostic row "admins who already enrolled") run
   `INSERT INTO platform_settings (key, value) VALUES ('admin_mfa_required', '{"enabled": true}') ON CONFLICT
   (key) DO UPDATE SET value = EXCLUDED.value;` and enrolled admins need an AAL2 session to hold any admin
   authority. Admins without a factor are never locked out.
6. Feature flags (`FeatureFlagsContext`) hide tabs but do not block routes or data (UX only by design).

## Rollout order

1. Run `supabase/diagnostics/audit_live_state.sql`; keep the output.
2. Deploy `login-with-username` (`supabase functions deploy login-with-username --no-verify-jwt`).
3. In the diagnostic's ADMIN ROSTER, make sure every platform-wide administrator has
   `admin_role = 'super_admin'` (the migration prints the roster as NOTICEs and turns NULL into
   `campus_admin`).
4. Deploy `admin-create-user` too (`supabase functions deploy admin-create-user`), then paste
   `supabase/manual/02_apply_fixes.sql` into the SQL editor (migrations 20261028 + 20261029 + 20261030,
   one run, each its own transaction, safe to re-run).
5. Re-run the diagnostic (`03_verify_after.sql`): every "(must be false)" row must read false and section
   G must show `true` / counts as labelled. See `supabase/manual/README.md`.
6. Ship the app/web build. It works before and after step 4 (it falls back to the old calls while the new
   functions are missing).
7. Smoke test: student downloads a GLOBAL file (unverified) and a campus file (verified); campus admin sees
   only their campus in Directory, Verification queue, Analytics; super admin sees all; a username login.

## Tests added
* `tools/sql-harness/audit-remediation.mjs` (`npm run audit` / `npm run audit:before` in
  `tools/sql-harness`): 55 behavioural checks as anon / student / staff / Campus Admin / Super Admin.
* `src/utils/fileNames.test.ts`, updated `src/utils/verificationGate.test.ts`.
