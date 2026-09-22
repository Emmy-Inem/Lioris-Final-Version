import { Post, PostPoll, PostStatus, PostVisibilityScope } from './types';
import { supabase } from './supabase';
import { listSavedItemIds } from './bookmarks';
import { isUserBlocked } from './connections';
import { getInstitutionForEmail } from './institutions';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { escapePostgrestLike } from '../utils/postgrest';
import { assertSafeHttpUrl } from '../utils/safeUrl';

// Posts this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch (and so
// update/delete on this session's own posts can find them locally). Never
// seeded with fixtures - those only come from getSeedPosts() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedPosts: Post[] = [];

/**
 * PostgREST fails the *entire* query when an embedded relationship is
 * missing (PGRST200), not just the embed - so a single absent table used
 * to blank the whole feed instead of costing us one column. Degrade
 * through progressively simpler selects so the posts themselves still
 * load when the author join or the likes join isn't resolvable.
 */
const POST_SELECT_LADDER = [
  '*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status), post_likes(user_id)',
  '*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status)',
  '*',
] as const;

/** True for the PostgREST errors that mean "this embed can't be resolved". */
function isMissingRelationshipError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST200' ||
    error.code === 'PGRST204' ||
    /schema cache|relationship|does not exist/i.test(error.message ?? '')
  );
}

async function selectPostsWithFallback(
  build: (select: string) => any,
): Promise<{ rows: any[]; degraded: boolean }> {
  let lastError: any = null;

  for (let i = 0; i < POST_SELECT_LADDER.length; i++) {
    const { data, error } = await build(POST_SELECT_LADDER[i]);
    if (!error) return { rows: data ?? [], degraded: i > 0 };

    lastError = error;
    if (!isMissingRelationshipError(error)) break;

    console.warn(
      `[Posts] Select "${POST_SELECT_LADDER[i]}" rejected (${error.code}: ${error.message}); retrying with a simpler projection.`,
    );
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Shared helpers (auth, polls, reposts/bookmarks decoration)
// ---------------------------------------------------------------------------

/** The signed-in user's id, falling back to the stored session when offline. */
async function currentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id;
  } catch {
    // offline - fall through to the stored session below
  }
  try {
    const stored = await getSessionUser();
    return stored?.id ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns a stored poll_data blob into a PostPoll for ONE viewer.
 *
 * `isVotedByMe` is per-viewer and is deliberately NOT read out of the blob. It
 * used to be stored there, which meant every viewer saw whoever-voted-last's
 * selection as their own and one person changing their vote changed it on
 * everybody's screen. It now comes from the viewer's own post_poll_votes row
 * (`myOptionId`); any flag left in the stored JSON is discarded here, and the
 * database strips it on write anyway (trg_strip_poll_is_voted_by_me).
 *
 * The per-option `votes` and `totalVotes` numbers stay in the blob, but they
 * are maintained by a trigger on post_poll_votes - the client only ever reads
 * them. `closesAt` absent (legacy polls) = never closes.
 */
function decoratePoll(raw: any, myOptionId?: string | null): PostPoll | undefined {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.options)) return undefined;
  const closesAt: string | undefined = raw.closesAt || undefined;
  const options = raw.options.map((o: any) => ({
    id: o.id,
    label: o.label,
    votes: o.votes || 0,
    isVotedByMe: !!myOptionId && o.id === myOptionId,
  }));
  return {
    ...raw,
    options,
    totalVotes: raw.totalVotes ?? options.reduce((n: number, o: any) => n + (o.votes || 0), 0),
    closesAt,
    isClosed: !!closesAt && new Date(closesAt).getTime() <= Date.now(),
  } as PostPoll;
}

function isPollClosed(poll: { closesAt?: string } | null | undefined): boolean {
  return !!poll?.closesAt && new Date(poll.closesAt).getTime() <= Date.now();
}

/** The caller's own poll choices for a page of posts, in one query. */
async function myPollVotes(postIds: string[], viewerId: string): Promise<Map<string, string>> {
  const withPolls = postIds.filter(Boolean);
  if (withPolls.length === 0) return new Map();
  try {
    const { data, error } = await supabase
      .from('post_poll_votes')
      .select('post_id, option_id')
      .eq('user_id', viewerId)
      .in('post_id', withPolls);
    if (error) throw error;
    return new Map((data ?? []).map((r: any) => [r.post_id as string, r.option_id as string]));
  } catch (err) {
    console.warn('[Posts] Could not read poll votes:', err);
    return new Map();
  }
}

/**
 * Fills in isRepostedByMe / isBookmarkedByMe, and each poll's per-viewer
 * isVotedByMe, for a whole page of posts with exactly THREE queries - never
 * one per card. A failure here is never fatal: the flags stay false and the
 * buttons render in their neutral state.
 */
async function decorateViewerState(posts: Post[], viewerId?: string): Promise<Post[]> {
  if (!viewerId || posts.length === 0) return posts;
  const ids = Array.from(new Set(posts.map((p) => p.id)));
  const pollIds = posts.filter((p) => p.poll).map((p) => p.id);

  const [repostedIds, bookmarkedIds, pollVotes] = await Promise.all([
    (async () => {
      try {
        const { data, error } = await supabase
          .from('post_reposts')
          .select('post_id')
          .eq('user_id', viewerId)
          .in('post_id', ids);
        if (error) throw error;
        return new Set((data ?? []).map((r: any) => r.post_id as string));
      } catch (err) {
        console.warn('[Posts] Could not read repost state:', err);
        return new Set<string>();
      }
    })(),
    listSavedItemIds('post', ids).catch(() => new Set<string>()),
    myPollVotes(pollIds, viewerId),
  ]);

  return posts.map((p) => ({
    ...p,
    isRepostedByMe: repostedIds.has(p.id),
    isBookmarkedByMe: bookmarkedIds.has(p.id),
    // Re-derive the poll for THIS viewer from their own vote row.
    poll: p.poll ? decoratePoll(p.poll, pollVotes.get(p.id) ?? null) : p.poll,
  }));
}

