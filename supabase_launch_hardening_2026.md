# Lioris launch hardening (database) - 2026

File: `supabase_launch_hardening_2026.sql` (single `BEGIN ... COMMIT`, idempotent, every section guarded).
Verification: `tools/sql-harness` (PGlite, 64 checks, see `supabase/tests/README.md`).

## Apply order

Nothing new is needed before this file if production already has everything below. On a fresh project the order is:

1. `supabase_schema.sql`
2. `supabase_fix_*.sql`, `supabase_add_*.sql`, `supabase_backfill_profiles.sql` (as before; `supabase_migration_align.sql` only for the drifted legacy production DB)
3. `supabase_email_confirmation_2026.sql`
4. `supabase_security_hardening_2026.sql` (already applied in production, not modified)
5. **`supabase_launch_hardening_2026.sql`** (this file)

Paste it into the Supabase SQL editor and run it once. It is safe to re-run. It takes short locks only
(`CREATE INDEX` without `CONCURRENTLY` on 8 to 15 small tables, one `UPDATE` of `profiles.push_token`);
run it at a quiet moment anyway. Optional but recommended before running: enable the `pg_cron` extension
(Dashboard, Database, Extensions) so section 4 schedules the retention jobs; if it is not enabled the
script prints a NOTICE and skips scheduling (re-run after enabling).

## What each section changes

### 1. `push_tokens` (push token leak)
* `profiles.push_token` was readable by every same-campus user; a token lets anyone send spoofed
  notifications to that device.
* New `public.push_tokens(id, user_id -> auth.users ON DELETE CASCADE, token UNIQUE, platform, created_at, updated_at)`,
  index on `user_id`, RLS: owner `SELECT/INSERT/UPDATE/DELETE` on own rows, `service_role` full (policy + grants),
  `anon` nothing. Constraints: token length 10-512, platform <= 32 chars.
* Existing `profiles.push_token` values are copied (NULL / blank / duplicate skipped), the column is set to NULL and
  a `BEFORE INSERT OR UPDATE` trigger (`trg_profiles_force_null_push_token`) forces it to NULL forever. The column
  is kept so old clients do not break (they now silently store nothing).
* Extras: `updated_at` maintenance + per-user cap of 20 tokens (oldest evicted) via `trg_push_tokens_before_write`;
  `register_push_token(p_token, p_platform)` RPC (authenticated) that validates the Expo token format and
  **hands a token over** to the caller.
  **Client note:** the current client does `upsert(..., { onConflict: 'token' })`. That works for a new token or the
  same user, but fails with an RLS error when the same phone was previously used by another account that did not
  unregister (the old row is invisible to the new user, so `DO UPDATE` is refused). Calling
  `supabase.rpc('register_push_token', { p_token, p_platform })` instead fixes hand-over. The client already
  treats registration errors as non-fatal.

### 2. `client_errors`
Exactly the requested columns, indexes `(fingerprint, last_seen_at DESC)` and `(created_at DESC)`, RLS on, policies:
admins (`auth_profile_role() = 'admin'`) `SELECT` and `DELETE`; no insert/update policy (the `report-client-error` edge
function uses the service role, which bypasses RLS). `REVOKE ALL` from `anon, authenticated`, then
`GRANT SELECT, DELETE` to `authenticated`. `purge_old_client_errors(p_days int DEFAULT 30) returns bigint`
(`service_role` only, `p_days >= 1`). `user_id` deliberately has no FK (as specified); rows expire after 30 days.

### 3. Abuse rate limits
`enforce_insert_rate_limit()` (`SECURITY DEFINER`, `search_path = public, pg_temp`), attached as
`trg_rate_limit_<table>` `BEFORE INSERT ... FOR EACH ROW` with arguments `(owner_column, max_rows, window_seconds, label)`
(optional 5th argument: time column, default `created_at`). Callers with no JWT subject (service_role, cron, SQL editor)
and callers whose profile role is `admin` or `staff` are exempt. Otherwise it counts the owner's rows in the window
(capped by `LIMIT max_rows`, so cost is bounded by the limit and served by the new composite index
`idx_rl_<table>_<owner>_created (owner, created_at DESC)`) and raises
`Rate limit: too many <label> - please wait a few minutes` with SQLSTATE `P0001` and a HINT carrying the limit.
`SECURITY DEFINER` is required so the count sees rows the caller's RLS hides (for example `moderation_queue` only shows
your own reports); the owner value comes from the row itself and every INSERT policy already forces owner = `auth.uid()`,
so the client cannot aim the counter at somebody else. Tables/columns missing in your database are skipped.

