# supabase_security_hardening_2026.sql

## Apply order
1. Everything already applied on the live DB, ending with `supabase_email_confirmation_2026.sql`
   (this script needs `campus_for_email()` and aborts with a clear message otherwise).
2. Run `supabase_security_hardening_2026.sql` in the SQL Editor as the `postgres` role. It is one
   transaction (`BEGIN`/`COMMIT`), idempotent, and safe to re-run.
3. Do NOT re-run older files afterwards. `supabase_schema.sql` and `supabase_backfill_profiles.sql`
   still contain the `inememmanuel@gmail.com` admin elevation, and `supabase_schema.sql` re-creates
   the old permissive policies and `handle_new_user_profile()`. If they must be re-run, re-run this file after.

## Verify (run after applying)
```sql
-- 1 secrets redacted and hidden
select key, value from platform_settings where public.is_secret_setting_key(key);
-- 3 staff policy fixed (expects role IN ('student','alumni') and auth_profile_campus())
select qual, with_check from pg_policies where policyname = 'Staff can update profiles for their campus';
-- 5 no SECURITY DEFINER function without a pinned search_path / with anon EXECUTE
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
 where p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%pg_temp%'));
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
 where p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');
-- 6 rate-limit RPCs closed
select has_function_privilege('authenticated','public.check_auth_rate_limit(text)','EXECUTE');  -- false
-- 7 backdoor gone
select prosrc ilike '%inememmanuel%' as still_present from pg_proc where proname='handle_new_user_profile';  -- false
-- 8 append-only
select tgname from pg_trigger where tgrelid='public.audit_logs'::regclass and not tgisinternal;
-- 11/12 service_role only
select has_function_privilege('authenticated','public.purge_user_data(uuid)','EXECUTE'),
       has_function_privilege('authenticated','public.consume_rate_limit(text,int,int)','EXECUTE'); -- false,false
-- URL constraints validated or not
select conrelid::regclass, conname, convalidated from pg_constraint where conname like 'chk\_%\_url\_scheme';
-- storage policies / mime types
select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' order by 1;
select id, allowed_mime_types from storage.buckets where id in ('resources','avatars','campus-media');
```

## What to deploy with it
- Client (agent A): stop calling `check_auth_rate_limit` / `record_auth_attempt`; stop saving AI/WebRTC keys or
  anything matching the secret patterns via `platform_settings` (writes now raise `42501`); pass
  `terms_version`, `terms_accepted_at`, `age_confirmed_18` in signup `options.data`; make WebRTC channels private:
  `supabase.channel('webrtc:' + room, { config: { private: true, broadcast: { self: false } } })`
  (realtime.messages RLS only applies to private channels; call `supabase.realtime.setAuth()` first if needed).
- Edge functions (agent C): `consume_rate_limit(p_key, p_limit, p_window_seconds) -> boolean` (true = allowed),
  `cleanup_api_rate_limits(p_older_than_seconds default 86400)`, `export_my_data()` (user JWT),
  `purge_user_data(uuid)` and `list_expired_verification_documents(p_days default 30)` (service role).
  Delete-account order: `purge_user_data` -> delete Storage objects under `<uid>/` in every bucket -> `auth.admin.deleteUser`.
  Schedule the verification-document retention job (30 days after final decision) using
  `list_expired_verification_documents`, deleting through the Storage API (never SQL).
- Uploads must use paths `<auth.uid()>/...` (the current client already does); anything else is now rejected.

## Assumptions / risks
- WebRTC topic mapping: topic `webrtc:lioris-ui-<first 16 hex chars of chat_channels.id without dashes>`
  (from `getCallRoomName`). Members are matched by that 16-char prefix. Room names that do not match (for example
  `campus-room` or non-UUID demo ids) get no access on private channels. Non-webrtc topics are not granted by these policies.
- `suspension_reason` sits on `profiles`, which same-campus users can SELECT; avoid `select('*')`/exposing it in UI for
  non-staff, or move it to a private table later.
- Legacy rows with non-http(s) URLs are set to NULL in nullable columns. `jobs.apply_url`, `resources.file_url`,
  `portal_links.url` are NOT NULL, so their constraints stay `NOT VALID` if bad legacy rows exist (still enforced for
  new writes); fix rows then `VALIDATE CONSTRAINT`. Failed feed-image uploads that leave a `file:`/`blob:` URI will now
  be rejected on insert (previously they stored a dead URL).
- Columns guessed and guarded by existence checks: resources.thumbnail_url/cover_url/preview_url, profiles website-like
  columns, announcements link columns, matric_number/phone in purge. Missing ones are skipped.
- The last-admin guard also blocks deleting the auth user of the only active admin (cascade); promote another admin first.
  Bulk-deleting all admins in one statement can still bypass it (each row sees the others).
- `audit_logs` is append-only for everyone including service_role; disable the two triggers manually for maintenance.
  Audit rows keep `metadata.actorName` after erasure (retention basis: security audit trail); `actor_id` is nulled by the FK.
- Table `payment_gateway_config` in platform_settings is NOT redacted (public keys only, key name does not match the
  patterns); JSON fields named like `*secret*`, `*api_key*`, `private_key` are rejected.
- Public buckets keep the public SELECT policy on `storage.objects`, so object listing via the anon key remains possible.
- Legacy public tables with RLS disabled that the schema files do not create are only reported by a WARNING.
- Staff review of verification documents is implemented (staff SELECT on same-campus student/alumni folders), matching
  `ApprovalsModerationTab scope="staff"`.
- The escalation trigger `prevent_profile_role_escalation` was re-created with the audit-2026 `trust_score` revert
  (regressed by later migrations), staff self-edits treated as normal users, and staff limited to student/alumni targets.

## Rollback hints
- Policies: recreate the originals from `supabase_schema.sql` (platform_settings SELECT `USING (true)` etc.).
- `DROP TRIGGER trg_block_secret_settings/trg_audit_logs_append_only/trg_audit_logs_no_truncate/trg_audit_logs_sanitize_insert/
  trg_zz_audit_profile_changes/trg_zz_audit_profile_deleted/trg_guard_last_admin_update/trg_guard_last_admin_delete/
  trg_profile_clear_suspension_reason ON ...;`
- URL constraints: `ALTER TABLE t DROP CONSTRAINT chk_<table>_<column>_url_scheme;`
- Function grants: `GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;` for any RPC you must reopen.
- Redacted secrets cannot be restored; re-enter them as Edge Function secrets.
- New objects (`consent_records`, `api_rate_limits`, `suspension_reason`) can be left in place or dropped.