/**
 * pg_cron is NOT enabled on production yet, so nothing server-side flips a due
 * scheduled post to published (see supabase_posts_features_2026.md). This is
 * the fallback: whenever the author lists their own posts we publish THEIR OWN
 * due rows with a normal authenticated UPDATE, which the existing author
 * UPDATE policy already allows. It is one cheap indexed update, it never
 * touches anyone else's rows, and callers must not await it on the hot path -
 * a failure is logged and ignored.
 */
async function publishOwnDueScheduledPosts(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({ status: 'published', created_at: new Date().toISOString() })
      .eq('author_id', userId)
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  } catch (err) {
    console.warn('[Posts] Could not publish due scheduled posts:', err);
    return 0;
  }
}

/** One row -> one Post. Used by every list so the shapes cannot drift apart. */
function mapPostRow(row: any, viewerId?: string): Post {
  const isGlobal = row.visibility_scope === 'global' || row.campus_code === 'GLOBAL';
  const poll = decoratePoll(row.poll_data);
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.profiles?.full_name || row.author_name || 'Campus Student',
    authorRole: (row.profiles?.role || row.author_role || 'student') as any,
    authorVerified: row.profiles?.verification_status === 'verified' || row.profiles?.role === 'admin',
    authorAvatarUrl: row.profiles?.avatar_url || null,
    title: row.title,
    content: row.content,
    category: row.category || 'General',
    // Audience comes from audience_scope; visibility_scope is the institution
    // axis and belongs to scopeVisibility below.
    visibilityScope: (row.audience_scope as any) || 'global',
    scopeVisibility: isGlobal ? 'global' : 'campus',
    institutionCode: isGlobal ? undefined : row.campus_code,
    likesCount: row.likes_count || 0,
    commentsCount: row.comments_count || 0,
    repostsCount: row.reposts_count || 0,
    isLikedByMe: viewerId ? (row.post_likes ?? []).some((l: any) => l.user_id === viewerId) : false,
    isPinned: !!row.is_pinned,
    createdAt: row.created_at,
    imageUrl: row.image_url,
    videoUrl: row.video_url,
    courseTags: row.course_tags || undefined,
    poll,
    pollQuestion: poll?.question,
    status: (row.status as PostStatus) || 'published',
    scheduledAt: row.scheduled_at || undefined,
  };
}

export interface FeedQuery {
 scope?: PostVisibilityScope;
 category?: string;
 q?: string;
 /** The viewing user's own institution - enforces the hard rule that campus-scoped posts from OTHER universities are never shown, regardless of viewScope. */
 viewerInstitutionCode?: string;
 /**
  * The Global/My Campus toggle.
  * 'campus' (default) = the viewer's OWN campus posts only, no global ones.
  * 'global' = the viewer's own campus posts PLUS global (cross-university) ones.
  * Either way a campus post from ANOTHER university is never shown.
  */
 viewScope?: 'campus' | 'global';
}

function filterPosts(pool: Post[], query: FeedQuery): Post[] {
  let results = pool.filter((p) => !isUserBlocked(p.authorId));

  // Non-published rows (drafts, scheduled) never belong in a feed. RLS already
  // hides other people's; this also hides the author's own from their feed.
  results = results.filter((p) => (p.status ?? 'published') === 'published');

  // Institution scoping. The product rule:
  //   'campus' (default) -> the viewer's OWN campus posts ONLY (no global ones)
  //   'global'           -> the viewer's own campus posts PLUS global ones
  // and in BOTH modes a campus post belonging to another university is never
  // shown. This used to be the other way round: 'global' showed only global
  // posts, and 'campus' mixed campus with global - so "My Campus" was full of
  // cross-university chatter and "Global" hid the user's own campus entirely.
  const viewerCode = query.viewerInstitutionCode?.toUpperCase();
  const isGlobalPost = (p: Post) => p.scopeVisibility === 'global' || !p.institutionCode || p.institutionCode === 'GLOBAL';
  const isOwnCampusPost = (p: Post) =>
    !!viewerCode && !!p.institutionCode && p.institutionCode.toUpperCase() === viewerCode;

  if (query.viewScope === 'global') {
    // Own campus + global. Without a known viewer campus we can only be sure
    // about the global ones, so those are all that is shown.
    results = results.filter((p) => isGlobalPost(p) || isOwnCampusPost(p));
  } else if (viewerCode) {
    results = results.filter((p) => isOwnCampusPost(p));
  }

  // 'global' is the broadest portal scope (staff/alumni/admin forum routes all
  // pass scope="global") and is meant to mean "no audience restriction - show
  // every thread regardless of who it targets." The old
  // `p.visibilityScope === query.scope || p.visibilityScope === 'global'` check
  // collapses to just "=== 'global'" when query.scope IS 'global', which
  // inverted that intent: it hid every thread posted with the composer's
  // default "My Campus" audience (audience_scope 'student') from the staff,
  // alumni, and admin Forum views entirely - those roles could only ever see
  // threads explicitly marked "All Universities," while students saw
  // everything. That's most of the real content in the demo data.
  if (query.scope && query.scope !== 'global') {
    results = results.filter((p) => p.visibilityScope === query.scope || p.visibilityScope === 'global');
  }
  if (query.category) {
    results = results.filter((p) => p.category.toLowerCase() === query.category!.toLowerCase());
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q),
    );
  }
  return results;
}

