-- ============================================================================
-- LIORIS - LAUNCH HARDENING MIGRATION 2026
-- ============================================================================
-- Apply AFTER supabase_security_hardening_2026.sql (already applied in prod).
-- Single, idempotent, transaction-safe script. Safe to re-run. Every section
-- is guarded: a missing optional table / column / extension is skipped with a
-- NOTICE, never an error. Documentation: supabase_launch_hardening_2026.md
--
-- Section index:
--   1  push_tokens: move Expo push tokens out of the world-readable profiles row
--   2  client_errors: crash / error telemetry sink (admin read, service_role write)
--   3  Per-user abuse rate limits on user-generated content (BEFORE INSERT)
--   4  Retention: purge_expired_audit_logs(), pg_cron schedules
--   5  Consent versioning: latest_consent(), record_consent()
--   6  Fixes for gaps found while auditing (see the .md for the full list)
--   7  Grants hygiene for every function created here + NOTIFY
--
-- NOTE ON GRANTS: on Supabase, `ALTER DEFAULT PRIVILEGES` gives anon,
-- authenticated and service_role EXECUTE on every function created in schema
-- public. `REVOKE ... FROM PUBLIC` alone therefore does NOT lock a function;
-- every restricted function below is revoked from PUBLIC *and* anon *and*
-- authenticated explicitly (section 7 re-asserts all of them).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Preflight: the earlier migrations must be in place.
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Core tables missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.auth_profile_role()') IS NULL THEN
    RAISE EXCEPTION 'public.auth_profile_role() missing. Apply supabase_security_hardening_2026.sql first.';
  END IF;
  IF to_regclass('public.consent_records') IS NULL THEN
    RAISE NOTICE 'public.consent_records missing: consent RPCs (section 5) will be created but fail at call time until supabase_security_hardening_2026.sql is applied.';
  END IF;
END
$do$;

-- ============================================================================
-- SECTION 1. push_tokens
-- ============================================================================
-- Problem: profiles.push_token is readable by every same-campus user through
-- the profiles SELECT policy. An Expo push token is a bearer credential for
-- "send a notification to this device": anyone holding it can push spoofed
-- notifications (phishing links, fake admin alerts) straight to the device.
-- Fix: tokens live in a table only their owner (and service_role, used by the
-- send-push edge function) can read. The old column is kept for compatibility
-- but is forced to NULL forever.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_token_len CHECK (char_length(token) BETWEEN 10 AND 512),
  CONSTRAINT push_tokens_platform_len CHECK (platform IS NULL OR char_length(platform) <= 32)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read own push tokens" ON public.push_tokens;
CREATE POLICY "Owner can read own push tokens"
  ON public.push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can register own push tokens" ON public.push_tokens;
CREATE POLICY "Owner can register own push tokens"
  ON public.push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update own push tokens" ON public.push_tokens;
CREATE POLICY "Owner can update own push tokens"
  ON public.push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can delete own push tokens" ON public.push_tokens;
CREATE POLICY "Owner can delete own push tokens"
  ON public.push_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages push tokens" ON public.push_tokens;
CREATE POLICY "Service role manages push tokens"
  ON public.push_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

-- updated_at bookkeeping + per-user cap (a user never legitimately has more
-- than a handful of devices; the cap stops table stuffing). Oldest tokens are
-- evicted first. Both run as the caller: they only touch the caller's own rows.
CREATE OR REPLACE FUNCTION public.push_tokens_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  ELSE
    DELETE FROM public.push_tokens t
     WHERE t.id IN (
       SELECT id FROM public.push_tokens
        WHERE user_id = NEW.user_id
        ORDER BY updated_at DESC
        OFFSET 19                       -- keep 19 + the row being inserted = 20
     );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_push_tokens_before_write ON public.push_tokens;
CREATE TRIGGER trg_push_tokens_before_write
  BEFORE INSERT OR UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.push_tokens_before_write();

