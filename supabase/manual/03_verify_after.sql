-- ============================================================================
-- LIORIS - LIVE STATE DIAGNOSTIC (read-only)
-- ============================================================================
-- Purpose: the platform audit (docs/audit/2026-10-15-platform-audit.md) was done from the repository.
-- This script reads the LIVE database and says which of the audit's findings are actually present in
-- production, so nobody has to guess which of the ~100 SQL files were really applied, or in what order.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> new query -> paste this whole file -> Run.
--   It changes NOTHING (SELECTs and one temporary, session-local helper function).
--   Copy the result grid (or "Export -> CSV") and send it back.
--
-- It lists, per check: [section] item -> value. Rows beginning with "ERROR:" mean the object does not
-- exist on your database (itself an answer - e.g. a migration that was never applied).
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.q(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN COALESCE(v, '(none)');
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERROR: ' || SQLERRM;
END
$$;

SELECT section, item, value
FROM (VALUES
  -- ---------------------------------------------------------------- A. what is deployed
  ('A deploy', 'latest applied migration (supabase_migrations)',
     pg_temp.q($q$ SELECT max(version) FROM supabase_migrations.schema_migrations $q$)),
  ('A deploy', 'number of applied migrations',
     pg_temp.q($q$ SELECT count(*)::text FROM supabase_migrations.schema_migrations $q$)),
  ('A deploy', 'audit remediation (20261028) applied? (review_verification_request exists)',
     pg_temp.q($q$ SELECT (to_regprocedure('public.review_verification_request(uuid,boolean,text)') IS NOT NULL)::text $q$)),
  ('A deploy', 'campus wall functions exist (auth_campus_access)',
     pg_temp.q($q$ SELECT (to_regprocedure('public.auth_campus_access()') IS NOT NULL)::text $q$)),
  ('A deploy', 'campus wall switch (platform_settings.campus_wall)',
     pg_temp.q($q$ SELECT public.campus_wall_enabled()::text $q$)),
  ('A deploy', 'sign-up trigger can mint the owner admin at SIGN-UP (must be false)',
     pg_temp.q($q$ SELECT (pg_get_functiondef('public.handle_new_user_profile()'::regprocedure) ~* 'inememmanuel')::text $q$)),
  ('A deploy', 'sign-up trigger reads the age answer the app actually sends (age_eligibility_confirmed)',
     pg_temp.q($q$ SELECT (pg_get_functiondef('public.handle_new_user_profile()'::regprocedure) ~ 'age_eligibility_confirmed')::text $q$)),
  ('A deploy', 'consent records: sign-ups stored as age NOT confirmed (all of them = the key mismatch)',
     pg_temp.q($q$ SELECT count(*) FILTER (WHERE NOT age_confirmed_18)::text || ' of ' || count(*)::text FROM public.consent_records WHERE source = 'signup' $q$)),
  ('A deploy', 'all non-system triggers on auth.users',
     pg_temp.q($q$ SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal $q$)),

  -- ---------------------------------------------------------------- B. privacy (finding C1, C4)
  ('B privacy', 'ANON can read profiles.email  (must be false)',
     pg_temp.q($q$ SELECT has_column_privilege('anon', 'public.profiles', 'email', 'SELECT')::text $q$)),
  ('B privacy', 'ANON can read profiles.student_id_number  (must be false)',
     pg_temp.q($q$ SELECT has_column_privilege('anon', 'public.profiles', 'student_id_number', 'SELECT')::text $q$)),
  ('B privacy', 'AUTHENTICATED can read profiles.email  (must be false)',
     pg_temp.q($q$ SELECT has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT')::text $q$)),
  ('B privacy', 'AUTHENTICATED can read profiles.push_token / last_login_at  (must be false)',
     pg_temp.q($q$ SELECT (has_column_privilege('authenticated','public.profiles','push_token','SELECT') OR has_column_privilege('authenticated','public.profiles','last_login_at','SELECT'))::text $q$)),
  ('B privacy', 'profiles columns authenticated can NOT read',
     pg_temp.q($q$ SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND NOT has_column_privilege('authenticated','public.profiles',column_name,'SELECT') $q$)),
  ('B privacy', 'anon-readable profile rows under current policy (GLOBAL or directory_discoverable)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE campus_code = 'GLOBAL' OR directory_discoverable = true $q$)),
  ('B privacy', 'total profiles',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles $q$)),
  ('B privacy', 'anon policy on profiles',
     pg_temp.q($q$ SELECT string_agg(policyname || ' :: ' || regexp_replace(coalesce(qual,''), '\s+', ' ', 'g'), ' | ') FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND 'anon' = ANY(roles) $q$)),
  ('B privacy', 'ANON can execute get_email_for_username  (must be false)',
     pg_temp.q($q$ SELECT has_function_privilege('anon', 'public.get_email_for_username(text)', 'EXECUTE')::text $q$)),
  ('B privacy', 'ANON can read the public_profiles view  (must be false)',
     pg_temp.q($q$ SELECT has_table_privilege('anon', 'public.public_profiles', 'SELECT')::text $q$)),

  -- ---------------------------------------------------------------- C. admin hierarchy (C2, H2, H4)
  ('C hierarchy', 'is_super_admin() body (must NOT test role = admin on its own)',
     pg_temp.q($q$ SELECT left(regexp_replace(pg_get_functiondef('public.is_super_admin()'::regprocedure), '\s+', ' ', 'g'), 700) $q$)),
  ('C hierarchy', 'auth_is_super_admin() body',
     pg_temp.q($q$ SELECT left(regexp_replace(pg_get_functiondef('public.auth_is_super_admin()'::regprocedure), '\s+', ' ', 'g'), 500) $q$)),
  ('C hierarchy', 'ADMIN ROSTER  email : campus : admin_role : suspended',
     pg_temp.q($q$ SELECT string_agg(coalesce(email,id::text) || ' : ' || coalesce(campus_code,'(null)') || ' : ' || coalesce(admin_role,'NULL') || ' : ' || coalesce(is_suspended,false)::text, E'\n' ORDER BY created_at) FROM public.profiles WHERE role::text = 'admin' $q$)),
  ('C hierarchy', 'admins with NULL admin_role (become campus admins after remediation)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text='admin' AND admin_role IS NULL $q$)),
  ('C hierarchy', 'admins/staff with no real campus (GLOBAL or empty) that are NOT super admins',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text IN ('admin','staff') AND coalesce(admin_role,'') <> 'super_admin' AND (campus_code IS NULL OR campus_code IN ('','GLOBAL')) $q$)),
  ('C hierarchy', 'profiles policies',
     pg_temp.q($q$ SELECT string_agg(policyname || ' [' || cmd || ']', E'\n' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='profiles' $q$)),
  ('C hierarchy', 'campuses policies',
     pg_temp.q($q$ SELECT string_agg(policyname || ' [' || cmd || '] ' || left(regexp_replace(coalesce(qual,''), '\s+', ' ', 'g'), 120), E'\n') FROM pg_policies WHERE schemaname='public' AND tablename='campuses' $q$)),
  ('C hierarchy', 'triggers on profiles',
     pg_temp.q($q$ SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal $q$)),
  ('C hierarchy', 'escalation guard also freezes is_bot and e-mail?',
     pg_temp.q($q$ SELECT (pg_get_functiondef('public.prevent_profile_role_escalation()'::regprocedure) ~ 'is_bot' AND pg_get_functiondef('public.prevent_profile_role_escalation()'::regprocedure) ~ 'NEW.email')::text $q$)),
  ('C hierarchy', 'number of policies that grant power to ANY role=admin without a campus test (see list below)',
     pg_temp.q($q$ SELECT count(*)::text FROM pg_policies WHERE schemaname IN ('public','storage') AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* $$(role\s*=\s*'admin'|auth_profile_role\(\)\s*(=|IN)\s*\(?'admin')$$ $q$)),
  ('C hierarchy', 'tables carrying such policies',
     pg_temp.q($q$ SELECT string_agg(DISTINCT tablename, ', ') FROM pg_policies WHERE schemaname IN ('public','storage') AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* $$(role\s*=\s*'admin'|auth_profile_role\(\)\s*(=|IN)\s*\(?'admin')$$ $q$)),

  -- ---------------------------------------------------------------- D. verification (H3) and onboarding data
  ('D verification', 'verifications policies',
     pg_temp.q($q$ SELECT string_agg(policyname || ' [' || cmd || ']', E'\n' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='verifications' $q$)),
  ('D verification', 'pending requests',
     pg_temp.q($q$ SELECT count(*)::text FROM public.verifications WHERE status::text='pending' $q$)),
  ('D verification', 'pending requests older than 7 days',
     pg_temp.q($q$ SELECT count(*)::text FROM public.verifications WHERE status::text='pending' AND created_at < now() - interval '7 days' $q$)),
  ('D verification', 'pending requests whose campus is GLOBAL (invisible to every Campus Admin)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.verifications WHERE status::text='pending' AND campus_code = 'GLOBAL' $q$)),
  ('D verification', 'members with more than one pending request',
     pg_temp.q($q$ SELECT count(*)::text FROM (SELECT user_id FROM public.verifications WHERE status::text='pending' GROUP BY user_id HAVING count(*)>1) x $q$)),
  ('D verification', 'SYNC GAP: request approved but profile NOT verified',
     pg_temp.q($q$ SELECT count(*)::text FROM public.verifications v JOIN public.profiles p ON p.id=v.user_id WHERE v.status::text='approved' AND p.verification_status::text <> 'verified' $q$)),
  ('D verification', 'SYNC GAP: profile pending but no pending request exists',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles p WHERE p.verification_status::text='pending' AND NOT EXISTS (SELECT 1 FROM public.verifications v WHERE v.user_id=p.id AND v.status::text='pending') $q$)),
  ('D verification', 'SYNC GAP: request rejected but profile still pending',
     pg_temp.q($q$ SELECT count(*)::text FROM public.verifications v JOIN public.profiles p ON p.id=v.user_id WHERE v.status::text='rejected' AND p.verification_status::text = 'pending' AND NOT EXISTS (SELECT 1 FROM public.verifications v2 WHERE v2.user_id=p.id AND v2.status::text='pending') $q$)),
  ('D verification', 'institutional e-mail members still unverified (auto-verify never ran for them)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.role::text IN ('student','alumni') AND p.verification_status::text='unverified' AND u.email_confirmed_at IS NOT NULL AND public.campus_for_email(u.email) IS NOT NULL $q$)),
  ('D verification', 'verified members whose campus is GLOBAL',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE verification_status::text='verified' AND role::text IN ('student','alumni') AND (campus_code IS NULL OR campus_code='GLOBAL') $q$)),
  ('D onboarding', 'accounts stuck: onboarding incomplete although campus AND department are set',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text IN ('student','alumni') AND NOT coalesce(is_bot,false) AND coalesce(onboarding_complete,false)=false AND campus_code IS NOT NULL AND campus_code <> 'GLOBAL' AND nullif(btrim(coalesce(department,'')),'') IS NOT NULL $q$)),
  ('D onboarding', 'accounts with onboarding incomplete for more than 3 days',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text IN ('student','alumni') AND NOT coalesce(is_bot,false) AND coalesce(onboarding_complete,false)=false AND created_at < now() - interval '3 days' $q$)),
  ('D onboarding', 'student/alumni accounts with campus GLOBAL',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text IN ('student','alumni') AND campus_code = 'GLOBAL' $q$)),
  ('D onboarding', 'students/alumni without a username',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE role::text IN ('student','alumni') AND nullif(btrim(coalesce(username,'')),'') IS NULL $q$)),
  ('D onboarding', 'auth users with NO profile row',
     pg_temp.q($q$ SELECT count(*)::text FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) $q$)),
  ('D onboarding', 'auth users who never confirmed their e-mail',
     pg_temp.q($q$ SELECT count(*)::text FROM auth.users WHERE email_confirmed_at IS NULL $q$)),
  ('D onboarding', 'fabricated matric numbers (pattern CAMPUS/YYYY/NNNN created by the admin "create user" form)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.profiles WHERE student_id_number ~ '^[A-Z]{2,16}/20[0-9]{2}/[0-9]{4}$' $q$)),

  -- ---------------------------------------------------------------- E. resources and storage (C3)
  ('E storage', 'bucket visibility',
     pg_temp.q($q$ SELECT string_agg(id || ' public=' || public::text, ', ' ORDER BY id) FROM storage.buckets $q$)),
  ('E storage', 'bucket MIME allow-list for resources',
     pg_temp.q($q$ SELECT array_to_string(allowed_mime_types, ', ') FROM storage.buckets WHERE id='resources' $q$)),
  ('E storage', 'storage.objects policies',
     pg_temp.q($q$ SELECT string_agg(policyname || ' [' || cmd || ']', E'\n' ORDER BY policyname) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' $q$)),
  ('E storage', 'resources READ policy is the campus-agnostic "verified members" rule (finding C3)',
     pg_temp.q($q$ SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Campus media and resources viewable by verified members')::text $q$)),
  ('E storage', 'resources rows',
     pg_temp.q($q$ SELECT count(*)::text FROM public.resources $q$)),
  ('E storage', 'resources rows whose FILE does not exist in storage ("download does nothing")',
     pg_temp.q($q$ SELECT count(*)::text FROM public.resources r WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='resources' AND o.name = coalesce(substring(r.file_url from '/storage/v1/object/(?:public|sign|authenticated)/resources/([^?#]+)'), r.file_url)) AND r.file_url ~ '/storage/v1/object/' $q$)),
  ('E storage', 'resources rows that point at an EXTERNAL link (not downloadable from storage)',
     pg_temp.q($q$ SELECT count(*)::text FROM public.resources WHERE file_url IS NOT NULL AND file_url !~ '/storage/v1/object/' $q$)),
  ('E storage', 'resources: approved / pending / GLOBAL campus',
     pg_temp.q($q$ SELECT count(*) FILTER (WHERE is_approved)::text || ' / ' || count(*) FILTER (WHERE NOT is_approved)::text || ' / ' || count(*) FILTER (WHERE campus_code='GLOBAL' OR campus_code IS NULL)::text FROM public.resources $q$)),
  ('E storage', 'resources SELECT policy source (claimed campus vs verified wall)',
     pg_temp.q($q$ SELECT string_agg(left(regexp_replace(coalesce(qual,''), '\s+', ' ', 'g'), 260), E'\n') FROM pg_policies WHERE schemaname='public' AND tablename='resources' AND cmd='SELECT' $q$)),

  -- ---------------------------------------------------------------- F. role permission matrix (H5)
  ('F permissions', 'role_permissions rows',
     pg_temp.q($q$ SELECT count(*)::text FROM public.role_permissions $q$)),
  ('F permissions', 'download / upload / verify toggles per role',
     pg_temp.q($q$ SELECT string_agg(role || '.' || permission_key || '=' || enabled::text, ', ' ORDER BY role, permission_key) FROM public.role_permissions WHERE permission_key IN ('can_download_resources','can_upload_resources','can_verify_students') $q$)),
  ('F permissions', 'has_role_permission() exists (permissions enforced in the database)',
     pg_temp.q($q$ SELECT (to_regprocedure('public.has_role_permission(text)') IS NOT NULL)::text $q$)),

  -- ---------------------------------------------------------------- G. migrations 20261028 / 29 / 30 applied?
  ('G applied', '20261028 audit_remediation: can_admin_campus() exists',
     pg_temp.q($q$ SELECT (to_regprocedure('public.can_admin_campus(text)') IS NOT NULL)::text $q$)),
  ('G applied', '20261028 audit_remediation: submit_verification_request() exists',
     pg_temp.q($q$ SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='submit_verification_request' AND pronamespace='public'::regnamespace)::text $q$)),
  ('G applied', '20261029 scope completion: can_read_media_object() exists',
     pg_temp.q($q$ SELECT (to_regprocedure('public.can_read_media_object(text)') IS NOT NULL)::text $q$)),
  ('G applied', '20261029 scope completion: restrictive scope_* policies (expect ~50+)',
     pg_temp.q($q$ SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'scope\_%' AND permissive = 'RESTRICTIVE' $q$)),
  ('G applied', '20261029 scope completion: role_permission_insert policies (expect 4)',
     pg_temp.q($q$ SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND policyname = 'role_permission_insert' $q$)),
  ('G applied', '20261030 optional 2FA switch: admin_aal2_ok() exists',
     pg_temp.q($q$ SELECT (to_regprocedure('public.admin_aal2_ok()') IS NOT NULL)::text $q$)),
  ('G applied', '20261030 optional 2FA switch: current setting (none = off)',
     pg_temp.q($q$ SELECT value::text FROM public.platform_settings WHERE key = 'admin_mfa_required' $q$)),
  ('G applied', 'admins who already enrolled a verified 2FA factor (safe to switch the 2FA requirement on once all admins are here)',
     pg_temp.q($q$ SELECT count(DISTINCT f.user_id)::text || ' of ' || (SELECT count(*) FROM public.profiles WHERE role::text='admin')::text FROM auth.mfa_factors f JOIN public.profiles p ON p.id=f.user_id WHERE f.status::text='verified' AND p.role::text='admin' $q$))
) AS t(section, item, value)
ORDER BY section, item;

-- ============================================================================
-- DASHBOARD CHECKLIST (not visible from SQL - open each and tell me the value)
--   Authentication -> Providers -> Email: "Confirm email" ON?  "Secure email change" OFF (see docs)?
--   Authentication -> Providers -> Email: OTP length = 6, OTP expiry = 3600?
--   Authentication -> Attack Protection -> CAPTCHA: enabled?  (if ON, native app sign-ups/logins fail:
--        only the web build renders the Turnstile widget)
--   Authentication -> URL Configuration: Site URL and every Redirect URL (web origin + app scheme)
--   Authentication -> Email Templates: "Confirm signup" shows {{ .Token }} (6-digit code)?
--   Project Settings -> API: is the legacy `service_role` key ever shipped in the client? (it must not be)
--   Edge Functions: are `login-with-username` and `admin-create-user` deployed? ALLOWED_ORIGINS includes your web origin(s)?
-- ============================================================================
