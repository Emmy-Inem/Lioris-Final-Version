# Monitoring and alerting

Lioris has no third-party monitoring vendor. Client-side crashes go to a small self-hosted sink (a Supabase edge function plus one table), and availability is watched by an external uptime monitor plus Supabase and Vercel built-in tooling. This page describes what exists, how to look at it, what to set up by hand, and what to do when something breaks.

## 1. Client error reporting (built in)

### How errors flow

```
browser / React Native app
  src/monitoring/errorReporter.ts
    window "error" + "unhandledrejection" (web), ErrorUtils global handler (native)
    ErrorBoundary.componentDidCatch and RouteErrorBoundary (render errors)
        |  scrub -> fingerprint -> dedupe -> cap -> fetch (fire and forget)
        v
POST {SUPABASE_URL}/functions/v1/report-client-error      (verify_jwt = false)
  supabase/functions/report-client-error/index.ts
    16 KB body cap, field validation and truncation, second scrub
    rate limit: 30 reports / 10 min per IP, 60 reports / hour per verified user
        v
public.client_errors  (service_role writes, admins read)
        v
Admin > System Health > "Client errors"
```

What the client does before sending:

- **Fingerprint**: hash of the normalised message plus the first stack frame, so one bug is one group across users and releases.
- **Client-side dedupe**: the same fingerprint is sent at most once per 60 seconds, and a session sends at most 20 reports, so an error loop cannot flood the sink.
- **Scrubbing**: emails, `Bearer` tokens, JWT-looking strings, Supabase keys and URL query strings/fragments are removed from the message, stack and context. Only the route **path** is sent, never the query string.
- **Size limits**: message 1,000 chars, stack 6,000, context 2,000.
- **Attached**: release (`lioris@<expo version>`), route path, a random per-launch session id, the platform, and the user's access token when signed in. The server validates that token and stores the **verified** user id; a client-supplied user id is never trusted.
- **Never blocks the app**: reporting never throws and is skipped in `__DEV__` (a `console.warn` only).

What the server does:

- Accepts `POST` only, with the shared CORS allow-list (`ALLOWED_ORIGINS`).
- If a row with the same fingerprint was seen in the last hour, it increments `occurrences` and updates `last_seen_at` instead of inserting a new row.
- Fails **open**: if the rate limiter, service credentials or database are unavailable the report is dropped and the app still gets a success-class status (202). Monitoring must not break the product. Rate-limited callers receive 429 (the client ignores it).

### Deploying it

The function and table are not live until both steps are done:

1. Apply the migration that creates `public.client_errors` (in `supabase_launch_hardening_2026.sql`).
2. Deploy the function (anon key must be accepted because errors happen before login):

   ```
   supabase functions deploy report-client-error --no-verify-jwt
   ```

   It uses the standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets. The CSP needs no change because `connect-src` already allows the Supabase origin.

### Viewing errors

Sign in as an admin, open **Admin > System Health** and scroll to **Client errors**. It shows the last 50 reports grouped by fingerprint: message, occurrence count, last seen, route path and release. Tap a group to expand the stack trace. If the table is missing or unreadable the card says reporting is not available yet instead of failing.

For deeper queries use the Supabase SQL editor, for example:

```sql
select fingerprint, left(message, 120) as message, sum(occurrences) as hits,
       max(last_seen_at) as last_seen, max(release) as release
from public.client_errors
where last_seen_at > now() - interval '24 hours'
group by fingerprint, left(message, 120)
order by hits desc
limit 20;
```

Retention: `client_errors` grows with distinct errors. Delete old rows periodically (for example `delete from public.client_errors where last_seen_at < now() - interval '90 days';` in a scheduled job) and keep the retention period consistent with `docs/compliance/retention-and-deletion.md`. Rows contain a user id and user agent, so they are personal data.

### Swapping the sink for Sentry later

The whole app talks to three functions exported from `src/monitoring/errorReporter.ts`: `reportError`, `reportMessage` and `installGlobalErrorHandlers`. To move to Sentry:

1. Install `@sentry/react-native` (it also covers Expo web) and call `Sentry.init` in `src/monitoring/errorReporter.ts` with the DSN from an `EXPO_PUBLIC_SENTRY_DSN` variable.
2. Replace the body of `send()` with `Sentry.captureException` / `captureMessage`, keep the scrubbing as a `beforeSend` hook, and pass the user id via `Sentry.setUser({ id })` (no email).
3. Add the Sentry ingest host to `connect-src` in `vercel.json` and update `docs/security/csp.md`.
4. Optionally keep the edge function running in parallel for a release or two, then retire it and the System Health card.

Callers (`ErrorBoundary`, any future `reportError` call) do not change.

## 2. Uptime monitoring (set up by hand)

Use one external monitor so that an outage of the whole platform, including Vercel and Supabase, is noticed even when nobody is using the app. UptimeRobot (free tier, 5-minute checks) or BetterStack are both fine. Create these checks:

