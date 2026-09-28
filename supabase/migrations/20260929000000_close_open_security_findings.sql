-- ============================================================================
-- LIORIS - CLOSE OPEN SECURITY FINDINGS (2026-09-29)
-- ============================================================================
-- Ships the three items left open by docs/security/security-assessment-2026-09-28.md
-- and previously tracked as "not yet changed" in supabase_launch_hardening_2026.md
-- (sections 6b and 6d):
--
--   1. profiles column privacy: any same-campus authenticated user could read a
--      peer's `email` and `student_id_number` because RLS is row-level, not
--      column-level, and the SELECT policy allows the whole same-campus row.
--      Fix: REVOKE SELECT on just those two columns from authenticated/anon,
--      and add SECURITY DEFINER RPCs for the legitimate cases that still need
--      them (the caller's own profile; admin/staff lookups).
--
--   2. notifications insert scoping: any non-suspended authenticated user could
--      insert a notification for ANY recipient with an arbitrary `type`,
--      including 'system_announcement' (rendered with a distinct red/urgent
--      "official" style in NotificationsList.tsx) - an in-app phishing vector.
--      Fix: a non-admin/staff sender is now restricted to the notification
--      types real peer-to-peer flows already use ('message', 'system'), plus
--      sane title/body length caps and an in-app-path-only action_url shape.
--      Admins/staff are unaffected - their branch of the policy is unchanged.
--
--   3. forum_community_members: membership rows (who belongs to which
--      discussion space) were readable by anon (logged-out, unauthenticated)
--      requests. The member-count UI already gets its numbers from the
--      `get_forum_communities_stats()` RPC (SECURITY DEFINER, unaffected by
--      this change); the anon table policy was strictly wider than anything
--      the app needs. Fix: drop the anon SELECT policy. Authenticated access
--      is unchanged (a signed-in user seeing which of their own campus peers
--      are in a space they can already see is accepted, lower-severity risk -
--      not what this migration addresses).
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1a. profiles: hide email / student_id_number (and a few other columns that
--     have no confirmed peer-facing use: push_token, suspension_reason,
--     last_active_at, last_login_at) from row-level "same campus" access.
--
--     Table-level and column-level grants are ADDITIVE in Postgres: a plain
--     `REVOKE SELECT (col) ON t FROM role` does nothing when role also holds
--     table-level SELECT (granted here by the bootstrap `ALTER DEFAULT
--     PRIVILEGES ... GRANT ALL ON TABLES`, mirroring how Supabase configures
--     every new public table). So the table-level grant has to be revoked
--     and replaced with an explicit safe-column grant - there is no way to
--     "subtract" a column from a table-level grant.
--
--     Columns kept grantable: id, full_name, username, role, campus_code,
--     department, faculty, level, bio, interests, avatar_url, banner_url,
--     verification_status, custom_accent_color, trust_score (shown on
--     marketplace listings - src/api/marketplace.ts), is_suspended,
--     onboarding_complete (read for the caller's own row at login/onboarding
--     - src/api/auth.ts, src/auth/AuthContext.tsx), is_bot, created_at,
--     updated_at.
--
--     Built from information_schema rather than a static column list: some
--     of these (is_bot, last_login_at) only exist once
--     20260926160000_admin_analytics_and_activity.sql has been applied, and
--     this migration must not fail on a database where that hasn't happened
--     yet. Any candidate column not present on this database is silently
--     skipped rather than erroring the whole migration.
-- ----------------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM authenticated, anon;
DO $$
DECLARE
    v_candidate_cols TEXT[] := ARRAY[
        'id', 'full_name', 'username', 'role', 'campus_code', 'department',
        'faculty', 'level', 'bio', 'interests', 'avatar_url', 'banner_url',
        'verification_status', 'custom_accent_color', 'trust_score',
        'is_suspended', 'onboarding_complete', 'is_bot', 'created_at', 'updated_at'
    ];
    v_existing_cols TEXT[];
BEGIN
    SELECT array_agg(quote_ident(column_name) ORDER BY column_name)
    INTO v_existing_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = ANY(v_candidate_cols);

    IF v_existing_cols IS NULL OR array_length(v_existing_cols, 1) IS NULL THEN
        RAISE EXCEPTION 'profiles: none of the expected safe columns were found - check this against the live schema before re-running';
    END IF;

    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', array_to_string(v_existing_cols, ', '));
END $$;

-- 1b. Self-service RPC: the caller's own full row (all columns), regardless
--     of the column REVOKE above - SECURITY DEFINER runs as the function
--     owner, which still has full table access. Scoped to auth.uid() only.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT * FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 1c. Admin/staff RPC: contact fields (incl. email/student_id_number) for a
--     specific set of user ids - used where an admin/staff screen currently
--     embeds `profiles:user_id(email, student_id_number, ...)` on another
--     table (support tickets today). Caller must be admin or staff.
CREATE OR REPLACE FUNCTION public.admin_get_profile_contacts(p_user_ids UUID[])
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    student_id_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')) INTO v_caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.email::TEXT, p.role::TEXT, p.campus_code::TEXT, p.student_id_number::TEXT
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profile_contacts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_contacts(UUID[]) TO authenticated, service_role;

-- 1d. Admin/staff RPC: free-text search across name/email for the admin
--     universal search modal (previously a direct `profiles.select('...email...')`
--     that only worked for admins by relying on the now-removed column grant).
CREATE OR REPLACE FUNCTION public.admin_search_profiles(p_query TEXT, p_limit INT DEFAULT 5)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    verification_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_query TEXT;
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')) INTO v_caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_query := '%' || COALESCE(TRIM(p_query), '') || '%';

    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.email::TEXT, p.role::TEXT, p.campus_code::TEXT, p.verification_status::TEXT
    FROM public.profiles p
    WHERE p.full_name ILIKE v_query OR p.email ILIKE v_query
    LIMIT LEAST(COALESCE(p_limit, 5), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(TEXT, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. notifications: scope non-admin inserts to the types + shapes real
--    peer-to-peer flows use, so a client can no longer free-write an
--    "official"-styled alert to an arbitrary recipient.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins or authentic senders can create notifications" ON notifications;
CREATE POLICY "Admins or authentic senders can create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    OR (
        (auth.uid() = sender_id OR auth.uid() = recipient_id)
        AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
        -- Peer-to-peer flows today only ever create 'message' (connection
        -- request/accept, chat) and 'system' (e.g. "connection accepted")
        -- notifications. 'system_announcement', 'announcement' and
        -- 'moderation' stay admin/staff-only (the branch above).
        AND type IN ('message', 'system')
        AND char_length(title) <= 150
        AND char_length(body) <= 1000
        AND (action_url IS NULL OR (left(action_url, 1) = '/' AND left(action_url, 2) <> '//'))
    )
);

-- ----------------------------------------------------------------------------
-- 3. forum_community_members: unauthenticated (anon) requests can no longer
--    read raw membership rows. The public member-count UI already goes
--    through get_forum_communities_stats() (SECURITY DEFINER), not this
--    table directly, so nothing user-facing changes.
--
--    Guarded on the table existing: it's only created by
--    20260926220000_forum_community_memberships.sql, which may not have
--    been applied to this database yet.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'forum_community_members'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS "Memberships are visible to anon" ON public.forum_community_members';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
