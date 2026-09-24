# Supabase dashboard checklist (settings that cannot be set from code)

Project: `fdtnbluslkabwsmspbem` (region **eu-north-1, Stockholm**). Dashboard: https://supabase.com/dashboard/project/fdtnbluslkabwsmspbem

Everything on this page has to be clicked by a person with Owner/Admin rights on the Supabase organisation. Nothing here is applied by the SQL migrations, the edge-function deploy scripts or the Vercel build. Tick each box, write the date and initials, and re-verify after any plan change.

Conventions:
- **DOMAIN** = depends on the pending purchase of `lioris.app` (or whatever final domain is chosen). Do the interim step with the Vercel URL now, then repeat when the domain is live.
- **PRO** = needs the Pro plan or above (see section 15). If you stay on Free for launch, the item is not available and the noted fallback applies.
- Dashboard menu names move between releases. The paths below are current at the time of writing (Sept 2026); if a page has moved, use the dashboard search (`/` or Ctrl+K).

Values the app already assumes (so the dashboard must match):

| Assumption in code | Where |
| --- | --- |
| Email confirmation is ON and the user types a **6-digit code** | `app/(auth)/verify-email.tsx` (`maxLength={6}`), `supabase_email_confirmation_2026.sql` |
| Passwords are at least **8 characters** on the register screen | `app/(auth)/register.tsx` |
| Cloudflare Turnstile token is passed as `captchaToken` on sign-up, sign-in and password reset | `src/api/auth.ts`, `src/components/TurnstileWidget.tsx` |
| Admin/staff enrol TOTP and are moved to AAL2 | `src/auth/mfaPolicy.ts`, `app/(auth)/verify-mfa.tsx` |
| Password reset redirects to `https://lioris.app/(auth)/login` | `src/api/auth.ts` (~line 586) |
| Edge functions only accept the origins in `ALLOWED_ORIGINS` | `docs/security/deploy.md` section 2 |

---

## 1. Auth > Sign In / Providers > Email

Path: **Authentication > Sign In / Providers > Email**

| Setting | Recommended value | Why |
| --- | --- | --- |
| Enable Email provider | ON | Only sign-in method the app uses |
| **Confirm email** | **ON** | The app's `handle_new_user` flow and the "verified campus email" story assume unconfirmed accounts cannot sign in. If OFF, anyone can register with someone else's school address. |
| **Secure email change** | **OFF** | Settings > Security > "Change Email" (`ChangeEmailModal`) sends one 6-digit code to the NEW address. With this ON, Supabase also demands a code from the OLD address, and the old address is exactly what a graduate no longer has (school emails get deactivated), so they could never move off it. The new-inbox code proves ownership of the new address, and the change already needs a live signed-in session, as Change Password does. Apply `supabase_account_email_change_2026.sql` so `profiles.email` and verification follow the change. |
| **Secure password change** | ON (if shown) | Requires a recent login before a password change |
| **Minimum password length** | **12** | Must equal the client rule; the client is advisory only, the server setting is the enforcement |
| **Password requirements** | "Lowercase, uppercase letters, digits and symbols" | Matches the register-screen checklist (`PasswordChecklist`) |
| **Prevent use of leaked passwords** (HaveIBeenPwned check) | ON - **PRO** | Blocks known-breached passwords. Free plan: not available; rely on length and requirements. |
| **Email OTP length** | **6** | The verification screen accepts exactly 6 digits |
| **Email OTP expiration** | 900 to 3600 seconds (choose 1800) | Long enough for slow mobile email delivery on Nigerian networks, short enough to limit guessing |
| Allow new users to sign up | ON | (Set OFF only for an invite-only soft launch) |
| Allow anonymous sign-ins | **OFF** | Not used; anonymous users would satisfy `authenticated` RLS policies |
| Manual linking | OFF | Not used |

## 2. Auth > Attack Protection (CAPTCHA)

Path: **Authentication > Attack Protection**

