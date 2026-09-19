# Launch-day runbook

Consolidated order of operations for taking Lioris live, the smoke tests to run, how to roll back each layer, who communicates what, and who watches which dashboard for the first 72 hours.

Read alongside: `docs/launch/supabase-dashboard-checklist.md` (settings that only the dashboard can change), `docs/security/deploy.md` (SQL, secrets and function deployment), `docs/operations/monitoring.md`, `docs/operations/moderation-runbook.md`, `docs/compliance/incident-response.md`.

**DOMAIN** = step that depends on the pending purchase of `lioris.app`. Everything not marked DOMAIN can be done and verified on the Vercel URL today. Owner-fill values are marked `TODO(owner)`.

Current production surfaces:

| Layer | Where | Notes |
| --- | --- | --- |
| Web app | Vercel project serving `dist` (build: `npx expo export -p web --clear`, config in `vercel.json`) | `https://lioris-final-version.vercel.app`, also `lioris-campus.vercel.app`; **DOMAIN:** `https://lioris.app` |
| Database / Auth / Storage / Realtime / Edge Functions | Supabase project `fdtnbluslkabwsmspbem`, eu-north-1 (Stockholm) | Nine functions listed in `supabase/config.toml` |
| Bot protection | Cloudflare Turnstile widget, Cloudflare TURN for calls | |
| AI | Google Gemini via the `gemini-proxy` function | |
| Email | Custom SMTP provider (must be configured before launch) | **DOMAIN** for the sender domain |

## 0. Roles for launch and the first 72 hours (fill in)

| Role | Person | Backup | Contact |
| --- | --- | --- | --- |
| Launch commander (go/no-go, rollback decision) | TODO(owner) | TODO(owner) | |
| Engineer on call (Vercel, Supabase, functions) | TODO(owner) | TODO(owner) | |
| Trust & Safety lead (moderation queue, Critical reports) | TODO(owner) | TODO(owner) | |
| Communications (announcements, social, campus reps) | TODO(owner) | TODO(owner) | |
| DPO / privacy (`privacy@lioris.app`) | TODO(owner) | TODO(owner) | |
| Support desk (`support@lioris.app`, in-app support tickets) | TODO(owner) | TODO(owner) | |
| Campus reps (per campus, first point of feedback) | TODO(owner) | | |

Rules: one commander at a time; the commander decides rollback. Write every production change and incident into one shared log with a UTC time.

## 1. T-7 to T-1 days: readiness

- [ ] All items in `docs/launch/supabase-dashboard-checklist.md` ticked (Pro plan, custom SMTP, CAPTCHA secret, confirm email ON, backups/PITR).
- [ ] Restore drill completed and timed (dashboard checklist section 8).
- [ ] SQL migrations applied in order: `supabase_email_confirmation_2026.sql`, `supabase_security_hardening_2026.sql`, `supabase_launch_hardening_2026.sql` (see `docs/security/deploy.md`). Any other `supabase_fix_*.sql` already applied are recorded in the change log.
- [ ] Edge function secrets set and all nine functions deployed (`scripts/deploy-supabase.sh --dry-run`, then real run).
- [ ] Push webhook and verification-document purge schedule created (deploy.md section 4).
- [ ] Vercel: production env vars present (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, `APP_ENV=production`); latest deployment is from the intended commit; **Instant Rollback** target known (the previous good deployment).
- [ ] **Vercel Deployment Protection is OFF for Production.** On 2026-09-19 the production URL answered every anonymous request with `302 -> vercel.com/sso-api`, i.e. real users could not open the app. Fix: Vercel > Project > Settings > Deployment Protection > set Vercel Authentication to "Only Preview Deployments" (or disabled) and confirm with `curl -sI https://<prod-url>/login` returning `200`, not `302`. `scripts/verify-production.sh` reports this as a FAIL.
- [ ] Demo/quick-login buttons on the login page ("QUICK 1-CLICK DEMO ACCOUNTS": Student/Staff/Admin/Alumni) are removed or hidden in production builds; an Admin one-click login on a public page must not exist at launch.
- [ ] CI green on the release commit (typecheck, lint, tests, CodeQL, e2e).
- [ ] `scripts/verify-production.sh` passes against the Vercel URL (`SITE_URL=<url> scripts/verify-production.sh`).
- [ ] Legal pages live and correct: `/privacy`, `/terms`, `/community-rules`; owner placeholders in `src/constants/legal.ts` (registered address, NDPC reference) filled or consciously accepted; NDPC registration status confirmed.
- [ ] Moderation: `docs/operations/moderation-runbook.md` contact sheet filled in and reviewed by legal counsel; staff moderators named per campus and trained; tabletop exercise done.
- [ ] Uptime monitor and alerts configured (`docs/operations/monitoring.md` section 2), tested by pausing a check.
- [ ] Admin/staff accounts created, MFA enrolled, and a break-glass admin documented (two admins minimum: the app blocks removal of the last active admin).
- [ ] Support inbox and DPO mailbox exist and are monitored (**DOMAIN** if they use `@lioris.app`; until then use an interim address and update the legal constants).
- [ ] Test accounts for each role (student, alumni, staff, admin) exist for smoke tests; note they are demo accounts and must not exist in production with weak passwords.
- [ ] **DOMAIN:** replace every `https://lioris-final-version.vercel.app` in `public/index.html` (og:url, og:image, twitter:image) with the final domain, then re-share a link in WhatsApp/X to confirm the preview card. Crawlers cache previews, so do this BEFORE the first public share. (`app/+html.tsx` is not used by the single-page export.)
- [ ] **DOMAIN:** domain purchased, DNS at the registrar or Cloudflare, `lioris.app` and `www.lioris.app` added to the Vercel project (redirect www to apex or vice versa), certificate issued, and the redirect/origin lists updated (below).