| Check | Type | URL / target | Alert when |
| --- | --- | --- | --- |
| Site up | HTTPS keyword | `https://lioris.app/login` (or the current production URL) | Not 200, or body does not contain the app shell (`<div id="root">`) |
| Supabase REST health | HTTPS | `https://fdtnbluslkabwsmspbem.supabase.co/rest/v1/` with header `apikey: <publishable key>` | Not 200 within 10 s |
| Supabase Auth health | HTTPS | `https://fdtnbluslkabwsmspbem.supabase.co/auth/v1/health` with header `apikey: <publishable key>` | Not 200 |
| Synthetic login page | Browser check (BetterStack) or a scheduled Playwright run | Load `/login`, assert the "Secure Login" button and password field render, no "Something went wrong" text | Assertion fails twice in a row |
| TLS certificate | Certificate expiry | The site hostname | Fewer than 14 days left |

The publishable (anon) key is public by design and is already shipped in the web bundle, so it is safe to put in the monitor. Never put the service-role key in an external tool.

The login assertions in `e2e/smoke.spec.ts` can be copied into a scheduled GitHub Actions workflow (or a BetterStack browser check) as the synthetic check.

Send alerts to at least two channels (email plus SMS or a chat app) and to more than one person.

## 3. Supabase logs and alerts

1. **Logs**: Dashboard > Logs. The useful sources are *API Edge Logs* (HTTP status per request), *Postgres Logs*, *Auth Logs* and *Edge Function Logs* (per function, including `report-client-error` and the admin functions).
2. **Saved queries**: in the Logs Explorer save queries for `status_code >= 500`, failed sign-ins (Auth logs), and edge function errors, so on-call can open them in one click.
3. **Usage and health**: Dashboard > Reports shows API requests, database size/CPU/memory, and Auth activity. Check it weekly.
4. **Alerts**: Dashboard > Project Settings > Billing / Usage lets you set spend caps and usage notifications. Where your plan supports it, add email alerts for high CPU/memory or disk usage. (Supabase alert options depend on plan; if unavailable, cover the same conditions with the uptime monitor and the SQL checks below.)
5. **Auth security**: enable email notifications for sign-ins from new devices only if wanted; watch Auth logs for spikes of `invalid_credentials` (credential stuffing) and rate-limit responses.
6. **Log retention**: Supabase keeps logs for a limited time by plan. During an incident export the relevant logs immediately (see `docs/compliance/incident-response.md`, step 3).

A quick SQL health probe to run on-call:

```sql
-- errors in the last hour, grouped
select fingerprint, left(message, 100), sum(occurrences)
from public.client_errors
where last_seen_at > now() - interval '1 hour'
group by 1, 2 order by 3 desc limit 10;
```

## 4. Vercel deployment notifications

1. Vercel > Project > Settings > Notifications: enable **Deployment Failed** and **Deployment Promoted/Ready to Production** emails, and the Slack or Discord integration if the team uses one.
2. Vercel > Project > Observability (or Analytics): turn on Web Vitals / Speed Insights if wanted. Review failed runtime requests there.
3. Each production deploy should be followed by a 2-minute check: open `/login`, sign in with a test account, and confirm no new group appeared under **Client errors**.
4. Rollback: Vercel > Deployments > pick the last good production deployment > **Promote to Production** (instant). Database changes are not rolled back by this; use the rollback plan written in the PR.

## 5. On-call and incident checklist

Use this for any outage or suspected security event. For anything involving personal data (leaked key, exposed bucket, cross-user data access, stolen admin session) go straight to **`docs/compliance/incident-response.md`**: that document owns severity levels, the 72-hour NDPC clock, containment and notification.

1. **Acknowledge** the alert and note the time (this becomes T0 if personal data is involved).
2. **Scope**: is it the site (Vercel), the API/database (Supabase), a single edge function, or a client bug? Check, in order: uptime monitor, Vercel deployments, Supabase status page and logs, **System Health** (latency, row monitors, Client errors).
3. **Classify** severity using `docs/compliance/incident-response.md`. If personal data may be involved, open a breach-register entry now.
4. **Mitigate first, diagnose second**:
   - bad deploy: promote the previous Vercel deployment;
   - bad migration: run the rollback SQL from the PR;
   - abusive traffic: tighten the rate-limit constants in the affected edge function, or disable the feature flag in Admin > Feature Controls;
   - leaked secret: rotate it (Supabase keys, Turnstile secret, Gemini key) and redeploy the affected functions.
5. **Preserve evidence** (Supabase logs, Vercel logs, `audit_logs`) before rotating or deleting anything.
6. **Communicate**: post an in-app announcement for user-visible downtime; notify the DPO/Incident Lead for any personal-data impact.
7. **Verify recovery**: uptime checks green, login works, no new error groups, latency normal in System Health.
8. **Follow up**: write a short post-mortem (what happened, detection time, fix time, prevention) and add a regression test to `e2e/` when the failure was reproducible in the browser.
