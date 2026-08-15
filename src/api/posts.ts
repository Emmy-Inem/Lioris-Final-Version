import { api } from './client';
import { Post, PostVisibilityScope } from './types';
import { mockPosts } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

// Mutable in-memory copy so newly published posts actually persist and
// show up on the next fetch — the previous version fabricated a
// success response without ever adding it to the list `listFeedPosts`
// reads from, so a published thread would silently vanish.
let postsState = [...mockPosts];

export interface FeedQuery {
  scope?: PostVisibilityScope;
  category?: string;
  q?: string;
  /** The viewing user's own institution — enforces the hard rule that campus-scoped posts from OTHER universities are never shown, regardless of viewScope. */
  viewerInstitutionCode?: string;
  /** The Global/My Campus toggle. 'global' narrows to cross-university posts only; 'campus' (default) shows the viewer's own campus posts mixed with global ones. */
  viewScope?: 'campus' | 'global';
}

function filterMockPosts(query: FeedQuery): Post[] {
  let results = [...postsState];

  // Hard rule, independent of the toggle: a campus-scoped post is only
  // ever visible to users from that same university. Posts with no
  // institutionCode are global and visible to everyone.
  results = results.filter((p) => !p.institutionCode || p.institutionCode === query.viewerInstitutionCode);

  // The Global/Campus toggle further narrows within what's already
  // visible above — it never widens access to another university's
  // campus-only content.
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
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Post[] }>('/feed', { params: query });
    return data.items;
  }, filterMockPosts(query));
}

export interface CreatePostPayload {
  title: string;
  content: string;
  category: string;
  visibilityScope: PostVisibilityScope;
  /** 'campus' stamps the post with the author's own institutionCode; 'global' omits it, making the post visible everywhere. */
  scopeVisibility?: 'campus' | 'global';
  authorInstitutionCode?: string;
  sponsored?: boolean;
  courseTags?: string;
  postFormat?: 'Thread' | 'Rapid-Fire Conversation';
}

// PRD Section 6.2 (Community Discussions): "Given I submit a discussion
// post, then the post appears in the selected visibility scope."
export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const { authorInstitutionCode, scopeVisibility, ...rest } = payload;

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Post>('/feed', payload);
    return data;
  }
  try {
    const { data } = await api.post<Post>('/feed', payload);
    return data;
  } catch {
    const created: Post = {
      id: `mock-post-${Date.now()}`,
      authorId: 'me',
      authorName: 'You',
      authorRole: 'student',
      likesCount: 0,
      commentsCount: 0,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
      scopeVisibility: scopeVisibility ?? 'campus',
      institutionCode: scopeVisibility === 'global' ? undefined : authorInstitutionCode,
      ...rest,
    };
    postsState = [created, ...postsState];
    return created;
  }
}

// POST /feed/{id}/like or /unlike — previously fired the request and
// did nothing else; the comment claimed "optimistic UI already
// reflects the change" but nothing actually called this function from
// PostCard, and even if it had been called, this didn't touch
// `postsState`, so a like would silently vanish the moment the feed
// refetched. Now actually persists the change.
export async function togglePostLike(postId: string, liked: boolean): Promise<void> {
  await api.post(`/feed/${postId}/${liked ? 'like' : 'unlike'}`).catch(() => {
    // Expected in mock mode — see README's "Mock data fallback".
  });
  postsState = postsState.map((p) =>
    p.id === postId ? { ...p, isLikedByMe: liked, likesCount: p.likesCount + (liked ? 1 : -1) } : p,
  );
}