## 2. Order of operations on launch day (T-0)

Do these in order. Stop at the first failure and decide: fix forward or roll back (section 5).

| Step | Action | Owner | Check |
| --- | --- | --- | --- |
| 1 | Announce a freeze in the team channel: no merges, no dashboard changes except by the commander | Commander | |
| 2 | Verify Supabase project health: Dashboard > Reports, no active incident at status.supabase.com, database CPU/connections normal, plan is Pro | Engineer | |
| 3 | Verify Vercel: latest production deployment is Ready, status.vercel.com clear | Engineer | |
| 4 | Take a manual backup marker: note the current time (PITR restore point) and download a logical dump if allowed | Engineer | Timestamp written in the log |
| 5 | Confirm secrets and functions: `supabase secrets list`, `supabase functions list`; hit `turn-credentials` as a test user | Engineer | |
| 6 | **DOMAIN:** point the domain at Vercel; wait for the certificate; set Supabase **Site URL** and redirect allow-list to `https://lioris.app`; add `https://lioris.app` and `https://www.lioris.app` to `ALLOWED_ORIGINS`, Turnstile hostnames and the SMTP sender; redeploy functions (`supabase functions deploy ...`) so the new origins apply; ensure the password-reset redirect constant in `src/api/auth.ts` matches the live domain | Engineer | Reset email link lands on the live site |
| 7 | Run the smoke tests in section 3 on the production URL | Engineer + Commander | All P0 pass |
| 8 | Run `scripts/verify-production.sh` (with `SITE_URL` set to the live URL) | Engineer | Exit code 0 |
| 9 | Commander go/no-go. If go: publish the announcement (section 6) | Commander + Comms | |
| 10 | Watch the dashboards (section 4) continuously for the first 2 hours | Engineer | |

## 3. Smoke tests

Run on a phone (Android Chrome over mobile data, not office Wi-Fi) **and** a desktop browser. P0 items must pass before announcing.

**P0**

- [ ] `/`, `/login`, `/register`, `/privacy`, `/terms` load in under about 5 seconds on mobile data; no console errors; no CSP violations in the console.
- [ ] Response headers on `/`: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `frame-ancestors 'none'` (script `scripts/verify-production.sh` checks these).
- [ ] Register a new student with a real campus email: Turnstile appears and passes; age and terms checkboxes required; confirmation **code email arrives** (check inbox and spam) within a minute; entering the 6-digit code confirms; onboarding completes; the dashboard loads.
- [ ] Wrong password shows an error (no crash); "Forgot password" sends an email and the link returns to the live site.
- [ ] Log in and out; refresh keeps the session; sign out on one device does not break another.
- [ ] Create a post, comment, like, report a post (a row appears in the moderation queue; staff moderator can see it).
- [ ] Staff/admin login forces the MFA step (TOTP) and reaches the workdesk only after verification.
- [ ] Chat: send and receive a message between two accounts in real time.
- [ ] Legal: privacy policy shows Supabase (Sweden), Vercel and Google, and the cross-border transfer statement.