-- Atomic register / hand-over RPC. A plain client upsert(onConflict: 'token')
-- FAILS when the token still belongs to the previous account of the same
-- phone (RLS hides that row, so DO UPDATE is refused). This RPC re-parents the
-- token to the caller. Optional: the current client upsert keeps working for
-- the normal (no hand-over) case.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 10 AND 512
     OR p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{6,}\]$' THEN
    RAISE EXCEPTION 'Invalid push token.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.push_tokens AS t (user_id, token, platform)
  VALUES (v_uid, p_token, left(p_platform, 32))
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = COALESCE(EXCLUDED.platform, t.platform),
        updated_at = now();
END
$$;

-- Migrate existing profiles.push_token values, then neutralise the column.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'push_token') THEN
    RAISE NOTICE 'profiles.push_token does not exist: skipping push token migration';
    RETURN;
  END IF;

  -- Copy (skip NULL / blank / duplicate / out-of-range values), then blank the leaking column.
  EXECUTE $q$
    INSERT INTO public.push_tokens (user_id, token)
    SELECT p.id, btrim(p.push_token)
      FROM public.profiles p
     WHERE p.push_token IS NOT NULL
       AND char_length(btrim(p.push_token)) BETWEEN 10 AND 512
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    ON CONFLICT (token) DO NOTHING
  $q$;

  EXECUTE 'UPDATE public.profiles SET push_token = NULL WHERE push_token IS NOT NULL';

  -- The column is now write-proof: any INSERT/UPDATE that tries to store a
  -- value stores NULL instead (old clients keep "working" without leaking).
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.profiles_force_null_push_token()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $body$
    BEGIN
      NEW.push_token := NULL;
      RETURN NEW;
    END
    $body$
  $f$;
  EXECUTE 'DROP TRIGGER IF EXISTS trg_profiles_force_null_push_token ON public.profiles';
  EXECUTE 'CREATE TRIGGER trg_profiles_force_null_push_token
             BEFORE INSERT OR UPDATE ON public.profiles
             FOR EACH ROW WHEN (NEW.push_token IS NOT NULL)
             EXECUTE FUNCTION public.profiles_force_null_push_token()';
END
$do$;

