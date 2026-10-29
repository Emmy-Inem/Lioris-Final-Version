-- ============================================================================
-- LIORIS - 04 POST SETUP (run after 02_apply_all.sql, any time; safe to run again)
--
-- What it does, in order:
--   1. Turns on pg_cron, pg_net and Supabase Vault if they are off (a notice tells you if the dashboard must do it).
--   2. Creates the Vault secrets the 30-day ID-document purge needs: lioris_project_url, and lioris_cron_secret
--      (a random value, created only if it does not exist yet).
--   3. Schedules the ID-document purge and every other background job (reminders, retention clean-ups), creating
--      only the ones that are missing.
--   4. Promotes the administrators you list below to Super Admin. Leave the list empty to only look.
--   5. Prints ONE report at the end: item, status, detail. Anything marked ACTION NEEDED tells you what to do.
--
-- It never deletes data and never changes an existing secret.
-- ============================================================================

-- >>> EDIT THIS: e-mail addresses of the people who run the WHOLE platform (they will become Super Admins).
-- Example: ARRAY['first@example.com', 'second@example.com']      Leave as ARRAY[]::text[] to change nobody.
DROP TABLE IF EXISTS pg_temp._lioris_setup_input;
DROP TABLE IF EXISTS pg_temp._lioris_setup_report;
CREATE TEMP TABLE _lioris_setup_input AS SELECT ARRAY[]::text[] AS super_admin_emails;

CREATE TEMP TABLE _lioris_setup_report (n serial, item text, status text, detail text);

-- ----------------------------------------------------------------------------
-- 1. extensions
-- ----------------------------------------------------------------------------
DO $ext$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['pg_cron', 'pg_net', 'supabase_vault'] LOOP
    BEGIN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I', v_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% could not be enabled from SQL (%). Enable it in the dashboard: Database > Extensions, then run this file again.', v_name, SQLERRM;
    END;
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('extension ' || v_name,
            CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = v_name) THEN 'OK' ELSE 'ACTION NEEDED' END,
            CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = v_name) THEN 'enabled'
                 ELSE 'turn it on in Database > Extensions, then run this file again' END);
  END LOOP;
END
$ext$;

-- ----------------------------------------------------------------------------
-- 2. Vault secrets
-- ----------------------------------------------------------------------------
DO $vault$
DECLARE
  v_have_url boolean;
  v_have_secret boolean;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('vault secrets', 'ACTION NEEDED', 'Supabase Vault is not available; enable it (Database > Extensions), then run this file again');
    RETURN;
  END IF;

  EXECUTE $q$SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'lioris_project_url')$q$ INTO v_have_url;
  IF NOT v_have_url THEN
    EXECUTE $q$SELECT vault.create_secret('https://fdtnbluslkabwsmspbem.supabase.co', 'lioris_project_url', 'Project URL used by Lioris scheduled jobs')$q$;
  END IF;

  EXECUTE $q$SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'lioris_cron_secret')$q$ INTO v_have_secret;
  IF NOT v_have_secret THEN
    EXECUTE $q$SELECT vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'lioris_cron_secret', 'Shared secret the scheduled jobs send to the purge function')$q$;
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('lioris_cron_secret', 'ACTION NEEDED',
            'just created. Copy its value (query at the bottom of this file) and set it as the edge-function secret CRON_SECRET, so the purge function accepts the job');
  ELSE
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('lioris_cron_secret', 'OK', 'exists (make sure the edge-function secret CRON_SECRET has the same value)');
  END IF;
  INSERT INTO _lioris_setup_report (item, status, detail)
  VALUES ('lioris_project_url', 'OK', CASE WHEN v_have_url THEN 'exists' ELSE 'created' END);
END
$vault$;

-- ----------------------------------------------------------------------------
-- 3. background jobs (only missing ones are created)
-- ----------------------------------------------------------------------------
DO $jobs$
DECLARE
  r record;
  v_result text;
  v_present boolean;
