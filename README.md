# Lioris — Mobile App (Expo / React Native)

Cross-platform (iOS + Android) client for the Lioris campus networking
platform, scaffolded from the PRD. Built with Expo Router, React Query,
and a real-time layer with graceful polling fallback.

## Visual rebrand in progress (UniHub-inspired teal theme)

Per explicit request, Lioris is being re-skinned to match a different
reference app's ("UniHub," a Behance case study) deep-teal look, while
keeping Lioris's own information architecture and features. **This
intentionally supersedes** the navy-blue color correction described in
the "Design system source" section below — that correction is still
historically accurate (navy really was the right match for the
original Kotlin reference app), it's just no longer the active
target. Progress so far:

- **Color tokens** (`src/theme/colors.ts`): `brandPrimary`/`tabActive`/
  `sectionLabel`/`pastelPrimaryBg`/the glow-blob colors now pull from
  new `teal*` palette tokens instead of `navy*`. Because every button,
  active tab, "brand"-toned text, and glow background already reads
  from these theme tokens rather than hardcoded colors, this one
  change re-colors the *entire app* automatically — no per-screen work
  needed for the color swap itself. The old `navy*` tokens are kept
  (just unused) rather than deleted, in case of a revert.
- **New components**: `src/components/WaveCard.tsx` (a real SVG wave
  cut into a card's top edge — UniHub's single most recognizable
  visual signature, not an approximated border-radius) and
  `src/components/AuthHeroBackground.tsx` (a teal gradient standing in
  for a real campus photo — see the honesty note in that file about
  why a placeholder gradient was used instead of a hotlinked stock
  photo URL).
- **`app/(auth)/login.tsx` and `register.tsx`** rebuilt around those
  two components: hero banner up top, wave-card sheet below it holding
  the actual form. All existing state/logic (portal toggle, password
  strength meter, SSO stubs, waitlist form, the slides carousel) is
  untouched — only the visual chrome around it changed.

**Second round — onboarding, MFA, and university theming reaching
registration**:

- **`src/components/OnboardingShell.tsx`** rebuilt around the hero+wave
  chrome — its prop interface (`currentPath`/`title`/`subtitle`/
  `children`/`footer`) is completely unchanged, so all 8 onboarding
  step screens (`choose-department`, `select-interests`,
  `upload-photo`, `complete-profile`, `browse-directory`,
  `connect-classmates`, `join-community`, `join-event`) picked up the
  new look with zero per-screen edits.
- **`app/(auth)/verify-mfa.tsx`** rebuilt the same way, for visual
  consistency across the whole auth chain.
- **University theming reaches registration**: `institutionThemeOverrides`
  (FUNAAB green / UNILAG blue / UI violet — this system already
  existed, reverse-engineered from the original Kotlin reference app;
  it just previously only applied once a profile existed) is now
  surfaced on `register.tsx` too. Since that screen already detects
  your school live from your email domain (`matchedInstitution`), the
  hero banner now previews *that school's own brand color* the moment
  you type a recognized email — the same colors you'll see everywhere
  once logged in, shown a beat earlier.