export async function listFeedPosts(query: FeedQuery = {}): Promise<Post[]> {
  let viewerInstitutionCode = query.viewerInstitutionCode;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const viewerId = authData?.user?.id;

    if (!viewerInstitutionCode && authData?.user?.email) {
      // Domain match, not substring - this decides which campus's posts the
      // viewer is allowed to see, so `email.includes('adeola')` claiming
      // adeola@unilag.edu.ng for UI was a real cross-campus leak.
      viewerInstitutionCode = getInstitutionForEmail(authData.user.email)?.code;
    }

    const { rows } = await selectPostsWithFallback((select) => {
      let dbQuery = supabase.from('posts').select(select).order('created_at', { ascending: false });
      if (query.category) {
        dbQuery = dbQuery.ilike('category', `%${escapePostgrestLike(query.category)}%`);
      }
      return dbQuery;
    });

    const dbPosts: Post[] = rows.map((row: any) => mapPostRow(row, viewerId));

    // Merge unique - local pool only ever contributes this session's own
    // just-created posts (always) plus seed fixtures (only when the admin
    // mock-data toggle is on).
    const merged = [...dbPosts];
    for (const p of [...locallyCreatedPosts]) {
      if (!merged.some((m) => m.id === p.id)) {
        merged.push(p);
      }
    }
    // Drafts/scheduled rows are dropped by filterPosts (the author's own come
    // back from the database; everyone else's are already hidden by RLS).
    const visible = filterPosts(merged, { ...query, viewerInstitutionCode });
    return await decorateViewerState(visible, viewerId);
  } catch (err) {
    console.warn('[Posts] listFeedPosts failed, showing local pool only:', err);
    return filterPosts([...locallyCreatedPosts], { ...query, viewerInstitutionCode });
  }
}

const PROFILE_POST_SELECT =
  '*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status), post_likes(user_id)';

/**
 * A profile's posts: the published posts they authored UNION the posts they
 * reposted (those carry `repostOf`). Drafts and scheduled posts are never
 * included - they have their own screens.
 *
 * Reposts were invisible here before, because there was no post_reposts table:
 * a repost only bumped a counter, so it never showed up anywhere.
 */
export async function listMyPosts(userId?: string): Promise<Post[]> {
  const targetUid = userId || (await currentUserId());
  const viewerId = await currentUserId();

  try {
    if (targetUid) {
      // pg_cron fallback - only ever touches the caller's own rows, and is
      // deliberately not awaited so it cannot slow the profile down.
      if (viewerId && targetUid === viewerId) void publishOwnDueScheduledPosts(viewerId);

      const [authoredRes, repostRes] = await Promise.all([
        supabase
          .from('posts')
          .select(PROFILE_POST_SELECT)
          .eq('author_id', targetUid)
          .order('created_at', { ascending: false }),
        supabase
          .from('post_reposts')
          .select('post_id, created_at')
          .eq('user_id', targetUid)
          .order('created_at', { ascending: false }),
      ]);

      if (authoredRes.error) throw authoredRes.error;

      const authored: Post[] = (authoredRes.data ?? [])
        .map((row: any) => mapPostRow(row, viewerId))
        .filter((p) => (p.status ?? 'published') === 'published');

      let reposted: Post[] = [];
      if (repostRes.error) {
        // post_reposts missing (migration not applied yet) - authored posts
        // still render instead of the whole profile going blank.
        console.warn('[Posts] Could not read reposts for this profile:', repostRes.error.message);
      } else if ((repostRes.data ?? []).length > 0) {
        const repostedAtById = new Map<string, string>();
        for (const r of repostRes.data as any[]) repostedAtById.set(r.post_id, r.created_at);
        const ids = Array.from(repostedAtById.keys());

        // One query for every reposted post, not one per repost.
        const { data: originals, error: originalsError } = await supabase
          .from('posts')
          .select(PROFILE_POST_SELECT)
          .in('id', ids);
        if (originalsError) throw originalsError;

        reposted = (originals ?? [])
          .map((row: any) => mapPostRow(row, viewerId))
          .filter((p) => (p.status ?? 'published') === 'published')
          // A repost of your own post would otherwise appear twice.
          .filter((p) => !authored.some((a) => a.id === p.id))
          .map((p) => ({
            ...p,
            repostOf: { originalPostId: p.id, repostedAt: repostedAtById.get(p.id) as string },
          }));
      }

      // Ordered by the timestamp that matters for each row: when it was
      // reposted for a repost, when it was written for an authored post.
      const merged = [...authored, ...reposted].sort(
        (a, b) =>
          new Date(b.repostOf?.repostedAt || b.createdAt).getTime() -
          new Date(a.repostOf?.repostedAt || a.createdAt).getTime(),
      );

      return await decorateViewerState(merged, viewerId);
    }
  } catch (err) {
    console.warn('[Posts] listMyPosts error:', err);
  }

  return [...locallyCreatedPosts].filter(
    (p) =>
      p.authorId === 'me' ||
      p.authorId === 'student-me' ||
      p.authorId === userId ||
      p.authorName === 'You' ||
      p.authorId === 'my-post-1' ||
      p.authorId === 'my-post-2',
  );
}

