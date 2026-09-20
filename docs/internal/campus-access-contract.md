# Shared contract: campus access control (branch fix/app-feedback-batch)

Four agents in parallel. This file is the ONLY coordination point. Read
`docs/security/campus-access-control.md` first - it is the approved plan and explains WHY.

## Scale (measured on production 2026-09-20 - this is a PRE-LAUNCH app)
12 users on real campuses: 4 unverified students, 2 pending students, 2 verified students,
1 verified alumni, 1 verified staff, **2 UNVERIFIED ADMINS**. Storage: 1 file in `resources`,
3 in `campus-media`, 3 in `avatars`.

Consequences: no grace period, no comms campaign, no dark launch. The wall ships ENABLED.
The data migration is trivial. **Two admins are unverified, so any rule that walls admins
locks the owner out of his own platform** - the admin/staff short-circuit is load-bearing.

## Ownership (do not edit files you do not own)

| Agent | Owns |
| --- | --- |
| 1 SQL | `supabase_campus_access_2026.sql` + `.md` (new), `tools/sql-harness/**` |
| 2 Storage client | `src/api/storage.ts`, `src/api/signedUrls.ts` (new), `src/api/resources.ts`, media-URL mapping in `src/api/posts.ts` / `events.ts` / `marketplace.ts`, `src/components/{ResourceCard,ResourceReaderModal,ImageViewerModal,MarketplaceItemCard,SellItemModal,ShareAcademicFileModal}.tsx` |
| 3 Wall UX | `src/components/CampusLockedCard.tsx` (new), `src/components/{PostCard,CommunityFeedScreen,PostDetailScreen,CampusEventsScreen,EventCard,EventDetailScreen}.tsx`, `src/hooks/useViewScope.ts`, `src/hooks/useCampusScope.ts`, `src/api/campusAccess.ts` (new) |
| 4 Verification | `src/api/verification.ts`, `src/components/ApplyForVerificationModal.tsx`, `app/(admin)/verification-requests.tsx`, `app/(auth)/verify-*.tsx`, `src/components/OnboardingVerificationStep.tsx` |

Nobody else touches `src/api/types.ts` except Agent 1 (additive only).

## Contract

### Agent 1 provides (SQL)
```sql
public.campus_wall_enabled() returns boolean   -- reads platform_settings key 'campus_wall'; DEFAULT TRUE
public.auth_campus_access()  returns text      -- caller's entitled campus code, or NULL
public.auth_is_verified_member() returns boolean
```
Rules baked into `auth_campus_access()`: admin/staff always get their campus; verified users get
their campus; everyone else gets NULL; when the wall is disabled everyone gets their campus.

### Agent 2 provides (client)
```ts
// src/api/signedUrls.ts
export type PrivateBucket = 'resources' | 'campus-media';
/** Resolves a stored object PATH to a usable URL. Caches until shortly before expiry. */
export function resolveMediaUrl(bucket: PrivateBucket, path: string | null | undefined): Promise<string | null>;
export function useSignedUrl(bucket: PrivateBucket, path: string | null | undefined): { url: string | null; loading: boolean; error: string | null };
/** True for a legacy absolute public URL that predates privatisation. */
export function isLegacyPublicUrl(value: string): boolean;
```
`avatars` stays PUBLIC - do not sign avatars.

### Agent 3 provides (client)
```ts
// src/api/campusAccess.ts
export interface CampusAccess { hasCampusAccess: boolean; campusCode: string | null; reason: 'verified' | 'admin' | 'staff' | 'unverified' | 'pending' | 'rejected' | 'no-campus'; }
export function useCampusAccess(): CampusAccess & { isLoading: boolean };
```
`<CampusLockedCard reason={...} campusName={...} onVerify={...} />` is the single locked-state UI.

## Rules for everyone
1. **RLS is the boundary; the client only explains.** Never present a client-side filter as the
   security control. Every restriction must already be true in the database.
2. **Never wall admin or staff.** Two admins are unverified today.
3. No truncation (`numberOfLines` on content/labels/placeholders), mobile-first at 375x812,
   tap targets >= 44px - same rules as the previous batch.
4. `npx tsc --noEmit` and `npx eslint <your files> --quiet` clean before you finish.
5. Write files EARLY and INCREMENTALLY; a usage limit may interrupt you.
6. Do NOT git commit/push, do NOT run `npm install`, do NOT run the supabase CLI against the cloud.
