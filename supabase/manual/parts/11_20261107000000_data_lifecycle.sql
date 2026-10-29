-- LIORIS manual SQL, part 11 of 18: 20261107000000_data_lifecycle.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261107000000_data_lifecycle.sql ##########
-- ============================================================================
-- DATA LIFECYCLE, COMPLIANCE & RETENTION (2026-11)
-- ============================================================================
-- Idempotent. Everything is guarded (to_regclass / to_regprocedure / extension checks), so it
-- applies on a database that lacks pg_cron, pg_net or vault, and re-running changes nothing.
--
--   1  Compliance RPCs now live in migrations (they were only in root SQL files):
--      export_my_data, purge_user_data, record_consent, latest_consent,
--      list_expired_verification_documents (+ new clear_verification_document_paths)
--   2  Erasure: audit_logs keep a SHA-256 hash instead of the raw user id; consent evidence
--      survives as an anonymised proof row (public.consent_proofs); non-FK user columns are covered
--   3  Verification document retention matches the REAL evidence path columns
--   4  Retention purge functions + pg_cron jobs (analytics, push tokens, click logs, moderation
--      queue, unread notifications, verification documents)
--   5  analytics_events: no more WITH CHECK (true); record_user_activity is no longer anon
--   6  claim_push_token(): a device that changes hands is re-parented to the new user
--   7  Missing indexes (query paths + FKs that make profile deletion scan whole tables)
--   8  Campus deletion safety: direct DELETE FROM campuses is refused; admin_delete_campus audits
--   9  Realtime publication: each table added separately
--  10  Sign-up trigger survives a duplicate e-mail row; event-cancel fan-out is non-fatal
--  11  connections: one live (pending/accepted) row per unordered pair
--  12  Storage: only onboarded users may upload to the resources / campus-media buckets
--
-- ---------------------------------------------------------------------------
-- RPC CONTRACT for the purge-expired-verification-documents edge function
-- (service_role only, never callable by anon/authenticated):
--
--   list_expired_verification_documents(p_days int DEFAULT 30, p_limit int DEFAULT 500)
--     RETURNS TABLE (bucket text, path text, verification_id uuid)
--     * matches storage.objects.name (bucket 'verifications') against the evidence columns
--       verifications.id_card_front_url / id_card_back_url / selfie_url (bare path, leading slash,
--       'verifications/' prefix and legacy signed/public URLs are all normalised) and against the
--       legacy '<uid>/<verifications.id>.<ext>' naming;
--     * returns documents of requests DECIDED (approved/rejected) more than p_days ago, plus
--       unreferenced objects older than p_days whose owner has no pending request (orphans:
--       deleted accounts, abandoned uploads). verification_id is NULL for orphans;
--     * p_limit is clamped to 1..5000; the call is idempotent, so run it until it returns 0 rows.
--   clear_verification_document_paths(p_ids uuid[]) RETURNS integer
--     * after the Storage API has deleted the objects, send the NON-NULL verification_id values
--       back; the three path columns of those DECIDED requests are set to NULL (pending
--       requests are never touched). Returns the number of rows cleared.
--   Edge function flow: rpc list -> storage.remove(paths) -> rpc clear(ids of removed rows).
--
-- Cron (section 4) calls the edge function through pg_net with two Vault secrets:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'lioris_project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'lioris_cron_secret');
--   select public.schedule_verification_document_purge();   -- (re)schedules the job
-- ---------------------------------------------------------------------------

BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261106000000') THEN RAISE EXCEPTION 'Stopped: migration 20261106000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;

-- ============================================================================
-- 1a. consent_records (root file only so far) + anonymised proof archive
-- ============================================================================
DO $do$
BEGIN
  IF to_regclass('public.consent_records') IS NULL THEN
    CREATE TABLE public.consent_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      consent_type text NOT NULL,
      version text NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      age_confirmed_18 boolean NOT NULL DEFAULT false,
      source text NOT NULL DEFAULT 'signup',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_consent_records_user ON public.consent_records(user_id);
    ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view own consent records" ON public.consent_records
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can record own consent" ON public.consent_records
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    REVOKE ALL ON public.consent_records FROM PUBLIC, anon;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.consent_records FROM authenticated;
    GRANT SELECT, INSERT ON public.consent_records TO authenticated;
    GRANT ALL ON public.consent_records TO service_role;
  END IF;
END
$do$;

-- Erasure deletes consent_records (ON DELETE CASCADE). The legal evidence "this person accepted
-- version X at time T" is kept as a row that cannot be traced back to the person without the
-- original id: {sha256(user id), consent_type, version, accepted_at}. Retention of these proofs
-- is a policy decision (see docs/compliance); they hold no direct identifier.
CREATE TABLE IF NOT EXISTS public.consent_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_hash text NOT NULL CHECK (user_hash ~ '^[0-9a-f]{64}$'),
  consent_type text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_hash, consent_type, version, accepted_at)
);
ALTER TABLE public.consent_proofs ENABLE ROW LEVEL SECURITY;
-- RLS with NO policy: clients can run SELECT (no "permission denied" noise for generic table
-- scans) but always see zero rows; only service_role (BYPASSRLS) reads or writes.
REVOKE ALL ON public.consent_proofs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consent_proofs TO authenticated;
GRANT SELECT, INSERT ON public.consent_proofs TO service_role;

-- ============================================================================
-- 1b. consent RPCs (copied from supabase_launch_hardening_2026.sql section 5)
-- ============================================================================
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