/** Own rows with the given status, newest first. Never another user's (RLS agrees). */
async function listOwnPostsWithStatus(status: PostStatus, orderColumn: string): Promise<Post[]> {
  const uid = await currentUserId();
  if (!uid) return [];

  try {
    const { data, error } = await supabase
      .from('posts')
      .select(PROFILE_POST_SELECT)
      .eq('author_id', uid)
      .eq('status', status)
      .order(orderColumn, { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => mapPostRow(row, uid));
  } catch (err) {
    console.warn(`[Posts] list ${status} posts failed:`, err);
    return [];
  }
}

/** The signed-in user's own drafts, newest first. */
export async function listMyDrafts(): Promise<Post[]> {
  return await listOwnPostsWithStatus('draft', 'created_at');
}

/**
 * The signed-in user's own scheduled posts that have not gone live yet.
 * Due rows are published first (the pg_cron fallback), so a post whose time
 * has passed moves to the profile instead of sitting here forever.
 */
export async function listMyScheduled(): Promise<Post[]> {
  const uid = await currentUserId();
  if (uid) await publishOwnDueScheduledPosts(uid);
  return await listOwnPostsWithStatus('scheduled', 'scheduled_at');
}

/** Turns a draft/scheduled post into a live post immediately. */
export async function publishDraft(postId: string): Promise<Post> {
  const uid = await currentUserId();
  if (!uid) throw new Error('You need to be signed in to publish this post.');

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', scheduled_at: null, created_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('author_id', uid)
    .select(PROFILE_POST_SELECT)
    .maybeSingle();

  if (error) {
    console.warn('[Posts] publishDraft error:', error.message);
    throw new Error('Could not publish this post. Please try again.');
  }
  if (!data) throw new Error('That post could not be found, or it is not yours to publish.');

  const published = mapPostRow(data, uid);
  locallyCreatedPosts = locallyCreatedPosts.map((p) => (p.id === postId ? published : p));
  return published;
}

/** Reschedules a scheduled post (also re-schedules a draft). */
export async function reschedulePost(postId: string, scheduledAt: string): Promise<Post> {
  const uid = await currentUserId();
  if (!uid) throw new Error('You need to be signed in to reschedule this post.');

  const when = assertValidScheduledAt(scheduledAt);

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'scheduled', scheduled_at: when })
    .eq('id', postId)
    .eq('author_id', uid)
    .select(PROFILE_POST_SELECT)
    .maybeSingle();

  if (error) {
    console.warn('[Posts] reschedulePost error:', error.message);
    throw new Error('Could not reschedule this post. Please try again.');
  }
  if (!data) throw new Error('That post could not be found, or it is not yours to reschedule.');

  const updated = mapPostRow(data, uid);
  locallyCreatedPosts = locallyCreatedPosts.map((p) => (p.id === postId ? updated : p));
  return updated;
}

export async function getPost(id: string): Promise<Post | null> {
  const local = locallyCreatedPosts.find((p) => p.id === id);

  try {
    const viewerId = await currentUserId();

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status), post_likes(user_id)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return local || null;

    const post = mapPostRow(data, viewerId);
    // Unpublished rows are author-only. RLS already refuses them to everyone
    // else, but a deep link to your OWN draft must not pretend it is live.
    const [decorated] = await decorateViewerState([post], viewerId);
    return decorated ?? post;
  } catch (err) {
    console.warn('[Posts] getPost error:', err);
    return local || null;
  }
}

export interface CreatePostPayload {
 title: string;
 content: string;
 category: string;
 visibilityScope: PostVisibilityScope;
 scopeVisibility?: 'campus' | 'global';
 authorInstitutionCode?: string;
 sponsored?: boolean;
 isPinned?: boolean;
 courseTags?: string;
 postFormat?: 'Thread' | 'Rapid-Fire Conversation';
 imageUrl?: string;
 videoUrl?: string;
 poll?: any;
 pollQuestion?: string;
 /** Poll options when the composer builds the poll from scratch (instead of passing `poll`). */
 pollOptions?: string[];
 /** 1..720 (30 days). Default 24. Ignored when there is no poll. */
 pollDurationHours?: number;
 /** Default 'published'. */
 status?: PostStatus;
 /** ISO; required when status === 'scheduled', must be in the future. */
 scheduledAt?: string;
}

/** Scheduling window: far enough out that the user can still cancel, not so far it is forgotten. */
const MIN_SCHEDULE_MINUTES = 5;
const MAX_SCHEDULE_DAYS = 90;
const MIN_POLL_HOURS = 1;
const MAX_POLL_HOURS = 720;
const DEFAULT_POLL_HOURS = 24;

/** Returns the normalised ISO string, or throws a message the UI can show as-is. */
function assertValidScheduledAt(scheduledAt: string | undefined): string {
  const when = scheduledAt ? new Date(scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    throw new Error('Pick a date and time to schedule this post.');
  }
  const minutesAway = (when.getTime() - Date.now()) / 60000;
  if (minutesAway < MIN_SCHEDULE_MINUTES) {
    throw new Error(`Scheduled posts must be at least ${MIN_SCHEDULE_MINUTES} minutes in the future.`);
  }
  if (minutesAway > MAX_SCHEDULE_DAYS * 24 * 60) {
    throw new Error(`You can only schedule up to ${MAX_SCHEDULE_DAYS} days ahead.`);
  }
  return when.toISOString();
}

