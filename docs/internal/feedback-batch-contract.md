# Shared contract: app feedback batch (fix/app-feedback-batch)

Four agents work in parallel on disjoint files. This file is the ONLY coordination point.
Agent 1 implements everything under "Data layer"; agents 2-4 consume it and must NOT redefine it.
If you need a change to this contract, say so in your final report instead of editing another agent's file.

## Ownership (do not edit files you do not own)

| Agent | Owns |
| --- | --- |
| 1 Data | `src/api/posts.ts`, `src/api/bookmarks.ts` (new), `src/api/types.ts`, `src/utils/resourceBookmarks.ts`, `supabase_posts_features_2026.sql` (new), `supabase_posts_features_2026.md`, `tools/sql-harness/**` |
| 2 Composer/Feed | `src/components/PublishThreadModal.tsx`, `src/components/PostCard.tsx`, `src/components/PostDetailScreen.tsx`, `src/components/CommunityFeedScreen.tsx` |
| 3 Profile/Saved/Mobile | `src/components/ProfileScreenBase.tsx`, `app/(student|alumni|staff|admin)/saved.tsx` (new), `src/components/SavedItemsScreen.tsx` (new), tab bars / nav files, mobile-layout + truncation sweep everywhere EXCEPT files owned by 1, 2 and 4 |
| 4 AI/Modals/Admin | `src/components/AICopilotModal.tsx`, `src/components/ResourceReaderModal.tsx`, `src/components/ResearchPapersModal.tsx`, `src/components/AcademicLibraryModal.tsx`, `src/api/aiCopilot.ts`, `app/(admin)/verification-requests.tsx`, `src/api/verification.ts`, `src/components/ApplyForVerificationModal.tsx` |
| lead (not an agent) | `src/api/portalLinks.ts`, `src/utils/openExternalUrl.ts`, `supabase_portal_links_2026.sql` |

## Data layer contract (Agent 1 implements; everyone else codes against this)

```ts
// src/api/types.ts
export type PostStatus = 'published' | 'draft' | 'scheduled';

export interface PostPoll {
  question: string;
  options: { id: string; label: string; votes: number; isVotedByMe?: boolean }[];
  totalVotes: number;
  /** ISO timestamp when voting closes. Undefined = never closes (legacy rows). */
  closesAt?: string;
  /** Derived client-side from closesAt; true once voting is over. */
  isClosed?: boolean;
}

export interface Post {
  // ...all existing fields unchanged...
  status?: PostStatus;              // undefined is treated as 'published'
  scheduledAt?: string;             // ISO; only meaningful when status === 'scheduled'
  poll?: PostPoll;
  isRepostedByMe?: boolean;
  isBookmarkedByMe?: boolean;
  /** Set only on rows returned because the viewer reposted them (profile feed). */
  repostOf?: { originalPostId: string; repostedAt: string };
}
```

```ts
// src/api/posts.ts
export interface CreatePostPayload {
  // ...existing...
  status?: PostStatus;         // default 'published'
  scheduledAt?: string;        // ISO; required when status === 'scheduled', must be in the future
  pollQuestion?: string;
  pollOptions?: string[];
  pollDurationHours?: number;  // 1..720 (30 days). Default 24. Ignored when there is no poll.
}

/** Published posts authored by the user PLUS posts they reposted (repostOf set). Never drafts/scheduled. */
export function listMyPosts(userId?: string): Promise<Post[]>;
/** The signed-in user's own drafts, newest first. */
export function listMyDrafts(): Promise<Post[]>;
/** The signed-in user's own scheduled posts that have not gone live yet. */
export function listMyScheduled(): Promise<Post[]>;
/** Turns a draft/scheduled post into a live post immediately. */
export function publishDraft(postId: string): Promise<Post>;
/** Reschedules a scheduled post. */
export function reschedulePost(postId: string, scheduledAt: string): Promise<Post>;
/** THROWS a user-facing Error when the delete did not happen (e.g. RLS refused). */
export function deletePost(postId: string): Promise<void>;
/** Casting again changes the vote; same option twice removes it. Returns the new poll. Throws if closed. */
export function voteOnPoll(postId: string, optionId: string): Promise<PostPoll>;
/** Returns the new reposted state + count. Idempotent. */
export function togglePostRepost(postId: string, reposted: boolean): Promise<{ reposted: boolean; count: number }>;
```

```ts
// src/api/bookmarks.ts  (NEW - one saved/bookmark store for every kind of item)
export type SavedKind = 'post' | 'resource' | 'event' | 'job';
export interface SavedItem {
  id: string;            // row id
  kind: SavedKind;
  itemId: string;
  savedAt: string;
  title: string;         // denormalised for the list
  subtitle?: string;
  imageUrl?: string;
}
export function listSavedItems(kind?: SavedKind): Promise<SavedItem[]>;
export function isItemSaved(kind: SavedKind, itemId: string): Promise<boolean>;
export function toggleSavedItem(kind: SavedKind, itemId: string, saved: boolean, meta?: { title?: string; subtitle?: string; imageUrl?: string }): Promise<boolean>;
/** React Query key factory so every screen invalidates the same cache. */
export const SAVED_ITEMS_KEY: (kind?: SavedKind) => (string | undefined)[];
```

Agent 1 also writes the DB side: `post_reposts`, `saved_items`, `posts.status`, `posts.scheduled_at`,
`posts.poll_closes_at` (or inside `poll_data`), and the RLS for them, in `supabase_posts_features_2026.sql`.

## Global UI rules (every agent)

1. **No truncation.** Do not add `numberOfLines`, `ellipsizeMode`, or CSS `textOverflow: ellipsis`
   to user-facing content, labels, buttons, placeholders, modal titles or list rows. Remove the ones you
   find in files you own and let the text wrap (`flexShrink: 1`, `flexWrap: 'wrap'`, multi-line rows).
   The one acceptable exception is a single-line preview of a long free-text body in a dense list row,
   and only if the full text is reachable one tap away - say so in your report if you keep any.
2. **Mobile first.** Every screen you touch must be checked at 375x812. No horizontal scrolling,
   no clipped buttons, tap targets >= 44px, headers that wrap instead of cutting off.
3. Match the existing code style (the repo mixes 1-space and 2-space indentation per file - follow the file).
4. `npx tsc --noEmit` and `npx eslint <your files> --quiet` must be clean before you finish.
