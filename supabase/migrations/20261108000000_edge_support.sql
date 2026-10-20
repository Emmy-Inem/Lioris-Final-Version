-- ============================================================================
-- 20261108000000  Database support for the edge-function hardening pass
-- ============================================================================
-- Idempotent (CREATE OR REPLACE, guarded) and transactional. Every function here is
-- service_role only: the edge functions call them with the service-role client.
--
--   1. admin_revoke_user_sessions(uuid, timestamptz)
--        The GoTrue admin API's signOut() takes a user's JWT, not a user id, so the
--        old admin-force-signout call could never revoke anything. This deletes the
--        user's rows from auth.refresh_tokens and auth.sessions directly (guarded with
--        to_regclass, so a differently-shaped auth schema degrades to a no-op instead of
--        an error). With p_since only sessions created at/after that moment are
--        revoked (used to end an impersonation without logging the real user out of
--        devices they signed into earlier). NOTE: an already-issued access token (JWT)
--        stays valid until its own expiry (default 1 hour); the refresh token and the
--        session are what is destroyed, so it can not be renewed.
--   2. consume_rate_limit_ex(text, int, int) -> jsonb {allowed, count}
--        Same counter as consume_rate_limit(text, int, int) (which is untouched) but
--        returns the hit count, so the edge limiter can write ONE audit row on the
--        first denial of a window instead of one per denied request.
--   3. bump_client_error(text, int) -> boolean
--        Atomic "occurrences = occurrences + 1" for report-client-error (the old
--        select-then-update lost increments under concurrency).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. admin_revoke_user_sessions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(p_user_id uuid, p_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tokens   bigint := 0;
  v_sessions bigint := 0;
  v_n        bigint;
  v_tok_has_session boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;

  IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'auth.refresh_tokens'::regclass AND attname = 'session_id' AND NOT attisdropped
    ) INTO v_tok_has_session;

    IF p_since IS NULL THEN
      DELETE FROM auth.refresh_tokens WHERE user_id::text = p_user_id::text;
    ELSIF v_tok_has_session AND to_regclass('auth.sessions') IS NOT NULL THEN
      DELETE FROM auth.refresh_tokens
       WHERE user_id::text = p_user_id::text
         AND session_id IN (SELECT s.id FROM auth.sessions s WHERE s.user_id = p_user_id AND s.created_at >= p_since);
    ELSE
      DELETE FROM auth.refresh_tokens WHERE user_id::text = p_user_id::text AND created_at >= p_since;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_tokens := v_n;
  END IF;

  IF to_regclass('auth.sessions') IS NOT NULL THEN
    IF p_since IS NULL THEN
      DELETE FROM auth.sessions WHERE user_id = p_user_id;
    ELSE
      DELETE FROM auth.sessions WHERE user_id = p_user_id AND created_at >= p_since;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sessions := v_n;
  END IF;

  RETURN jsonb_build_object('user_id', p_user_id, 'refresh_tokens', v_tokens, 'sessions', v_sessions);
END
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. consume_rate_limit_ex: counter + hit count (new name; the old signature is unchanged)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;  -- no policies on purpose

CREATE OR REPLACE FUNCTION public.consume_rate_limit_ex(p_key text, p_limit int, p_window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' OR length(p_key) > 256 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be positive';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'count', 0);
  END IF;

  INSERT INTO public.api_rate_limits AS r (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET window_start = CASE WHEN r.window_start + make_interval(secs => p_window_seconds) <= now()
                            THEN now() ELSE r.window_start END,
        count        = CASE WHEN r.window_start + make_interval(secs => p_window_seconds) <= now()
                            THEN 1 ELSE LEAST(r.count + 1, 2000000000) END
  RETURNING r.count INTO v_count;

  RETURN jsonb_build_object('allowed', v_count <= p_limit, 'count', v_count);
END
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit_ex(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_ex(text, int, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. bump_client_error: atomic occurrences + 1 on the newest row of a fingerprint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_client_error(p_fingerprint text, p_window_seconds int DEFAULT 3600)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_fingerprint IS NULL OR btrim(p_fingerprint) = '' OR to_regclass('public.client_errors') IS NULL THEN
    RETURN false;
  END IF;

  -- FOR UPDATE (not SKIP LOCKED): a concurrent bump waits for the row instead of
  -- falling through to a duplicate insert.
  SELECT id INTO v_id
    FROM public.client_errors
   WHERE fingerprint = p_fingerprint
     AND last_seen_at >= now() - make_interval(secs => GREATEST(COALESCE(p_window_seconds, 3600), 1))
   ORDER BY last_seen_at DESC
   LIMIT 1
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.client_errors
     SET occurrences = LEAST(occurrences + 1, 2000000000), last_seen_at = now()
   WHERE id = v_id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.bump_client_error(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_client_error(text, int) TO service_role;

COMMIT;