-- Supabase grants EXECUTE on new functions to anon explicitly, so anon must be revoked by name.
REVOKE ALL ON FUNCTION public.latest_consent(text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_consent(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_consent(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_consent(text, boolean) TO authenticated, service_role;

-- ============================================================================
-- 1c. export_my_data (copied from supabase_security_hardening_2026.sql section 11c)
-- ============================================================================
-- (c) export_my_data(): everything that belongs to the caller.
--     Tables/columns are discovered from foreign keys pointing at profiles /
--     auth.users, so tables added later are covered too:
--       * every ON DELETE CASCADE ownership column (posts.author_id, ...),
--         except user_blocks.blocked_id (other people's blocks against you);
--       * plus moderation_queue.reporter_id, forum_communities.created_by,
--         chat_channels.created_by (SET NULL ownership columns).
--     Never included: rows only linked via reviewed_by/approved_by/sender_id
--     etc. (other people's data), verification document URLs, internal
--     support_tickets.admin_notes, chat messages written by other people.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_data jsonb := '{}'::jsonb;
  v_truncated jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_where text;
  v_strip text[];
  v_cnt bigint;
  r record;
  c_cap constant int := 20000;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  FOR r IN
    SELECT cl.relname::text AS tbl,
           array_agg(DISTINCT a.attname::text ORDER BY a.attname::text) AS cols
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname <> 'audit_logs'
       AND (
            (c.confdeltype = 'c' AND NOT (cl.relname = 'user_blocks' AND a.attname = 'blocked_id'))
         OR (cl.relname = 'moderation_queue' AND a.attname = 'reporter_id')
         OR (cl.relname = 'forum_communities' AND a.attname = 'created_by')
         OR (cl.relname = 'chat_channels' AND a.attname = 'created_by')
       )
     GROUP BY cl.relname
     ORDER BY cl.relname
  LOOP
    SELECT string_agg(format('%I = $1', col), ' OR ') INTO v_where FROM unnest(r.cols) AS col;
    v_strip := CASE r.tbl
      WHEN 'verifications' THEN ARRAY['id_card_front_url', 'id_card_back_url', 'selfie_url', 'reviewed_by']
      WHEN 'support_tickets' THEN ARRAY['admin_notes', 'resolved_by']
      ELSE ARRAY[]::text[]
    END;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, v_where) INTO v_cnt USING v_uid;
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %s LIMIT %s) t',
      r.tbl, v_where, c_cap)
      INTO v_rows USING v_uid, v_strip;

    v_data := v_data || jsonb_build_object(r.tbl, v_rows);
    IF v_cnt > c_cap THEN
      v_truncated := v_truncated || jsonb_build_object(r.tbl, v_cnt);
    END IF;
  END LOOP;

  -- Actions the user performed (admin/staff) and actions taken on the account.
  v_data := v_data || jsonb_build_object(
    'audit_logs_performed_by_you',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'entity_type', a.entity_type,
                                                  'entity_id', a.entity_id, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs WHERE actor_id = v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb),
    'audit_logs_about_your_account',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs
                       WHERE entity_id = v_uid AND actor_id IS DISTINCT FROM v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb)
  );

  -- Uploaded files: metadata only (paths, sizes), never content.
  BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'bucket', o.bucket_id, 'path', o.name,
                 'size_bytes', o.metadata->>'size', 'mime_type', o.metadata->>'mimetype',
                 'created_at', o.created_at)), '[]'::jsonb)
          FROM (SELECT * FROM storage.objects
                 WHERE (storage.foldername(name))[1] = $1::text LIMIT 20000) o
      $q$ INTO v_rows USING v_uid;
      v_data := v_data || jsonb_build_object('storage_objects', v_rows);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_data := v_data || jsonb_build_object('storage_objects', '[]'::jsonb);
  END;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'data_export_requested', 'user', v_uid,
          jsonb_build_object('summary', 'User exported their personal data', 'source', 'export_my_data'));

  RETURN jsonb_build_object(
    'schema_version', 1,
    'exported_at', now(),
    'user_id', v_uid,
    'data', v_data,
    'truncated_tables', v_truncated
  );
END
$$;

REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- ============================================================================
-- 2. audit_logs: controlled anonymisation + purge_user_data
-- ============================================================================
-- audit_logs is append-only for everybody. Erasure needs ONE narrow exception: a SECURITY DEFINER
-- function (current_user is the owner, never anon/authenticated/service_role) may, inside a
-- transaction that set lioris.audit_anonymise = 'on', change ONLY actor_id (to NULL), entity_id
-- (to NULL) and metadata. Every other column must stay identical.
CREATE OR REPLACE FUNCTION public.audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1
       AND OLD.actor_id IS NOT NULL
       AND NEW.actor_id IS NULL
       AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
      RETURN NEW;
    END IF;
    IF current_setting('lioris.audit_anonymise', true) = 'on'
       AND current_user NOT IN ('anon', 'authenticated', 'service_role', 'authenticator')
       AND (NEW.actor_id IS NULL OR NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id)
       AND (NEW.entity_id IS NULL OR NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id)
       AND (to_jsonb(NEW) - 'actor_id' - 'entity_id' - 'metadata')
         = (to_jsonb(OLD) - 'actor_id' - 'entity_id' - 'metadata') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP USING ERRCODE = '42501';
END
$$;

