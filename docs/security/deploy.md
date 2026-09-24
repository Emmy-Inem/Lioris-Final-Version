# Security deployment checklist

Everything here is a manual step: nothing is deployed automatically by the repo.

## Order of operations

1. **Apply the SQL migrations** in the Supabase SQL editor, in this order:
   1. `supabase_email_confirmation_2026.sql` (already applied)
   2. `supabase_security_hardening_2026.sql` (already applied)
   3. `supabase_launch_hardening_2026.sql` (new: `push_tokens`, consent RPCs `latest_consent` / `record_consent`, and the other launch-hardening changes)
2. **Set the secrets** (section 2).
3. **Deploy the functions** (section 3): `scripts/deploy-supabase.sh` (or `.ps1` on Windows). Use `--dry-run` first: it checks login / link / which secrets are missing and prints the deploy commands without running them.
4. **Create the push Database Webhook** ([`docs/operations/push-notifications.md`](../operations/push-notifications.md)) and schedule the purge job (section 4).
5. **Verify**: `scripts/verify-production.sh` (read-only; prints PASS/FAIL, exits non-zero on any FAIL).

## 1. Database migrations

The functions call RPCs / tables from these migrations, so apply them **before** deploying:

- `public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean` (service_role only)
- `public.purge_user_data(p_user_id uuid) returns jsonb` (service_role only)
- `public.list_expired_verification_documents(p_days int default 30) returns table(bucket text, path text)` (service_role only)
- `public.push_tokens` (owner-only RLS; read by `send-push` with the service role)
- `public.latest_consent(p_type text default 'terms_and_privacy') returns text` and `public.record_consent(p_version text, p_age_confirmed boolean default true)` (authenticated; used by the in-app re-consent gate, which fails open if they are missing)

`gemini-proxy`, `admin-impersonate-user`, `delete-my-account` and `turn-credentials` fail closed (503) if `consume_rate_limit` is missing.

## 2. Secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>
supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>
supabase secrets set ALLOWED_ORIGINS=https://lioris-final-version.vercel.app,https://lioris.app,https://www.lioris.app
supabase secrets set REQUIRE_ADMIN_MFA=true
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
supabase secrets set PUSH_WEBHOOK_SECRET=$(openssl rand -hex 32)
supabase secrets set TURN_KEY_ID=<Cloudflare TURN key id>
supabase secrets set TURN_KEY_API_TOKEN=<Cloudflare TURN API token>
# optional
supabase secrets set EXPO_ACCESS_TOKEN=<Expo access token>
```

| Secret | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | Server-only. Never in a client `.env`. |
| `GEMINI_API_KEY` | gemini-proxy | Rotate the key that was previously exposed in the web bundle. |
| `ALLOWED_ORIGINS` | all browser-facing functions | Comma separated, exact origins, no trailing slash. Unset = built-in defaults (vercel.app, lioris.app, www.lioris.app, localhost:8081/19006). Drop the localhost entries in production. |
| `REQUIRE_ADMIN_MFA` | admin-delete-user, admin-impersonate-user, admin-manage-institution | `true`: always require an AAL2 (TOTP-verified) session. `false`: never. Unset (default): only for admins who have enrolled a TOTP factor - matching the app policy that 2FA is voluntary. An admin who is asked for it gets `403 mfa_required`; the User Directory then prompts for the 6-digit code and retries. With `true`, an admin who never enrolled cannot use these functions until they enrol (Settings > Security). |
| `CRON_SECRET` | purge-expired-verification-documents | At least 16 characters; compared in constant time. |
| `PUSH_WEBHOOK_SECRET` | send-push | At least 16 characters; sent by the Database Webhook as header `x-webhook-secret`; compared in constant time. Missing = the function refuses everything (500). |
| `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | turn-credentials | Cloudflare Realtime TURN key (below). Missing = `503 not_configured` and calls fall back to STUN only. |
| `EXPO_ACCESS_TOKEN` | send-push | Optional. Only needed if "Enhanced Push Security" is enabled for the Expo project. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by Supabase automatically. To see which secrets are set without revealing values: `supabase secrets list` (names + digests) or section 2 of the deploy script.

### Cloudflare TURN key (reliable calls)

Public STUN alone cannot connect two phones when either is behind symmetric NAT or carrier-grade NAT (very common on Nigerian mobile networks), so calls silently fail. `turn-credentials` mints short-lived (1 hour) Cloudflare TURN credentials for signed-in users; the client (`src/api/webrtc.ts`) caches them and falls back to STUN if anything goes wrong.

1. Cloudflare dashboard (a free account works) -> **Realtime** -> **TURN Server** -> **Create** a TURN key. Name it `lioris-prod`.
2. Copy the **Turn Token ID** (this is `TURN_KEY_ID`) and the **API Token** shown once at creation (this is `TURN_KEY_API_TOKEN`; store it in a password manager, it cannot be shown again).
3. `supabase secrets set TURN_KEY_ID=... TURN_KEY_API_TOKEN=...` then `supabase functions deploy turn-credentials` (JWT verification ON).
4. Check: a signed-in user calling `supabase.functions.invoke('turn-credentials')` gets `{ iceServers: [...] }` containing `turn:` / `turns:` URLs. Anonymous callers get 401; unconfigured projects get `503 { "error": "not_configured" }`.
5. Cloudflare bills TURN relay egress after a free monthly allowance; check current pricing and set a billing alert. Rate limit: 30 credential requests per user per hour.