BEGIN
  -- the ID-document purge has its own scheduler (it needs the Vault secrets above)
  IF to_regprocedure('public.schedule_verification_document_purge()') IS NULL THEN
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('ID-document purge job', 'ACTION NEEDED', 'schedule_verification_document_purge() is missing: run 02_apply_all.sql first');
  ELSE
    SELECT public.schedule_verification_document_purge() INTO v_result;
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('ID-document purge job (daily 04:07 UTC)', CASE WHEN v_result = 'scheduled' THEN 'OK' ELSE 'ACTION NEEDED' END, v_result);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('background jobs', 'ACTION NEEDED', 'pg_cron is off, so no job can be scheduled. Enable it and run this file again');
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('lioris_dispatch_event_reminders',   '*/5 * * * *',  'SELECT public.dispatch_event_reminders()',              'public.dispatch_event_reminders()'),
      ('lioris_event_reminders',            '*/10 * * * *', 'SELECT public.send_event_reminders()',                  'public.send_event_reminders()'),
      ('lioris_study_pod_reminders',        '*/10 * * * *', 'SELECT public.send_study_pod_reminders()',              'public.send_study_pod_reminders()'),
      ('lioris_mentorship_reminders',       '*/10 * * * *', 'SELECT public.send_mentorship_session_reminders()',     'public.send_mentorship_session_reminders()'),
      ('lioris_expire_mentorship_requests', '13 4 * * *',   'SELECT public.expire_stale_mentorship_requests()',      'public.expire_stale_mentorship_requests()'),
      ('lioris_publish_scheduled_posts',    '*/5 * * * *',  'SELECT public.publish_due_scheduled_posts()',           'public.publish_due_scheduled_posts()'),
      ('lioris_purge_audit_logs',           '17 3 * * *',   'SELECT public.purge_expired_audit_logs(24)',            'public.purge_expired_audit_logs(integer)'),
      ('lioris_purge_client_errors',        '37 3 * * *',   'SELECT public.purge_old_client_errors(30)',             'public.purge_old_client_errors(integer)'),
      ('lioris_cleanup_rate_limits',        '47 3 * * *',   'SELECT public.cleanup_api_rate_limits()',               'public.cleanup_api_rate_limits()'),
      ('lioris_purge_viewed_notifications', '27 3 * * *',   'SELECT public.purge_viewed_notifications(30)',          'public.purge_viewed_notifications(integer)'),
      ('lioris_purge_analytics',            '12 4 * * *',   'SELECT public.purge_old_analytics(90)',                 'public.purge_old_analytics(integer)'),
      ('lioris_purge_stale_push_tokens',    '17 4 * * *',   'SELECT public.purge_stale_push_tokens(120)',            'public.purge_stale_push_tokens(integer)'),
      ('lioris_purge_click_logs',           '22 4 * * *',   'SELECT public.purge_old_click_logs(180)',               'public.purge_old_click_logs(integer)'),
      ('lioris_purge_moderation_queue',     '27 4 * * *',   'SELECT public.purge_resolved_moderation_queue(12)',     'public.purge_resolved_moderation_queue(integer)'),
      ('lioris_purge_unread_notifications', '32 4 * * *',   'SELECT public.purge_old_unread_notifications(180)',     'public.purge_old_unread_notifications(integer)')
    ) AS t(name, schedule, cmd, fn)
  LOOP
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)' INTO v_present USING r.name;
    IF v_present THEN
      INSERT INTO _lioris_setup_report (item, status, detail) VALUES ('job ' || r.name, 'OK', 'already scheduled');
    ELSIF to_regprocedure(r.fn) IS NULL THEN
      INSERT INTO _lioris_setup_report (item, status, detail) VALUES ('job ' || r.name, 'ACTION NEEDED', r.fn || ' does not exist: run 02_apply_all.sql first');
    ELSE
      BEGIN
        EXECUTE 'SELECT cron.schedule($1, $2, $3)' USING r.name, r.schedule, r.cmd;
        INSERT INTO _lioris_setup_report (item, status, detail) VALUES ('job ' || r.name, 'OK', 'scheduled now (' || r.schedule || ')');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _lioris_setup_report (item, status, detail) VALUES ('job ' || r.name, 'ACTION NEEDED', 'could not schedule: ' || SQLERRM);
      END;
    END IF;
  END LOOP;
END
$jobs$;

-- ----------------------------------------------------------------------------
-- 4. Super Admins
-- ----------------------------------------------------------------------------
DO $admins$
DECLARE
  v_emails text[];
  v_email text;
  v_changed int;
  r record;