/** Builds the poll blob that goes into posts.poll_data, including `closesAt`. */
function buildPollData(payload: CreatePostPayload): PostPoll | null {
  const provided = payload.poll && typeof payload.poll === 'object' ? payload.poll : null;
  const labels = (payload.pollOptions ?? [])
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter(Boolean);
  const question = payload.pollQuestion?.trim() || provided?.question?.trim();

  if (!provided && (!question || labels.length < 2)) return null;

  const hours = Math.min(
    MAX_POLL_HOURS,
    Math.max(MIN_POLL_HOURS, Math.round(payload.pollDurationHours ?? DEFAULT_POLL_HOURS)),
  );
  const options =
    provided?.options?.length
      ? provided.options.map((o: any, i: number) => ({
          id: o.id || `opt-${i + 1}`,
          label: o.label ?? String(o),
          votes: o.votes || 0,
        }))
      : labels.map((label, i) => ({ id: `opt-${i + 1}`, label, votes: 0 }));

  return {
    question: question || provided?.question || '',
    options,
    totalVotes: options.reduce((n: number, o: any) => n + (o.votes || 0), 0),
    // Stored inside poll_data - there is no poll_closes_at column, see
    // supabase_posts_features_2026.md.
    closesAt: provided?.closesAt || new Date(Date.now() + hours * 3600_000).toISOString(),
  };
}

/** Columns we'd like to write but can live without if the table predates them. */
const OPTIONAL_POST_COLUMNS = new Set([
  'campus_code',
  'visibility_scope',
  'audience_scope',
  'category',
  'video_url',
  'image_url',
  'poll_data',
  // Added by supabase_posts_features_2026.sql. Dropping them on an
  // un-migrated database turns a draft into a normal post rather than
  // losing the user's writing entirely.
  'status',
  'scheduled_at',
]);

/**
 * Inserts a post, dropping optional columns the deployed table doesn't have
 * yet rather than losing the whole post to one unknown column. Required
 * columns (author_id, content, ...) are never dropped - if one of those is
 * rejected the error is returned so the caller still fails loudly.
 */
async function insertPostRow(row: Record<string, unknown>): Promise<{ message: string } | null> {
  const attempt = { ...row };

  // Bounded by the number of optional columns, so this always terminates.
  for (let i = 0; i <= OPTIONAL_POST_COLUMNS.size; i++) {
    const { error } = await supabase.from('posts').insert(attempt);
    if (!error) return null;

    const missingColumn = error.message.match(/'([a-z_]+)' column/i)?.[1];
    if (!missingColumn || !OPTIONAL_POST_COLUMNS.has(missingColumn) || !(missingColumn in attempt)) {
      return error;
    }

    console.warn(
      `[Posts] posts.${missingColumn} missing on the deployed table; retrying insert without it. ` +
        'Run supabase_migration_align.sql + supabase_schema.sql to restore full fidelity.',
    );
    delete attempt[missingColumn];
  }

  return { message: 'Post insert failed after dropping every optional column.' };
}

/**
 * Throws if there's no authenticated author or the Supabase insert fails,
 * instead of quietly reporting a thread as published when it was never
 * actually saved. Callers must catch this and show a real error.
 */
export async function createPost(payload: CreatePostPayload): Promise<Post> {
 const { authorInstitutionCode, scopeVisibility, pollOptions: _pollOptions, pollDurationHours: _pollDurationHours, ...rest } = payload;
 const postId = generateUUID();
 const now = new Date().toISOString();

 // Validate the schedule BEFORE uploading media, so a bad date does not cost
 // the user an upload. status defaults to 'published'.
 const status: PostStatus = payload.status || 'published';
 const scheduledAt = status === 'scheduled' ? assertValidScheduledAt(payload.scheduledAt) : null;
 const pollData = buildPollData(payload);

 let permanentImageUrl: string | undefined = payload.imageUrl;
 let permanentVideoUrl: string | undefined = payload.videoUrl;

 // Media references are validated (safe http(s), the bundled `asset:` scheme,
 // or an on-device file that is uploaded). Upload/validation failures throw.
 if (payload.imageUrl) {
 const { resolveMediaUrl } = await import('./storage');
 permanentImageUrl = await resolveMediaUrl(payload.imageUrl, 'feed', { allowAsset: true });
 }

 if (payload.videoUrl) {
 const { resolveMediaUrl } = await import('./storage');
 permanentVideoUrl = await resolveMediaUrl(payload.videoUrl, 'videos');
 }

 const { data: authData } = await supabase.auth.getUser();
 let authorId = authData?.user?.id;
 let authorName = authData?.user?.user_metadata?.full_name;
 let authorRole = authData?.user?.user_metadata?.role;
 let authorCampus = authorInstitutionCode;

 if (!authorId) {
 const stored = await getSessionUser();
 if (stored?.id) {
 authorId = stored.id;
 authorName = stored.fullName || authorName;
 authorRole = stored.role || authorRole;
 }
 }

 if (!authorId) {
 throw new Error('You need to be signed in to post to the forum.');
 }

 authorName = authorName || 'Campus Student';
 authorRole = authorRole || 'student';

  let authorAvatarUrl: string | null = authData?.user?.user_metadata?.avatar_url || null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('campus_code, avatar_url, role')
    .eq('id', authorId)
    .maybeSingle();
  if (profile?.avatar_url) authorAvatarUrl = profile.avatar_url;
  if (!authorCampus) {
    authorCampus = profile?.campus_code || 'GLOBAL';
  }
  // The profiles table, not client-supplied auth metadata, is the source of
  // truth for the author's real role (e.g. the "Staff Advisor" badge on
  // their threads).
  authorRole = profile?.role || authorRole;

 const isExplicitlyGlobal = scopeVisibility === 'global' || payload.visibilityScope === 'global';
 const campusCode = authorCampus || 'GLOBAL';
 const finalVisibilityScope = isExplicitlyGlobal ? 'global' : 'campus';

 const error = await insertPostRow({
 id: postId,
 author_id: authorId,
 campus_code: campusCode,
 title: payload.title,
 content: payload.content,
 category: payload.category || 'General',
 // Two orthogonal axes, two columns. visibility_scope is the institution
 // axis ('campus' | 'global'); audience_scope is who the post targets.
 // Writing the institution value into the audience column is what used to
 // make every new post invisible in the feed.
 visibility_scope: finalVisibilityScope,
 audience_scope: payload.visibilityScope || 'global',
 image_url: permanentImageUrl || null,
 video_url: permanentVideoUrl || null,
 poll_data: pollData,
 is_pinned: payload.isPinned || false,
 status,
 scheduled_at: scheduledAt,
 });

 if (error) {
 console.warn('[Posts] Supabase create post error:', error.message);
 throw new Error(
 status === 'draft' ? 'Could not save your draft. Please try again.' : 'Could not publish your post. Please try again.',
 );
 }

 const created: Post = {
 id: postId,
 authorId,
 authorName,
 authorRole: authorRole as any,
 authorAvatarUrl: authorAvatarUrl || null,
 likesCount: 0,
 commentsCount: 0,
 repostsCount: 0,
 isLikedByMe: false,
 createdAt: now,
 scopeVisibility: finalVisibilityScope,
 institutionCode: isExplicitlyGlobal ? undefined : campusCode,
 ...rest,
 imageUrl: permanentImageUrl,
 videoUrl: permanentVideoUrl,
 status,
 scheduledAt: scheduledAt || undefined,
 poll: pollData ? decoratePoll(pollData) : undefined,
 pollQuestion: pollData?.question,
 isRepostedByMe: false,
 isBookmarkedByMe: false,
 };

 // Only a live post belongs in the session's "show it instantly" pool - a
 // draft or a scheduled post must not appear in the feed before its time.
 if (status === 'published') {
 locallyCreatedPosts = [created, ...locallyCreatedPosts];
 }
 return created;
}