| Table | Owner column | Limit | Window | Label in message |
|---|---|---|---|---|
| `posts` | `author_id` | 20 | 1 hour | posts |
| `post_comments` | `author_id` | 60 | 10 minutes | comments |
| `chat_messages` | `sender_id` | 100 | 1 minute | messages |
| `chat_channels` | `created_by` | 30 | 1 hour | conversations |
| `moderation_queue` (reports) | `reporter_id` | 20 | 1 hour | reports |
| `events` | `creator_id` | 10 | 1 day | events |
| `resources` | `uploader_id` | 20 | 1 hour | resource uploads |
| `marketplace_listings` | `seller_id` | 20 | 1 day | listings |
| `jobs` | `poster_id` | 10 | 1 day | job posts |
| `connections` | `requester_id` | 50 | 1 day | connection requests |
| `mentorships` | `student_id` | 20 | 1 day | mentorship requests |
| `study_groups` | `creator_id` | 10 | 1 day | study groups |
| `forum_communities` | `created_by` | 5 | 1 day | community proposals |
| `support_tickets` | `user_id` | 10 | 1 day | support tickets |
| `notifications` | `sender_id` | 1000 | 1 hour | notifications |

Tune a limit by re-creating its trigger (see Rollback) or by editing the `VALUES` list and re-running the script.
`waitlist_entries` (anonymous INSERT) is not covered: rate-limit it at the edge (Turnstile / Cloudflare) instead.
Likes, RSVPs and group joins are not limited (single cheap rows with composite primary keys).

### 4. Retention
* `purge_expired_audit_logs(p_months int DEFAULT 24) returns bigint`, `SECURITY DEFINER`, `service_role` only, refuses
  `p_months < 12`. `audit_logs` is append-only through `trg_audit_logs_append_only` (BEFORE UPDATE OR DELETE) from the
  security hardening file. The function disables **only that trigger** (`ALTER TABLE ... DISABLE TRIGGER`), deletes rows
  older than `p_months`, and re-enables it inside an `EXCEPTION` block that re-enables and re-raises (Postgres DDL is
  transactional so an error would roll the DISABLE back anyway; the handler makes the guarantee independent of that).
  The truncate guard is untouched. It writes an `audit_logs_purged` row (actor NULL, count, months) when it deleted
  something. While it runs, `ALTER TABLE` holds a `SHARE ROW EXCLUSIVE` lock, so audit inserts wait; hence the off-peak schedule.
* Schedules (only if the `pg_cron` extension exists; each job is unscheduled first so re-runs are idempotent; any failure is a WARNING):

| Job name | UTC | Command |
|---|---|---|
| `lioris_purge_audit_logs` | 03:17 daily | `SELECT public.purge_expired_audit_logs(24)` |
| `lioris_purge_client_errors` | 03:37 daily | `SELECT public.purge_old_client_errors(30)` |
| `lioris_cleanup_rate_limits` | 03:47 daily | `SELECT public.cleanup_api_rate_limits()` (signature `(int default 86400)` from the previous migration) |

Without `pg_cron`, call the functions daily from an external scheduler using the service-role key
(`POST /rest/v1/rpc/purge_expired_audit_logs`, body `{"p_months":24}`).

### 5. Consent versioning
* `latest_consent(p_type text DEFAULT 'terms_and_privacy') returns text` - authenticated; version of the caller's most
  recent `consent_records` row of that type, else `NULL`. Matches `ReConsentGate.tsx`.
* `record_consent(p_version text, p_age_confirmed boolean DEFAULT true) returns void` - authenticated, `SECURITY DEFINER`;
  requires a JWT, version matching `^[A-Za-z0-9._-]{1,64}$`, `p_age_confirmed = true`; inserts a `consent_records` row for
  `auth.uid()` with `source = 'reconsent'`, `accepted_at = clock_timestamp()`; at most 20 rows per user per day.