-- ============================================================================
-- SECTION 2. client_errors (crash / error telemetry)
-- ============================================================================
-- Written ONLY by the report-client-error edge function with the service role
-- (which bypasses RLS). Admins can read and delete; nobody else can do anything.
CREATE TABLE IF NOT EXISTS public.client_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid NULL,
  session_id   text,
  fingerprint  text NOT NULL,
  message      text,
  stack        text,
  url          text,
  user_agent   text,
  release      text,
  level        text NOT NULL DEFAULT 'error',
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrences  int NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_fingerprint_last_seen
  ON public.client_errors (fingerprint, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at
  ON public.client_errors (created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read client errors" ON public.client_errors;
CREATE POLICY "Admins can read client errors"
  ON public.client_errors FOR SELECT TO authenticated
  USING (public.auth_profile_role() = 'admin');

DROP POLICY IF EXISTS "Admins can delete client errors" ON public.client_errors;
CREATE POLICY "Admins can delete client errors"
  ON public.client_errors FOR DELETE TO authenticated
  USING (public.auth_profile_role() = 'admin');
-- Deliberately NO insert / update policy: service_role bypasses RLS.

REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;

-- Retention: keep p_days days of errors (by last occurrence). service_role only.
CREATE OR REPLACE FUNCTION public.purge_old_client_errors(p_days int DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be >= 1' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.client_errors
   WHERE last_seen_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- ============================================================================
-- SECTION 3. PER-USER ABUSE RATE LIMITS ON USER-GENERATED CONTENT
-- ============================================================================
-- One generic BEFORE INSERT trigger function, configured per table through
-- CREATE TRIGGER arguments (TG_ARGV):
--   0 owner column   (uuid column that identifies the author, e.g. author_id)
--   1 max rows       (allowed inserts per window)
--   2 window seconds
--   3 label          (used in the error message, e.g. 'posts')
--   4 time column    (optional, default created_at)
-- Behaviour:
--   * calls without a JWT subject (service_role, cron, SQL editor) are exempt;
--   * callers whose profile role is admin or staff are exempt (announcements,
--     bulk notifications, moderation tooling);
--   * otherwise the number of rows the row's owner inserted during the last
--     window is counted and the insert is refused with SQLSTATE P0001 once the
--     limit is reached.
-- Why SECURITY DEFINER: the count must see ALL of the owner's rows, including
-- ones the caller's RLS SELECT policy hides (e.g. moderation_queue only shows
-- your own reports; a user cannot dodge the limit by deleting/hiding rows because
-- the count is taken by the definer). The owner is read from the row itself,
-- and every INSERT policy already forces owner = auth.uid(), so the counter
-- cannot be pointed at another user by the client.
-- Cost: one index range scan per INSERT, capped at (limit) index entries thanks
-- to LIMIT and the (owner, created_at) composite indexes created below.
CREATE OR REPLACE FUNCTION public.enforce_insert_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_col   text := TG_ARGV[0];
  v_max   int  := TG_ARGV[1]::int;
  v_win   int  := TG_ARGV[2]::int;
  v_label text := COALESCE(TG_ARGV[3], TG_TABLE_NAME);
  v_time  text := COALESCE(NULLIF(TG_ARGV[4], ''), 'created_at');
  v_role  text;
  v_owner uuid;
  v_cnt   bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;                                   -- service_role / cron / SQL editor
  END IF;

  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role IN ('admin', 'staff') THEN
    RETURN NEW;
  END IF;

  v_owner := (to_jsonb(NEW) ->> v_col)::uuid;
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM (SELECT 1 FROM %I.%I WHERE %I = $1 AND %I > now() - make_interval(secs => $2) LIMIT $3) s',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col, v_time)
    INTO v_cnt USING v_owner, v_win, v_max;

  IF v_cnt >= v_max THEN
    RAISE EXCEPTION 'Rate limit: too many % - please wait a few minutes', v_label
      USING ERRCODE = 'P0001',
            HINT = format('limit %s per %s seconds', v_max, v_win);
  END IF;
  RETURN NEW;
END
$$;

-- Attach the limits. Limits are deliberately GENEROUS (real users never see
-- them); they only stop scripts. Table | owner column | max rows | window (s).
DO $do$
DECLARE
  r record;
  v_idx text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('posts',               'author_id',    20,     3600, 'posts'),
      ('post_comments',       'author_id',    60,      600, 'comments'),
      ('chat_messages',       'sender_id',   100,       60, 'messages'),
      ('chat_channels',       'created_by',   30,     3600, 'conversations'),
      ('moderation_queue',    'reporter_id',  20,     3600, 'reports'),
      ('events',              'creator_id',   10,    86400, 'events'),
      ('resources',           'uploader_id',  20,     3600, 'resource uploads'),
      ('marketplace_listings','seller_id',    20,    86400, 'listings'),
      ('jobs',                'poster_id',    10,    86400, 'job posts'),
      ('connections',         'requester_id', 50,    86400, 'connection requests'),
      ('mentorships',         'student_id',   20,    86400, 'mentorship requests'),
      ('study_groups',        'creator_id',   10,    86400, 'study groups'),
      ('forum_communities',   'created_by',    5,    86400, 'community proposals'),
      ('support_tickets',     'user_id',      10,    86400, 'support tickets'),
      ('notifications',       'sender_id',  1000,     3600, 'notifications')
    ) AS t(tbl, owner_col, max_rows, win_secs, label)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'rate limit: table public.% missing, skipped', r.tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.owner_col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'created_at') THEN
      RAISE NOTICE 'rate limit: public.%.% or created_at missing, skipped', r.tbl, r.owner_col;
      CONTINUE;
    END IF;

    v_idx := left('idx_rl_' || r.tbl || '_' || r.owner_col || '_created', 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I, created_at DESC)', v_idx, r.tbl, r.owner_col);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_rate_limit_' || r.tbl, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit(%L, %L, %L, %L)',
      'trg_rate_limit_' || r.tbl, r.tbl, r.owner_col, r.max_rows::text, r.win_secs::text, r.label);
  END LOOP;
