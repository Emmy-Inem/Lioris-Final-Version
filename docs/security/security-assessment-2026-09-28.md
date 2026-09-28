# Lioris security assessment — 2026-09-28

Scope: the codebase at commit `a6c2a48` (branch `claude/pensive-bardeen-pcpp3g` = `main`), covering the Expo/React Native client (`src/`, `app/`), the Supabase Edge Functions (`supabase/functions/`), and the database policies (`supabase_schema.sql`, `supabase/migrations/`, the `supabase_*_2026.sql` hardening scripts).

**Method.** Three angles, as requested: (1) an attacker's walk-through of the exposed surface — auth, edge functions, RLS, deep links, WebView; (2) a source-level security-researcher review of the same code; (3) a check against published, dated sources — `npm audit`, and web searches for CVEs against the exact installed versions. Nothing below is fabricated: every claim either quotes a file/line in this repo, or cites the search result it came from. Where I could not verify something from inside this container (e.g., Supabase project dashboard settings, production headers, whether a WAF/rate limiter sits in front of Vercel), I say so explicitly rather than guess — see "Could not verify" at the end.

**Overall read.** This is an unusually well-hardened codebase for its stage. There's a real, dated incident history (`supabase_launch_hardening_2026.md`, `supabase_security_hardening_2026.md`) showing an admin-email auto-elevation backdoor, a public-storage-bucket leak, and a profile self-insert privilege escalation were all found and fixed, with the team's own test harness reproducing each one before the fix. `npm audit` reports zero known vulnerabilities across 761 packages. No SQL injection, `eval`, `dangerouslySetInnerHTML`, or hardcoded secrets were found anywhere in `src/` or `supabase/functions/`. The remaining risk is concentrated in a small number of already-identified, not-yet-shipped RLS gaps — not in the classic OWASP injection/secrets categories.

> **Update — 2026-09-28, same day.** Findings 1.1, 1.2 and 1.3 below have been fixed and shipped: `supabase/migrations/20260929000000_close_open_security_findings.sql` plus matching client changes in `src/auth/AuthContext.tsx`, `src/api/systemHealth.ts`, `src/api/supportTickets.ts`, and `src/components/admin/AdminUniversalSearchModal.tsx`. The fix was verified two ways, not just by static review: (a) `npm run test:sql` — the project's own PGlite-backed migration test harness (`tools/sql-harness/`) — runs the new migration against a real Postgres 17 instance with 10 new assertions covering every finding (peer email/matric now denied, self/admin RPCs still work, notification type spoofing denied, forum membership anon read denied), alongside all 150 pre-existing regression checks, **160/160 passing**; (b) `tsc --noEmit`, `eslint`, and the unit test suite (126/126) all pass clean on the updated client code. Each finding below is marked **FIXED** with what changed; the original write-up is left intact underneath for the record.

---

## 1. Findings — ranked by severity

### 1.1 HIGH — Any authenticated user can read classmates' email address and matriculation/student ID number — **FIXED 2026-09-28**

**Fix:** `profiles` no longer has a table-level `SELECT` grant for `authenticated`/`anon`; only a safe column list is granted back (excludes `email`, `student_id_number`, `push_token`, `suspension_reason`, `last_active_at`, `last_login_at`). Three new `SECURITY DEFINER` RPCs cover the legitimate cases that need the excluded columns: `get_my_profile()` (caller's own full row), `admin_get_profile_contacts(uuid[])` and `admin_search_profiles(text, int)` (admin/staff-gated). Every client call site that touched the removed columns was updated: `src/api/supportTickets.ts` (4 functions), `src/components/admin/AdminUniversalSearchModal.tsx`, and the three self-profile `select('*')` calls in `src/auth/AuthContext.tsx` (narrowed to the columns they actually use — `select('*')` errors outright once a role loses any column's privilege, so these had to be explicit regardless of sensitivity). See `supabase/migrations/20260929000000_close_open_security_findings.sql` section 1.

**Where:** `supabase_schema.sql:586`
```sql
CREATE POLICY "Profiles viewable by same campus or global or self or admin" ON profiles FOR SELECT TO authenticated USING (
    auth.uid() = id OR
    campus_code = 'GLOBAL' OR
    campus_code = public.auth_profile_campus() OR
    public.auth_profile_role() IN ('admin', 'staff')
);
```
RLS is row-level, not column-level. This policy grants `SELECT *` on every profile in the same campus, which includes `email`, `student_id_number`, `trust_score`, `last_active_at`, `is_suspended`, and `onboarding_complete` — none of which need to be visible to a peer.

