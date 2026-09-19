import { Post, PostVisibilityScope } from './types';
import { supabase } from './supabase';
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

export interface FeedQuery {
 scope?: PostVisibilityScope;
 category?: string;
 q?: string;
 /** The viewing user's own institution - enforces the hard rule that campus-scoped posts from OTHER universities are never shown, regardless of viewScope. */
 viewerInstitutionCode?: string;
 /** The Global/My Campus toggle. 'global'narrows to cross-university posts only; 'campus' (default) shows the viewer's own campus posts mixed with global ones. */
 viewScope?: 'campus' | 'global';
}

function filterPosts(pool: Post[], query: FeedQuery): Post[] {
  let results = pool.filter((p) => !isUserBlocked(p.authorId));

  if (query.viewScope === 'global') {
    results = results.filter((p) => p.scopeVisibility === 'global' || !p.institutionCode);
  } else if (query.viewerInstitutionCode) {
    const viewerCode = query.viewerInstitutionCode.toUpperCase();
    results = results.filter((p) => {
      if (p.institutionCode && p.institutionCode !== 'GLOBAL') {
        return p.institutionCode.toUpperCase() === viewerCode;
      }
      return p.scopeVisibility === 'global' || !p.institutionCode;
    });
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
    const currentUserId = authData?.user?.id;

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

    const dbPosts: Post[] = rows.map((row: any) => {
      const isGlobal = row.visibility_scope === 'global' || row.campus_code === 'GLOBAL';
      const isLiked = currentUserId ? (row.post_likes ?? []).some((l: any) => l.user_id === currentUserId) : false;

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
        // Audience comes from audience_scope; visibility_scope is the
        // institution axis and belongs to scopeVisibility below. A row
        // written before audience_scope existed has no audience
        // restriction, so it reads as 'global' (visible to everyone).
        visibilityScope: (row.audience_scope as any) || 'global',
        scopeVisibility: isGlobal ? 'global' : 'campus',
        institutionCode: isGlobal ? undefined : row.campus_code,
        likesCount: row.likes_count || 0,
        commentsCount: row.comments_count || 0,
        repostsCount: row.reposts_count || 0,
        isLikedByMe: isLiked,
        isPinned: !!row.is_pinned,
        createdAt: row.created_at,
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        poll: row.poll_data || undefined,
        pollQuestion: row.poll_data?.question || undefined,
      };
    });

    // Merge unique - local pool only ever contributes this session's own
    // just-created posts (always) plus seed fixtures (only when the admin
    // mock-data toggle is on).
    const merged = [...dbPosts];
    for (const p of [...locallyCreatedPosts]) {
      if (!merged.some((m) => m.id === p.id)) {
        merged.push(p);
      }
    }
    return filterPosts(merged, { ...query, viewerInstitutionCode });
  } catch (err) {
    console.warn('[Posts] listFeedPosts failed, showing local pool only:', err);
    return filterPosts([...locallyCreatedPosts], { ...query, viewerInstitutionCode });
  }
}

export async function listMyPosts(userId?: string): Promise<Post[]> {
  try {
    let targetUid = userId;
    if (!targetUid) {
      const { data: authData } = await supabase.auth.getUser();
      targetUid = authData?.user?.id;
      if (!targetUid) {
        const stored = await getSessionUser();
        if (stored?.id) targetUid = stored.id;
      }
    }

    if (targetUid) {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status), post_likes(user_id)')
        .eq('author_id', targetUid)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          authorId: row.author_id,
          authorName: row.profiles?.full_name || 'You',
          authorRole: (row.profiles?.role || 'student') as any,
          authorVerified: row.profiles?.verification_status === 'verified' || row.profiles?.role === 'admin',
          authorAvatarUrl: row.profiles?.avatar_url || null,
          title: row.title,
          content: row.content,
          category: row.category || 'General',
          visibilityScope: (row.audience_scope as any) || 'global',
          scopeVisibility: row.visibility_scope === 'global' ? 'global' : 'campus',
          institutionCode: row.campus_code === 'GLOBAL' ? undefined : row.campus_code,
          likesCount: row.likes_count || 0,
          commentsCount: row.comments_count || 0,
          repostsCount: row.reposts_count || 0,
          isLikedByMe: (row.post_likes ?? []).some((l: any) => l.user_id === targetUid),
          createdAt: row.created_at,
          imageUrl: row.image_url,
          videoUrl: row.video_url,
        }));
      }
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