END
$do$;

-- ============================================================================
-- SECTION 4. RETENTION
-- ============================================================================
-- audit_logs is append-only through trg_audit_logs_append_only (UPDATE/DELETE)
-- created in supabase_security_hardening_2026.sql (section 8). Retention is the
-- ONE sanctioned deletion path: this function disables exactly that trigger,
-- deletes rows older than p_months, and re-enables it. (ALTER TABLE is
-- transactional in Postgres, so an error in the DELETE rolls the DISABLE back
-- too; the explicit handler makes that guarantee independent of that fact.)
-- The truncate guard is never touched. Minimum retention: 12 months.
-- ALTER TABLE ... DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock: audit inserts
-- wait for the purge to finish, so it is scheduled off-peak (03:17 UTC).
CREATE OR REPLACE FUNCTION public.purge_expired_audit_logs(p_months int DEFAULT 24)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n        bigint := 0;
  v_disabled boolean := false;
BEGIN
  IF p_months IS NULL OR p_months < 12 THEN
    RAISE EXCEPTION 'Audit logs must be retained for at least 12 months (got %).', p_months
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'purge_expired_audit_logs is restricted to service_role.' USING ERRCODE = '42501';
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.audit_logs'::regclass
                  AND tgname = 'trg_audit_logs_append_only' AND NOT tgisinternal) THEN
      ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_append_only;
      v_disabled := true;
    END IF;

    DELETE FROM public.audit_logs
     WHERE created_at < now() - make_interval(months => p_months);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    IF v_disabled THEN
      ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_append_only;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF v_disabled THEN
      ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_append_only;
    END IF;
    RAISE;
  END;

  -- The purge itself is auditable (written after the trigger is back on).
  IF v_n > 0 THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'audit_logs_purged', 'audit_logs', NULL,
            jsonb_build_object('deleted', v_n, 'older_than_months', p_months, 'source', 'retention_job'));
  END IF;
  RETURN v_n;
END
$$;