-- purge_user_data(): erasure of everything owned by a user (service_role only).
--   Order used by the delete-account edge functions: 1) this RPC  2) delete storage objects under
--   '<uid>/' in every user bucket (Storage API)  3) auth.admin.deleteUser(uid).
--   * every FK to profiles / auth.users is discovered at run time: ON DELETE CASCADE rows are
--     deleted, ON DELETE SET NULL columns are nulled (analytics_events, giving_campaign_clicks,
--     moderation_queue.reporter_id, ...); restrictive FKs are reported in skipped_restrictive_fks;
--   * non-FK user columns (client_errors.user_id, resource_takedown_requests.resource_uploader)
--     are nulled explicitly;
--   * consent_records are archived as hash-only rows in consent_proofs before they are deleted;
--   * audit_logs rows are KEPT but anonymised: actor_id / entity_id are cleared and the user id
--     (and the actor's display name) in them is replaced by sha256(user id) in metadata;
--   * the purge's own audit row stores the hash, never the raw id.
CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_n bigint;
  v_role text;
  v_email text;
  v_hash text;
  v_deleted jsonb := '{}'::jsonb;
  v_anonymised jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_sets text[] := ARRAY[]::text[];
  v_col text;
  v_audit_n bigint := 0;
  v_proofs bigint := 0;
  v_uuid text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;
  v_uuid := p_user_id::text;
  v_hash := encode(sha256(convert_to(v_uuid, 'UTF8')), 'hex');

  SELECT role::text, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'profile_found', false,
                              'deleted', v_deleted, 'anonymised', v_anonymised,
                              'storage_prefix', v_uuid || '/');
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be purged; demote the account first.' USING ERRCODE = '42501';
  END IF;

  -- Consent evidence first: it is deleted by the generic loop below.
  IF to_regclass('public.consent_records') IS NOT NULL AND to_regclass('public.consent_proofs') IS NOT NULL THEN
    INSERT INTO public.consent_proofs (user_hash, consent_type, version, accepted_at)
    SELECT DISTINCT v_hash, c.consent_type, c.version, c.accepted_at
      FROM public.consent_records c WHERE c.user_id = p_user_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_proofs = ROW_COUNT;
  END IF;

  FOR r IN
    SELECT DISTINCT cl.relname::text AS tbl, a.attname::text AS col, c.confdeltype AS del
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname NOT IN ('audit_logs', 'profiles')
     ORDER BY 1, 2
  LOOP
    IF r.del = 'c' THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSIF r.del = 'n' THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSE
      v_skipped := v_skipped || to_jsonb(r.tbl || '.' || r.col);
    END IF;
  END LOOP;

  -- User columns with no foreign key (nothing cascades them).
  FOR r IN
    SELECT t.tbl, t.col FROM (VALUES
      ('client_errors', 'user_id'),
      ('resource_takedown_requests', 'resource_uploader')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = r.tbl
                  AND c.column_name = r.col AND c.is_nullable = 'YES') THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    END IF;
  END LOOP;

  -- Rows keyed by e-mail instead of user id.
  IF v_email IS NOT NULL THEN
    IF to_regclass('public.waitlist_entries') IS NOT NULL THEN
      DELETE FROM public.waitlist_entries WHERE lower(email) = lower(v_email);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('waitlist_entries.email', v_n); END IF;
    END IF;
    IF to_regclass('public.auth_rate_limits') IS NOT NULL THEN
      DELETE FROM public.auth_rate_limits WHERE identifier = lower(btrim(v_email));
    END IF;
  END IF;

  -- Anonymise the profile row (removed for good by auth.admin.deleteUser).
  FOR v_col IN
    SELECT c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.is_nullable = 'YES'
       AND c.column_name = ANY (ARRAY['username', 'bio', 'avatar_url', 'banner_url', 'student_id_number',
                                      'push_token', 'department', 'faculty', 'level', 'matric_number',
                                      'phone', 'phone_number', 'website', 'website_url', 'linkedin_url',
                                      'github_url', 'twitter_url', 'portfolio_url', 'resume_url',
                                      'company', 'job_title', 'location', 'industry', 'graduation_year',
                                      'suspension_reason'])
  LOOP
    v_sets := v_sets || format('%I = NULL', v_col);
  END LOOP;
  EXECUTE format(
    'UPDATE public.profiles SET email = %L, full_name = %L, interests = ''{}''%s WHERE id = $1',
    'deleted+' || v_uuid || '@deleted.invalid', 'Deleted user',
    CASE WHEN array_length(v_sets, 1) IS NULL THEN '' ELSE ', ' || array_to_string(v_sets, ', ') END)
    USING p_user_id;

  -- audit_logs: keep the trail, drop the identity. Done AFTER the profile update so the rows the
  -- profile triggers just wrote are covered too.
  PERFORM set_config('lioris.audit_anonymise', 'on', true);
  UPDATE public.audit_logs a
     SET actor_id = CASE WHEN a.actor_id = p_user_id THEN NULL ELSE a.actor_id END,
         entity_id = CASE WHEN a.entity_id = p_user_id THEN NULL ELSE a.entity_id END,
         metadata = CASE
           WHEN a.metadata IS NULL THEN NULL
           WHEN jsonb_typeof(a.metadata) = 'object' THEN
             regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
             || CASE WHEN a.actor_id = p_user_id THEN jsonb_build_object('actorIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.entity_id = p_user_id THEN jsonb_build_object('entityIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.actor_id = p_user_id AND a.metadata ? 'actorName'
                     THEN jsonb_build_object('actorName', 'Deleted user') ELSE '{}'::jsonb END
           ELSE regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
         END
   WHERE a.actor_id = p_user_id
      OR a.entity_id = p_user_id
      OR a.metadata::text ILIKE '%' || v_uuid || '%';
  GET DIAGNOSTICS v_audit_n = ROW_COUNT;
  PERFORM set_config('lioris.audit_anonymise', 'off', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'user_data_purged', 'user', NULL,
          jsonb_build_object('deletedUserIdHash', v_hash, 'deleted', v_deleted, 'anonymised', v_anonymised,
                             'auditRowsAnonymised', v_audit_n, 'consentProofsArchived', v_proofs,
                             'source', 'purge_user_data'));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'user_id_hash', v_hash,
    'profile_found', true,
    'purged_at', now(),
    'deleted', v_deleted,
    'anonymised', v_anonymised,
    'skipped_restrictive_fks', v_skipped,
    'audit_rows_anonymised', v_audit_n,
    'consent_proofs_archived', v_proofs,
    'profile_anonymised', true,
    'storage_prefix', v_uuid || '/',
    'note', 'Storage objects are NOT touched; delete them via the Storage API, then call auth.admin.deleteUser.'
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;

-- ============================================================================
-- 3. Verification-document retention
-- ============================================================================
-- submit_verification_request() generates its own request id and the client uploads to
-- '<uid>/<client uuid>.<ext>', so the storage file name never equalled verifications.id and the
-- old listing returned nothing. Match on the stored evidence paths instead.
DO $do$
BEGIN
  IF to_regclass('public.verifications') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'verifications'
                    AND column_name = 'id_card_front_url' AND is_nullable = 'NO') THEN
    -- Needed so the path can be cleared after the file is deleted (metadata-only change).
    ALTER TABLE public.verifications ALTER COLUMN id_card_front_url DROP NOT NULL;
  END IF;
END
$do$;

-- Normalises whatever is stored in an evidence column to a storage object name.
CREATE OR REPLACE FUNCTION public.verification_object_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(
    CASE
      WHEN p IS NULL THEN NULL
      WHEN btrim(p) ~* '^https?://' THEN regexp_replace(split_part(btrim(p), '?', 1), '^.*/verifications/', '')
      ELSE regexp_replace(regexp_replace(btrim(p), '^/+', ''), '^verifications/', '')
    END, '')
$$;
REVOKE ALL ON FUNCTION public.verification_object_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verification_object_name(text) TO service_role;

DROP FUNCTION IF EXISTS public.list_expired_verification_documents(integer);
CREATE OR REPLACE FUNCTION public.list_expired_verification_documents(p_days int DEFAULT 30, p_limit int DEFAULT 500)
RETURNS TABLE (bucket text, path text, verification_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1));
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
BEGIN
  RETURN QUERY
  WITH refs AS (
    SELECT v.id, v.user_id, v.status::text AS status,
           COALESCE(v.reviewed_at, v.created_at) AS decided_at,
           public.verification_object_name(c.p) AS obj
      FROM public.verifications v
      CROSS JOIN LATERAL (VALUES (v.id_card_front_url), (v.id_card_back_url), (v.selfie_url)) AS c(p)
     WHERE c.p IS NOT NULL
  ),
  objs AS (
    SELECT o.name::text AS name, o.created_at, (storage.foldername(o.name))[1] AS owner_dir
      FROM storage.objects o
     WHERE o.bucket_id = 'verifications'
       AND (storage.foldername(o.name))[1] IS NOT NULL
  ),
  hits AS (
    -- (1) evidence path of a decided request older than the window
    SELECT ob.name, ob.created_at, r.id AS vid
      FROM objs ob JOIN refs r ON r.obj = ob.name
     WHERE r.status IN ('approved', 'rejected') AND r.decided_at < v_cutoff
    UNION
    -- (2) legacy naming '<uid>/<verifications.id>.<ext>' of a decided request
    SELECT ob.name, ob.created_at, v.id
      FROM objs ob
      JOIN public.verifications v
        ON v.user_id::text = ob.owner_dir
       AND split_part(storage.filename(ob.name), '.', 1) = v.id::text
     WHERE v.status::text IN ('approved', 'rejected')
       AND COALESCE(v.reviewed_at, v.created_at) < v_cutoff
    UNION
    -- (3) orphans: referenced by no request, old enough, and the owner has nothing pending
    SELECT ob.name, ob.created_at, NULL::uuid
      FROM objs ob
     WHERE ob.created_at < v_cutoff
       AND NOT EXISTS (SELECT 1 FROM refs r WHERE r.obj = ob.name)
       AND NOT EXISTS (SELECT 1 FROM public.verifications v
                        WHERE split_part(storage.filename(ob.name), '.', 1) = v.id::text
                          AND v.user_id::text = ob.owner_dir)
       AND NOT EXISTS (SELECT 1 FROM public.verifications v
                        WHERE v.user_id::text = ob.owner_dir AND v.status::text = 'pending')
  )
  SELECT DISTINCT ON (h.name) 'verifications'::text, h.name, h.vid
    FROM hits h
   ORDER BY h.name, h.vid NULLS LAST
   LIMIT v_limit;