**Attacker's view:** a student's own Supabase session (`anon` key + their own JWT, which every signed-in user already holds) can run `supabase.from('profiles').select('*').eq('campus_code', 'MY_CAMPUS')` and get back every classmate's email and matric number. No admin access needed.

**Status:** this is not a new finding — the team already found and documented it themselves at `supabase_launch_hardening_2026.md:118-132`, labeled "6b (reported, NOT changed)," with a proposed fix already designed (replace `select('*')` in `src/auth/AuthContext.tsx`, `src/components/admin/UserProfilesTab.tsx`, and the support-ticket embed with explicit column lists + a `get_my_profile()` / `admin_list_profiles()` RPC pair, then `REVOKE`/column-`GRANT` on `profiles`). I re-verified the policy text is still exactly as documented and the client still does `select('*')` against `profiles` in `src/auth/AuthContext.tsx` (3 call sites). **This is the single biggest open item and the team's own doc calls it that too.** I did not implement the fix myself since it's a coordinated client+DB migration the doc says should ship together, and touching it without your review risks breaking the app if I get a call site wrong — happy to do it as a follow-up if you want.

### 1.2 MEDIUM — Any user can push an in-app "notification" to any other user with arbitrary free text and a deep link — **FIXED 2026-09-28**

**Fix:** rebuilt the `notifications` INSERT policy's non-admin branch to require `type IN ('message', 'system')` — the only two types real peer-to-peer flows (`connections.ts`) actually use; `'system_announcement'`, `'announcement'` and `'moderation'` (and anything else, e.g. an undeclared `'emergency'`) are now admin/staff-only. Also added `title`/`body` length caps (150/1000 chars) and requires `action_url` to be an in-app absolute path (`/...`, not `//...`) when present, mirroring what `send-push`'s `safeDeepLink()` already enforced at delivery time. Admin/staff sending is entirely unaffected. See `supabase/migrations/20260929000000_close_open_security_findings.sql` section 2.

**Where:** `supabase_schema.sql:874`
```sql
CREATE POLICY "Admins or authentic senders can create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')) OR
    ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid()))
);
```
Any non-suspended authenticated user can insert a `notifications` row naming themselves as `sender_id` and any other user as `recipient_id`, with free-text `title`, `body`, and `action_url`. The push-delivery function (`send-push`) validates `action_url` is an in-app path only (`supabase/functions/send-push/index.ts:89-96`, good), but the in-app notification feed itself will render the free text, so this is an in-app phishing/social-engineering vector ("Your account will be suspended, tap here") — throttled only by a 1000-inserts/hour-per-sender cap, not blocked. Documented by the team as "6d (noted, not changed)" at `supabase_launch_hardening_2026.md:136-139`, with the durable fix (move notification creation into `SECURITY DEFINER` triggers instead of direct client insert) already scoped but not shipped.

### 1.3 LOW/MEDIUM — Forum community membership is readable by unauthenticated (`anon`) requests — **FIXED 2026-09-28**