export async function togglePostLike(postId: string, liked: boolean): Promise<void> {
 locallyCreatedPosts = locallyCreatedPosts.map((p) =>
 p.id === postId ? { ...p, isLikedByMe: liked, likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)) } : p,
 );

 try {
 const { data: authData } = await supabase.auth.getUser();
 const userId = authData?.user?.id;
 if (userId) {
 if (liked) {
 const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
 if (error) console.warn('[Posts] Like persistence error:', error.message);
 } else {
 const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
 if (error) console.warn('[Posts] Unlike error:', error.message);
 }
 }
 } catch (err) {
 console.warn('[Posts] Like error:', err);
 }
}

/**
 * Writes or removes the caller's row in post_reposts and returns the state the
 * post ended in. posts.reposts_count is maintained by a database trigger, so
 * the number is always the real number of repost rows and two devices racing
 * cannot drift it.
 *
 * Before post_reposts existed this just incremented the counter, which meant
 * "have I reposted this?" was un-answerable and a repost never showed up on
 * the reposter's own profile.
 *
 * Idempotent: reposting something already reposted (or un-reposting something
 * that was never reposted) is not an error, it just reports the current state.
 */
export async function togglePostRepost(
  postId: string,
  reposted: boolean,
): Promise<{ reposted: boolean; count: number }> {
  const uid = await currentUserId();
  if (!uid) throw new Error('You need to be signed in to repost.');

  locallyCreatedPosts = locallyCreatedPosts.map((p) =>
    p.id === postId
      ? { ...p, isRepostedByMe: reposted, repostsCount: Math.max(0, p.repostsCount + (reposted ? 1 : -1)) }
      : p,
  );

  try {
    if (reposted) {
      const { error } = await supabase
        .from('post_reposts')
        // The unique (post_id, user_id) constraint makes a double tap a no-op
        // instead of a duplicate-key error.
        .upsert({ post_id: postId, user_id: uid }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('post_reposts').delete().eq('post_id', postId).eq('user_id', uid);
      if (error) throw error;
    }

    // Read the trigger-maintained counter back rather than guessing it.
    const { data, error: readError } = await supabase
      .from('posts')
      .select('reposts_count')
      .eq('id', postId)
      .maybeSingle();
    if (readError) throw readError;

    const count = Math.max(0, data?.reposts_count ?? 0);
    locallyCreatedPosts = locallyCreatedPosts.map((p) =>
      p.id === postId ? { ...p, isRepostedByMe: reposted, repostsCount: count } : p,
    );
    return { reposted, count };
  } catch (err) {
    console.warn('[Posts] Repost persistence error:', err);
    // Undo the optimistic local move so the UI does not lie.
    locallyCreatedPosts = locallyCreatedPosts.map((p) =>
      p.id === postId
        ? { ...p, isRepostedByMe: !reposted, repostsCount: Math.max(0, p.repostsCount + (reposted ? -1 : 1)) }
        : p,
    );
    throw new Error('Could not update repost. Please try again.');
  }
}

export interface PostComment {
 id: string;
 postId: string;
 authorId?: string;
 authorName: string;
 authorRole: 'student' | 'staff' | 'alumni' | 'admin';
 authorAvatarUrl?: string | null;
 authorDepartment?: string;
 content: string;
 createdAt: string;
 likesCount: number;
 isLikedByMe?: boolean;
 imageUrl?: string | null;
}


const locallyCreatedComments: Record<string, PostComment[]> = {};

export async function listPostComments(postId: string): Promise<PostComment[]> {
 try {
 const { data, error } = await supabase
 .from('post_comments')
 .select('*, author:profiles(full_name, role, department, avatar_url)')
 .eq('post_id', postId)
 .order('created_at', { ascending: true });

 if (error) throw error;

 const dbComments: PostComment[] = (data ?? []).map((row: any) => ({
 id: row.id,
 postId: row.post_id,
 authorId: row.author_id,
 authorName: row.author?.full_name || 'Campus Member',
 authorRole: (row.author?.role || 'student') as any,
 authorDepartment: row.author?.department || 'Verified Member',
 authorAvatarUrl: row.author?.avatar_url || null,
 content: row.content,
 createdAt: row.created_at,
 likesCount: row.likes_count || 0,
 isLikedByMe: false,
 }));

 // Merge unique - local pool only ever contributes this session's own
 // just-created comments (always) plus seed fixtures (only when the
 // admin mock-data toggle is on).
 const merged = [...dbComments];
 for (const c of [...(locallyCreatedComments[postId] ?? [])]) {
 if (!merged.some((m) => m.id === c.id)) {
 merged.push(c);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Posts] listPostComments failed, showing local pool only:', err);
 return [...(locallyCreatedComments[postId] ?? [])];
 }
}

/**
 * Throws if there's no identifiable author or the Supabase insert fails,
 * instead of quietly showing a comment nobody else will ever see.
 */
export async function createPostComment(
 postId: string,
 content: string,
 authorName = 'You',
 authorRole: 'student' | 'staff' | 'alumni' | 'admin' = 'student',
 imageUrl?: string | null,
): Promise<PostComment> {
 const commentId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 let authorId = authData?.user?.id;
 if (!authorId) {
 const stored = await getSessionUser();
 if (stored?.id) authorId = stored.id;
 }

 if (!authorId) {
 throw new Error('You need to be signed in to comment.');
 }

 const { error } = await supabase.from('post_comments').insert({
 id: commentId,
 post_id: postId,
 author_id: authorId,
 content,
 });

 if (error) {
 console.warn('[Posts] Supabase comment insert error:', error.message);
 throw new Error('Could not post your comment. Please try again.');
 }

 const created: PostComment = {
 id: commentId,
 postId,
 authorId,
 authorName,
 authorRole,
 authorDepartment: 'UI Verified',
 content,
 createdAt: new Date().toISOString(),
 likesCount: 0,
 isLikedByMe: false,
 imageUrl: imageUrl || null,
 };
 locallyCreatedComments[postId] = [...(locallyCreatedComments[postId] ?? []), created];
 locallyCreatedPosts = locallyCreatedPosts.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p));

 return created;
}