END
$$;

REVOKE ALL ON FUNCTION public.list_expired_verification_documents(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_verification_documents(int, int) TO service_role;

-- Call after the Storage API removed the objects: forgets the paths of DECIDED requests.
CREATE OR REPLACE FUNCTION public.clear_verification_document_paths(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RETURN 0; END IF;
  UPDATE public.verifications
     SET id_card_front_url = NULL, id_card_back_url = NULL, selfie_url = NULL
   WHERE id = ANY (p_ids)
     AND status::text IN ('approved', 'rejected');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.clear_verification_document_paths(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_verification_document_paths(uuid[]) TO service_role;

-- ============================================================================
-- 4. Retention purge functions and cron jobs
-- ============================================================================
-- Each function deletes at most 100000 rows per call (short locks, WAL stays small); the daily job
-- simply catches up over several days after a backlog. All are service_role only and are no-ops
-- when the table or column does not exist.
CREATE OR REPLACE FUNCTION public.log_retention_purge(p_job text, p_deleted bigint, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(p_deleted, 0) > 0 THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'retention_purge', 'system', NULL,
            jsonb_build_object('job', p_job, 'deleted', p_deleted, 'source', 'retention_job') || COALESCE(p_detail, '{}'::jsonb));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;  -- logging must never make a purge fail
END
$$;
REVOKE ALL ON FUNCTION public.log_retention_purge(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_old_analytics(p_days integer DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint := 0;
BEGIN
  IF to_regclass('public.analytics_events') IS NULL THEN RETURN 0; END IF;
  WITH d AS (
    SELECT ctid FROM public.analytics_events
     WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 90), 1))
     LIMIT 100000
  )
  DELETE FROM public.analytics_events a USING d WHERE a.ctid = d.ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_retention_purge('purge_old_analytics', v_n, jsonb_build_object('older_than_days', p_days));
  RETURN v_n;
END
$$;

CREATE OR REPLACE FUNCTION public.purge_stale_push_tokens(p_days integer DEFAULT 120)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint := 0;
BEGIN
  IF to_regclass('public.push_tokens') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'push_tokens' AND column_name = 'updated_at') THEN
    RETURN 0;
  END IF;
  WITH d AS (
    SELECT ctid FROM public.push_tokens
     WHERE updated_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 120), 1))
     LIMIT 100000
  )
  DELETE FROM public.push_tokens t USING d WHERE t.ctid = d.ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_retention_purge('purge_stale_push_tokens', v_n, jsonb_build_object('older_than_days', p_days));
  RETURN v_n;
END
$$;

-- Click logs only. resource_downloads is deliberately NOT purged: it is the download counter's source of truth.
CREATE OR REPLACE FUNCTION public.purge_old_click_logs(p_days integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint := 0;
  v_total bigint := 0;
  v_cut timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_days, 180), 1));
BEGIN
  IF to_regclass('public.event_payment_clicks') IS NOT NULL THEN
    WITH d AS (SELECT ctid FROM public.event_payment_clicks WHERE last_clicked_at < v_cut LIMIT 100000)
    DELETE FROM public.event_payment_clicks t USING d WHERE t.ctid = d.ctid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;
  IF to_regclass('public.giving_campaign_clicks') IS NOT NULL THEN
    WITH d AS (SELECT ctid FROM public.giving_campaign_clicks WHERE created_at < v_cut LIMIT 100000)
    DELETE FROM public.giving_campaign_clicks t USING d WHERE t.ctid = d.ctid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;
  PERFORM public.log_retention_purge('purge_old_click_logs', v_total, jsonb_build_object('older_than_days', p_days));
  RETURN v_total;
END
$$;

-- Moderation reports that were resolved more than p_months ago.
CREATE OR REPLACE FUNCTION public.purge_resolved_moderation_queue(p_months integer DEFAULT 12)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint := 0;
BEGIN
  IF to_regclass('public.moderation_queue') IS NULL THEN RETURN 0; END IF;
  WITH d AS (
    SELECT ctid FROM public.moderation_queue
     WHERE resolved_at IS NOT NULL
       AND resolved_at < now() - make_interval(months => GREATEST(COALESCE(p_months, 12), 1))
     LIMIT 100000
  )
  DELETE FROM public.moderation_queue t USING d WHERE t.ctid = d.ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_retention_purge('purge_resolved_moderation_queue', v_n, jsonb_build_object('older_than_months', p_months));
  RETURN v_n;
END
$$;