WebRTC media/ICE traffic is not governed by the page CSP, so `vercel.json` needs no change for TURN.

## 3. Function deployment and `verify_jwt`

`supabase/config.toml` records `project_id` and the per-function `verify_jwt` policy, so a plain `supabase functions deploy <name>` is reproducible. The deploy scripts additionally pass `--no-verify-jwt` explicitly for the public functions (older CLI versions ignore the config value).

| Function | verify_jwt | Command |
| --- | --- | --- |
| gemini-proxy | true | `supabase functions deploy gemini-proxy` |
| admin-delete-user | true | `supabase functions deploy admin-delete-user` |
| admin-impersonate-user | true | `supabase functions deploy admin-impersonate-user` |
| admin-manage-institution | true | `supabase functions deploy admin-manage-institution` |
| delete-my-account | true | `supabase functions deploy delete-my-account` |
| turn-credentials | true | `supabase functions deploy turn-credentials` |
| overpass-proxy | false (public map data) | `supabase functions deploy overpass-proxy --no-verify-jwt` |
| purge-expired-verification-documents | false (cron, secret header) | `supabase functions deploy purge-expired-verification-documents --no-verify-jwt` |
| send-push | false (database webhook, secret header) | `supabase functions deploy send-push --no-verify-jwt` |
| report-client-error | false (errors happen before login) | `supabase functions deploy report-client-error --no-verify-jwt` |

Or deploy everything: `scripts/deploy-supabase.sh` / `scripts\deploy-supabase.ps1` (`--dry-run` / `-DryRun` to preview). The script checks the CLI is logged in and linked to `fdtnbluslkabwsmspbem`, lists required secrets that are still missing, deploys every function directory and finishes with smoke checks (anon key, expected 401 for auth-required functions).

If you later run `supabase init`, keep the `[functions.*]` blocks from `supabase/config.toml` when merging.

Shared code lives in `supabase/functions/_shared/` and is bundled automatically (relative imports).

## 4. Schedules and webhooks

**Verification-document purge** - run daily with pg_cron + pg_net (store the secret in Vault, do not paste it into SQL history):

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

**Push notifications** - Database Webhook on `INSERT` into `public.notifications` -> `send-push` with header `x-webhook-secret`. Step by step, plus Expo/FCM/APNs credentials and a curl test: [`docs/operations/push-notifications.md`](../operations/push-notifications.md).

## 5. Client contracts

- `admin-impersonate-user`: `{ targetUserId, reason }` (reason >= 10 chars) to start, `{ action: 'end', targetUserId }` to end. The **end** call needs the *admin's own* AAL2 session, so the client must restore the admin session before calling it (the impersonated session is the target's, not the admin's).
- `admin-delete-user`: `{ targetUserId, reason }` (reason >= 10 chars). Admin targets are refused: demote first.
- `delete-my-account`: `{ confirm: 'DELETE' }`.
- `turn-credentials`: `POST {}` as a signed-in user -> `{ iceServers, ttl }` or `503 { error: 'not_configured' }`.
- `send-push`: called only by the Database Webhook (`{ type: 'INSERT', table: 'notifications', record }` + `x-webhook-secret`).
- The minted impersonation session is a real session and cannot be time-limited server-side. The audit trail (`impersonation_started` / `impersonation_ended`) is the control.
- Re-consent: when `TERMS_VERSION` in `src/constants/legal.ts` changes, every signed-in user sees a blocking "We updated our Terms & Privacy Policy" prompt (`src/components/ReConsentGate.tsx`) until `record_consent` succeeds. It never blocks on network/RPC errors. Bump the version only when the documents materially change.

## 6. Web headers (vercel.json)

Security headers, including an enforced Content-Security-Policy, are set in `vercel.json`. If you add a new third-party API origin, image host or embed to the client, add its origin to the CSP `connect-src` / `img-src` / `frame-src` or the browser will block it. See `docs/security/csp.md`.

Make sure Vercel **Deployment Protection** (Vercel SSO) is disabled for the Production domain, otherwise the public is redirected to a Vercel login and `scripts/verify-production.sh` cannot inspect the headers or bundle.

## 7. Verify production

```bash
scripts/verify-production.sh                       # default site https://lioris-final-version.vercel.app
SITE_URL=https://lioris.app scripts/verify-production.sh
```

Read-only and credential-free (the Supabase URL and publishable key are public). It checks: anonymous REST reads of sensitive tables return 0 rows or are denied; privileged RPCs are denied to anon; every edge function returns the expected status without a session; the site sends the security headers; and the live JS bundle contains no `generativelanguage.googleapis.com` reference, `AIza...` key or service-role name. Any FAIL exits non-zero.

## 8. GitHub

- Enable Dependabot alerts, secret scanning and push protection in the repo settings.
- CodeQL results appear under Security > Code scanning after the first run of `.github/workflows/codeql.yml`.
- Make the `Continuous Integration` and `CodeQL` checks required on `main`.
- TODO: pin GitHub Actions to full commit SHAs.
- Confirm `security@lioris.app` exists, then update `public/.well-known/security.txt` and `SECURITY.md` (the `Expires` date is 2027-09-18; renew it before then).