**Fix:** dropped the "Memberships are visible to anon" RLS policy. The member-count UI already gets its numbers from `get_forum_communities_stats()` (a `SECURITY DEFINER` RPC already granted to `anon`), so nothing user-facing changes — logged-out visitors still see accurate counts, they just can no longer pull the raw `(community_id, user_id)` rows. Authenticated access is unchanged (see the original note below on why that's lower-severity and out of scope for this pass). See `supabase/migrations/20260929000000_close_open_security_findings.sql` section 3.

**Where:** `supabase/migrations/20260926220000_forum_community_memberships.sql:22-24`
```sql
CREATE POLICY "Memberships are visible to anon" ON public.forum_community_members
    FOR SELECT TO anon USING (true);
```
This exposes the full `(community_id, user_id)` membership table to anyone, logged in or not — not just a member count. If any discussion space is about a sensitive topic (mental health, LGBTQ+, politics, etc.), this lets an outsider enumerate exactly which user IDs belong to it. If the product intent is "show a member count publicly," that's better served by a `SECURITY DEFINER` RPC that returns only a count, not raw membership rows.

### 1.4 LOW — Admin MFA is opt-in, but admin actions include real-session impersonation

`supabase/functions/_shared/auth.ts:96-135` (`requireAdmin`): when `REQUIRE_ADMIN_MFA` is unset (the default), an admin who has never enrolled TOTP is **not** required to prove a second factor to use `admin-impersonate-user`, `admin-delete-user`, `admin-manage-institution`, etc. — password auth alone is enough. This is a deliberate, documented tradeoff (the comment explains the login flow never steps a session up to AAL2, so a hard requirement would lock out every unenrolled admin), and it's mitigated by rate limiting + an append-only audit log written *before* any token is issued (`admin-impersonate-user/index.ts:178-198`, fails closed if the audit write fails). Still, given `admin-impersonate-user` mints a **real, indefinite-until-OTP-expiry session for another user** (documented limitation at `admin-impersonate-user/index.ts:29-34`), I'd treat mandatory MFA enrollment for the `admin` role as a policy decision worth making explicitly rather than leaving opt-in — a compromised admin password with no 2FA is a compromised "become anyone" tool.

### 1.5 LOW — Web build stores the Supabase session in `localStorage`

**Where:** `src/api/supabase.ts:13-57` (`ExpoSecureStoreAdapter`), `src/auth/tokenStorage.ts:16-42`. Native builds use `expo-secure-store` (Keychain/Keystore) correctly. On web, both files fall back to plain `localStorage`, and `tokenStorage.ts` says so in its own comment ("do not treat the web fallback as safe for real tokens in production"). This is a real XSS-to-session-theft surface for the web/PWA build specifically — if any XSS bug is ever introduced, an attacker's script can read the access/refresh token straight out of `localStorage`.
**Mitigating control already in place:** the deployed CSP (`vercel.json`, documented in `docs/security/csp.md`) sets `script-src 'self'` with **no** `unsafe-inline`/`unsafe-eval`, plus `object-src 'none'` and `frame-ancestors 'none'`. That's a strong barrier — a classic reflected/DOM XSS via inline `<script>` or `eval` is blocked by the browser regardless of the bug. The residual risk is a compromised or vulnerable *npm dependency* that ships first-party-looking JS (a supply-chain XSS), which CSP `script-src 'self'` does not stop. I'm not recommending a change here, since browser `HttpOnly` cookie storage isn't available to a client-side Supabase SDK without a server component you don't currently have — just flagging that this is the accepted risk and why it's currently reasonable.

### 1.6 INFORMATIONAL — Unrestricted anonymous writes on two low-sensitivity tables

- `waitlist_entries`: `FOR INSERT TO anon, authenticated WITH CHECK (true)` (`supabase_schema.sql:1048`) — anyone can submit unlimited waitlist signups; no DB-level rate limit (only whatever CAPTCHA/edge throttling exists in front of it, which I couldn't verify from the repo alone — see "Could not verify").
- `analytics_events`: `FOR INSERT TO authenticated, anon WITH CHECK (true)` (`supabase_seed_admin_analytics_and_activity.sql:52`) — same pattern, not in the documented 15-table rate-limit list (`supabase_launch_hardening_2026.md:77`).

Neither exposes data; both are write-amplification/spam nuisances, not confidentiality or integrity risks. Worth a DB-level rate limit trigger if abuse becomes a problem, not urgent otherwise.

### 1.7 Everything I specifically tried to break and could not

As the "attacker" pass, I specifically went looking for the following and found them already closed:
- **Client-bundle admin backdoor:** removed — `src/api/auth.ts:196-206` has a comment explicitly describing and disclaiming a *previous* backdoor (`admin@ui.edu.ng` self-elevation with an offline fake-session fallback). Confirmed no equivalent exists today; role is read from the server-verified `profiles` row only, never `user_metadata` (which a client can self-write via `updateUser()`).
- **Role/privilege spoofing via client:** `RoleGate` (`src/auth/RoleGate.tsx`) is explicitly commented as UX-only; every admin write path I checked (`admin-*` edge functions) re-verifies role server-side via `requireAdmin()`, which queries `profiles.role` itself rather than trusting the JWT or any client claim.
- **WebView open-redirect / arbitrary origin load:** the one WebView (`src/components/AndroidCampusMap.android.tsx`) is locked to `openstreetmap.org` via both `originWhitelist` and a regex-checked `onShouldStartLoadWithRequest`.
- **SSRF via the Overpass/Gemini/TURN proxies:** all three edge functions build their upstream requests from validated, non-attacker-controlled input (numeric lat/lon range-checked; fixed model allow-list; no user-supplied URL is ever fetched server-side).
- **SQL injection:** no raw string-built SQL anywhere in `src/`; all 60+ `.rpc()` calls use parameterized object arguments.
- **Self-registering as admin:** blocked both client-side (`register()` in `src/api/auth.ts:317-318` hardcodes the assigned role to `student`/`alumni` only) and DB-side (`trg_profiles_guard_self_insert`, per `supabase_launch_hardening_2026.md` section 6a, with the team's test harness reproducing the old exploit before the fix).
- **Secrets in the client bundle:** none. The Supabase key present in `.env.example` and hardcoded as a fallback in `src/api/supabase.ts:59-61` is the new-format `sb_publishable_...` anon key, which is *designed* to be public (Supabase's security boundary is RLS, not key secrecy). Every genuinely sensitive key (Gemini, Cloudflare TURN, push webhook secret, cron secret, service-role key) lives only in `Deno.env` inside edge functions and is never shipped to the client — the `gemini-proxy` function's own header comment (lines 1-8) documents this was deliberately moved server-side for exactly this reason.

---

## 2. Dependency / CVE check (sourced)

`npm audit --json` against the full lockfile (761 packages: 678 prod, 73 dev, 11 optional): **0 vulnerabilities at any severity.**

Installed versions of the security-relevant packages, checked against current advisories:

| Package | Installed | Relevant advisory found | Applicable here? |
| --- | --- | --- | --- |
| `@supabase/auth-js` (bundled in `@supabase/supabase-js`) | 2.112.3 | [CVE-2025-48370](https://github.com/advisories/GHSA-8r88-6cj9-9fh5) — insecure path routing from malformed user input, fixed in 2.69.1/2.70.0 | **No** — installed version is far newer than the fixed version. |
| Supabase Auth (GoTrue, the **server**, not an npm package) | not controlled by this repo | [CVE-2026-31813](https://www.sentinelone.com/vulnerability-database/cve-2026-31813/) / [GHSA-v36f-qvww-8w8m](https://github.com/supabase/auth/security/advisories/GHSA-v36f-qvww-8w8m) — OIDC issuer-validation bypass letting an attacker mint sessions for arbitrary users, but **only when Apple or Azure sign-in providers are enabled**, fixed in Auth 2.185.0 | Grepped the whole client for `signInWithIdToken`/`signInWithOAuth`/Apple/Azure — **not used anywhere in this app.** Not exploitable via this client. Worth a 30-second check in the Supabase Dashboard → Authentication → Providers that Apple/Azure are in fact off, and that your project's Auth service is on a current version (Supabase-hosted projects auto-upgrade, but I can't see your dashboard from here). |
| `react-native-webview` | 13.16.1 | Searched specifically; no CVE found against this package/version. The only 2025/2026 React Native CVE I found (CVE-2025-11953) is in `@react-native-community/cli`'s dev-only Metro server (`/open-url` command injection, CISA KEV-listed), which this app doesn't run in production and doesn't depend on directly. | N/A to production; if you ever run `npx react-native` dev tooling, bind Metro to `--host 127.0.0.1`. |
| `expo-updates` | 57.0.23 | No CVE found. Code-signing for OTA updates is a configuration step (EAS private key), not a code fix — I could not verify from this repo whether EAS code signing is turned on for your project (that lives in the EAS dashboard/`eas.json` secrets, not in tracked files). | Recommend confirming in EAS dashboard; if code signing isn't on, a compromised EAS account could push a malicious OTA update to every install. |
| React Server Components CVEs (CVE-2025-55182, CVE-2026-23864/23869) | N/A | These are Next.js/RSC-specific; this app is Expo Router (client-rendered), not Next.js RSC. | Not applicable. |

Sources: [SentinelOne CVE-2026-31813](https://www.sentinelone.com/vulnerability-database/cve-2026-31813/), [Supabase Auth GHSA-v36f-qvww-8w8m](https://github.com/supabase/auth/security/advisories/GHSA-v36f-qvww-8w8m), [GitHub Advisory GHSA-8r88-6cj9-9fh5 (CVE-2025-48370)](https://github.com/advisories/GHSA-8r88-6cj9-9fh5), [JFrog CVE-2025-11953 writeup](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/), [Vibe App Scanner — Supabase CVE-2025-48757 patterns](https://vibeappscanner.com/issues/supabase) (the general "RLS off, service_role in client bundle" pattern this describes does **not** apply here — RLS is on for every table, and no service_role key appears client-side).

---

## 3. Standards checklist (OWASP-oriented)

Mapped loosely to OWASP ASVS / Mobile Top 10 categories, since this is a mobile+web app backed by a BaaS rather than a classic server API.

| Category | Status | Evidence |
| --- | --- | --- |
| Broken access control | **Partial — see 1.1, 1.2** | Row-level RLS is present everywhere (every `CREATE TABLE` has a matching `ENABLE ROW LEVEL SECURITY`), but two column/insert-scope gaps remain, both already self-documented. |
| Cryptographic storage | Pass (native), **accepted-risk gap (web)** | `expo-secure-store` on iOS/Android; `localStorage` on web, mitigated by strict CSP — see 1.5. |
| Injection | Pass | No raw SQL, no `eval`, all RPCs parameterized. |
| Insecure design | Pass | Impersonation is server-brokered + audited, not client-fabricated; role source is server-verified only. |
| Security misconfiguration | Pass | CSP, HSTS, X-Frame-Options, X-Content-Type-Options all set in `vercel.json`; CORS on edge functions is an explicit allow-list, not `*`. |
| Vulnerable/outdated components | Pass | `npm audit` clean; manually checked the security-relevant packages above against current CVE databases. |
| Identification & authentication | Pass, with a policy note | Real Supabase Auth, MFA (TOTP) available and used to gate admin impersonation *when enrolled* — see 1.4 for the opt-in gap. Client-side login-rate-limiting is `localStorage`-based and trivially bypassable by clearing storage, but is backed by server-side Turnstile CAPTCHA + Supabase's own GoTrue rate limits, so this is defense-in-depth rather than the only control. |
| Sensitive data exposure / logging | Pass | Grepped all `console.*` calls near auth/token/password/OTP keywords in `src/` and every edge function; nothing logs a raw credential. `report-client-error` actively scrubs JWTs, bearer tokens, emails, and query strings before storage (`supabase/functions/report-client-error/index.ts:55-63`). |
| SSRF | Pass | Checked all three outbound-proxy edge functions (Gemini, Overpass, TURN) — none forward an attacker-controlled URL. |
| Security headers | Pass | See CSP table above; documented rationale per directive in `docs/security/csp.md`. |

---

## 4. Recommended priority order

1. ~~Ship the `profiles` column-exposure fix (1.1)~~ — **done 2026-09-28**.
2. ~~Decide on `notifications` insert scoping (1.2)~~ — **done 2026-09-28**.
3. ~~Tighten `forum_community_members` anon SELECT (1.3)~~ — **done 2026-09-28**.
4. **Decide explicitly whether admin MFA should be mandatory, not opt-in** (1.4) — this is a product/ops policy call, not a code bug; flagging so it's a deliberate choice rather than a default. Not implemented as part of the fixes above since it's a policy decision (making it mandatory today would lock out any admin who hasn't enrolled TOTP yet — see 1.4 for why).
5. Everything else above is either already mitigated (1.5), informational (1.6), or confirms things are already solid (1.7, §2, §3) — no action required unless you want the EAS OTA code-signing and Apple/Azure-provider settings confirmed, which I can't see from inside this container.

**Still to decide:** item 4 needs a human call (do you want to force MFA enrollment on the `admin` role, and if so, what's the rollout plan for admins who haven't enrolled yet?). Everything else in this report is either fixed or was already fine.

## 5. Could not verify from this container

- Supabase project dashboard settings: Apple/Azure OAuth provider on/off, current GoTrue (Auth service) version, whether Turnstile/CAPTCHA and GoTrue's own server-side rate limits are actually configured as tightly as the client code assumes.
- EAS Update code-signing (private key generated and enforced) for OTA updates.
- Production HTTP response headers as actually served by Vercel (I read the *configured* `vercel.json`, not a live response).
- Whether any WAF/rate-limiter sits in front of the Supabase project or Vercel deployment beyond what's in this repo.
- Anything about the native mobile builds' code-signing/store-listing security (out of this repo's scope; I only reviewed source).

If you want, I can act on items 1–3 above as follow-up changes (the migrations + matching client updates), or do a live dynamic test against a staging URL if you give me one and confirm I'm authorized to test it — I did not attempt any live network attack against a running deployment for this assessment, only static source review, since I have no staging credentials or explicit authorization scope beyond "assess our app."