-- Notifications nobody ever opened (read ones are handled by purge_viewed_notifications).
CREATE OR REPLACE FUNCTION public.purge_old_unread_notifications(p_days integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint := 0;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN 0; END IF;
  WITH d AS (
    SELECT ctid FROM public.notifications
     WHERE NOT is_read
       AND created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 180), 1))
     LIMIT 100000
  )
  DELETE FROM public.notifications t USING d WHERE t.ctid = d.ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_retention_purge('purge_old_unread_notifications', v_n, jsonb_build_object('older_than_days', p_days));
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.purge_old_analytics(integer)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_stale_push_tokens(integer)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_click_logs(integer)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_resolved_moderation_queue(integer)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_unread_notifications(integer)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_analytics(integer)             TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_stale_push_tokens(integer)         TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_click_logs(integer)            TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_resolved_moderation_queue(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_unread_notifications(integer)  TO service_role;

-- 4b. Verification-document purge: pg_cron -> pg_net -> edge function, authenticated by a shared
--     secret kept in Vault. Callable again after the secrets are created (see header).
CREATE OR REPLACE FUNCTION public.schedule_verification_document_purge()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secrets int;
  v_cmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: the verification-document purge is NOT scheduled. Enable pg_cron, then run: select public.schedule_verification_document_purge();';
    RETURN 'skipped: pg_cron missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net is not installed: the verification-document purge is NOT scheduled. Enable pg_net, then run: select public.schedule_verification_document_purge();';
    RETURN 'skipped: pg_net missing';
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Supabase Vault is not available: the verification-document purge is NOT scheduled. Enable supabase_vault, create the secrets below, then run: select public.schedule_verification_document_purge();';
    RETURN 'skipped: vault missing';
  END IF;
  EXECUTE 'SELECT count(*) FROM vault.decrypted_secrets WHERE name = ANY ($1)'
    INTO v_secrets USING ARRAY['lioris_project_url', 'lioris_cron_secret'];
  IF v_secrets < 2 THEN
    RAISE NOTICE 'Vault secrets missing: the verification-document purge is NOT scheduled. Run: select vault.create_secret(''https://<project-ref>.supabase.co'', ''lioris_project_url''); select vault.create_secret(''<CRON_SECRET>'', ''lioris_cron_secret''); select public.schedule_verification_document_purge();';
    RETURN 'skipped: vault secrets missing';
  END IF;

  v_cmd := $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lioris_project_url')
             || '/functions/v1/purge-expired-verification-documents',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lioris_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000)
  $cmd$;
  BEGIN
    PERFORM cron.unschedule('lioris_purge_verification_documents');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('lioris_purge_verification_documents', '7 4 * * *', v_cmd);
  RETURN 'scheduled';
END
$$;
REVOKE ALL ON FUNCTION public.schedule_verification_document_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_verification_document_purge() TO service_role;

DO $do$
DECLARE
  r record;
BEGIN
  PERFORM public.schedule_verification_document_purge();

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: lifecycle retention jobs NOT scheduled';
    RETURN;
  END IF;
  FOR r IN
    SELECT * FROM (VALUES
      ('lioris_purge_analytics',             '12 4 * * *', 'SELECT public.purge_old_analytics(90)',              'public.purge_old_analytics(integer)'),
      ('lioris_purge_stale_push_tokens',     '17 4 * * *', 'SELECT public.purge_stale_push_tokens(120)',         'public.purge_stale_push_tokens(integer)'),
      ('lioris_purge_click_logs',            '22 4 * * *', 'SELECT public.purge_old_click_logs(180)',            'public.purge_old_click_logs(integer)'),
      ('lioris_purge_moderation_queue',      '27 4 * * *', 'SELECT public.purge_resolved_moderation_queue(12)',  'public.purge_resolved_moderation_queue(integer)'),
      ('lioris_purge_unread_notifications',  '32 4 * * *', 'SELECT public.purge_old_unread_notifications(180)',  'public.purge_old_unread_notifications(integer)')
    ) AS j(name, schedule, cmd, fn)
  LOOP
    BEGIN
      IF to_regprocedure(r.fn) IS NULL THEN
        RAISE NOTICE 'function % missing: job % skipped', r.fn, r.name;
        CONTINUE;
      END IF;
      BEGIN
        PERFORM cron.unschedule(r.name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      PERFORM cron.schedule(r.name, r.schedule, r.cmd);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not schedule cron job %: %', r.name, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- ============================================================================
-- 5. Analytics integrity
-- ============================================================================
DO $do$
BEGIN
  IF to_regclass('public.analytics_events') IS NULL THEN
    RAISE NOTICE 'analytics_events missing: section 5 skipped';
    RETURN;
  END IF;

  -- Bounded rows. NOT VALID: enforced for every new row without scanning (or failing on) old data.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_events'::regclass AND conname = 'analytics_events_name_len') THEN
    ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_name_len CHECK (length(name) <= 64) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_events'::regclass AND conname = 'analytics_events_type_len') THEN
    ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_type_len CHECK (length(event_type) <= 32) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_events'::regclass AND conname = 'analytics_events_metadata_size') THEN
    ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_metadata_size CHECK (metadata IS NULL OR pg_column_size(metadata) <= 2048) NOT VALID;
  END IF;

  DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
  DROP POLICY IF EXISTS "Authenticated users insert own analytics events" ON public.analytics_events;
  DROP POLICY IF EXISTS "Anonymous visitors insert anonymous analytics events" ON public.analytics_events;

  IF to_regprocedure('public.auth_profile_campus()') IS NOT NULL THEN
    CREATE POLICY "Authenticated users insert own analytics events" ON public.analytics_events
      FOR INSERT TO authenticated
      WITH CHECK (
        (user_id IS NULL OR user_id = auth.uid())
        AND event_type IN ('page_view', 'feature_use', 'session_start', 'screen_view')
        AND (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = public.auth_profile_campus())
      );
  ELSE
    CREATE POLICY "Authenticated users insert own analytics events" ON public.analytics_events
      FOR INSERT TO authenticated
      WITH CHECK (
        (user_id IS NULL OR user_id = auth.uid())
        AND event_type IN ('page_view', 'feature_use', 'session_start', 'screen_view')
        AND (campus_code IS NULL OR campus_code = 'GLOBAL')
      );
  END IF;
  CREATE POLICY "Anonymous visitors insert anonymous analytics events" ON public.analytics_events
    FOR INSERT TO anon
    WITH CHECK (
      user_id IS NULL
      AND event_type IN ('page_view', 'session_start')
      AND (campus_code IS NULL OR campus_code = 'GLOBAL')
    );
END
$do$;

-- record_user_activity: signed-in callers only, campus comes from the caller's profile (a
-- caller-supplied campus used to let anyone skew another campus' numbers), bounded input and a
-- per-user burst limit. Unknown event types are ignored instead of raising so a client bug cannot
-- break the screen that called it.
CREATE OR REPLACE FUNCTION public.record_user_activity(
    p_event_type TEXT,
    p_name TEXT,
    p_campus_code TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_campus TEXT;
    v_name TEXT := left(btrim(COALESCE(p_name, '')), 64);
    v_meta JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
    IF v_uid IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
        RETURN;
    END IF;
    IF p_event_type IS NULL OR p_event_type NOT IN ('page_view', 'feature_use', 'session_start', 'screen_view') OR v_name = '' THEN
        RETURN;
    END IF;
    IF jsonb_typeof(v_meta) <> 'object' OR pg_column_size(v_meta) > 2048 THEN
        v_meta := '{}'::jsonb;
    END IF;

    IF v_uid IS NOT NULL THEN
        IF (SELECT count(*) FROM public.analytics_events
             WHERE user_id = v_uid AND created_at > now() - interval '1 minute') >= 60 THEN
            RETURN;
        END IF;
        SELECT campus_code INTO v_campus FROM public.profiles WHERE id = v_uid;
    ELSE
        v_campus := NULLIF(btrim(COALESCE(p_campus_code, '')), '');
    END IF;

    INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, metadata, created_at)
    VALUES (v_uid, p_event_type, v_name, COALESCE(v_campus, 'GLOBAL'), v_meta, NOW());

    IF v_uid IS NOT NULL THEN
        IF p_event_type = 'session_start' THEN
            UPDATE public.profiles SET last_active_at = NOW(), last_login_at = NOW() WHERE id = v_uid;
        ELSE
            UPDATE public.profiles SET last_active_at = NOW() WHERE id = v_uid;
        END IF;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_activity(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_activity(TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ============================================================================
-- 6. Push token takeover
-- ============================================================================
-- push_tokens.token is UNIQUE and the INSERT policy is owner-only, so when A's token row survives
-- (A's session had already expired at sign-out) B could not claim it and A's notifications kept
-- landing on B's phone. claim_push_token() upserts the token and re-parents it to the caller.
CREATE OR REPLACE FUNCTION public.claim_push_token(p_token text, p_platform text DEFAULT NULL)
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
REVOKE ALL ON FUNCTION public.claim_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_token(text, text) TO authenticated, service_role;

-- Older clients call register_push_token(); it is now the same operation.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.claim_push_token(p_token, p_platform) $$;
REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated, service_role;

-- ============================================================================
-- 7. Missing indexes
-- ============================================================================
-- Plain CREATE INDEX IF NOT EXISTS (these tables are modest). An index is skipped when the table or a
-- column is missing, or when an equivalent non-partial index (same key columns, same order) exists.
DO $do$
DECLARE
  r record;
  v_cols text[];
  v_exists boolean;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('idx_post_comments_post',               'post_comments',        'post_id',                   NULL),
      ('idx_post_comments_post_created',       'post_comments',        'post_id, created_at',       NULL),
      ('idx_marketplace_listings_campus',      'marketplace_listings', 'campus_code',               NULL),
      ('idx_verifications_campus_status',      'verifications',        'campus_code, status',       NULL),
      ('idx_giving_campaigns_campus',          'giving_campaigns',     'campus_code',               NULL),
      ('idx_study_groups_campus',              'study_groups',         'campus_code',               NULL),
      ('idx_chat_channels_campus',             'chat_channels',        'campus_code',               NULL),
      ('idx_job_alerts_campus',                'job_alerts',           'campus_code',               NULL),
      ('idx_notifications_recipient_created',  'notifications',        'recipient_id, created_at DESC', NULL),
      ('idx_notifications_recipient_unread',   'notifications',        'recipient_id',              'NOT is_read'),
      ('idx_resources_campus_created',         'resources',            'campus_code, created_at DESC', NULL),
      ('idx_events_campus_start',              'events',               'campus_code, start_time',   NULL),
      ('idx_chat_messages_channel_created',    'chat_messages',        'channel_id, created_at DESC', NULL),
      -- user-facing foreign keys that make deleting a profile scan the whole child table
      ('idx_post_likes_user',                  'post_likes',           'user_id',                   NULL),
      ('idx_post_comment_likes_user',          'post_comment_likes',   'user_id',                   NULL),
      ('idx_event_waitlist_user',              'event_waitlist',       'user_id',                   NULL),
      ('idx_resource_downloads_user',          'resource_downloads',   'user_id',                   NULL),
      ('idx_event_payment_clicks_user',        'event_payment_clicks', 'user_id',                   NULL),
      ('idx_giving_campaign_clicks_campaign_user', 'giving_campaign_clicks', 'campaign_id, user_id', NULL),
      ('idx_study_group_posts_author',         'study_group_posts',    'author_id',                 NULL),
      ('idx_giving_campaigns_creator',         'giving_campaigns',     'creator_id',                NULL)
    ) AS i(idx, tbl, cols, pred)
  LOOP
    BEGIN
      IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
      v_cols := regexp_split_to_array(regexp_replace(r.cols, '\s+(ASC|DESC)', '', 'gi'), '\s*,\s*');
      IF EXISTS (SELECT 1 FROM unnest(v_cols) c
                  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = c)) THEN
        CONTINUE;
      END IF;
      IF r.pred IS NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_index i
           WHERE i.indrelid = ('public.' || r.tbl)::regclass AND i.indpred IS NULL AND i.indisvalid
             AND (SELECT array_agg(a.attname::text ORDER BY k.ord)
                    FROM unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                   WHERE k.ord <= i.indnkeyatts) = v_cols
        ) INTO v_exists;
        IF v_exists THEN CONTINUE; END IF;
      END IF;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)%s',
                     r.idx, r.tbl, r.cols, CASE WHEN r.pred IS NULL THEN '' ELSE ' WHERE ' || r.pred END);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'index % not created: %', r.idx, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- Every remaining single-column FK from a public table to profiles(id) without an index that leads