BEGIN
  SELECT super_admin_emails INTO v_emails FROM _lioris_setup_input;

  FOREACH v_email IN ARRAY COALESCE(v_emails, ARRAY[]::text[]) LOOP
    UPDATE public.profiles
       SET admin_role = 'super_admin'
     WHERE lower(email) = lower(btrim(v_email)) AND role::text = 'admin' AND admin_role IS DISTINCT FROM 'super_admin';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed > 0 THEN
      INSERT INTO _lioris_setup_report (item, status, detail) VALUES ('promoted ' || v_email, 'OK', 'is now a Super Admin');
      BEGIN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        SELECT NULL, 'super_admin_granted', 'user', p.id, jsonb_build_object('summary', 'Super Admin granted by 04_post_setup.sql')
          FROM public.profiles p WHERE lower(p.email) = lower(btrim(v_email));
      EXCEPTION WHEN OTHERS THEN
        NULL;  -- the audit row is a bonus; never block the promotion on it
      END;
    ELSIF NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(btrim(v_email)) AND role::text = 'admin') THEN
      INSERT INTO _lioris_setup_report (item, status, detail)
      VALUES ('promote ' || v_email, 'ACTION NEEDED', 'no administrator account with this e-mail (it must already have the admin role)');
    END IF;
  END LOOP;

  FOR r IN
    SELECT COALESCE(email, id::text) AS who, admin_role, campus_code
      FROM public.profiles WHERE role::text = 'admin' ORDER BY (admin_role = 'super_admin') DESC, email
  LOOP
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('admin ' || r.who,
            CASE WHEN r.admin_role = 'super_admin' THEN 'OK'
                 WHEN r.campus_code IS NULL OR r.campus_code = 'GLOBAL' THEN 'ACTION NEEDED'
                 ELSE 'OK' END,
            CASE WHEN r.admin_role = 'super_admin' THEN 'Super Admin (whole platform)'
                 WHEN r.campus_code IS NULL OR r.campus_code = 'GLOBAL'
                   THEN 'Campus Admin with no campus: if this person runs the whole platform, put their e-mail in the list at the top of this file and run it again'
                 ELSE 'Campus Admin for ' || r.campus_code END);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role::text = 'admin' AND admin_role = 'super_admin') THEN
    INSERT INTO _lioris_setup_report (item, status, detail)
    VALUES ('super admins', 'ACTION NEEDED', 'there is no Super Admin: add the platform owner''s e-mail to the list at the top and run this file again');
  END IF;
END
$admins$;

-- ----------------------------------------------------------------------------
-- 5. push notifications hook (informational: the database webhook that calls the send-push function)
-- ----------------------------------------------------------------------------
INSERT INTO _lioris_setup_report (item, status, detail)
SELECT 'push webhook on notifications',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_trigger t
                JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE t.tgrelid = 'public.notifications'::regclass AND NOT t.tgisinternal
                 AND n.nspname = 'supabase_functions' AND p.proname = 'http_request')
            THEN 'OK' ELSE 'ACTION NEEDED' END,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_trigger t
                JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE t.tgrelid = 'public.notifications'::regclass AND NOT t.tgisinternal
                 AND n.nspname = 'supabase_functions' AND p.proname = 'http_request')
            THEN 'found: new notifications reach the send-push function'
            ELSE 'not found: create the Database Webhook (table notifications, INSERT, calls the send-push function; see docs/operations/push-notifications.md). Without it nobody gets push notifications' END
WHERE to_regclass('public.notifications') IS NOT NULL;

-- ----------------------------------------------------------------------------
-- THE REPORT (this is the result you read)
-- ----------------------------------------------------------------------------
SELECT item, status, detail FROM _lioris_setup_report ORDER BY (status = 'OK'), n;

-- ----------------------------------------------------------------------------
-- Only if the report says lioris_cron_secret was just created: run THIS on its own, copy the value, and set it
-- as the edge-function secret (Edge Functions > Secrets > CRON_SECRET, or `supabase secrets set CRON_SECRET=<value>`):
--   select decrypted_secret as cron_secret from vault.decrypted_secrets where name = 'lioris_cron_secret';
-- ============================================================================