-- Daily jobs (UTC, off-peak) - only when pg_cron is installed. Idempotent: an
-- existing job of the same name is unscheduled first. If pg_cron is not
-- enabled, enable it in Dashboard -> Database -> Extensions and re-run this
-- script, or call the functions from an external scheduler with the service key.
DO $do$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: retention jobs NOT scheduled (see supabase_launch_hardening_2026.md)';
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('lioris_purge_audit_logs',      '17 3 * * *', 'SELECT public.purge_expired_audit_logs(24)'),
      ('lioris_purge_client_errors',   '37 3 * * *', 'SELECT public.purge_old_client_errors(30)'),
      ('lioris_cleanup_rate_limits',   '47 3 * * *', 'SELECT public.cleanup_api_rate_limits()')
    ) AS j(name, schedule, cmd)
  LOOP
    BEGIN
      IF r.name = 'lioris_cleanup_rate_limits'
         AND to_regprocedure('public.cleanup_api_rate_limits(integer)') IS NULL THEN
        RAISE NOTICE 'cleanup_api_rate_limits(int) missing: job % skipped', r.name;
        CONTINUE;
      END IF;
      -- Idempotency: drop a previous job of the same name (ignore "not found").
      BEGIN
        EXECUTE format('SELECT cron.unschedule(%L)', r.name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      EXECUTE format('SELECT cron.schedule(%L, %L, %L)', r.name, r.schedule, r.cmd);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not schedule cron job %: % (schedule it manually)', r.name, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- ============================================================================
-- SECTION 5. CONSENT VERSIONING
-- ============================================================================
-- The client compares latest_consent() with its TERMS_VERSION constant and shows
-- a re-consent gate when they differ; record_consent() stores the acceptance.
CREATE OR REPLACE FUNCTION public.latest_consent(p_type text DEFAULT 'terms_and_privacy')
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.version
    FROM public.consent_records c
   WHERE c.user_id = auth.uid()
     AND c.consent_type = COALESCE(p_type, 'terms_and_privacy')
   ORDER BY c.accepted_at DESC, c.created_at DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.record_consent(p_version text, p_age_confirmed boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_version IS NULL OR p_version !~ '^[A-Za-z0-9._-]{1,64}$' THEN
    RAISE EXCEPTION 'Invalid consent version.' USING ERRCODE = '22023';
  END IF;
  IF p_age_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Age confirmation is required.' USING ERRCODE = '22023';
  END IF;
  -- clock_timestamp() (not now()) keeps 'most recent' well-ordered even when two
  -- acceptances happen inside one transaction.
  -- Abuse guard: consent is a once-per-version event; 20 rows/day is plenty.
  IF (SELECT count(*) FROM public.consent_records
       WHERE user_id = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Rate limit: too many consent submissions - please wait a few minutes'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.consent_records (user_id, consent_type, version, accepted_at, age_confirmed_18, source)
  VALUES (v_uid, 'terms_and_privacy', p_version, clock_timestamp(), true, 'reconsent');
END
$$;

-- ============================================================================
-- SECTION 6. FIXES FOUND WHILE AUDITING  (details in the .md)
-- ============================================================================
-- 6a. Self-inserted profile privilege escalation (CONFIRMED by the harness).
--     The INSERT policy "Users can insert own profile" only checks id = auth.uid().
--     tr_prevent_profile_role_escalation is BEFORE UPDATE only, so a signed-in
--     user WITHOUT a profiles row (e.g. an admin deleted just the profile row,
--     or a legacy account never backfilled) could run
--       INSERT INTO profiles (id, email, full_name, role, verification_status,
--                             trust_score, campus_code)
--       VALUES (auth.uid(), '..', '..', 'admin', 'verified', 100, 'UI');
--     and become an admin. This BEFORE INSERT guard normalises the row for any
--     JWT-authenticated non-admin caller. Calls without a JWT subject (the
--     GoTrue signup trigger handle_new_user_profile(), service_role, SQL editor)
--     are untouched, so signup behaves exactly as before.
CREATE OR REPLACE FUNCTION public.profiles_guard_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = NEW.id;

  NEW.role                := CASE WHEN NEW.role::text = 'alumni' THEN 'alumni'::public.user_role_type
                                  ELSE 'student'::public.user_role_type END;
  NEW.verification_status := 'unverified';
  NEW.is_suspended        := false;
  NEW.trust_score         := 80.00;
  -- Campus can only come from the verified e-mail domain, never from the client.
  NEW.campus_code         := COALESCE(public.campus_for_email(v_email), 'GLOBAL');
  IF v_email IS NOT NULL THEN
    NEW.email := v_email;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_self_insert ON public.profiles;
CREATE TRIGGER trg_profiles_guard_self_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_self_insert();

-- 6b. INFORMATIONAL (not changed here): profiles.email / student_id_number /
--     trust_score / last_active_at are readable by every same-campus user via
--     the profiles SELECT policy. A column-level REVOKE would make the client's
--     select('*') calls (AuthContext, admin UserProfilesTab, supportTickets
--     embeds) fail, so it is documented with a migration path in the .md
--     instead of being applied blind.

-- ============================================================================
-- SECTION 7. GRANTS HYGIENE FOR EVERYTHING CREATED HERE
-- ============================================================================
-- Trigger functions never need EXECUTE for triggers to fire.
REVOKE ALL ON FUNCTION public.push_tokens_before_write()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_insert_rate_limit()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_guard_self_insert() FROM PUBLIC, anon, authenticated;
DO $do$
BEGIN
  IF to_regprocedure('public.profiles_force_null_push_token()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.profiles_force_null_push_token() FROM PUBLIC, anon, authenticated;
  END IF;
END
$do$;

-- service_role-only maintenance functions.
REVOKE ALL ON FUNCTION public.purge_old_client_errors(int)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_audit_logs(int)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_client_errors(int)  TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_logs(int) TO service_role;

-- Signed-in RPCs.
REVOKE ALL ON FUNCTION public.register_push_token(text, text)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.latest_consent(text)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_consent(text, boolean)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.latest_consent(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_consent(text, boolean)   TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