-- with that column (profile deletion and the erasure RPC scan the child table otherwise).
DO $do$
DECLARE
  r record;
  v_made int := 0;
BEGIN
  FOR r IN
    SELECT cl.relname::text AS tbl, a.attname::text AS col, c.oid AS con
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid = 'public.profiles'::regclass
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indkey[0] = c.conkey[1])
     ORDER BY cl.relname, a.attname
     LIMIT 60
  LOOP
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
                     left('idx_' || r.tbl || '_' || r.col || '_fk', 63), r.tbl, r.col);
      v_made := v_made + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'FK index on %.% not created: %', r.tbl, r.col, SQLERRM;
    END;
  END LOOP;
  IF v_made > 0 THEN RAISE NOTICE 'created % foreign-key indexes', v_made; END IF;
END
$do$;

-- ============================================================================
-- 8. Campus deletion safety
-- ============================================================================
-- campuses has ON DELETE CASCADE children (posts, events, resources, verifications, ...). A direct
-- DELETE (e.g. a Super Admin through REST) used to wipe them all with no audit trail. Now only
-- admin_delete_campus() can delete a row: it audits first, then sets a transaction-local flag.
CREATE OR REPLACE FUNCTION public.campuses_block_direct_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'campuses cannot be truncated' USING ERRCODE = '42501';
  END IF;
  IF current_setting('lioris.campus_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Campuses can only be deleted through admin_delete_campus() (it audits and reassigns members).'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$$;

DO $do$
BEGIN
  IF to_regclass('public.campuses') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_campuses_block_direct_delete ON public.campuses;
    CREATE TRIGGER trg_campuses_block_direct_delete
      BEFORE DELETE ON public.campuses
      FOR EACH ROW EXECUTE FUNCTION public.campuses_block_direct_delete();
    DROP TRIGGER IF EXISTS trg_campuses_block_truncate ON public.campuses;
    CREATE TRIGGER trg_campuses_block_truncate
      BEFORE TRUNCATE ON public.campuses
      FOR EACH STATEMENT EXECUTE FUNCTION public.campuses_block_direct_delete();
  END IF;
END
$do$;

-- Same behaviour as the 20261101000000 version (it supersedes 20261027010000) plus the audit row and the
-- guard flag. Also fixes a latent error there: the demotion CASE cast to public.user_role, a type that
-- does not exist (the column is public.user_role_type), so deleting a campus that still had members failed.
CREATE OR REPLACE FUNCTION public.admin_delete_campus(p_code text, p_members text DEFAULT 'reassign')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  t        record;
  n        bigint;
  pass     int;
  pending  text[] := '{}';
  failed   text[];
  deleted  jsonb := '{}'::jsonb;
  moved    bigint := 0;
  v_impact jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required: only a Super Administrator can delete a campus' USING ERRCODE = '42501';
  END IF;

  p_code := upper(btrim(p_code));
  IF p_code IS NULL OR p_code = '' OR p_code = 'GLOBAL' THEN
    RAISE EXCEPTION 'protected_campus: the Global network cannot be deleted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = p_code) THEN
    RAISE EXCEPTION 'not_found: that campus does not exist';
  END IF;
  IF p_members NOT IN ('reassign', 'block') THEN
    RAISE EXCEPTION 'bad_request: members must be reassign or block';
  END IF;

  SELECT count(*) INTO moved FROM public.profiles WHERE campus_code = p_code;
  IF moved > 0 AND p_members = 'block' THEN
    RAISE EXCEPTION 'has_members: % member(s) still belong to this campus', moved;
  END IF;

  -- Audit BEFORE anything is removed, with the row counts that are about to disappear. It is part
  -- of the same transaction: if the deletion fails, the entry is rolled back with it.
  IF to_regprocedure('public.campus_delete_impact(text)') IS NOT NULL THEN
    v_impact := public.campus_delete_impact(p_code);
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'campus_deleted', 'campus', NULL,
          jsonb_build_object('campusCode', p_code, 'institutionCode', p_code,
                             'membersReassigned', moved, 'removedRows', v_impact,
                             'callerRole', auth.role(),
                             'summary', format('Deleted campus %s (%s member(s) moved to GLOBAL)', p_code, moved)));

  PERFORM set_config('lioris.campus_delete', 'on', true);

  -- Members keep their accounts and land on GLOBAL; Campus Admins of the deleted campus are
  -- demoted to student so they do not retain role='admin' with campus_code='GLOBAL'.
  IF moved > 0 THEN
    UPDATE public.profiles
       SET campus_code = 'GLOBAL',
           role = CASE
             WHEN role::text = 'admin'
                  AND COALESCE(admin_role, 'campus_admin') <> 'super_admin'
                  AND LOWER(COALESCE(email, '')) <> 'inememmanuel@gmail.com'
             THEN 'student'::public.user_role_type
             ELSE role
           END,
           admin_role = CASE
             WHEN role::text = 'admin'
                  AND COALESCE(admin_role, 'campus_admin') <> 'super_admin'
                  AND LOWER(COALESCE(email, '')) <> 'inememmanuel@gmail.com'
             THEN NULL
             ELSE admin_role
           END,
           is_campus_ambassador = false
     WHERE campus_code = p_code;
  END IF;

  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'campus_code' AND c.table_name <> 'profiles'
    ORDER BY c.table_name
  LOOP
    pending := array_append(pending, t.table_name);
  END LOOP;

  FOR pass IN 1..4 LOOP
    failed := '{}';
    FOR t IN SELECT x AS table_name FROM unnest(pending) x LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE campus_code = $1', t.table_name) USING p_code;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(t.table_name, COALESCE((deleted ->> t.table_name)::bigint, 0) + n);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        failed := array_append(failed, t.table_name);
      END;
    END LOOP;
    pending := failed;
    EXIT WHEN COALESCE(array_length(pending, 1), 0) = 0;
  END LOOP;

  IF COALESCE(array_length(pending, 1), 0) > 0 THEN
    RAISE EXCEPTION 'delete_blocked: could not clear tables: %', array_to_string(pending, ', ');
  END IF;

  DELETE FROM public.campuses WHERE code = p_code;
  PERFORM set_config('lioris.campus_delete', 'off', true);

  RETURN jsonb_build_object('code', p_code, 'members_reassigned', moved, 'deleted', deleted);
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_campus(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_campus(text, text) TO authenticated, service_role;

-- ============================================================================
-- 9. Realtime publication
-- ============================================================================
-- supabase_schema.sql added every table in ONE statement inside EXCEPTION WHEN OTHERS THEN NULL, so
-- a single already-published table silently added none of the others. One table at a time, a
-- duplicate is ignored; nothing is ever removed from the publication. profiles is deliberately NOT
-- added: realtime ignores column-level privileges, so streaming it would expose e-mail addresses.
DO $do$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime does not exist: realtime tables not configured';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'chat_messages', 'chat_channels', 'notifications', 'connections', 'events', 'event_attendees',
    'posts', 'post_comments', 'verifications', 'moderation_queue', 'marketplace_listings',
    'mentorships', 'mentorship_sessions', 'mentorship_updates', 'mentorship_goals',
    'study_group_posts', 'study_group_sessions', 'study_group_members',
    'portal_links', 'announcements'
  ]
  LOOP
    BEGIN
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE WARNING 'could not add % to supabase_realtime: %', t, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- ============================================================================
-- 10. Sign-up trigger robustness; non-fatal event fan-out
-- ============================================================================
-- Same function as 20261028000000 (role/campus derivation, age flag, username fallback loop, consent
-- record) with ONE change: a unique violation on the profile INSERT (a stale / differently-cased
-- row already owns the e-mail) no longer aborts sign-up. It retries with a placeholder address so
-- the account exists; the e-mail is reconciled by the e-mail sync / an admin.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_campus text;
    v_role public.user_role_type;
    v_terms_version text;
    v_terms_at timestamptz;
    v_age_raw text;
    v_age boolean;
    v_username text;
    v_try int;
