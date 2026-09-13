-- Fix P0: "Database error saving new user" on every signup (all roles/campuses).
--
-- Root cause: handle_new_user_profile() and handle_auto_confirm_user() are
-- SECURITY DEFINER triggers on auth.users with no pinned search_path. GoTrue
-- executes signups as `supabase_auth_admin`, whose default search_path is
-- `auth` only (see pg_roles.rolconfig). SECURITY DEFINER functions run with
-- the DEFINER's privileges but the CALLER's search_path unless one is
-- explicitly set, so the unqualified `INSERT INTO profiles (...)` and the
-- unqualified `user_role_type` / `verification_status_type` casts inside
-- handle_new_user_profile() fail to resolve, raising:
--   ERROR 42P01: relation "profiles" does not exist
-- which GoTrue reports to clients as the generic
--   {"error_code":"unexpected_failure","msg":"Database error saving new user"}
--
-- Fix: pin search_path on both SECURITY DEFINER trigger functions so they
-- resolve `public` objects regardless of the invoking role's own search_path.
-- This does not change either function's logic.

ALTER FUNCTION public.handle_new_user_profile() SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.handle_auto_confirm_user() SET search_path = public, auth, pg_temp;