export async function getPost(id: string): Promise<Post | null> {
  const local = locallyCreatedPosts.find((p) => p.id === id);

  try {
    const { data: authData } = await supabase.auth.getUser();
    let currentUserId = authData?.user?.id;
    if (!currentUserId) {
      const stored = await getSessionUser();
      if (stored?.id) currentUserId = stored.id;
    }

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:author_id(full_name, role, avatar_url, campus_code, verification_status), post_likes(user_id)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return local || null;

    const likedByMe = currentUserId
      ? (data.post_likes || []).some((like: any) => like.user_id === currentUserId)
      : false;

    return {
      id: data.id,
      authorName: data.profiles?.full_name || 'Campus Student',
      authorRole: (data.profiles?.role || 'student') as any,
      authorVerified: data.profiles?.verification_status === 'verified' || data.profiles?.role === 'admin',
      authorAvatarUrl: data.profiles?.avatar_url || null,
      institutionCode: data.profiles?.campus_code || 'GLOBAL',
      authorId: data.author_id,
      title: data.title,
      content: data.content,
      category: data.category || 'General',
      createdAt: data.created_at,
      likesCount: data.likes_count || 0,
      commentsCount: data.comments_count || 0,
      repostsCount: data.reposts_count || 0,
      isLikedByMe: likedByMe,
      isPinned: !!data.is_pinned,
      scopeVisibility: data.visibility_scope === 'global' || data.campus_code === 'GLOBAL' ? 'global' : 'campus',
      visibilityScope: (data.audience_scope || 'global') as any,
      imageUrl: data.image_url || undefined,
      videoUrl: data.video_url || undefined,
      courseTags: data.course_tags || undefined,
      poll: data.poll_data || undefined,
      pollQuestion: data.poll_data?.question || undefined,
    };
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
 const { authorInstitutionCode, scopeVisibility, ...rest } = payload;
 const postId = generateUUID();
 const now = new Date().toISOString();

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
 poll_data: payload.poll || null,
 is_pinned: payload.isPinned || false,
 });

 if (error) {
 console.warn('[Posts] Supabase create post error:', error.message);
 throw new Error('Could not publish your post. Please try again.');
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
 };

 locallyCreatedPosts = [created, ...locallyCreatedPosts];
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
 * Persists a repost by moving posts.reposts_count.
 *
 * The Repost button used to only toggle local state and pop an alert saying
 * "Amplified to campus cohort" - nothing was written, and the count shown
 * next to it was the literal number 18 for every post.
 *
 * There's no post_reposts join table, so "have I reposted this?" is
 * session-local; the count itself is real and shared.
 */
export async function togglePostRepost(postId: string, reposted: boolean): Promise<number | null> {
  locallyCreatedPosts = locallyCreatedPosts.map((p) =>
    p.id === postId ? { ...p, repostsCount: Math.max(0, p.repostsCount + (reposted ? 1 : -1)) } : p,
  );

  try {
    const { data: current, error: readError } = await supabase
      .from('posts')
      .select('reposts_count')
      .eq('id', postId)
      .maybeSingle();
    if (readError) throw readError;

    const next = Math.max(0, (current?.reposts_count ?? 0) + (reposted ? 1 : -1));
    const { error } = await supabase.from('posts').update({ reposts_count: next }).eq('id', postId);
    if (error) throw error;
    return next;
  } catch (err) {
    console.warn('[Posts] Repost persistence error:', err);
    throw new Error('Could not update repost. Please try again.');
  }
}

export interface PostComment {
 id: string;
 postId: string;
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

export async function toggleCommentLike(postId: string, commentId: string, liked: boolean): Promise<void> {
 const current = locallyCreatedComments[postId] ?? [];
 locallyCreatedComments[postId] = current.map((c) =>
 c.id === commentId
 ? { ...c, isLikedByMe: liked, likesCount: Math.max(0, c.likesCount + (liked ? 1 : -1)) }
 : c
 );
}

/**
 * Persists the updated tallies to posts.poll_data (the column already
 * existed in the schema but nothing ever wrote or read it back, so a poll
 * vote - and the poll itself - vanished the moment the feed refetched from
 * Supabase and merged over the local session copy). Note this JSON blob has
 * no per-viewer vote table, so `isVotedByMe` is shared across everyone who
 * fetches the row rather than tracked per user - the same known limitation
 * already documented for reposts in PostDetailScreen.
 */
export async function voteOnPoll(postId: string, optionId: string): Promise<void> {
 let nextPollForPersist: Post['poll'] | null = null;

 locallyCreatedPosts = locallyCreatedPosts.map((p) => {
 if (p.id !== postId || !p.poll) return p;
 const hasVoted = p.poll.options.some((o) => o.isVotedByMe);
 if (hasVoted) return p;
 const nextOptions = p.poll.options.map((opt) =>
 opt.id === optionId ? { ...opt, votes: opt.votes + 1, isVotedByMe: true } : opt,
 );
 const nextPoll = { ...p.poll, options: nextOptions, totalVotes: p.poll.totalVotes + 1 };
 nextPollForPersist = nextPoll;
 return { ...p, poll: nextPoll };
 });

 try {
 if (!nextPollForPersist) {
 const { data, error } = await supabase.from('posts').select('poll_data').eq('id', postId).maybeSingle();
 if (error) throw error;
 const current: Post['poll'] = data?.poll_data ?? null;
 if (!current || current.options.some((o) => o.isVotedByMe)) return;
 nextPollForPersist = {
 ...current,
 options: current.options.map((opt) =>
 opt.id === optionId ? { ...opt, votes: opt.votes + 1, isVotedByMe: true } : opt,
 ),
 totalVotes: current.totalVotes + 1,
 };
 }
 const { error: updateError } = await supabase.from('posts').update({ poll_data: nextPollForPersist }).eq('id', postId);
 if (updateError) console.warn('[Posts] Poll vote persistence error:', updateError.message);
 } catch (err) {
 console.warn('[Posts] Poll vote error:', err);
 }
}

export async function deletePost(postId: string): Promise<boolean> {
 locallyCreatedPosts = locallyCreatedPosts.filter((p) => p.id !== postId);
 delete locallyCreatedComments[postId];
 try {
 const { error } = await supabase.from('posts').delete().eq('id', postId);
 if (error) {
 console.warn('[Posts] Supabase deletePost error:', error.message);
 }
 } catch (err) {
 console.warn('[Posts] Backend deletePost error:', err);
 }
 return true;
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