BEGIN
    BEGIN
        v_campus := public.campus_for_email(NEW.email);
    EXCEPTION WHEN OTHERS THEN
        v_campus := NULL;
    END;
    v_campus := COALESCE(v_campus, NULLIF(NEW.raw_user_meta_data->>'campus_code', ''), 'GLOBAL');
    IF v_campus <> 'GLOBAL' AND NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = v_campus AND c.is_active) THEN
        v_campus := 'GLOBAL';
    END IF;

    v_role := CASE
        WHEN NEW.raw_user_meta_data->>'role' = 'alumni' THEN 'alumni'::public.user_role_type
        ELSE 'student'::public.user_role_type
    END;

    BEGIN
        INSERT INTO public.profiles (id, email, full_name, role, campus_code, verification_status)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
            v_role,
            v_campus,
            'unverified'::public.verification_status_type
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
        -- A stale or differently-cased profile row already owns this e-mail (profiles_email_key).
        -- Sign-up must not fail because of it: create the profile with a placeholder address that
        -- cannot collide, and say so. (A row with this id may also have appeared concurrently.)
        RAISE WARNING 'handle_new_user_profile: e-mail already used by another profile row, using a placeholder for %', NEW.id;
        INSERT INTO public.profiles (id, email, full_name, role, campus_code, verification_status)
        VALUES (
            NEW.id,
            'pending+' || NEW.id::text || '@email-conflict.invalid',
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
            v_role,
            v_campus,
            'unverified'::public.verification_status_type
        )
        ON CONFLICT (id) DO NOTHING;
    END;

    -- Username. A taken, reserved or malformed handle must never make sign-up itself fail, and must never leave
    -- the member with NO handle either (two people can pass the availability check at the same moment, and
    -- the unique index then rejects the second). The second person gets the handle plus a short number and is
    -- told on the next screen; they can change it in Settings.
    v_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')));
    IF v_username !~ '^[a-z0-9._]{3,24}$' OR public.is_reserved_username(v_username) THEN
        v_username := left(regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9._]', '', 'g'), 18);
        IF length(v_username) < 3 OR public.is_reserved_username(v_username) THEN
            v_username := 'student';
        END IF;
    END IF;
    v_try := 0;
    LOOP
        BEGIN
            UPDATE public.profiles
               SET username = CASE WHEN v_try = 0 THEN v_username
                                   ELSE left(v_username, 19) || (1000 + floor(random() * 9000))::int END
             WHERE id = NEW.id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_try := v_try + 1;
            IF v_try > 8 THEN
                EXIT; -- vanishingly unlikely; the member keeps no handle and is asked to pick one
            END IF;
        WHEN OTHERS THEN
            EXIT;
        END;
    END LOOP;

    BEGIN
        v_terms_version := NULLIF(btrim(NEW.raw_user_meta_data->>'terms_version'), '');
        IF v_terms_version IS NOT NULL AND to_regclass('public.consent_records') IS NOT NULL THEN
            BEGIN
                v_terms_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_terms_at := NULL;
            END;
            v_terms_at := LEAST(COALESCE(v_terms_at, now()), now());

            v_age_raw := lower(COALESCE(NEW.raw_user_meta_data->>'age_eligibility_confirmed', NEW.raw_user_meta_data->>'age_confirmed_18', ''));
            v_age := v_age_raw IN ('true', 't', '1', 'yes');

            INSERT INTO public.consent_records (user_id, consent_type, version, accepted_at, age_confirmed_18, source)
            VALUES (NEW.id, 'terms_and_privacy', left(v_terms_version, 64), v_terms_at, v_age, 'signup');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'consent record not stored for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