**P1**

- [ ] Upload an avatar and a resource file (size limit, allowed types); another user cannot access a private verification document.
- [ ] Push notification arrives on a real device (`docs/operations/push-notifications.md` test).
- [ ] Voice/video call between two networks connects (TURN works).
- [ ] AI Copilot answers (Gemini proxy) and respects the rate limit.
- [ ] Dark mode and light mode both readable; keyboard-only Tab through the login page shows a visible focus ring; screen reader (TalkBack/VoiceOver) can complete login.
- [ ] Deleting an account works (`delete-my-account`) and the user cannot log in afterwards; data-export request works.
- [ ] Verification submission (student ID) works and appears in staff/admin review.

**P2**

- [ ] Calendar/events, marketplace, jobs, study groups load with an empty database (empty states) and with data.
- [ ] Offline banner appears when the network drops and clears when it returns.
- [ ] Favicon and page title correct; sharing a link shows a sensible preview.

## 4. Watching the first 72 hours

| Window | Who | Where | What to look for | Cadence |
| --- | --- | --- | --- | --- |
| T+0 to T+2 h | Engineer + Commander together | Supabase Reports (CPU, memory, connections, API and Auth requests, egress), Supabase Logs Explorer (Auth, Postgres, Edge Function logs), Vercel Deployment > Logs and Analytics, the in-app **Admin > System Health > Client errors**, uptime monitor | Auth 4xx/5xx spikes (CAPTCHA and email issues show here first), email delivery failures at the SMTP provider, DB connection saturation, 429s, new client-error fingerprints | Continuous |
| T+2 h to T+24 h | Engineer on call | Same, plus SMTP provider dashboard (bounces/complaints), Google AI Studio quota, Cloudflare TURN usage | Same; error-group growth; support tickets | Every 30-60 min in waking hours; alerts to phone overnight |
| T+24 h to T+72 h | Engineer on call, Trust & Safety lead | Same, plus moderation queue age | Backlog beyond SLA (Critical 1 h, High 24 h, Normal 72 h), repeat reporters, spam waves | Every 2-4 hours; daily 15-minute review meeting |
| Daily | Commander | One-page status: sign-ups, active users, errors, tickets, reports, open incidents | | Once a day |

Thresholds that trigger action (adjust after the first day of real traffic):
- Any Critical moderation report: follow the child-safety / Critical procedure immediately.
- Auth error rate above 5% for 10 minutes: check Turnstile, SMTP, rate limits (section 3 of the dashboard checklist) and Supabase status.
- Confirmation emails not arriving: check SMTP provider first, then templates (`{{ .Token }}`), then the hourly email rate limit.
- Database CPU above 80% for 15 minutes or connections above 80% of the limit: identify the query in Logs Explorer, then consider a compute upgrade.
- Error group with more than 50 occurrences an hour: triage within the hour.

## 5. Rollback plan

Decide fast: for anything that breaks sign-in, data integrity or security, roll back first and investigate second.

### 5.1 Web app (Vercel)

1. Vercel dashboard > Project > Deployments > pick the last known good deployment > **Instant Rollback** (or "Promote to Production"). This is a pointer change; it takes seconds and does not touch data.
2. Confirm the site serves the old build (view-source hash of the entry bundle or the version stamp) and re-run P0 smoke tests.
3. Fix on a branch, redeploy through the normal pipeline. Do not edit `dist` by hand.
4. Environment variable changes require a **redeploy** to take effect; a rollback restores the env vars that deployment was built with.
5. Client-side note: users with the page already open keep the old JS until they reload; keep new server behaviour backward compatible with the previous client for at least one release.

### 5.2 Edge functions

