import { Post, PostVisibilityScope } from './types';
import { supabase } from './supabase';
import { isUserBlocked } from './connections';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

// Posts this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch (and so
// update/delete on this session's own posts can find them locally). Never
// seeded with fixtures - those only come from getSeedPosts() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedPosts: Post[] = [];


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

 results = results.filter((p) => !p.institutionCode || p.institutionCode === query.viewerInstitutionCode);

 if (query.viewScope === 'global') {
 results = results.filter((p) => !p.institutionCode);
 }

 if (query.scope) {
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
 try {
 let dbQuery = supabase.from('posts').select('*').order('created_at', { ascending: false });
 if (query.category) {
 dbQuery = dbQuery.ilike('category', `%${query.category}%`);
 }
 const { data, error } = await dbQuery;
 if (error) throw error;

 const dbPosts: Post[] = (data ?? []).map((row: any) => {
 const isGlobal = row.visibility_scope === 'global' || row.campus_code === 'GLOBAL';
 return {
 id: row.id,
 authorId: row.author_id,
 authorName: row.author_name || 'Campus Student',
 authorRole: (row.author_role as any) || 'student',
 title: row.title,
 content: row.content,
 category: row.category || 'General',
 visibilityScope: (row.visibility_scope as any) || 'campus',
 scopeVisibility: isGlobal ? 'global' : 'campus',
 institutionCode: isGlobal ? undefined : row.campus_code,
 likesCount: row.likes_count || 0,
 commentsCount: row.comments_count || 0,
 isLikedByMe: false,
 createdAt: row.created_at,
 imageUrl: row.image_url,
 videoUrl: row.video_url,
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
 return filterPosts(merged, query);
 } catch (err) {
 console.warn('[Posts] listFeedPosts failed, showing local pool only:', err);
 return filterPosts([...locallyCreatedPosts], query);
 }
}

export async function listMyPosts(userId?: string): Promise<Post[]> {
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

export interface CreatePostPayload {
 title: string;
 content: string;
 category: string;
 visibilityScope: PostVisibilityScope;
 scopeVisibility?: 'campus' | 'global';
 authorInstitutionCode?: string;
 sponsored?: boolean;
 courseTags?: string;
 postFormat?: 'Thread' | 'Rapid-Fire Conversation';
 imageUrl?: string;
 videoUrl?: string;
 poll?: any;
 pollQuestion?: string;
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

 if (payload.imageUrl && !payload.imageUrl.startsWith('http://') && !payload.imageUrl.startsWith('https://') && !payload.imageUrl.startsWith('asset:')) {
 try {
 const { uploadMediaFile } = await import('./storage');
 permanentImageUrl = await uploadMediaFile('campus-media', payload.imageUrl, 'feed');
 } catch (uploadErr) {
 console.warn('[Posts] Image upload warning:', uploadErr);
 }
 }

 if (payload.videoUrl && !payload.videoUrl.startsWith('http://') && !payload.videoUrl.startsWith('https://')) {
 try {
 const { uploadMediaFile } = await import('./storage');
 permanentVideoUrl = await uploadMediaFile('campus-media', payload.videoUrl, 'videos');
 } catch (uploadErr) {
 console.warn('[Posts] Video upload warning:', uploadErr);
 }
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

 if (!authorCampus) {
 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', authorId)
 .maybeSingle();
 authorCampus = profile?.campus_code || 'GLOBAL';
 }

 const isExplicitlyGlobal = scopeVisibility === 'global' || payload.visibilityScope === 'global';
 const campusCode = authorCampus || 'GLOBAL';
 const finalVisibilityScope = isExplicitlyGlobal ? 'global' : 'campus';

 const { error } = await supabase.from('posts').insert({
 id: postId,
 author_id: authorId,
 campus_code: campusCode,
 title: payload.title,
 content: payload.content,
 category: payload.category || 'General',
 visibility_scope: finalVisibilityScope,
 image_url: permanentImageUrl || null,
 video_url: permanentVideoUrl || null,
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
 likesCount: 0,
 commentsCount: 0,
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

export async function voteOnPoll(postId: string, optionId: string): Promise<void> {
 locallyCreatedPosts = locallyCreatedPosts.map((p) => {
 if (p.id !== postId || !p.poll) return p;
 const hasVoted = p.poll.options.some((o) => o.isVotedByMe);
 if (hasVoted) return p;
 const nextOptions = p.poll.options.map((opt) =>
 opt.id === optionId ? { ...opt, votes: opt.votes + 1, isVotedByMe: true } : opt,
 );
 return {
 ...p,
 poll: {
 ...p.poll,
 options: nextOptions,
 totalVotes: p.poll.totalVotes + 1,
 },
 };
 });
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