1. **Enable CAPTCHA protection** = ON. Provider: **Cloudflare Turnstile**.
2. Paste the **Turnstile secret key** for the widget whose **site key** the app uses. The site key is `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (Vercel env) or, if unset, the fallback constant in `src/components/TurnstileWidget.tsx` (`0x4AAAAAAE8rvj6r5JOLLpDJ`). The secret must belong to the **same Turnstile widget** in the Cloudflare dashboard (Turnstile > your widget > Settings), otherwise every sign-up and login fails with "captcha verification process failed".
3. In Cloudflare > Turnstile > widget > **Hostname management**, allow: the current Vercel hostnames (`lioris-final-version.vercel.app`, `lioris-campus.vercel.app`, and any preview domain you test on) and, **DOMAIN**, `lioris.app` and `www.lioris.app`. A missing hostname = widget error 110200.
4. Widget mode: **Managed** (invisible challenge when possible).
5. **Prevent use of leaked passwords** also appears on this page in newer dashboards (see section 1; PRO).
6. Test after enabling: sign up, log in and "Forgot password" all still work from the deployed site; then try the same request with `curl` and no `captchaToken` and confirm it is rejected.

Important ordering: enable CAPTCHA in the dashboard only when the deployed client already sends `captchaToken` (it does as of commit `144b005`). Enabling it earlier breaks all logins from older cached bundles until they refresh.

## 3. Auth > Rate Limits

Path: **Authentication > Rate Limits**

Nigerian campuses and mobile carriers put many students behind **one shared public IP** (CGNAT, campus Wi-Fi). Per-IP limits that look normal elsewhere will lock out whole lecture halls. Keep the per-IP limits generous and rely on CAPTCHA plus the per-user/email limits for abuse control.

| Limit | Default | Recommended for launch | Note |
| --- | --- | --- | --- |
| Rate limit for sending emails (per hour) | 30 (custom SMTP) | **300** at launch, raise with the size of the campus cohort | One email per sign-up, resend and reset. A 2,000-student onboarding day needs more; also check the SMTP provider's own cap. |
| Rate limit for sending SMS | 30 | n/a (no SMS provider) | |
| Rate limit for sign-ins and sign-ups (per 5 min per IP) | 30 | **150** | Shared campus IPs |
| Rate limit for token refreshes (per 5 min per IP) | 150 | 300 | Shared IPs, many open tabs |
| Rate limit for token verifications - OTP/magic link (per 5 min per IP) | 30 | **120** | Email code entry |
| Rate limit for anonymous users | 30 | 0 / not applicable (anonymous sign-ins are OFF) | |
| Rate limit for MFA verifications (per 5 min per IP) | 15 | 30 | Admin/staff TOTP |

Also note: the repo has its own database-side limiters (`consume_rate_limit`) for edge functions; they are separate and are not shown on this page.

## 4. Auth > Sessions and JWT

Path: **Authentication > Sessions** and **Project Settings > JWT Keys / Data API (JWT settings)**

| Setting | Recommended value | Why |
| --- | --- | --- |
| **JWT expiry** | **3600** seconds (1 hour) | Short access tokens limit the damage of a stolen one; the client auto-refreshes. Do not go below 300 or above 3600. |
| **Enable refresh token rotation** | **ON** | Every refresh issues a new refresh token and invalidates the old one |
| **Refresh token reuse interval** | **10** seconds | Tolerates a double refresh from two tabs or a flaky mobile network without logging the user out; anything reused later is treated as theft |
| **Time-box user sessions** | 30 days for students; **PRO** | Bounds how long a device stays signed in. Free: not available. |
| **Inactivity timeout** | 7 days (optionally 24 hours if the owner wants stricter) ; **PRO** | Logs out abandoned devices |
| **Single session per user** | OFF | Students use phone plus laptop; **PRO** anyway |
| JWT signing keys | Use the new asymmetric signing keys if the project offers them; keep the legacy secret private | After any suspected leak, rotate here (see `docs/compliance/incident-response.md`) |

Record: rotating the JWT secret signs every user out. Do it only in an incident.

## 5. Auth > URL Configuration

Path: **Authentication > URL Configuration**

| Field | Value now | Value after domain purchase (**DOMAIN**) |
| --- | --- | --- |
| **Site URL** | `https://lioris-final-version.vercel.app` | `https://lioris.app` |
| **Redirect URLs** (allow-list) | `https://lioris-final-version.vercel.app/**`, `https://lioris-campus.vercel.app/**`, `lioris://**` (native deep links; scheme from `app.config.ts`) | Add `https://lioris.app/**` and `https://www.lioris.app/**`; then remove the Vercel URLs you no longer need (keep one for smoke-testing) |

Rules:
- Never use a wildcard for the host (`https://*.vercel.app`): it would let anyone's Vercel project receive your auth redirects.
- Do **not** leave `http://localhost:*` in the production allow-list (or, if kept for development, add it to a separate dev project).
- `src/api/auth.ts` hard-codes the password-reset redirect `https://lioris.app/(auth)/login`. Until the domain is live, that link lands on a site you do not control or a dead host. **DOMAIN:** either buy the domain before launch, or change that constant to the Vercel URL (engineering) and add it to the allow-list above.
- Also update `ALLOWED_ORIGINS` (edge-function secret, section 11) and the Cloudflare Turnstile hostname list whenever a new origin is added.

