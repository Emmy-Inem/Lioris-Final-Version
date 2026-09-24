-- Turn on pg_cron and schedule the retention jobs.
--
-- supabase_launch_hardening_2026.sql only schedules its jobs "when pg_cron is installed", and it was
-- not, so audit-log / client-error / rate-limit retention and the viewed-notification cleanup were
-- never running. This installs the extension and (re)schedules them. Safe to re-run: each job is
-- unscheduled first, and a job whose function does not exist is skipped.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('lioris_purge_audit_logs',          '17 3 * * *', 'SELECT public.purge_expired_audit_logs(24)',   'public.purge_expired_audit_logs(integer)'),
      ('lioris_purge_client_errors',       '37 3 * * *', 'SELECT public.purge_old_client_errors(30)',    'public.purge_old_client_errors(integer)'),
      ('lioris_cleanup_rate_limits',       '47 3 * * *', 'SELECT public.cleanup_api_rate_limits()',      'public.cleanup_api_rate_limits()'),
      ('lioris_purge_viewed_notifications','27 3 * * *', 'SELECT public.purge_viewed_notifications(30)', 'public.purge_viewed_notifications(integer)')
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
