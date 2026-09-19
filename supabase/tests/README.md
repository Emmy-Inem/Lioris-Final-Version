# Database tests (SQL harness)

The Lioris database layer (RLS policies, `SECURITY DEFINER` functions, triggers) is verified by
**executing the real migration files** against an in-memory Postgres 17 (PGlite = Postgres compiled
to WASM). No Supabase project, Docker, network or credentials are involved and no real database is
touched.

```
cd tools/sql-harness
npm install          # first time only, installs @electric-sql/pglite + libpg-query into tools/sql-harness/node_modules
npm test             # = node run.mjs  (about 15-30 seconds)
npm run parse        # syntax-only check of every supabase_*.sql with the real Postgres parser
```

Exit code is `0` when every check passes, `1` otherwise. Output is one `PASS` / `FAIL` line per check
plus a summary. `node run.mjs --keep` additionally prints the per-file load log.

## What it does

1. `tools/sql-harness/bootstrap.sql` stubs what Supabase provides: roles `anon`, `authenticated`,
   `service_role` (BYPASSRLS), `authenticator`, `supabase_auth_admin`; schemas `auth` (`users`,
   `uid()`, `role()`, `jwt()`, `email()` reading the same `request.jwt.claim*` settings as Supabase),
   `storage` (`buckets`, `objects`, `foldername()`), `realtime` (`messages`, `topic()`), `extensions`
   (`pgcrypto`, `uuid-ossp`), and Supabase's `ALTER DEFAULT PRIVILEGES` for schema `public` (this is
   why `REVOKE ... FROM PUBLIC` alone never locks a function on Supabase).
2. It applies, in order: `supabase_schema.sql`, the `supabase_fix_*` / `supabase_add_*` /
   `supabase_backfill_*` files, `supabase_email_confirmation_2026.sql`,
   `supabase_security_hardening_2026.sql` (strict, must apply), then
   `supabase_launch_hardening_2026.sql` (strict, applied twice to prove idempotency).
   `supabase_migration_align.sql` is deliberately skipped: it repairs a drifted production database by
   dropping stale empty tables *before* the schema runs, which would drop the freshly created tables
   on a clean database.
3. `tools/sql-harness/run.mjs` seeds users through the real signup trigger (`auth.users` insert) and
   runs the assertions as different roles: each check does `SET LOCAL ROLE ...` +
   `set_config('request.jwt.claims', ...)` inside a transaction that is rolled back.

## What is asserted (64 checks)

* Previous hardening (regression): students cannot change role / verification / suspension / trust
  score / campus; staff cannot touch other campuses, staff or admins; secret `platform_settings`
  keys are unreadable and unwritable by everyone; `audit_logs` UPDATE / DELETE / TRUNCATE fail for
  every role including `service_role`; the last active admin cannot be demoted, suspended or deleted;
  resource uploads are forced to `is_approved = false`; `consume_rate_limit` works for `service_role`
  and is denied to `anon` / `authenticated`; `export_my_data` only returns the caller's rows; signup
  never creates an admin (including the old backdoor e-mail); `suspend_user_account` rules; user
  deletion with audit rows; `purge_user_data` privileges; every table has RLS; every
  `SECURITY DEFINER` function pins `search_path` (incl. `pg_temp`) and is not executable by `anon`.
* Launch hardening: `push_tokens` migration (dedup, blanks skipped, source column nulled, cannot be
  refilled), owner-only access, hand-over RPC, per-user cap; `client_errors` privileges and
  retention; every rate limit trigger (the N+1th insert is refused with `P0001`, staff / admin /
  service_role exempt, windows expire, per-user isolation); `purge_expired_audit_logs` (refuses
  < 12 months, restores the append-only trigger on success AND on error, is itself audited);
  the `pg_cron` scheduling block (against stub `cron.*` functions); consent RPCs; the profile
  self-insert escalation guard; the migration applying when optional tables / columns are missing.

## Known limits of this harness (read before trusting it blindly)

* PGlite is real Postgres, but it is not Supabase. PostgREST (`db-pre-request`, request role
  switching), GoTrue, Storage, Realtime and `pg_cron` are **not** present. JWT context is simulated
  with the same GUCs PostgREST sets. Only a fraction of the storage policies is exercised.
* `pg_cron` is simulated with stub functions to test the scheduling block's logic; the real
  extension has not been exercised.
* Concurrency (advisory locks, `ALTER TABLE ... DISABLE TRIGGER` lock behaviour under load) is not
  tested; PGlite is single-connection.
* Legacy `supabase_*` files that are allowed to fail statement-by-statement are reported in the
  load log (currently none fail on a clean database).

If PGlite ever becomes unusable in your environment, `npm run parse` (libpg-query, the real Postgres
parser) still proves the SQL parses. It does **not** prove behaviour.
