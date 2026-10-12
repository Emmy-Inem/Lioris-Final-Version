-- Total campus deletion, used by the admin-manage-institution edge function (Super Admin + MFA + typed-code
-- confirmation are enforced there). Both functions are callable by the service role ONLY.
--
-- Rather than hard-coding a table list that rots every time a feature adds a campus-scoped table, they discover
-- every base table in `public` that has a `campus_code` column.
--   * profiles    -> members are MOVED to GLOBAL (their accounts are never deleted)
--   * every other -> rows belonging to the campus are deleted (events, resources, posts, communities, portal links ...)
-- The campus row itself is removed last, which frees its email domains. GLOBAL can never be deleted.
-- Everything runs in one transaction: if any table cannot be cleared, nothing is changed.

CREATE OR REPLACE FUNCTION public.campus_delete_impact(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  t       record;
  n       bigint;
  result  jsonb := '{}'::jsonb;
BEGIN
  p_code := upper(btrim(p_code));
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'campus_code'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE campus_code = $1', t.table_name) INTO n USING p_code;
    IF n > 0 THEN result := result || jsonb_build_object(t.table_name, n); END IF;
  END LOOP;
  RETURN result;
END $$;

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
BEGIN
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

  -- Members keep their accounts; they simply land on the Global network.
  IF moved > 0 THEN
    UPDATE public.profiles SET campus_code = 'GLOBAL' WHERE campus_code = p_code;
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

  -- Foreign keys between campus-scoped tables decide the order, so retry what failed until nothing is left.
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
    RAISE EXCEPTION 'cleanup_failed: could not clear %', array_to_string(pending, ', ');
  END IF;

  DELETE FROM public.campuses WHERE code = p_code;

  RETURN jsonb_build_object('code', p_code, 'membersMoved', moved, 'deleted', deleted);
END $$;

REVOKE ALL ON FUNCTION public.campus_delete_impact(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_campus(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campus_delete_impact(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_campus(text, text) TO service_role;