## 6. Auth > SMTP and email templates

Path: **Authentication > Emails > SMTP Settings** and **Authentication > Emails > Templates** (older UI: Authentication > Email Templates / Settings > SMTP)

**Custom SMTP is mandatory for launch.** The built-in Supabase mailer is a demo sender: it only delivers to addresses of the project's team members and has a very low hourly cap, so real students will not receive their confirmation codes and sign-up will look broken.

| Item | Value |
| --- | --- |
| Enable custom SMTP | ON |
| Provider | Resend, Postmark, Brevo or AWS SES (pick one with good delivery to Nigerian providers and Gmail/Outlook). Use the provider's SMTP host, port 465/587, and an API-key-based password stored in a password manager. |
| Sender email / name | `no-reply@lioris.app` (**DOMAIN**), name "Lioris". Until the domain exists, use a sender on a domain you own and can verify. The provider will not send from a domain without SPF/DKIM verification. |
| DNS (**DOMAIN**) | After a real monitored mailbox is provisioned, add the provider's SPF, DKIM and a DMARC record using that verified address. Do not publish or configure an unmonitored `lioris.app` mailbox. |
| Minimum interval between emails to the same user | 60 seconds (matches the app's 60 s resend cooldown) |

**Templates** (Authentication > Emails > Templates):

| Template | Required content |
| --- | --- |
| **Confirm sign up** | **Must show the 6-digit code with `{{ .Token }}`.** The app asks the user to type a code (`verify-email.tsx`); a template that only contains `{{ .ConfirmationURL }}` gives users a link the app does not handle, and the flow dead-ends. You may include both. |
| **Reset password** | Either `{{ .Token }}` or `{{ .ConfirmationURL }}` depending on the reset flow currently shipped (`resetPasswordForEmail` with `redirectTo`); test end to end and keep whichever works. |
| **Change email address** | **Must show the 6-digit code with `{{ .Token }}`.** Settings > Security > Change Email asks the user to type the code (`ChangeEmailModal`); a link-only template dead-ends the flow. |
| **Magic link / Invite / Reauthentication** | Not used by the app today; keep the defaults but brand them |
| All templates | Lioris name and a verified monitored support route, plain language, "If you did not request this, ignore this email", no third-party tracking pixels |

After changing SMTP or templates, send yourself a real sign-up and a password reset and check spam placement in Gmail and one Nigerian provider.

## 7. Auth > Multi-Factor (MFA)

Path: **Authentication > Sign In / Providers > Multi-Factor** (may appear as "MFA" under Sessions)

- **TOTP (App Authenticator)**: **Enabled** for enrol and verify. The app enrols staff and admin inline (`verify-mfa.tsx`).
- Phone/SMS MFA: OFF (no SMS provider).
- Max enrolled factors per user: 10 is fine.
- After enabling, sign in as an admin and staff test account and confirm the session reaches AAL2 (`auth.jwt() ->> 'aal' = 'aal2'`). The edge functions `admin-delete-user` and `admin-impersonate-user` reject non-AAL2 admins while `REQUIRE_ADMIN_MFA` is not `false`.
- Store recovery guidance for staff who lose their authenticator (admin removes the factor from the User Directory / dashboard, user re-enrols).

## 8. Database > Backups and point-in-time recovery

Path: **Database > Backups** (and **Project Settings > Add-ons** to purchase PITR)

| Item | Recommended | Note |
| --- | --- | --- |
| Daily backups | Confirm they are listed and recent | Free plan has no downloadable daily backups. Pro keeps 7 days. |
| **Point in Time Recovery (PITR)** | **ON** with 7-day window | **PRO plus paid add-on** (billed hourly; requires at least a Small compute instance). Lets you restore to any second, which matters if a bad migration or admin bulk action deletes data. |
| Physical vs logical | Know that PITR restores replace the whole database in place, so plan downtime |  |

**Restore drill (do it once before launch, then every quarter):**
1. Create a scratch project (or use a branch) and restore the latest backup into it (Database > Backups > Restore, or `pg_dump` to a scratch database).
2. Confirm row counts for `profiles`, `posts`, `chat_messages`, `audit_logs`, and that the RLS policies and functions exist.
3. Confirm Storage objects are **not** included in database backups: buckets need their own export (Storage is not part of PITR). Decide if avatars/resources need periodic copying; verification documents are deleted by design after 30 days.
4. Time the drill and write the result down (RTO). Note the retention promise in `RETENTION.backupRollOffDays` (30 days) in `src/constants/legal.ts`: deleted-account data must roll out of backups within that window, which the backup retention setting must not exceed.

## 9. Project Settings > Data API

Path: **Project Settings > Data API** (older: Settings > API)

| Setting | Recommended | Why |
| --- | --- | --- |
| **Exposed schemas** | `public` only (remove `graphql_public` if GraphQL is unused) | Any exposed schema is reachable by every user with the anon key; keep private objects in non-exposed schemas |
| **Extra search path** | `public, extensions` (default) | |
| **Max rows** | **1000** | Caps runaway `select *`; the client paginates |
| Enable Data API | ON (required) | |
| Automatic RLS on new tables | ON if offered | Prevents forgetting RLS on future tables |
| GraphQL (`pg_graphql` extension) | Disable if unused (Database > Extensions) | Smaller attack surface |

Then run **Database > Advisors > Security** and fix every ERROR/WARN (RLS disabled tables, SECURITY DEFINER views, mutable search_path, exposed auth users).

## 10. Storage settings

Path: **Storage > Settings** (Project Settings > Storage in some builds)

| Setting | Recommended | Why |
| --- | --- | --- |
| **Global file size limit** | **50 MB** (Free plan maximum is 50 MB; Pro allows more, leave at 50 MB unless needed) | The per-bucket limits and MIME allow-lists are set by `supabase_schema.sql` / `supabase_security_hardening_2026.sql`; the global value is a ceiling above them and must not be lower than the largest bucket limit |
| Image transformations | Enabled (Pro) if the app uses render URLs; otherwise leave off | Cost control |
| Public buckets | Only `resources`, `avatars`, `campus-media` per the schema; the verification bucket must be **private** | Open Storage > Buckets and confirm each `public` flag |

Check policies: Storage > Policies must show owner-folder upload rules and staff-only review for verification documents (section 9 of the hardening SQL). Test with a second test user that they cannot list or download someone else's verification document.

## 11. Edge Functions and secrets

Path: **Edge Functions > Secrets** (or `supabase secrets set`; see `docs/security/deploy.md` section 2 for values)

Confirm (names only are shown): `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `REQUIRE_ADMIN_MFA` (`true`), `CRON_SECRET`, `PUSH_WEBHOOK_SECRET`, `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`, optional `EXPO_ACCESS_TOKEN`.

- `ALLOWED_ORIGINS` for launch: `https://lioris-final-version.vercel.app,https://lioris.app,https://www.lioris.app` (drop localhost entries). **DOMAIN:** the `lioris.app` entries only matter once the domain serves the app.
- Confirm all nine functions are deployed and the `verify_jwt` flags match `supabase/config.toml` (Edge Functions page shows each function's JWT setting).
- Set a Google AI Studio **spend/usage cap** for `GEMINI_API_KEY` (outside Supabase) and an alert.
- Cloudflare TURN: set a billing alert in Cloudflare.

## 12. Realtime settings

Path: **Realtime > Settings** (Project Settings > Realtime in some builds)

| Setting | Recommended | Note |
| --- | --- | --- |
| **Allow public access** | **OFF at launch only if every channel is private/authorised. Currently: keep ON, then turn OFF after the check below.** | WebRTC signalling (`webrtc:<room>`) already uses `private: true` with Realtime RLS on `realtime.messages` (hardening SQL section 10). The chat/notification feed in `src/realtime/useRealtimeChannel.ts` uses a **non-private channel** (`app_public_realtime_changes`) with `postgres_changes`; turning public access OFF would break it unless the app is changed to a private channel or that feed moves to authorised broadcast. Test on a staging project first. |
| Enable Realtime on tables | Only the tables the app subscribes to (`chat_messages`, notifications) via Database > Publications (`supabase_realtime`) | RLS still filters `postgres_changes` per user, so verify the policies before relying on them |
| Max concurrent clients / messages per second | Defaults are fine on Pro; check the plan quota (Free: 200 concurrent) | A launch-day spike on Free will disconnect users |
| Database connection pool for Realtime | Default | |

## 13. Network restrictions, SSL and access

Path: **Project Settings > Database > Network Restrictions / SSL Configuration**

- **Enforce SSL on incoming connections**: ON.
- **Network Restrictions**: the database is reached by the API/edge functions through Supabase, not directly by the app. If nobody connects with `psql` from fixed IPs, restrict direct database access to the owner's IP(s) or leave the default and never share the DB password. If the owner has a static IP or VPN, add it and remove `0.0.0.0/0`.
- **Database password**: rotate it once at launch and store in a password manager (Project Settings > Database > Reset database password). It is not used by the app.
- **Organisation members**: Organisation settings > Team: remove ex-collaborators, require **2FA on every Supabase, Vercel, GitHub, Cloudflare and Google account** with access to production. Use the least-privileged role (Developer instead of Owner where possible).
- **Access tokens** (Account > Access Tokens): revoke unused CLI tokens.

## 14. Logs, alerts and leaked secrets

| Item | Path | Recommended |
| --- | --- | --- |
| Log retention | **Logs** (Logs Explorer) | Free: 1 day; Pro: 7 days. Export or drain for longer (the incident-response process needs logs for 72 hours at minimum). |
| **Log drains** | Project Settings > Log Drains | Available on Team plan and above (check current plan matrix). If available, drain to Logflare/Datadog/Axiom/an S3 bucket. Otherwise download logs manually during an incident and rely on `client_errors` + Vercel logs. |
| **Alerts / Reports** | **Reports** (Observability) and **Organisation settings > Billing > Spend cap / usage alerts** | Watch database CPU, memory, disk, connections, egress and auth request rate; enable email notifications for the owner and one backup |
| Advisors | **Database > Advisors** (Security, Performance) | Zero ERROR-level findings before launch; re-run weekly |
| **Leaked secrets check** | GitHub > Settings > Code security > **Secret scanning** and push protection ON; run `git log -p \| grep -E "service_role\|sb_secret\|AIza"` (or `gitleaks`) once | The publishable/anon key in `vercel.json` is public by design; the **service-role key, database password, Gemini key, Turnstile secret, CRON/PUSH secrets and SMTP password must never appear in the repo or the web bundle**. `scripts/verify-production.sh` section 5 scans the live bundle. |
| Uptime monitor | See `docs/operations/monitoring.md` section 2 | Configure before launch |

## 15. Billing and plan

Path: **Organisation settings > Billing**

- **Free projects are paused after 7 days of inactivity** and can be paused/limited under load. A paused database means a dead app. **Use the Pro plan for launch.** Also gives daily backups (7 days), higher quotas, no auto-pause, custom-domain and log/retention options, and unlocks the PRO items above (leaked-password protection, session time-box/inactivity, PITR add-on).
- Turn on the **Spend cap** decision deliberately: with the cap ON, hitting a quota throttles the project instead of billing overage; with it OFF you pay overage but stay up. For launch week, prefer OFF with billing alerts, then review.
- Compute size: start with the default Micro/Small; upsize if the Reports page shows sustained CPU above 70% or connection saturation. PITR needs Small or larger.
- **Region**: this project is in **eu-north-1 (Stockholm)**. It cannot be moved; changing means a new project and migration. Data therefore leaves Nigeria; the privacy policy discloses this (section 5 of `app/privacy.tsx`). Expect ~150-200 ms round trips from Nigeria: do not add chatty per-item requests.
- Set a billing alert for Vercel and Cloudflare (TURN) as well.

## 16. Sign-off table

| # | Area | Owner | Done (date, initials) | Verified by |
| --- | --- | --- | --- | --- |
| 1 | Email provider settings (confirm email, min length 12, OTP 6, secure email change) | | | |
| 2 | Turnstile secret matches site key; hostnames added (**DOMAIN** for lioris.app) | | | |
| 3 | Rate limits set for shared-IP campuses | | | |
| 4 | JWT 3600, refresh rotation ON, reuse interval 10 s; session time-box (PRO) | | | |
| 5 | Site URL and redirect allow-list (**DOMAIN**) | | | |
| 6 | Custom SMTP and `{{ .Token }}` confirmation template (**DOMAIN** for sender domain) | | | |
| 7 | TOTP MFA enabled; admin and staff test accounts reach AAL2 | | | |
| 8 | Backups verified, PITR on (PRO), restore drill done | | | |
| 9 | Data API exposed schemas and max rows; Security Advisor clean | | | |
| 10 | Storage global limit and private verification bucket | | | |
| 11 | Edge function secrets and function list | | | |
| 12 | Realtime public access decision recorded | | | |
| 13 | SSL enforced, network restrictions, DB password rotated, 2FA on every account | | | |
| 14 | Logs/alerts, secret scanning, uptime monitor | | | |
| 15 | Pro plan active, spend cap decision, billing alerts | | | |