### 6. Other fixes
* **6a (fixed): self-inserted profile privilege escalation.** The `profiles` INSERT policy only checks `id = auth.uid()`
  and `tr_prevent_profile_role_escalation` is `BEFORE UPDATE` only. A signed-in user with no `profiles` row (for example
  an admin deleted just that row, or a legacy account that was never backfilled) could `INSERT` themselves with
  `role = 'admin'`, `verification_status = 'verified'`, any campus and trust score. **Reproduced in the harness before the
  fix.** New `BEFORE INSERT` trigger `trg_profiles_guard_self_insert` normalises the row for JWT-authenticated non-admins
  (role student, or alumni if requested; unverified; not suspended; trust 80; campus derived from the auth e-mail domain,
  else `GLOBAL`; e-mail forced to the auth e-mail). No effect on signup (the GoTrue trigger has no JWT subject), `service_role`,
  SQL editor or admins. The client never inserts into `profiles`, so nothing breaks.
* **6b (reported, NOT changed): same-campus users can read peers' `email`, `student_id_number`, `trust_score`,
  `last_active_at`, `is_suspended`, `onboarding_complete` through the `profiles` SELECT policy** (confirmed by the harness).
  RLS cannot hide columns, and a column-level `REVOKE SELECT (email, ...) FROM authenticated` would make every
  `select('*')` fail with `permission denied for column`; the client does exactly that in `src/auth/AuthContext.tsx` (own
  profile, three places), `src/components/admin/UserProfilesTab.tsx` and the `supportTickets` embed
  (`profiles:user_id(... email, student_id_number)` for admins). Proposed safe migration:
  1. Client: replace the `select('*')` calls with explicit column lists; add a `get_my_profile()` `SECURITY DEFINER` RPC
     (returns the caller's full row) and an admin/staff `admin_list_profiles()` RPC for the admin tab and ticket embeds.
  2. Other reads already use explicit safe columns (`id, full_name, username, bio, department, interests, campus_code,
     avatar_url, banner_url, verification_status, role, is_suspended, ...` in `src/api/*`).
  3. Then: `REVOKE SELECT ON public.profiles FROM authenticated; GRANT SELECT (id, full_name, username, role, campus_code,
     department, faculty, level, bio, interests, avatar_url, banner_url, verification_status, custom_accent_color, created_at)
     ON public.profiles TO authenticated;` (own e-mail comes from `auth.getUser()`), and keep `admin`/`staff` on RPCs.
  Do this as its own change with client + DB shipped together; it is the biggest remaining privacy item (e-mail and
  matriculation numbers of classmates).
* **6c (checked, OK): resource self-approval.** `trg_enforce_resource_moderation` (BEFORE INSERT/UPDATE) runs before the
  INSERT policy `WITH CHECK`, so a student INSERT with `is_approved = true` is stored as `false` and accepted by the
  policy; a student UPDATE cannot approve; staff/admin approval works.
* **6d (noted, not changed):** `notifications` INSERT lets any user create a notification for any recipient with their own
  `sender_id` (needed for chat/like notifications) and free-text `title`, `body`, `action_url`, i.e. a phishing vector inside
  the app inbox. `action_url` is not URL-scheme-checked (deliberately excluded by the previous migration: it holds in-app
  paths). Mitigated now by the 1000/hour cap; the durable fix is to create notifications from `SECURITY DEFINER` triggers /
  the edge function only and to allow-list `action_url` prefixes in the client. Also `waitlist_entries` accepts anonymous
  inserts (`WITH CHECK (true)`): protect with Turnstile / edge rate limiting.

### 7. Grants
Every restricted function is revoked from `PUBLIC, anon, authenticated` explicitly (Supabase default privileges grant
`EXECUTE` to `anon/authenticated/service_role`, so revoking from `PUBLIC` alone is not enough), then granted back only to
the intended roles. Ends with `NOTIFY pgrst, 'reload schema'`.

## Bugs found in the previous migration (`supabase_security_hardening_2026.sql`)

I executed the previous migration (and all earlier ones) in PGlite and ran ~40 behaviour checks against it
(`tools/sql-harness/run.mjs`, sections "previously-shipped security hardening" and "more regression coverage"). **No
functional defect was found in it**: everything it claims held. Observations that are not defects but matter operationally:

1. `tr_prevent_profile_role_escalation` also applies to JWT-less callers at trigger depth 1. A plain
   `UPDATE profiles SET role = 'staff'` from the SQL editor or with the service-role key is **silently reverted**
   (the trigger only lets admins, staff-on-students and nested server-side updates through). To appoint the first
   admin/staff from SQL you must run `ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation;
   UPDATE ...; ALTER TABLE ... ENABLE TRIGGER ...;` in one transaction, or promote through the app as an existing admin.
   The last-admin guard still protects removal. I left this unchanged (changing it alters a security control that is live);
   no edge function currently needs to write those columns.
2. The previous file ran without any failing statement on a clean database when applied after the other migrations in the
   order listed above.
3. The gap fixed in section 6a existed in `supabase_schema.sql` (policy) and was not covered by the previous migration.

There are therefore no corrective statements for the previous file beyond section 6a.

## Verification queries (run after applying)

```sql
-- push_tokens migrated, column neutralised
SELECT count(*) AS tokens FROM public.push_tokens;
SELECT count(*) AS leaked FROM public.profiles WHERE push_token IS NOT NULL;               -- expect 0
-- rate-limit triggers (expect 15 rows, fewer if optional tables are absent)
SELECT tgrelid::regclass, tgname FROM pg_trigger WHERE tgname LIKE 'trg_rate_limit_%' AND NOT tgisinternal ORDER BY 1;
-- client_errors privileges (expect: authenticated = SELECT, DELETE only; anon = none)
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'client_errors' ORDER BY 1, 2;
-- retention functions locked to service_role (expect false, false, true for each)
SELECT p.oid::regprocedure AS fn, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
  FROM pg_proc p WHERE p.proname IN ('purge_expired_audit_logs', 'purge_old_client_errors', 'enforce_insert_rate_limit');
-- audit trigger enabled (expect tgenabled = 'O')
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal;
-- cron jobs (only with pg_cron)
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'lioris_%';
-- dry run of a purge (does nothing on a young database); run as service_role / postgres
SELECT public.purge_expired_audit_logs(24);
-- profile insert guard installed
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname IN
  ('trg_profiles_guard_self_insert', 'trg_profiles_force_null_push_token');
```

## Rollback hints

Everything is additive; there is no data destruction except nulling `profiles.push_token` (its values now live in
`push_tokens`; to restore: `UPDATE profiles p SET push_token = t.token FROM push_tokens t WHERE t.user_id = p.id`
after dropping `trg_profiles_force_null_push_token`, but that re-opens the leak).

```sql
-- rate limits (per table; drop all)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tgrelid::regclass AS t, tgname FROM pg_trigger WHERE tgname LIKE 'trg_rate_limit_%' AND NOT tgisinternal
  LOOP EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.t); END LOOP; END $$;
-- profile guards
DROP TRIGGER IF EXISTS trg_profiles_guard_self_insert ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_force_null_push_token ON public.profiles;
-- cron
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'lioris_%';
-- tables / functions (only if truly needed)
DROP TABLE IF EXISTS public.client_errors, public.push_tokens;
DROP FUNCTION IF EXISTS public.purge_expired_audit_logs(int), public.purge_old_client_errors(int),
  public.latest_consent(text), public.record_consent(text, boolean), public.register_push_token(text, text),
  public.enforce_insert_rate_limit(), public.profiles_guard_self_insert(), public.profiles_force_null_push_token(),
  public.push_tokens_before_write();
-- the (owner, created_at) indexes are harmless; drop with DROP INDEX public.idx_rl_* if desired
```

## Limits of the verification

Behaviour was executed in PGlite (real Postgres 17 engine) with simulated Supabase roles, `auth`, `storage`, `realtime`
and JWT claim settings. Not exercised: PostgREST, GoTrue, Supabase Storage/Realtime services, the real `pg_cron`
extension, concurrent load. Run the verification queries above in production after applying.