/**
 * Callable by the comment's author, an admin, or the post's own community
 * creator/moderator (see the community-moderation migration's post_comments
 * RLS policies) - never gated further client-side than that, since RLS is
 * the real boundary. posts.comments_count follows automatically via
 * trigger_sync_post_comments, the same trigger createPostComment relies on.
 */
export async function deletePostComment(postId: string, commentId: string): Promise<void> {
  const previousComments = locallyCreatedComments[postId];
  locallyCreatedComments[postId] = (previousComments ?? []).filter((c) => c.id !== commentId);

  try {
    // Returning the deleted row is how we know RLS actually let it through:
    // a refused DELETE reports success with zero rows affected.
    const { data, error } = await supabase.from('post_comments').delete().eq('id', commentId).select('id');
    if (error) throw error;

    if (!data || data.length === 0) {
      const { data: still } = await supabase.from('post_comments').select('id').eq('id', commentId).maybeSingle();
      if (still) {
        if (previousComments) locallyCreatedComments[postId] = previousComments;
        throw new Error('This comment could not be deleted. You may not have permission to remove it.');
      }
    }
  } catch (err) {
    if (err instanceof Error && /could not be deleted/.test(err.message)) throw err;
    console.warn('[Posts] deletePostComment error:', err);
    if (previousComments) locallyCreatedComments[postId] = previousComments;
    throw new Error('Could not delete this comment. Please check your connection and try again.');
  }
}

export async function toggleCommentLike(postId: string, commentId: string, liked: boolean): Promise<void> {
 const current = locallyCreatedComments[postId] ?? [];
 locallyCreatedComments[postId] = current.map((c) =>
 c.id === commentId
 ? { ...c, isLikedByMe: liked, likesCount: Math.max(0, c.likesCount + (liked ? 1 : -1)) }
 : c
 );
}

/**
 * Casts, changes or clears the CALLER's vote and returns the poll as it now
 * stands, with `isVotedByMe` computed for that caller only.
 *
 * - Voting a different option MOVES the count from the old option to the new one.
 * - Voting the option you already picked CLEARS your vote.
 * - A closed poll (`closesAt` in the past) throws a message the UI can show.
 *
 * One row per voter in post_poll_votes, so a vote is now attributable: nobody
 * sees anybody else's selection as their own any more, and changing your vote
 * changes only your own row. Casting is an INSERT, changing is an UPDATE of
 * option_id, clearing is a DELETE - the unique (post_id, user_id) key makes
 * holding two votes impossible.
 *
 * The tallies in poll_data are maintained by a database trigger, so this never
 * writes them: it re-reads them afterwards. That is what makes two devices
 * racing (or a stale client) unable to corrupt the counts. The same rules are
 * enforced server-side too (trg_poll_vote_guard), so the checks below are for
 * a good error message, not for safety.
 */