1. Functions are versioned by deploy only in git: redeploy the previous commit's function code (`git checkout <good-sha> -- supabase/functions/<name>` then `supabase functions deploy <name>` with the same `--no-verify-jwt` flag where required), or
2. To switch a function off quickly, deploy a stub that returns 503 (or `supabase functions delete <name>` for the dangerous ones: `delete-my-account`, `admin-delete-user`, `admin-impersonate-user`, `gemini-proxy`).
3. Secrets are changed with `supabase secrets set`; a function picks up new secrets on the next cold start (redeploy to be sure). Keep the previous secret value in the password manager until the change is verified.
4. `gemini-proxy` failing must not break the app: the AI features degrade with an error message; leave it off rather than exposing the key.

### 5.3 SQL migrations

There is no automatic down-migration. Prepare before applying anything:
1. Write the rollback SQL **before** you run the migration (drop the new function/policy, restore the old definition). Keep it next to the migration in the change log.
2. Run migrations inside a transaction (`BEGIN; ... COMMIT;` as the hardening SQL does) so a failure leaves no partial state.
3. Take a PITR restore point (note the timestamp) just before.
4. For a bad migration that already committed: first try a forward fix (small corrective SQL); if data was damaged, restore with PITR to the timestamp taken in step 3, into a **new** project or branch first, then copy back the rows (a full in-place restore loses everything written since).
5. Emergency containment for a broken RLS policy: `REVOKE` table privileges from `anon` and `authenticated` temporarily (this takes the app down but stops leakage), fix, then re-grant.

### 5.4 Configuration and third parties

- Auth settings (dashboard): the previous values are in the sign-off table; revert and retest. A wrong CAPTCHA secret or SMTP password is the most common launch-day break.
- Turnstile: switch the widget to "Non-interactive" or temporarily disable CAPTCHA in Supabase (Authentication > Attack Protection) **and** accept the abuse risk for a short window only; re-enable after the fix.
- DNS (**DOMAIN**): keep TTL low (300 s) for the first week so a wrong record can be reverted quickly; keep the Vercel URL working as a fallback.

### 5.5 Kill switches and containment

- In-app feature flags: Admin > Feature controls can disable a feature (marketplace, messaging, etc.) without a deploy.
- Registrations: turn off "Allow new users to sign up" in the Email provider settings to stop a spam wave (existing users can still log in).
- Account containment: User Directory suspension (with reason) for abusers; the moderation runbook covers escalation.
- Security incident (leaked key, suspected breach): stop, follow `docs/compliance/incident-response.md` (72-hour NDPC clock starts at awareness).

## 6. Communications

| When | Message | Channel | Owner |
| --- | --- | --- | --- |
| T-3 days | "Lioris opens on <date> for <campuses>" with the sign-up link and the school-email requirement | Campus reps, class groups, social | Comms |
| T-0 | Launch announcement: what it is, who can join, how to report problems, link to support | Social, campus groups, in-app announcement (admin dashboard announcements) | Comms |
| Incident, degraded service | Short status: what is affected, since when, workaround, next update time (within 30 minutes) | In-app announcement banner, social, campus reps | Comms + Commander |
| Outage over | "Resolved" with a two-line cause | Same channels | Comms |
| Security or data incident | Follow `incident-response.md` (NDPC within 72 hours; users without undue delay when high risk); legal review before wording | DPO + counsel | DPO |
| Moderation or child-safety incident | No public statement unless counsel or the police advise; brief the owner privately | Trust & Safety lead | |

Standing rules: no speculation about causes, no blaming vendors publicly, one spokesperson, keep a copy of every message sent. Support replies come from `support@lioris.app`; privacy requests from `privacy@lioris.app` are answered within 30 days (`DSR_RESPONSE_DAYS`).

## 7. After 72 hours

- [ ] Retrospective: timeline, what broke, what worked, actions with owners and dates.
- [ ] Review moderation stats against the SLAs and adjust staffing.
- [ ] Reduce the alert noise created by launch-day thresholds; set steady-state thresholds.
- [ ] Review Supabase and Vercel bills against expectations; adjust compute, spend cap and quotas.
- [ ] Decide on the items deferred: Realtime "Allow public access" OFF, image moderation/hash-matching, async route splitting, self-hosting fonts, Nigerian data residency options.
- [ ] Update `docs/` for anything learned; schedule the first quarterly restore drill and the 6-month runbook review.
