-- The previous migration skipped this job: cleanup_api_rate_limits takes (integer) with a default,
-- so to_regprocedure('...cleanup_api_rate_limits()') found nothing. Schedule it with the real signature.
DO $do$
BEGIN
  IF to_regprocedure('public.cleanup_api_rate_limits(integer)') IS NULL THEN
    RAISE NOTICE 'cleanup_api_rate_limits(integer) missing: job skipped';
    RETURN;
  END IF;
  BEGIN
    PERFORM cron.unschedule('lioris_cleanup_rate_limits');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('lioris_cleanup_rate_limits', '47 3 * * *', 'SELECT public.cleanup_api_rate_limits()');
END
$do$;