-- Event cancellation: one failing notification insert (a deleted recipient, a check violation, a
-- misbehaving notification trigger) used to roll back the organiser's cancellation. Each insert
-- now runs in its own sub-transaction; a failure is logged as a warning and skipped.
CREATE OR REPLACE FUNCTION public.notify_event_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  v_body TEXT;
BEGIN
  v_body := '"' || NEW.title || '" has been cancelled.';
  IF NEW.cancellation_reason IS NOT NULL AND btrim(NEW.cancellation_reason) <> '' THEN
    v_body := v_body || ' Reason: ' || NEW.cancellation_reason;
  END IF;
  FOR r IN SELECT user_id FROM public.event_attendees WHERE event_id = NEW.id LOOP
    BEGIN
      INSERT INTO public.notifications (recipient_id, title, body, type, action_url, is_read)
      VALUES (r.user_id, 'Event cancelled', v_body, 'event', '/event/' || NEW.id, false);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_event_cancelled: notification for % skipped: %', r.user_id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_event_cancelled failed for event %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

-- ============================================================================
-- 11. connections: one live row per unordered pair
-- ============================================================================
-- The existing unique pair index only covers status = 'pending'; accepted A->B and B->A could both
-- exist. Resolve existing duplicates first (an accepted row wins, otherwise the oldest), then add
-- the canonical-pair index over pending + accepted.
DO $do$
DECLARE
  v_n bigint;
BEGIN
  IF to_regclass('public.connections') IS NULL THEN RETURN; END IF;
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)
             ORDER BY (status = 'accepted') DESC, created_at NULLS LAST, id) AS rn
      FROM public.connections
     WHERE status IN ('pending', 'accepted')
  )
  DELETE FROM public.connections c USING ranked r WHERE c.id = r.id AND r.rn > 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN RAISE NOTICE 'connections: removed % duplicate pair row(s)', v_n; END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_live_pair
    ON public.connections (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
    WHERE status IN ('pending', 'accepted');
END
$do$;

-- ============================================================================
-- 12. Storage: only onboarded users upload to resources / campus-media
-- ============================================================================
-- Avatars keep their own policy ("Authenticated users can upload avatars"), because uploading a
-- profile photo is part of onboarding. Chat attachments live in the resources bucket under
-- '<uid>/', so an onboarded member keeps working; size and mime limits are untouched.
CREATE OR REPLACE FUNCTION public.auth_onboarding_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.onboarding_complete FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.auth_onboarding_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_onboarding_complete() TO authenticated, service_role;

DO $do$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload public storage objects" ON storage.objects;
  CREATE POLICY "Authenticated users can upload public storage objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = ANY (ARRAY['resources', 'campus-media'])
      AND (
        public.auth_is_super_admin()
        OR ((storage.foldername(name))[1] = auth.uid()::text
            AND NOT public.auth_is_suspended()
            AND public.auth_onboarding_complete())
      )
    );

  DROP POLICY IF EXISTS "Users and admins can update public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can update public storage objects" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = ANY (ARRAY['resources', 'avatars', 'campus-media'])
      AND ((storage.foldername(name))[1] = auth.uid()::text
           OR public.auth_is_super_admin()
           OR public.can_admin_object_owner(name))
    )
    WITH CHECK (
      bucket_id = ANY (ARRAY['resources', 'avatars', 'campus-media'])
      AND (
        public.auth_is_super_admin()
        OR ((storage.foldername(name))[1] = auth.uid()::text
            AND NOT public.auth_is_suspended()
            AND (bucket_id = 'avatars' OR public.auth_onboarding_complete()))
      )
    );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Not allowed to manage storage.objects policies from this role: apply the two upload policies in the Dashboard (section 12 of 20261107000000_data_lifecycle.sql).';
END
$do$;

INSERT INTO public._manual_migration_log (version) VALUES ('20261107000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