- **Deliberately not built**: a "Live Campus Status" stat-bar dashboard
  section (from UniHub's reference) — Lioris has no gym-capacity/
  parking-occupancy data behind that, so building it would mean
  inventing a new feature area, not re-skinning an existing one. Per
  "don't add any features," this was skipped rather than faked with
  placeholder numbers.

**Third round — illustrations and every popup in the app**:

- **`src/components/illustrations/`** (new folder): `EmptyTrayIllustration.tsx`
  and `SuccessIllustration.tsx` — original flat-vector SVG illustrations
  (react-native-svg, already a dependency), built in Lioris's own brand
  color rather than copying UniHub's specific mascot artwork (that's
  their own studio's IP; there's also no image-generation tool in this
  environment to produce matching raster art, so vector illustration
  authored directly in code was the honest path here — see this
  section's earlier limitation note). `EmptyState.tsx` now renders
  `EmptyTrayIllustration` by default, which cascades to all ~15 of its
  call sites across the app with zero per-screen changes.
  `SuccessIllustration` is built and ready but not yet wired anywhere —
  Lioris doesn't currently have a dedicated "big celebration" screen
  (like UniHub's Booking Confirmed/Payment Successful moments) to
  attach it to, and building one would be a new feature, not a re-skin.
- **Every popup in the app now animates consistently**: swept the 3
  remaining center-dialog modals that still popped in instantly under
  a bare fade (`EditShortcutModal`, `MentorCard`'s pitch dialog,
  `SettingsScreenBase`'s erase-profile confirmation) — same scale+fade
  treatment as `AdminConfigModal`/`DiscussionWorkspacesModal`/
  `ApplyForVerificationModal` from earlier. Combined with the
  previously-fixed `ActionSheetModal`/`ShareAcademicFileModal` (slide-
  up) and the screens that already used RN's legitimate native
  `animationType="slide"` (`ChangeWorkspaceScopeModal`,
  `PublishEventModal`, `PublishThreadModal`, `LibraryFilterModal`),
  every single `<Modal>` in the codebase (14 files) now has a real
  entrance — none are left doing a bare instant-pop fade.

**Fourth round — profile, settings, and all four dashboards restyled**:

- **`AuthHeroBackground`** gained an optional `radius` prop, letting the
  same component double as a rounded *card* background (not just a
  full-bleed screen band) — reused for everything below rather than
  building a second gradient component.
- **`ProfileScreenBase`** (shared across all 4 roles): the existing
  cover-photo band — previously a flat pale tint when no cover photo
  was set — now uses the bold teal gradient, with a white ring added
  around the avatar for contrast. The fallback-cover-color case is the
  only thing that changed; a real cover photo still displays exactly
  as before.
- **`SettingsScreenBase`** (shared across all 4 roles): added a teal
  hero band behind the "Account Settings" heading, matching the
  pattern now used everywhere else. Every list section below is
  unchanged.
- **All four dashboards** (`student`, `staff`, `admin`, `alumni`): the
  plain "Welcome, [name] 👋" heading is now a bold teal hero card
  (role label + status pill + greeting + avatar) instead of a flat
  white background — the single most-viewed screen in the app for
  every role.

**Fifth round — Forum, Events, and Messages headers**:

- **`CommunityFeedScreen`** (Forum, shared across all 4 roles): this
  screen is already dense with functional chrome (workspace menu,
  title, campus/global toggle, search, filters, sort) — adding a full
  hero *card* here the way the dashboards got one would push useful
  controls down and hurt usability more than it'd help. Applied a
  lighter, appropriate touch instead: the workspace-menu icon is now a
  bold teal-filled circle (previously a secondary mint tint) for
  stronger brand consistency, without restructuring the busy layout
  around it.
- **`CampusEventsScreen`** (Events, shared across all 4 roles) and
  **`MessagesListScreen`** (Messages, shared across all 4 roles): both
  were simple enough to safely take the same slim hero-band treatment
  as Settings — a short teal band behind the title (and, on Events,
  the "Post Event" button too) instead of a plain white heading. All
  functional content below (filter chips, the events FlatList, the
  conversations list) is unchanged.

**Clutter audit — a real gap, called out directly**: everything above
was about color and hero/card styling, which is a different axis from
information density. Asked directly whether pages were actually as
clean/simple as the reference rather than just re-colored, and the
honest answer was no — hadn't specifically checked. Went through with
fresh eyes:

- **`app/(student)/dashboard.tsx` had real, genuine clutter**: six
  separately-labeled sections stacked with generous gaps (vs. UniHub's
  greeting + one banner + 3 icons + one status section). Fixed
  concretely: removed a redundant double-heading (an eyebrow label
  *and* a separate H2 saying almost the same thing, for one section);
  merged two nearly-identical full-width "Getting Started" cards into
  one card with two compact rows separated by a divider (same two
  tasks, roughly half the vertical space); tightened the gap between
  sections from `spacing.xl` to `spacing.lg` in three places.
- **Staff and admin dashboards were already reasonably clean** on
  inspection — no redundant headers, no easily-mergeable duplicate
  cards. Left alone rather than changed for the sake of changing them.
- **Alumni's dashboard is busier** (three full content-preview
  sections: recent posts, upcoming events, a directory spotlight) but
  that's inherent to genuinely surfacing rich content, not redundant
  labeling — a different situation from student's issue. Added
  consistent spacing between the three sections so they read as
  distinct zones rather than running together, rather than removing
  any of the three (which would cut a real feature).
- **`ProfileScreenBase`** had four detail fields (Department, Academic
  Level, Graduation, Campus) floating directly on the page background
  with no visual grouping — wrapped them in one card so they read as
  one organized block.
- **`SettingsScreenBase`**, checked and left alone: it's organized into
  six clearly-grouped cards (Profile/Display/Notifications/Security/
  Legal/Storage), which is a different pattern from UniHub's single
  flat icon-list but not objectively more cluttered — a legitimate,
  common alternative (the same grouped-sections pattern iOS Settings
  uses), not forced into matching the reference's exact list shape
  just for the sake of it.

**Clutter audit, continued — Forum and Events**:

- **`CommunityFeedScreen` (Forum) had the same class of issue as the
  student dashboard, worse**: four stacked control rows before any
  actual content (workspace icon + title/subtitle, campus/global
  toggle, search + filters, then sort alone on its own row). Fixed:
  removed a "Viewing: ..." subtitle that just restated in text what
  the toggle directly below it already showed visually; merged the
  standalone Sort row into the Search/Filters row (three controls, one
  row instead of two); Filters and Sort are now compact icon buttons
  (with a small dot indicating an active filter) instead of icon +
  full text label, consistent with common toolbar patterns — full
  state is still exposed via `accessibilityLabel` either way. Four rows
  of chrome down to two, with zero controls actually removed.
- **`CampusEventsScreen`'s "Sponsored & Featured" section is inert**:
  there's no `sponsored`/`featured` field anywhere in the event data
  model, so this heading has always shown the same static "No featured
  events" message regardless of real state — not a working feature
  with an empty case, just permanently-empty chrome. Wiring it up with
  real sponsored-event logic would mean adding a new feature (a new
  data field + new dynamic display logic), which "don't add features"
  rules out — so it was left non-functional, just compressed from a
  bold heading + separate description line down to one lighter caption
  line.
- **`MessagesListScreen`**, checked: already minimal (hero band + list,
  nothing else) — no changes needed.

**Sponsored events & posts — wired up for real, per explicit follow-up
request** (this one genuinely adds a feature, rather than just
re-skinning — asked for directly, superseding "don't add features" for
this specific case):

- **`CampusEvent`** gained a real `sponsored?: boolean` field (also
  added to `EventsQuery` for filtering and `CreateEventPayload`).
  `PublishEventModal`'s "Feature as sponsored event" checkbox — always
  collected, never actually sent to `createEvent` — now really gets
  stored.
- **`CampusEventsScreen`**'s "Sponsored & Featured" section (previously
  permanently-static text, see the clutter-audit note above) now
  actually queries for `sponsored` events from the same fetch already
  in hand (no extra network round-trip) and renders them in a
  horizontal-scroll row with a real "Sponsored" tag — falling back to
  the honest empty message only when there truly are none.
- **Found and fixed the identical bug on the Forum side while in
  there**: `PublishThreadModal`'s "Sponsor this post" checkbox had the
  exact same problem — collected, never sent. `Post` gained the same
  `sponsored?: boolean` field, wired through `createPost`, and
  `PostCard` now shows a "🌟 Sponsored" badge alongside its existing
  category/visibility badges rather than a whole new UI section (Forum
  doesn't have a "featured" section the way Events does, so a badge on
  the existing card was the lighter-touch fit).
- Seeded one real example of each in mock data (the Career Fair post,
  the Resume Workshop event) so both are visible immediately rather
  than only after manually publishing something new.

**Continuing to remaining sub-screens — `EventDetailScreen`**: had the
same "verbose stacked label" pattern as the student dashboard's earlier
issues — three separate plain-text lines ("Category: X", "Venue: Y",
"Guests Joined: Z") instead of the compact badge/icon-row style
`EventCard` and `PostCard` already use for the same kind of metadata
elsewhere. Consolidated into one row: a category badge + a location
row + an attendee-count row.

**Final check — `ChatThread` and admin Platform Config**:

- **`ChatThread`**: already clean — no genuine clutter. The one real
  gap is that its screen shows no header with who you're actually
  chatting with (just a generic native "Conversation" title, no
  name/avatar/online status the way the conversations list itself
  shows). Left alone deliberately: displaying that would mean
  `ChatThread` fetching participant data it doesn't currently query,
  which is new functionality, not a re-skin — out of scope here.
- **Admin Platform Config** (`platform-config.tsx`, 385 lines, 8 tabs):
  checked for both clutter and off-brand hardcoded colors. Its density
  is appropriate for what it is — a power-admin control panel, not a
  casual social screen (the same way UniHub's own Council/
  Representative dashboards are noticeably denser than its student
  Home screen). The only hardcoded hex colors found (`#059669`/
  `#DC2626` on the waitlist Approve/Reject buttons) are semantic
  success/danger colors that correctly stay independent of the brand
  teal — not an inconsistency. No changes made.

This closes out the density/consistency audit across every major
screen and screen-family in the app.
`SuccessIllustration` (built several
rounds ago) is still unused — there's no existing "big celebration"
screen in Lioris to attach it to without inventing one, which "don't
add features" rules out.
**A real limitation, stated plainly**: UniHub's case study leans
heavily on a custom-illustrated 3D mascot character for empty states
and celebrations. There's no image-generation tool available in this
environment to produce matching illustration assets — that would need
real artwork supplied separately; icon/emoji-based substitutes are the
realistic alternative without it.

## Design system source — read this first

The visual design now follows a separate reference app: a native Android
(Kotlin/Jetpack Compose) build of Lioris with its own detailed design
tokens and a much larger feature set (gamification, marketplace, jobs,
study groups, a full admin ops panel) than the original PRD scoped for
MVP. That reference app is being ported to this React Native codebase in
tiers, since it's roughly 3-4x the size of everything else in this repo:

All four tiers are now complete:

- **Tier 1 — done:** exact color tokens, the custom Lioris shield logo
  (`src/components/LiorisLogo.tsx`), the frosted-glass card style with a
  real gradient background (`src/components/GlassCard.tsx`), the
  glow-blob screen background (`src/components/ScreenGlowBackground.tsx`,
  wired into `ScreenContainer` by default), role-colored badges
  (`UserTypeBadge`), and an animated skeleton loader.
- **Tier 2 — done:** Dashboard (all 4 roles), the full `PostCard`
  rebuild (trust badges, options menu, report flow), Chats (presence
  dot, typing indicator), Profile (full XP/level/streak/badges
  gamification), and a real mentor-search Mentorship screen.
- **Tier 3 — done:** Marketplace, Jobs, Study Groups, and Resources
  (none of these existed before this redesign), Calendar (built with
  real date math, not the reference's hardcoded month lengths),
  Notifications (delete + deep-link CTA), and a proper Settings screen
  (didn't exist before either).
- **Tier 4 — done, with one deliberate departure from the reference:**
  all 18 admin surfaces are built (User Directory, Audit Logs, Pulse
  Analytics as full screens; the other 15 as modals off a
  `Platform Configuration` hub), but the four that touch real secrets
  (Payment Gateway, Video SDK/WebRTC, AI service keys) never show or
  accept raw key values — they show configuration *status* only
  (`src/components/SecureCredentialCard.tsx`) and point to "manage in
  secure web console" instead. The two highest-privilege actions (force-
  releasing escrowed funds, impersonating a user session) also gained
  guardrails the reference didn't have: typed confirmation and a
  required, audit-logged reason, respectively
  (`src/components/admin/HighRiskModals.tsx`).

Everything below this point describes the app as it stood before this
redesign — still accurate for anything not mentioned above.

## Bottom navigation — matches the reference exactly

The reference app's bottom nav is role-conditional and defined in
`MainActivity.kt`. This app now matches it exactly rather than the
PRD's original per-role nav trees:

- **Student** (5 tabs): Home, Forum, Messages, Event, Library
- **Alumni** (4 tabs): Home, Forum, Messages, Event
- **Staff & Admin** (4 tabs, same set for both): Home, Forum, Messages, Admin Desk

Profile is **not** a bottom tab in the reference — it's reached via the
header avatar (tap the avatar/name in `DashboardHeader` or
`AlumniGradientHeader`). Everything else that used to be a tab
(Mentorship, Marketplace, Jobs, Study Groups, Calendar, Directory,
Announcements, Analytics, Moderation Queue, Reports, etc.) is still a
real route — just reachable from dashboard quick-links instead of the
tab bar, registered with `href: null` in each `_layout.tsx`.

"Forum" is the same community-feed screen for every role
(`src/components/CommunityFeedScreen.tsx`, parameterized by audience
scope) rather than duplicated per role. "Messages" is likewise one
shared screen (`src/components/MessagesListScreen.tsx`) — Staff and
Admin didn't have messaging at all before this fix and do now.
`ConversationRow` and the header components derive the current role
group via `useSegments()` instead of taking a hardcoded path prop, so
the same components work correctly under all four role groups.

## Multi-university launch model

Launching with exactly 3 universities — UNILAG, UI, FUNAAB
(`src/api/institutions.ts` is the single source of truth other files
import from). Anyone else's school goes through the waitlist instead.

- **Content scoping is a hard rule, not just a UI toggle.** A
  campus-scoped post is only ever visible to users from that same
  university; posts with no `institutionCode` are global and visible
  to everyone. The "My Campus"/"Global" toggle (in the header pill and
  on the Forum screen) narrows *within* what's already visible — it
  never widens access to another university's local content. Backed by
  `src/hooks/useViewScope.ts`, which stores the toggle in react-query's
  cache rather than a new Context provider, since `QueryClientProvider`
  is already available everywhere the toggle is used.
- **Per-university color themes**: FUNAAB (green) and UNILAG (blue)
  were explicitly specified; UI's violet was **not** — it's a judgment
  call to keep the third school clearly distinct from the other two,
  flagged as such in `src/theme/colors.ts`. Only the brand-accent
  fields are overridden per school (primary color, active-tab color,
  pastel highlight background); backgrounds, text, and borders stay
  the same everywhere. This required moving `ThemeProvider` to sit
  *inside* `QueryClientProvider`/`AuthProvider` in the root layout
  instead of wrapping them, since it now needs to read the signed-in
  user's institution to pick a palette.
- **Registration doesn't require a university email.** Anyone can
  register with any email. A recognized UNILAG/UI/FUNAAB domain
  auto-verifies the account (the checkmark tick) immediately; anything
  else registers successfully but starts unverified, with a clear,
  non-blocking note that they can apply for the tick afterward.
- **A real (if fully mock) verification pipeline**: Profile shows a
  3-state banner (verified / pending / none) instead of a single
  boolean. Applying opens `ApplyForVerificationModal` (school name,
  document type, reference number), which creates a real pending
  request — reviewed from a new Admin screen
  (`app/(admin)/verification-requests.tsx`, wired to the previously
  decorative "Verify Credentials" tile). Approving actually grants the
  tick on the applicant's own profile record, not just the request.
- **Staff/Admin moderation distinction now has real teeth**: Staff's
  Moderation screen filters to only their own campus's reports
  (derived from their actual profile); Admin's Flags tab respects
  the "Active Campus Workspace Scope" selector, which used to be purely
  decorative and now actually filters what's shown. Caught and fixed a
  real bug in the process: `resolveReport` never persisted before —
  resolving a report would silently reappear as "open" again on the
  next fetch.

## Global audit — bugs found and fixed

A full pass through every route, all four roles, checking for broken
links, drifted/duplicated screens, and role bleed-through. Real issues
found and fixed, not just cosmetic:

- **`DirectoryCard`'s Message button was hardcoded to `/(alumni)/messages/...`**,
  but the component is also used during onboarding previews for any
  role. Now derives the correct path per role, with a safe fallback
  during onboarding.
- **Forum had silently drifted apart across roles.** Student's got a
  real upgrade (search, composer, workspace switcher) in an earlier
  round; Alumni/Staff/Admin were left on an older, plain copy with no
  way to actually post. Consolidated into one shared
  `CommunityFeedScreen` so this class of bug can't recur.
- **Same drift, same fix, in Events** — consolidated into
  `CampusEventsScreen`.
- **17 screens across all four roles were missing the persistent
  `AppHeader`** entirely. Fixed in a batch pass, verified by full
  typecheck each step.
- **18 shared components (including `PostCard` and `EventCard`) were
  still using the old heavy `GlassCard` blur style** instead of the
  flat `SolidCard` the screenshots actually show. Swapped all of them.
- **`StaffAdminBoardCard` hardcoded the literal text "STAFF EXECUTIVE
  DASHBOARD" for both Staff and Admin accounts** — an Admin user would
  see the word "STAFF" on their own Home screen. Now takes a `role`
  prop and shows correct copy per role.
- **Settings showed "Private Student Profile Visibility" and "your
  encrypted student data" to Alumni/Staff/Admin accounts too.** Made
  role-aware.
- **Profile's "Campus" field hardcoded "FUNAAB"** regardless of actual
  profile data. Added a real `institutionCode` field to `UserProfile`
  instead of a stray UI string.

Confirmed clean: `RoleGate` correctly blocks cross-role access on all
four layouts; no other cross-role label leakage found; onboarding
chains are correctly role-specific; Messages/Settings/Profile/
Notifications were already properly shared and consistent; the
Marketplace/Jobs cross-role re-export pattern still resolves correctly.

## Screenshot-driven redesign — now covers the whole app

The person supplied two rounds of real screenshots (student screens
first, then a much larger set covering login/onboarding, Alumni Hub,
Notifications, Profile, and the Admin Workdesk). All of it is now
built:

- **Color scheme**: navy blue primary (`palette.navyPrimary` ≈
  `#1B2F5E`) — an earlier pass wrongly set this to green off a partial
  screenshot set; corrected once the fuller set arrived. The pastel
  shortcut-tile colors (sage/rose/mint/lavender) are unaffected.
- **Visual weight**: flat white/pastel cards (`SolidCard`), a
  persistent top app bar (`AppHeader`: logo+wordmark, institution
  switcher for non-student roles, search, bell, avatar) on every
  screen, not just dashboards.
- **Nav, confirmed per role**: Student (Home/Forum/Event/Library-
  Network, 4 tabs), Alumni (Home/Forum/Alumni Hub, 3 tabs), Staff &
  Admin (Home/Forum/Admin Desk, 3 tabs each). Messages doesn't appear
  in bottom nav for any role — routes still exist, just unlinked.
- **Real modals wired to real data**, not mockups: Publish Event,
  Publish Campus Thread, Discussion Workspaces switcher, Share Academic
  File — all call actual create/list functions I had to add (`createEvent`,
  `createResource` didn't exist before).
- **Notifications**: Alerts/Connections tabs, Read All/Clear (fixed a
  real bug where marking read never persisted), "People you may know."
- **Profile**: simplified to match what's actually shown — the earlier
  XP/level/streak build was over-assumed from the Kotlin source and
  doesn't appear in the real screenshots. Now: cover photo edit
  affordance, unverified-email banner with a working Verify+XP flow,
  Followers/Following, department/level/graduation/campus grid.
- **Login/Onboarding**: logo+tagline, an info carousel (only its first
  slide was confirmed by screenshot; two more invented in the same
  spirit — flagged), Student Portal/Alumni Circle toggle, working
  show/hide password, SSO buttons (visual only, no real OAuth), and the
  waitlist card for unlisted schools.
- **Admin Workdesk — the biggest single piece**: restructured from a
  simple settings list into the real layout — workspace-scope selector,
  a "Preview As" role-label switcher (cosmetic only — it doesn't
  actually re-render the app as another role yet), and an 8-tab row
  (Analytics with a real SVG line chart, Flags, User Profiles, Utility
  Hub — now the real dashboard-shortcuts CMS (see below), Forums with a
  working per-workspace moderator permission matrix, Events with
  approve/revoke/purge, Library, Approvals for the onboarding waitlist).
- **Utility Hub was wrong and has been corrected.** It's now the real
  "Local Hub Options & Utilities Control Desk" — a CMS with full CRUD
  for the dashboard shortcut tiles (Student Hub/Alumni Hub toggle, add/
  edit/delete listings with icon/department/level targeting). Note:
  edits here don't yet live-update what a real student session sees on
  Home — that would need a shared cache/backend layer, flagged in code
  rather than silently implied. The 14-modal config list that used to
  live under this tab (wrongly) now has its own proper screen:
  **Super Admin Configuration** (`app/(admin)/super-admin-config.tsx`),
  restructured into the actual 9 numbered sections from the screenshots,
  with 3 genuinely new items added: Tenant Feature Toggles, an Enable
  Gamification System toggle, and a Maintenance Mode Kill Switch that
  requires real confirmation before enabling (it's described as taking
  the whole platform offline — that warranted a guard, not a bare
  toggle).
- **Event Detail screen** — tapping any event now opens a full detail
  view (offline-map mock, walking directions, attendee list, G-Cal/.ICS
  export, Cancel Attendance). `EventCard` itself gained a working
  report/block menu, a reminder-bell toggle, and a "Joined ✓" state.
- **"People you may know"** now uses real gradient-header suggestion
  cards with mixed roles (Staff/Student/Alumni), not a repurposed
  directory card.

Known simplifications, stated plainly: "Preview As" only changes a
label, it doesn't render another role's actual screens inline; the
onboarding carousel's 2nd/3rd slides are invented; SSO buttons don't
call real Google/Microsoft OAuth.

## Staff/admin MFA (PRD Section 11)

Section 11 requires MFA for staff/admin accounts at minimum; previously
no client stub existed at all. Now built as a real, wired login-time
gate rather than a decorative screen:

- `src/auth/mfaPolicy.ts` is the single source of truth for which roles
  need it (`roleRequiresMfa` — currently staff/admin only). Everything
  that gates on it (`AuthContext`, `app/(auth)/_layout.tsx`, the root
  resolver `app/index.tsx`, `RoleGate`) imports this rather than
  re-checking role strings inline.
- On login, a staff/admin session is created with `mfaVerified: false`;
  the root resolver redirects to the new `app/(auth)/verify-mfa.tsx`
  screen instead of the dashboard until it's cleared. Deep-linking
  straight into `(staff)`/`(admin)` routes is blocked the same way
  (`RoleGate`), and `app/(auth)/_layout.tsx` was adjusted so an
  MFA-pending session isn't bounced out of that screen the instant
  it lands there (the same subtlety onboarding already had to handle,
  since `login()` sets `onboardingComplete: true` immediately).
- Student/alumni are unaffected — `mfaVerified` defaults to `true` for
  roles the policy doesn't cover, and self-registration only ever
  produces student/alumni accounts anyway (staff/admin are
  invite-provisioned per Section 5.3/5.4).
- **Mocked the same way the rest of auth is** (see "Mock data fallback"
  below): `authApi.verifyMfaCode`/`resendMfaCode` fabricate success,
  since there's no real backend or delivery channel (SMS/email/
  authenticator) to check a code against. A session cached before this
  field existed defaults `mfaVerified` to `false` on restore rather than
  trusting its absence, so it re-challenges instead of silently
  skipping the gate.
- **Not built**: real code delivery, TOTP/authenticator-app support, and
  "remember this device" — every sign-in re-challenges. Reasonable
  next steps, flagged here rather than silently assumed done.

## Moderation & admin action log (PRD Section 14)

Section 14 defines an `AuditLog` model; Section 6.2's acceptance
criteria requires moderation decisions be audit-logged. Previously
there was no model or view at all — the Admin Reports screen was
adjacent but wasn't the same thing, and two of the Super Admin
high-risk actions (escrow release, role impersonation) had UI copy
that *claimed* to write to an audit trail without actually persisting
anything anywhere. Both gaps are closed now:

- `src/api/auditLog.ts` — `recordAuditLogEntry()` (reads the current
  actor from the local session cache, tries a real `POST /audit-log`
  first, falls back to an in-memory list on failure — same convention
  as every other mutation in `src/api/`) and `listAuditLog()` with
  filtering. Seeded with 3 historical entries so the screen isn't empty
  on first load.
- **Wired into every real moderation/high-risk mutation**, not just
  new code: `resolveReport` (`src/api/moderation.ts`),
  `revokeEventApproval`/`purgeEvent` (`src/api/events.ts`),
  `respondToVerificationRequest` (`src/api/verification.ts`), and the
  two `HighRiskModals` actions in `super-admin-config.tsx` — the
  escrow-release and impersonation modals' callback signatures changed
  (`onReleased`/`onStart` now receive the amount / target+reason) so
  the parent has enough to log a real entry instead of just showing an
  alert that used to overstate what the app actually did.
- **New screen**: `app/(admin)/moderation-audit-log.tsx` — filterable
  (All/Reports/Events/Verification/High-Risk), reachable from Super
  Admin Configuration → Section 6 ("Cybersecurity & Ecosystem Safety"),
  alongside the existing entry. **Deliberately not the same screen** as
  `app/(admin)/audit-logs.tsx` — that one is the Tier-4 reference-app
  parity surface for E2EE key-rotation events (a different, narrower
  concept that predates this work); this is the PRD's actual
  moderation/admin-decision audit trail.
- **Known simplification, stated plainly**: the waitlist approve/reject
  flow in `platform-config.tsx`'s Approvals tab is *not* logged here —
  it's an operational/onboarding decision rather than a moderation one
  per Section 6.2's wording, so it was left out of scope rather than
  silently included or silently forgotten.

## Motion design (PRD Section 8)

Section 8's Design Philosophy calls for page transitions, modal
enter/exit animations, loading skeletons, notification animations, and
gesture interactions. **Correcting a stale claim in this README**: an
earlier version of this doc said reanimated was "used in exactly one
component" — that was already inaccurate before this session started.
Four components used `react-native-reanimated` beforehand: `AppButton`
(press-scale), `SkeletonLoader` (a real animated shimmer sweep, not a
static placeholder — done back in Tier 1), `PresenceHalo` (pulsing
online dot), and `TypingIndicator` (bouncing dots), all ported from the
Kotlin reference app's micro-interactions. So loading skeletons were
already real; this session's work went toward the parts of Section 8
that genuinely had nothing yet:

- **Modal enter/exit animations**: `AdminConfigModal` (backs ~15 admin
  config modals across `super-admin-config.tsx`/`platform-config.tsx`)
  now has a real scale+fade entrance instead of the content just
  popping in under RN's native backdrop fade. A new shared
  `src/components/ActionSheetModal.tsx` gives the post/event "..."
  options menus (`PostCard`, `EventCard` — both very high-traffic,
  rendering on every post/event across every role) a slide-up + spring
  entrance with a fading backdrop, and consolidates what used to be two
  near-duplicate raw `<Modal>` blocks into one component. The same
  scale+fade treatment was also applied directly to
  `DiscussionWorkspacesModal` and `ApplyForVerificationModal` (both
  center dialogs), and the same slide-up + spring treatment to
  `ShareAcademicFileModal` (a bottom sheet) — each kept its own
  existing colors/radius rather than being forced through
  `ActionSheetModal`, since that component's styling was tuned
  specifically for the PostCard/EventCard menus. `PostCard`'s separate
  report-reason confirmation dialog (distinct from its options-menu
  sheet) got the same scale+fade treatment too.
  `ChangeWorkspaceScopeModal`, `PublishEventModal`, `PublishThreadModal`,
  and `LibraryFilterModal` already used RN's native
  `animationType="slide"`, which genuinely moves content rather than
  just cross-dissolving it — left as-is rather than redundantly
  reimplemented.
- **Gesture interactions + notification animations, together**:
  `NotificationsList` rows are now wrapped in `Swipeable`
  (`react-native-gesture-handler/ReanimatedSwipeable`) for a real
  swipe-to-delete gesture, revealing a red delete action — the
  tap-to-delete "×" button stays too, for non-gesture and
  accessibility-focused users. Rows also animate out with `FadeOut` +
  `LinearTransition` when deleted, instead of instantly vanishing from
  the list.
- **Page transitions**: previously left to whatever each platform
  defaults to (which can differ between iOS and Android). Now explicit
  and deliberate: `app/(auth)/_layout.tsx` uses `fade` for the
  login/verify/MFA checkpoint chain; `app/(auth)/onboarding/_layout.tsx`
  uses `slide_from_right` for the linear onboarding steps — a
  "state change" feel versus a "moving forward" feel, on purpose.

**Follow-up round**: feed items now animate in — `CommunityFeedScreen`
(posts) and `CampusEventsScreen` (events) both wrap their `FlatList`
rows in a staggered fade+slide-up entrance (capped at 8 items' worth of
delay so long lists don't feel sluggish to load). `EventCard`'s
whole-card tap (a real navigation to the event detail screen) now has
the same press-scale feedback `AppButton` uses. `PostCard`'s container
was deliberately left alone here: unlike `EventCard`, tapping the card
itself doesn't navigate anywhere in this app (there's no post-detail
screen) — adding press feedback to a tap that does nothing would be
misleading, not polish, so this is a real "not applicable" rather than
a gap.

**Second follow-up round — the swipe-gesture gap is now closed too**:
`ConversationRow` (the Messages list, shared across all four roles)
supports swipe-to-archive, revealed via a red action panel — backed by
a real `archiveConversation()` in `src/api/messaging.ts` that now
persists for the session (previously `listConversations` had no
mutable state at all, so nothing could ever actually be removed; same
class of bug this codebase has fixed elsewhere, e.g. `resolveReport`).
`ChatThread` message bubbles support swipe-to-reply, revealing a small
reply icon; a "Replying to: ..." strip appears above the composer with
a cancel button. **Stated plainly**: there's no real threaded-reply
data model here (`Message` has no `replyToId` in PRD Section 15.4's
contract) — this is a lightweight client-side quoting convenience that
prepends the quoted text to the outgoing message, not a persisted
reply relationship. A real implementation would need a backend field
and UI to render the quote distinctly in the thread, not string
concatenation.

**Known gaps, stated plainly, not silently assumed done**: no other
list in the app has a swipe gesture (e.g. `NotificationsList`'s peers
in other domains — resources, marketplace listings, job postings).

## Quick start

```bash
npm install
npx expo install --fix   # see "Known follow-ups" #1 before running this
npx expo run:ios         # or: npx expo run:android
```

For day-to-day development once you have a dev client installed:

```bash
npx expo start
```

## What's implemented

- **Auth flow** (`app/(auth)/`): login, register (with a live password-
  policy checklist — 12+ chars, mixed case, number, special character,
  common-password rejection, per the PRD's Security Requirements), email
  verification, and a full role-specific onboarding chain matching PRD
  Section 5's flowcharts (`app/(auth)/onboarding/`): choose department,
  select interests, upload profile photo (real `expo-image-picker`
  integration), complete profile, browse directory / connect with
  classmates, and join a first community (student) or event (alumni).
  Onboarding progress is persisted (`onboardingStep` in the session), so
  closing and reopening the app resumes at the right step rather than
  restarting the chain.
- **Four role-scoped app sections**, each behind a client-side `RoleGate`
  (`app/(student)/`, `app/(alumni)/`, `app/(staff)/`, `app/(admin)/`),
  matching the navigation trees in PRD Section 4 and dashboards in
  Section 6. The gate also checks onboarding completion, so a
  mid-onboarding session can't deep-link straight into a dashboard route.
  This is all a UX convenience only — every real deployment must still
  enforce role/permission checks server-side on every request (PRD
  Section 12.1); this client trusts nothing on its own.
- **Alumni connection-request inbox** (`app/(alumni)/connection-requests.tsx`):
  incoming pending requests with accept/decline, reachable from a badged
  icon on the Directory screen — the recipient-side half of the
  connection lifecycle in PRD Section 13.1 that the original build left
  unbuilt (only the sender side existed).
- **Directory and Events search actually filter now.** Both do real
  case-insensitive partial matching against the mock dataset, with
  exact-match results ranked first, per Section 16.3.
- **Design system** (`src/theme/`): light/dark themes, the 85/10/5
  blue/neutral/orange brand ratio, and the iOS (SF Pro Display via system
  font) / Android+Web (Inter) typography split from Section 8.
- **API layer** (`src/api/`): typed client modules matching the contracts
  in Section 15, an axios instance with token-refresh interceptor, and
  secure token storage via `expo-secure-store`.
- **Real-time layer** (`src/realtime/`): WebSocket client with
  exponential-backoff reconnect, and a hook that flips React Query to
  polling mode if the socket stays down — the graceful-degradation
  requirement in Section 12.2.
- **Push notifications** (`src/notifications/`): permission request,
  Expo push token registration, Android notification channels (with a
  separate high-importance channel for emergency broadcasts), and
  deep-link-on-tap handling.

## RSVP persistence, and closing out debounce coverage app-wide

Checked the three areas flagged as not-yet-covered at the same depth
as Forum/Marketplace: admin `feature-controls.tsx` (confirmed
genuinely clean — fully self-contained, honestly labeled, nothing else
reads its state), the full RSVP pipeline, and Alumni's directory/
connection-requests screens.

**`rsvpToEvent` had the exact same bug class as `createListing`/
`publishAnnouncement` before those got fixed**: it used the plain
`withMockFallback` fallback-value form, which never touched
`eventsState` at all. `rsvpCount` and the "Going: [names]" list shown
in both `EventCard` and `EventDetailScreen` never actually reflected a
real RSVP, and would silently reset on any refetch — even within the
same session. Fixed to genuinely update both fields, including adding/
removing the current user's own name from the attendee list.

**Found a debounce gap that had slipped through** while checking
Alumni's directory screen, then went back and systematically checked
every search input in the app rather than assuming the earlier fix was
complete. It wasn't: **7 more screens** had the same un-debounced
search issue (Marketplace, Jobs, Mentorship, Resources, Alumni
Directory, Alumni Hub) — all fixed now. Also explicitly verified the
two remaining hits (`user-directory.tsx`, admin's
`ForumsModerationTab`) are genuinely fine — both filter an
already-fetched list client-side with no network call involved, so
they never needed debouncing in the first place.

## The single biggest architectural gap found this whole session

Continuing "keep going until confident at 9/10" with the same
systematic method: this time, scanning for every optional callback
prop across the whole codebase never actually supplied by any caller
(the exact shape of the `PostCard.onReport` bug). Result: only one
hit, and it was the already-known-dead `AnnouncementBanner` — that bug
class is now fully closed app-wide.

**Then found something structurally bigger while checking admin's
"Local Hub Control" panel**: Admin has a complete CRUD interface for
managing dashboard shortcuts shown to students and alumni — create,
edit, delete, toggle active/inactive, scope by campus/department/
level. The student dashboard's "My Shortcuts" grid **never read from
any of it** — it rendered 4 hardcoded tiles regardless of what an
admin configured. An entire admin control surface, with zero actual
control over what it claimed to control. Fixed: the student dashboard
now genuinely fetches `listDashboardShortcuts('student')` and renders
whatever admin has marked active. Each shortcut's `internalAction`
maps to a real screen where one exists (library/courses/past-questions
→ Resources, timetable → Calendar, upload-events → Events) and gives
honest "not available yet" feedback for the two that don't (a Fees
Portal and course catalog aren't things Lioris actually has built).
**Deliberately left alumni's dashboard alone**: its admin-configured
shortcuts ("Post a Job," "Mentor a Student") map to features that
don't exist anywhere in the app yet either, so wiring that connection
now would just surface two dead-feeling tiles — lower quality than
leaving its existing, working, fixed navigation row as it is.

**Also fixed a second instance of the fragile-navigation pattern**
found while building Marketplace's "Message Seller": `DirectoryCard`'s
"Message" button navigated straight to `/messages/{alumniEntryId}`,
assuming a conversation with that exact ID already existed. If it
didn't, the chat would open but the conversation would never actually
appear in the Messages inbox afterward. Fixed to use the same
`getOrCreateConversationWithUser()` guarantee Marketplace now uses —
this pattern is confirmed consistent across all 3 places in the app
that start a conversation.

**Built the Marketplace "Message Seller" action** (the piece left
in-flight last round): added `getOrCreateConversationWithUser()` to
`messaging.ts`, reusing the existing chat infrastructure rather than
building something new, wired into a real button on
`MarketplaceItemCard` (hidden for your own listings).

**Built the missing Study Group creation flow** — same gap shape as
Marketplace: `isPublic` implied student-created groups, but nothing
could create one. Added `createStudyGroup` with real persistence,
built `CreateStudyGroupModal` matching the established pattern, wired
into the screen.

**Turned a decorative toggle into a real feature**: `EventCard`'s
reminder bell previously just flipped a local boolean with zero
effect. Now schedules an actual local notification 1 hour before the
event via `expo-notifications` — which only works at all because
push registration got wired up two rounds ago — with proper
cancellation and a graceful failure message if permission was never
granted.

**Closed the remaining notification-wiring gaps**: mentorship accept/
decline and announcement publishing both now create real notifications
with matching query invalidation, closing out every item from the
original "extend this further" list.

**Flagged, not built**: "Become a Mentor" (alumni have no way to
register as mentors — `MentorProfile`s are static, and unlike
Marketplace/Study Groups there's no existing signal this was intended)
and job-posting (confirmed again: no `createJob` function anywhere,
nothing to reconnect).

## The most significant round yet: reporting content did literally nothing

Continuing the "backend functionality across the board" sweep,
starting from the two flagged candidates (Marketplace, Jobs):

**Marketplace — built the missing half.** `createListing` already
existed and already persisted correctly (fixed two rounds ago), but
there was no "Sell an item" UI anywhere in the app calling it. Built
`SellItemModal` (photo picker, category/condition chips, matching
`PublishEventModal`'s established pattern exactly) and wired it into
`marketplace.tsx` via both a header button and a FAB, following the
same hero-band layout already used for Events.

**Jobs — checked, genuinely fine, and one gap flagged rather than
built.** `JobCard`'s "Apply" button correctly opens the real external
`applyUrl` — that's honest, working functionality (real campus job
boards link out rather than handle applications in-app), not a bug.
There's no job-*posting* capability anywhere, staff or otherwise — but
unlike Marketplace, there's no existing scaffolding to complete here
(no `createJob` function, no staff jobs screen, nothing 80% built).
Building it would mean inventing a new feature end-to-end rather than
reconnecting something disconnected, so it's flagged here rather than
built without more specific direction.

**Then found something bigger while re-checking the moderation
pipeline**: `submitReport` — what fires when anyone reports a post or
event — never actually added the report to `reportsState` at all. It
fired a request and did nothing else. This meant user-submitted
reports *never reached the moderation queue*; staff/admin only ever
saw the pre-seeded mock reports, regardless of what anyone actually
reported during a session. This is about as core to a moderation
system as a bug gets, and it's now fixed properly.

**While tracing that, found the actual worst bug in the whole
app so far**: `PostCard`'s "Report Post" and "Block Author" actions —
across the *entire* Forum feed, every role — called `onReport`/
`onBlockAuthor` props that literally no call site (all 3 of them:
`CommunityFeedScreen`, `SearchScreen`, the alumni dashboard) ever
provided. Tapping "Submit Report" on a post did not fail silently —
it did *nothing at all*, not even attempt a network request, because
the function being called was `undefined`. Fixed by making `PostCard`
self-contained (calling `submitReport` and showing a real confirmation
directly), matching the pattern `EventCard` already used correctly —
`EventCard`'s equivalent actions worked the whole time; this was
specifically a `PostCard`-only gap.

**Closed out the notification-wiring list from last round**: added
the reporter notification to `resolveReport` (previously wired
everything except telling the person who filed the report what
happened to it) and the matching query invalidation in
`ModerationQueue` so it appears immediately rather than on the next
natural refetch.

## The biggest finding: notifications were never actually generated by anything

Extended the "does anything call this" check to the notification
system specifically, and found the most significant gap yet:
**nothing anywhere in the entire app ever created a notification.**
Sending a message, requesting a connection, getting verified, an
admin publishing an announcement — none of it touched
`notificationsState`. The list was pure static seed data for the
whole session; mark-as-read/delete just mutated the same fixed items.
For an app whose entire premise is "never miss campus updates," a
notification feed that can't reflect anything that actually happens is
a core-feature gap, not a cosmetic one.

**Fixed a well-scoped, real subset** rather than wiring every
conceivable trigger: added `createNotification()` to `notifications.ts`
and called it from the two clearest "someone should be told about
this" moments — `respondToVerificationRequest` (approved/rejected) and
`sendConnectionRequest`/`respondToConnectionRequest` (new request /
accepted). Deliberately did **not** wire it into new chat messages,
since those already surface via `ConversationRow`'s own unread badge —
adding a second, redundant notification for the same event would be
noise, not a fix. Also deliberately did not touch announcements or
moderation-report outcomes this round — flagging both as reasonable
next candidates rather than claiming full coverage.

**Caught a second-order bug while wiring this up**: even after
`createNotification` existed, none of the three calling
screens/components invalidated the `['notifications']` query
afterward — meaning the bell badge wouldn't update until the next
natural refetch (up to 30s later, or a manual pull-to-refresh).
Fixed all three call sites
(`app/(admin)/verification-requests.tsx`,
`SuggestedConnectionCard`, `DirectoryCard`, and
`app/(alumni)/connection-requests.tsx`'s accept/decline handler) to
invalidate immediately.

**One honest caveat about how this mock models multi-user actions**:
this app has no real backend, so it only ever represents *one* active
session at a time — there's no way to "deliver" a notification to a
literal separate other user's device. Consistent with how the rest of
this mock backend already works (e.g. the audit log isn't scoped
per-viewer either), these notifications land in the single shared
demo feed, worded from the affected person's point of view. That's the
honest, correct trade-off for a single-session mock, not a bug to
"fix" further without a real backend behind it.

## Two significant "never actually wired up" findings

Continuing the optimization pass into "extend optimistic UI updates"
led to systematically checking every exported API function for
whether anything actually calls it — the same category of check that
found the sponsored-events and marketplace bugs earlier, extended
further. Two real findings, one of them substantial:

**The like/upvote button on every post in the entire Forum had zero
backend persistence.** `togglePostLike` existed in `posts.ts`, fired a
real API call, and its own comment claimed "optimistic UI already
reflects the change" — but `PostCard` never called it at all. The
`liked` state was purely local `useState`, meaning a like would reset
to the original mock value the instant the post re-rendered from a
fresh fetch. Also fixed: `togglePostLike` itself never updated the
mutable `postsState`, so even calling it wouldn't have survived a
refetch either — same bug class as the marketplace/announcements
fixes. Now: `PostCard` calls it with a real optimistic update (flips
instantly) and rollback if the call ever throws, and the mock state
actually persists the change.

**An entire push-notification subsystem was fully built and never
connected to the app.** `src/notifications/push.ts` has real,
complete code — permission requests, Android notification channels
(including a separate max-importance channel for critical emergency
alerts per PRD Section 17), Expo push token registration, and a
deep-link listener for notification taps. Both of its exported
functions had their own comments stating exactly where they should be
called from ("call this after login," "mount once near the app
root") — and neither was called from anywhere. Wired both in:
`addNotificationResponseListener` now mounts once in
`app/_layout.tsx`, routing notification taps via `router.push`;
`registerForPushNotificationsAsync` now fires after `login()` (for
returning users) and after `completeOnboarding()` (for new users,
matching the comment's own reasoning that permission prompts should be
tied to a moment of clear benefit rather than immediately at account
creation) — both fire-and-forget so neither can ever block the actual
sign-in/onboarding flow.

**One more gap found, not fixed — a backend capability with zero UI**:
`verifyProfileEmail` in `profile.ts` is fully implemented (its comment
says it "backs the Profile screen's 'Verify' button on the
unverified-email banner" and awards +150 XP) but no such banner exists
anywhere in `ProfileScreenBase`. Same category as `createListing`'s
missing "Sell an item" screen — a real gap, but building the banner
would be new UI, not a fix to something broken, so left alone pending
explicit direction.

## Offline detection + list performance tuning

Two more items from the optimization list, continuing from where the
image/haptics pass left off:

- **`@react-native-community/netinfo`** — wasn't installed at all
  before (checked and confirmed zero `NetInfo` usage anywhere in the
  app). Installed at `^12.0.1`. Wired into React Query's own
  `onlineManager` (`src/components/OfflineBanner.tsx`'s
  `setupNetworkAwareQueries()`), so queries now automatically pause
  retries while offline and refetch the moment connectivity returns —
  this is the standard, documented integration pattern for React
  Query, not a bespoke one. A slim, non-blocking `<OfflineBanner />` is
  mounted once at the root layout, appearing only while offline and
  disappearing the instant it returns, rather than needing to be added
  to every screen individually.
- **`FlatList` virtualization tuning** — `initialNumToRender`,
  `maxToRenderPerBatch`, `windowSize`, and `removeClippedSubviews`
  added to the four highest-traffic lists (Forum, Events,
  Notifications, Messages). Invisible at the current mock-data scale
  (a handful of items each), but this is exactly the kind of thing
  that's easy to forget until a real backend returns hundreds of rows
  and scrolling starts janking — cheap to add now, before it's a
  problem instead of after.

## Readiness audit — navigation integrity, staff role, empty states

Asked directly whether the app is truly ready for students, alumni,
and admins — did a deeper pass than the earlier global scan,
specifically covering navigation-link integrity and the
least-scrutinized role (staff), plus a systematic empty-state check.

**Every navigable link verified, one theoretical gap found**: cross-
checked all 37 unique static `router.push`/`replace` routes against
real files (zero missing), then separately verified every
`${roleGroup}`-templated route (used by shared components like
`EventCard`/`ConversationRow`) actually resolves for all 4 roles.
Found one: `EventCard`/`CampusEventsScreen` push to
`/(admin)/events/{id}`, which doesn't exist — admin has no `events`
route at all. Confirmed this is a **dead code path, not a live bug**:
`EventCard` is never rendered from any admin-reachable screen (admin's
real event-moderation UI, `EventsModerationTab`, doesn't use it).
Left as-is rather than building an unused admin events route, but
flagging it here as a fragile spot if `EventCard` ever gets reused in
an admin context later.

**Staff role checked end-to-end**: all 10 screens, zero dead handlers.
`moderation.tsx` (staff's actual distinguishing capability vs. Admin)
verified to genuinely filter by `institutionCode` — not just accept
the prop and ignore it.

**Empty-state coverage**: systematically checked every `FlatList` in
the app for a `ListEmptyComponent`. Found and fixed 2 real gaps —
`ChatThread` (a brand-new conversation with zero messages showed a
blank area) and admin `user-directory.tsx` (a search/filter combo that
matches nothing showed a blank screen). A third candidate,
`audit-logs.tsx`, was checked and left alone: its list is a hardcoded
static array with no search/filter UI at all, so it can never actually
render empty — adding a `ListEmptyComponent` there would be
theoretical, not a real fix.

## Image caching + haptic feedback

**`expo-image` migration, all 5 usages of plain React Native `Image`**:
`Avatar` (highest-leverage — renders on nearly every list row in the
app), `ProfileScreenBase`'s cover photo, `ApplyForVerificationModal`,
`PublishEventModal`, and the onboarding photo-upload screen. Each now
gets `cachePolicy="memory-disk"` (RN's plain `Image` re-decodes on
every mount, no caching at all) and a 200ms fade-in transition on load.
`expo-image` was already an installed dependency — this was purely a
matter of nobody having migrated `Avatar` and friends onto it yet.

**`expo-haptics` — installed and wired into the highest-frequency
interactions**: wasn't a dependency at all before this pass (`npx expo
install` failed on its own compatibility-check network call in this
sandbox; fell back to plain `npm install expo-haptics@^57.0.1`,
matching this project's SDK-numbered versioning scheme). Added a thin
wrapper (`src/utils/haptics.ts`, no-ops safely on web) and wired it
into:

- Light tap: `PostCard`'s like/upvote toggle, `EventCard`'s RSVP
  toggle, `MarketplaceItemCard`'s wishlist toggle
- Medium tap: `ChatThread`'s send button, and every "publish" action
  (`PublishEventModal`, `PublishThreadModal`, staff
  `announcements.tsx`)
- Success/error: `verify-mfa.tsx` (correct vs. wrong code),
  `ChatThread` (failed message send), `ApplyForVerificationModal`
  (submission confirmed)

**Not yet done, if this continues**: haptics could reasonably extend
further — swipe-to-archive/swipe-to-reply, the erase-profile
confirmation, admin moderation approve/reject actions — this covers
the highest-frequency interactions first rather than every single
button in the app.

## Full visual consistency + first optimization pass

**Every auth screen now matches**: `verify-email.tsx`, `verify-school.tsx`,
and `verify-alumni.tsx` were the last three screens still on the old
plain layout after the UniHub rebrand — rebuilt around the same
hero+wave chrome as `login`/`register`/`verify-mfa`, each with a
context-appropriate icon (mail/school/ribbon). All logic (API calls,
error handling, onboarding advancement) is byte-for-byte the same as
before — only the visual shell changed.

**Two concrete, high-value fixes from a UX/performance review** (full
prioritized list of everything else worth doing is in the chat, not
duplicated here to avoid this file becoming unreadable):

- **Global error boundary** (`src/components/ErrorBoundary.tsx`) —
  previously nothing in the app caught render errors, so any component
  crash took the whole app down with React Native's default red-screen
  (dev) or blank white screen (production), no recovery path. Wraps
  the root `<Slot />`. Its own `componentDidCatch` notes plainly that
  there's no crash-reporting service wired up yet (Sentry/Bugsnag/etc.)
  — this should exist before shipping so failures are visible without
  someone filing a bug report.
- **Search debounce** (`src/hooks/useDebouncedValue.ts`) — the Forum
  feed's search bar and the new global `SearchScreen` both fired a
  fresh query on every keystroke, with no debounce at all. Against a
  real backend this means a network request per character typed.
  Fixed both; `SearchScreen` specifically keeps the *displayed* text
  instant while only the actual query waits for typing to settle, so
  clearing the box still instantly reverts to the welcome placeholder.

## Global scan — full app audit (routing, roles, data persistence)

Asked directly whether every page/section/button/feature/backend/role
was working, so this was a systematic pass rather than a spot-check:
build health, dead-button re-scan with a wider net, every registered
route cross-checked against its file, role gating for all 4 roles, and
every API module with a mutation function checked for whether it
actually persists what it creates.

**Two more dead buttons found** (the earlier "dead Pressable" audits
only checked `<Pressable>`, not `<AppButton>` — a real gap in the scan
method itself, not just the app): "Edit Profile" on every profile
screen across all 4 roles, and "+ Create Campus Workspace" in the
workspace-scope switcher. Neither had *any* backing implementation —
there's no `updateProfile` API function anywhere, and guest workspaces
are entirely pre-seeded from `LAUNCH_INSTITUTIONS`, not user-creatable.
Building either for real would mean a new API function and a new form
from scratch, not fixing a data-passing gap — so both now give honest
"not available yet" feedback instead of doing nothing, consistent with
how SSO/Schedule Post were handled earlier.

**A second instance of the "collected but discarded" bug class**,
found by cross-checking every creation modal's form state against its
actual submit payload: `PublishThreadModal`'s "Course Tags" field and
its Thread/Rapid-Fire mode toggle were fully interactive UI with zero
effect on the post that got created. Fixed the same way as sponsored
events/posts — `Post` gained real `courseTags`/`postFormat` fields,
wired through `createPost`, and `PostCard` now shows them (a small tag
row, and a "⚡ Rapid-Fire" badge).

**Two real backend persistence bugs, same class as the
`listConversations` bug fixed earlier this session** — a function
builds and returns a "created" object but never actually stores it
anywhere, so it silently vanishes the moment anything refetches the
list it should appear in:

- **`createListing`** (Marketplace) — built a full listing object,
  returned it, never stored it. Worth noting: this function is never
  actually called from anywhere in the app — there's no "Sell an item"
  button or form in the Marketplace screen at all. Fixed the
  persistence bug regardless (a real correctness issue independent of
  whether a UI exists yet), but did **not** build the missing "sell"
  UI — that's a new feature, not a bug fix, and wasn't asked for.
- **`publishAnnouncement`** (Staff Announcements) — same bug, but this
  one *is* wired to a real, reachable screen, and that screen calls
  `invalidateQueries` immediately after publishing — meaning a staff
  member publishing an announcement would watch it disappear on the
  spot. This was a live, user-visible bug, not a theoretical one.

**Checked and confirmed correct** (no changes needed): routing — every
route registered in all 4 roles' tab bars has a matching file, zero
orphaned screens; the full onboarding chain (8 steps, both student and
alumni paths); role gating (`RoleGate allow=` correct for all 4 roles,
MFA gate and post-login routing logic re-verified); every other
creation modal (`PublishEventModal`, `ApplyForVerificationModal`,
`ShareAcademicFileModal`, `EditShortcutModal`, `MentorCard`) checked
field-by-field against its submit call; 11 of 12 other API modules
with mutation functions (`adminShortcuts`, `connections`, `events`,
`institutions`, `mentorship`, `messaging`, `moderation`,
`notifications`, `posts`, `resources`, `studyGroups`, `verification`)
all correctly persist what they create; `profile.ts`'s `Map`-based
session state (a different but equally valid persistence pattern);
`sendConnectionRequest`'s reliance on local optimistic component state
rather than a persisted list (correct for how its two call sites
actually use it — no bug).

## Bug-fix pass — dead buttons, padding, login clarity

**Deliberate routing change, not a bug fix**: admin now lands on
Platform Config ("Admin Desk") instead of the plain dashboard right
after login/MFA — per explicit request, since that's where the
"Preview As" role switcher lives, and this saves an extra tap to get
there. Changed in exactly one place, `DASHBOARD_BY_ROLE` in
`app/index.tsx` — the regular admin dashboard is still one tap away
via the "Home" tab, nothing else about it changed.

A tester hit a runtime error, repeatable across multiple fresh
extracts: `A navigator cannot contain multiple 'Screen' components
with the same name (found duplicate screen named 'events')` in
`app/(student)/_layout.tsx`. Checked for a literal duplicate
declaration three times and found none — but found something more
useful: **student was the only role in the entire app with a *visible*
Tabs.Screen (with `title`/`tabBarIcon` options) pointing at a route
backed by its own nested directory + `_layout.tsx` (a Stack
navigator)**. Staff and alumni have the identical `events/` directory
structure but register it as `href: null` (hidden), and neither has
ever been reported broken — same for `messages/`, hidden everywhere
it's used. That combination (visible tab options + grouped/nested
route) appears to be what triggers this; `expo export` doesn't
actually execute the navigator at build time, so this class of bug
can't be caught by the typecheck/export checks used throughout this
README's other fixes.

**Fix**: added `app/(student)/events-list.tsx` — a plain leaf file
(matching every other visible tab in the app) rendering the exact same
`CampusEventsScreen`. The visible "Event" tab now points at this file
instead of the `events/` directory. `events/` itself is untouched and
still registered, just hidden (`href: null`, the same safe pattern
`messages/` already uses) — so `EventCard`'s existing
`router.push(`/${roleGroup}/events/${id}`)` for event details still
works unchanged. If this recurs, it's worth checking whether any other
role's tab ever gets a visible directory-backed route in the future.

A tester reported "a lot of buttons not working," inconsistent padding,
and admin features seeming to be missing. Investigated each rather
than guessing:

- **Dead buttons — found and fixed all 8, confirmed zero remain.**
  Wrote a proper scan (not just eyeballing) for every `<Pressable>` in
  the app with no `onPress` handler at all. The biggest one: the
  **header search icon, present on every single screen across every
  role**, was wired to `onPress={() => {}}` — a true no-op. Built a
  real `SearchScreen` (search Posts/Events by text — both APIs already
  supported a `q` param that nothing had ever called) and wired the
  icon to it. Also wired real category-filtering and Latest/Most
  Popular sorting into the Forum tab's previously-decorative Filters
  and Sort buttons. The remaining five (event banner upload, 
  verification-document upload, "Schedule Post," Terms/Privacy links,
  SSO buttons) either got real functionality (the two uploads now use
  `expo-image-picker`, same pattern as onboarding's photo step) or —
  where a real backend would be needed and there isn't one — now give
  honest tap feedback ("not available in this preview") instead of
  silently doing nothing.
- **Padding — found a real, systemic bug across 12 files.** Every
  screen correctly used `ScreenContainer` (which handles horizontal
  padding and the safe-area top inset), but several put their first
  heading directly against `<AppHeader />` with zero vertical spacing,
  while other screens correctly added `paddingVertical`/`marginTop`.
  Affected: all four role dashboards, `platform-config.tsx`,
  `super-admin-config.tsx`, `alumni-hub.tsx`, `resources.tsx`, and three
  components shared across all four roles (`CampusEventsScreen`,
  `CommunityFeedScreen`, `NotificationsList`, `SettingsScreenBase`) —
  all now consistent.
- **Admin settings/role-switcher "missing"**: traced the full
  login → MFA → `RoleGate` → dashboard → profile → settings chain in
  code line by line — it's correctly wired end to end, no bug found.
  The much more likely cause: this app has no real backend, so role is
  decided purely by whether your login email contains "admin"/"staff"/
  "alumni" (else it defaults to student) — and after this session added
  MFA, a admin/staff login now stops on a verification-code screen
  first. Someone who doesn't know either mechanic could easily end up
  in the wrong role's view, or stuck on the MFA screen, and reasonably
  conclude features were missing. Added a plain hint on the login
  screen explaining the email-based role mechanic, and a hint on the
  MFA screen stating outright that any 4+ digit code works — closing
  the likely gap without changing any actual logic.
- **Onboarding screens**: cross-checked every step referenced in
  `src/auth/onboardingSteps.ts` against files on disk for both the
  student chain (8 steps) and alumni chain (8 steps). All 11 unique
  screens exist and are correctly registered in
  `app/(auth)/onboarding/_layout.tsx` — confirmed complete, nothing
  missing.

## Mock data fallback — read this before demoing

**There is no backend yet.** Every function in `src/api/*.ts` tries a real
HTTP call first and, on failure, falls back to realistic fixture data
from `src/api/mockData.ts` (see `src/api/withMockFallback.ts`). This means
the app renders populated, believable screens today, without a server.

- Controlled by `FALL_BACK_TO_MOCKS` in `src/api/config.ts` — it's `true`
  whenever `APP_ENV !== 'production'`. Flip it off once a real backend is
  live and you want failures to surface as real errors instead of
  silently masking them.
- **Actions that mutate data (RSVP, send message, connect, publish
  announcement, resolve report) return a locally-fabricated success
  response when mocked — they don't persist anywhere. Don't mistake a
  successful-looking mock response for confirmation that a real backend
  received anything.
- **Auth is mocked too.** `src/api/auth.ts` has no live backend to call,
  so login/register never actually fail for reachability reasons — they
  fabricate a session. The role is guessed from the email address
  (containing "alumni", "staff", or "admin"; otherwise defaults to
  "student"), so you can preview any of the four dashboards just by what
  you type in the email field. The session (including which role you
  picked) is cached locally via `setSessionUser`/`getSessionUser` in
  `src/auth/tokenStorage.ts`, so reloading the app keeps you signed in —
  swap this for a real `/me` call or JWT decode once a backend exists.
  Logging in as staff/admin additionally lands on a mocked MFA
  challenge first — see "Staff/admin MFA" below.

## Known follow-ups

1. **Run `npx expo install --fix` on a machine with normal network
   access.** This sandbox couldn't reach `api.expo.dev` (only npm/PyPI/
   GitHub-style registries are reachable here), so every package in this
   project was installed via plain `npm install` rather than Expo's
   version-aware installer. Two of those (`react-dom`, `react-native-worklets`)
   initially resolved to versions outside what `expo-modules-core@57`
   accepts as a peer, which caused an `ERESOLVE` error on a clean
   `npm install` — both are now pinned to compatible versions
   (`react-dom` matches `react` exactly; `react-native-worklets` is
   pinned to `^0.10.0`, the highest range `expo-modules-core@57.0.6`
   actually supports) and `npm install` resolves clean with no flags
   needed. Still worth letting the real `expo install` reconcile
   everything once you're off this sandbox, and `npx expo-doctor` is
   worth running at the same time.
2. **SF Pro Display isn't bundled.** It's Apple system property and can't
   be redistributed — iOS uses the system font by default, which *is*
   SF Pro Display/Text, so there's nothing to fix unless you have a
   licensed `.ttf` you want to load explicitly (see the comment in
   `src/theme/useLoadFonts.ts`).
3. **App icons/splash are Expo's generic default placeholders**, copied
   into `assets/images/` just so `app.config.ts` doesn't point at missing
   files. Swap them for real Lioris branding art before building for the
   stores.
4. **`google-services.json` is commented out** in `app.config.ts` under
   `android` — required once you wire up Android push through
   Firebase/FCM.
5. **EAS project ID is a placeholder** (`extra.eas.projectId` in
   `app.config.ts`) — replace it after running `eas build:configure`.
6. **Verified this actually bundles**: `npx tsc --noEmit` passes clean,
   and `npx expo export --platform web` successfully bundles with zero
   import errors — a good sign the native builds will resolve cleanly
   too, though only a real `expo run:ios` / `run:android` on a machine
   with the SDKs installed can fully confirm that.
7. **Known gaps against the PRD, not yet built:**
   - **Accessibility — every `Pressable` labeled; full Section 18.5
     compliance still open.** Touch targets were already correctly
     sized throughout (48dp constant). Real `accessibilityLabel`/
     `accessibilityRole`/`accessibilityState` coverage was added across
     several rounds, prioritized by reach rather than alphabetically,
     and finished with a full sweep: **every `Pressable` in the app —
     44 files, live code and dead code alike — now has a real
     accessible name**, confirmed by grepping every file in `app/` and
     `src/` for `<Pressable` without a matching `accessibilityLabel`
     and getting zero results. That's up from 37 files with no
     coverage at all when this work started. Notable stops along the
     way:
     - **Foundational primitives** (fix once, applies everywhere):
       `AppText` now defaults to `accessibilityRole="button"` whenever
       it's used as a tappable text link (the "Sign Up" / "Resend code"
       / "Sign out" pattern used across dozens of screens);
       `AppButton` always has an accessible name and announces a `busy`
       state while loading; `AppTextField` falls back to `placeholder`
       for its accessible name when the visual `label` is empty (true
       of several auth screens), and announces validation errors via
       `accessibilityLiveRegion`.
     - **Shared components reused across all four roles**: `ChipSelect`
       (10 call sites), `AppHeader` and `ChangeWorkspaceScopeModal`
       (every screen), `ConversationRow`, `PostCard`, `EventCard`,
       `NotificationsList`, `CommunityFeedScreen`, `CampusEventsScreen`,
       `ProfileScreenBase`, `SettingsScreenBase`, `ChatThread` (all four
       roles' message screens), `MonthCalendarGrid`, plus every
       remaining form-style modal (`PublishThreadModal`,
       `PublishEventModal`, `LibraryFilterModal`,
       `DiscussionWorkspacesModal`, `ApplyForVerificationModal`,
       `ShareAcademicFileModal`) and admin surface
       (`LocalHubControlTab`, `platform-config.tsx`,
       `user-directory.tsx` — the latter's user-options menu also got
       refactored onto the shared animated `ActionSheetModal` in the
       process, closing a motion-design gap at the same time).
     - **Every role dashboard** (`app/(student)/dashboard.tsx`,
       `app/(staff)/dashboard.tsx`, `app/(admin)/dashboard.tsx`,
       `app/(alumni)/alumni-hub.tsx`) and both auth screens
       (`login.tsx`, `register.tsx`, plus the onboarding photo-upload
       step) — the first screens any user sees.
     - **What "every Pressable is labeled" does *not* mean**: this
       covers accessible names and selected/checked states for
       interactive controls, which was the concrete, checkable gap.
       It is not the same as full Section 18.5 compliance — screen
       reader focus order, dynamic type/font-scaling support, and
       actual VoiceOver/TalkBack testing on a device were not
       attempted in this sandbox and still need real verification
       before shipping.

## Project structure

```
app/                    expo-router routes (file-based)
  (auth)/                login, register, verification screens
  (student)/             student tab group + nested screens
  (alumni)/               alumni tab group + nested screens
  (staff)/               staff tab group + nested screens
  (admin)/               admin tab group + nested screens
  _layout.tsx            root providers (theme, auth, react-query, fonts)
  index.tsx               role-resolving entry redirect

src/
  theme/                 colors, typography, spacing tokens, ThemeProvider
  auth/                   AuthContext, secure token storage, RoleGate
  api/                    typed API client modules + mock-data fallback
  realtime/               WebSocket client + polling-fallback hook
  notifications/          push registration and deep-link handling
  components/             shared UI (GlassCard, AppButton, EventCard, etc.)
```