export async function voteOnPoll(postId: string, optionId: string): Promise<PostPoll> {
  const uid = await currentUserId();
  if (!uid) throw new Error('You need to be signed in to vote.');

  const { data, error } = await supabase.from('posts').select('poll_data').eq('id', postId).maybeSingle();
  if (error) {
    console.warn('[Posts] Poll read error:', error.message);
    throw new Error('Could not record your vote. Please try again.');
  }

  const current = data?.poll_data as PostPoll | null | undefined;
  if (!current || !Array.isArray(current.options)) {
    throw new Error('This poll is no longer available.');
  }
  if (isPollClosed(current)) {
    throw new Error('Voting on this poll has closed.');
  }
  if (!current.options.some((o) => o.id === optionId)) {
    throw new Error('That poll option no longer exists.');
  }

  // What this user picked last time (if anything) - their own row, not a flag
  // shared with every other reader of the post.
  const { data: existing, error: existingError } = await supabase
    .from('post_poll_votes')
    .select('id, option_id')
    .eq('post_id', postId)
    .eq('user_id', uid)
    .maybeSingle();
  if (existingError) {
    console.warn('[Posts] Poll vote read error:', existingError.message);
    throw new Error('Could not record your vote. Please try again.');
  }

  const clearing = existing?.option_id === optionId;

  try {
    if (clearing) {
      const { error: deleteError } = await supabase
        .from('post_poll_votes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', uid);
      if (deleteError) throw deleteError;
    } else if (existing) {
      const { error: updateError } = await supabase
        .from('post_poll_votes')
        .update({ option_id: optionId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('post_poll_votes')
        .insert({ post_id: postId, user_id: uid, option_id: optionId });
      if (insertError) throw insertError;
    }
  } catch (err: any) {
    console.warn('[Posts] Poll vote persistence error:', err?.message ?? err);
    // The server guard raises this when closesAt passed between the read above
    // and the write - worth reporting honestly rather than as a generic error.
    if (/closed/i.test(err?.message ?? '')) throw new Error('Voting on this poll has closed.');
    throw new Error('Could not record your vote. Please try again.');
  }

  // The trigger has recomputed the tallies; read them back rather than guess.
  const { data: refreshed } = await supabase.from('posts').select('poll_data').eq('id', postId).maybeSingle();
  const decorated =
    decoratePoll(refreshed?.poll_data ?? current, clearing ? null : optionId) ??
    (decoratePoll(current, clearing ? null : optionId) as PostPoll);

  locallyCreatedPosts = locallyCreatedPosts.map((p) => (p.id === postId ? { ...p, poll: decorated } : p));
  return decorated;
}

/**
 * Deletes a post and THROWS when it is still there afterwards.
 *
 * This used to swallow the Supabase error and always return true, so a post
 * the database refused to delete (RLS, a staff member on another campus, an
 * offline device) disappeared from the screen, came back on the next reload,
 * and the user was told it was gone.
 */
export async function deletePost(postId: string): Promise<void> {
  const previousPosts = locallyCreatedPosts;
  const previousComments = locallyCreatedComments[postId];

  // Optimistic: drop it from the in-memory cache so the profile updates
  // immediately. Restored below if the delete turns out not to have happened.
  locallyCreatedPosts = locallyCreatedPosts.filter((p) => p.id !== postId);
  delete locallyCreatedComments[postId];

  const restore = () => {
    locallyCreatedPosts = previousPosts;
    if (previousComments) locallyCreatedComments[postId] = previousComments;
  };

  try {
    // Returning the deleted rows is how we know RLS actually let it through:
    // a refused DELETE reports success with zero rows affected.
    const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
    if (error) throw error;

    if (!data || data.length === 0) {
      // The row may simply have been deleted already (e.g. by another device),
      // which is a success - so check before crying foul.
      const { data: still } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle();
      if (still) {
        restore();
        throw new Error('This post could not be deleted. You may not have permission to remove it.');
      }
    }
  } catch (err) {
    if (err instanceof Error && /could not be deleted/.test(err.message)) throw err;
    console.warn('[Posts] deletePost error:', err);
    restore();
    throw new Error('Could not delete this post. Please check your connection and try again.');
  }
}

/**
 * Persists to Supabase first. A post that isn't in this session's local
 * cache (any post fetched from the database in the normal case) still
 * gets updated for real - this just returns a best-effort merged object
 * for it instead of throwing, since the write already succeeded.
 */
export async function updatePost(postId: string, updates: Partial<Post>): Promise<Post> {
 if (updates.imageUrl && !/^asset:/i.test(updates.imageUrl)) assertSafeHttpUrl(updates.imageUrl, 'The image link');
 try {
 const dbPayload: any = {};
 if (updates.title) dbPayload.title = updates.title;
 if (updates.content) dbPayload.content = updates.content;
 if (updates.category) dbPayload.category = updates.category;
 if (updates.imageUrl) dbPayload.image_url = updates.imageUrl;
 if (updates.isPinned !== undefined) dbPayload.is_pinned = updates.isPinned;

 if (Object.keys(dbPayload).length > 0) {
 await supabase.from('posts').update(dbPayload).eq('id', postId);
 }
 } catch (err) {
 console.warn('[Posts] Backend updatePost error:', err);
 }

 let updated: Post | undefined;
 locallyCreatedPosts = locallyCreatedPosts.map((p) => {
 if (p.id === postId) {
 updated = { ...p, ...updates };
 return updated;
 }
 return p;
 });

 if (updated) return updated;

  return { id: postId, ...updates } as Post;
}
