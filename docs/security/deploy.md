# Security deployment checklist

Everything here is a manual step: nothing is deployed automatically by the repo.

## 1. Database migration (agent B / owner)

Apply `supabase_security_hardening_2026.sql` in the Supabase SQL editor **before** deploying the edge functions. The functions call these RPCs (service_role only):

- `public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean`
- `public.purge_user_data(p_user_id uuid) returns jsonb`
- `public.list_expired_verification_documents(p_days int default 30) returns table(bucket text, path text)`

`gemini-proxy`, `admin-impersonate-user` and `delete-my-account` fail closed (503) if `consume_rate_limit` is missing.

## 2. Secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>
supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>
supabase secrets set ALLOWED_ORIGINS=https://lioris-final-version.vercel.app,https://lioris.app,https://www.lioris.app
supabase secrets set REQUIRE_ADMIN_MFA=true
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
```

| Secret | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | Server-only. Never in a client `.env`. |
| `GEMINI_API_KEY` | gemini-proxy | Rotate the key that was previously exposed in the web bundle. |
| `ALLOWED_ORIGINS` | all browser-facing functions | Comma separated, exact origins, no trailing slash. Unset = built-in defaults (vercel.app, lioris.app, www.lioris.app, localhost:8081/19006). Drop the localhost entries in production. |
| `REQUIRE_ADMIN_MFA` | admin-delete-user, admin-impersonate-user | Enforced unless exactly `false`. Admins must enrol MFA (TOTP) first, otherwise they get `403 mfa_required`. |
| `CRON_SECRET` | purge-expired-verification-documents | At least 16 characters; compared in constant time. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by Supabase automatically.

## 3. Function deployment and `verify_jwt`

There is no `supabase/config.toml` in the repo (creating a partial one can break `supabase start` and link state), so pass the flags on the command line:

| Function | verify_jwt | Command |
| --- | --- | --- |
| gemini-proxy | true | `supabase functions deploy gemini-proxy` |
| admin-delete-user | true | `supabase functions deploy admin-delete-user` |
| admin-impersonate-user | true | `supabase functions deploy admin-impersonate-user` |
| delete-my-account | true | `supabase functions deploy delete-my-account` |
| overpass-proxy | false (public map data) | `supabase functions deploy overpass-proxy --no-verify-jwt` |
| purge-expired-verification-documents | false (cron, secret header) | `supabase functions deploy purge-expired-verification-documents --no-verify-jwt` |

If you later add a `config.toml`, mirror the table:

```toml
[functions.overpass-proxy]
verify_jwt = false
[functions.purge-expired-verification-documents]
verify_jwt = false
```

Shared code lives in `supabase/functions/_shared/` and is bundled automatically (relative imports).

## 4. Schedule the verification-document purge

Run daily with pg_cron + pg_net (store the secret in Vault, do not paste it into SQL history):

```sql
select cron.schedule(
  'purge-expired-verification-documents',
  '17 3 * * *',
  $$
  select net.http_post(
    url := 'https://fdtnbluslkabwsmspbem.supabase.co/functions/v1/purge-expired-verification-documents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 5. Client contracts

- `admin-impersonate-user`: `{ targetUserId, reason }` (reason >= 10 chars) to start, `{ action: 'end', targetUserId }` to end. The **end** call needs the *admin's own* AAL2 session, so the client must restore the admin session before calling it (the impersonated session is the target's, not the admin's).
- `admin-delete-user`: `{ targetUserId, reason }` (reason >= 10 chars). Admin targets are refused: demote first.
- `delete-my-account`: `{ confirm: 'DELETE' }`.
- The minted impersonation session is a real session and cannot be time-limited server-side. The audit trail (`impersonation_started` / `impersonation_ended`) is the control.

## 6. Web headers (vercel.json)

Security headers, including an enforced Content-Security-Policy, are set in `vercel.json`. If you add a new third-party API origin, image host or embed to the client, add its origin to the CSP `connect-src` / `img-src` / `frame-src` or the browser will block it. See `docs/security/csp.md`.

## 7. GitHub

- Enable Dependabot alerts, secret scanning and push protection in the repo settings.
- CodeQL results appear under Security > Code scanning after the first run of `.github/workflows/codeql.yml`.
- Make the `Continuous Integration` and `CodeQL` checks required on `main`.
- TODO: pin GitHub Actions to full commit SHAs.
- Confirm `security@lioris.app` exists, then update `public/.well-known/security.txt` and `SECURITY.md` (the `Expires` date is 2027-09-18; renew it before then).
