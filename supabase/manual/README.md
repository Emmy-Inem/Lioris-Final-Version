# SQL to run by hand (Supabase Dashboard -> SQL Editor)

Generated from the migrations by `tools/build-manual-sql.sh`; do not edit these files, edit the migrations.

Run them **in this order**, each as one paste-and-Run:

| # | File | What it does | Changes data? |
|---|------|--------------|---------------|
| 1 | `01_diagnostics_before.sql` | Reads the live database and reports which audit findings are present. Save the result grid. | No (read-only) |
| 2 | `02_apply_fixes.sql` | Applies migrations 20261028 (RLS/auth/verification/resources), 20261029 (campus-admin vs super-admin scoping, campus media, role permissions) and 20261030 (optional 2FA switch, OFF). | Yes - schema, policies, a one-off backfill of members who confirmed an institutional e-mail |
| 3 | `03_verify_after.sql` | Same report again. Every "(must be false)" row must now say `false`; section `G applied` must say `true`. | No |

## Before step 2

1. Deploy the two edge functions: `supabase functions deploy login-with-username` and
   `supabase functions deploy admin-create-user` (needs `ALLOWED_ORIGINS` and the service-role key secrets).
2. In the diagnostic's admin roster make sure every platform-wide administrator has
   `admin_role = 'super_admin'`. Admins with an empty tier become `campus_admin` (the migration prints the roster as NOTICEs).

## After step 3

Ship the app/web build (it works before and after the SQL: it falls back to the old calls while the new functions are missing).

## Optional: require two-factor for admins (off by default)

Only when every admin has enrolled (the last diagnostic row counts them):

```sql
INSERT INTO public.platform_settings (key, value, description)
VALUES ('admin_mfa_required', '{"enabled": true}', 'Require AAL2 for enrolled admins')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Undo: `UPDATE public.platform_settings SET value = '{"enabled": false}' WHERE key = 'admin_mfa_required';`
