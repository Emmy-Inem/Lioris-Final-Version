import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/api/supabase';
import { FORUM_COMMUNITIES } from '@/constants/forumCommunities';

// Namespaced by user id (see joinedCommunitiesKey) so a shared/handed-down
// device, or an account switch before the next successful server round-trip,
// cannot show the previous account's cached joins.
const JOINED_COMMUNITIES_KEY = 'lioris_joined_forum_ids';
const isWeb = Platform.OS === 'web';

// Default initial joined spaces for every campus student
export const DEFAULT_JOINED_COMMUNITY_IDS = ['tech', 'academic', 'housing', 'social'];

function joinedCommunitiesKey(userId?: string | null): string {
  return userId ? `${JOINED_COMMUNITIES_KEY}:${userId}` : JOINED_COMMUNITIES_KEY;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readLocalJoinedIds(userId?: string | null): Promise<string[] | null> {
  try {
    const key = joinedCommunitiesKey(userId);
    const raw = isWeb
      ? typeof localStorage !== 'undefined'
        ? localStorage.getItem(key)
        : null
      : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

async function writeLocalJoinedIds(ids: string[], userId?: string | null): Promise<void> {
  try {
    const raw = JSON.stringify(ids);
    const key = joinedCommunitiesKey(userId);
    if (isWeb && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, raw);
    } else if (!isWeb) {
      await SecureStore.setItemAsync(key, raw);
    }
  } catch {
    // the cache is a convenience; the database is the source of truth
  }
}

interface CommunityRef {
  id: string;
  slug: string | null;
  category: string | null;
}

/** Every name a community can be known by in the UI: its uuid, its slug without "c/", its lowercased category. */
function aliasesOf(ref: CommunityRef): string[] {
  const out = [ref.id];
  if (ref.slug) out.push(ref.slug.replace(/^c\//, ''));
  if (ref.category) out.push(ref.category.toLowerCase());
  return out;
}

/** Resolves a uuid / slug ("tech" or "c/tech") / category label to ONE community row, or null. */
async function resolveCommunity(identifier: string): Promise<CommunityRef | null> {
  const base = supabase.from('forum_communities').select('id, slug, category');
  if (UUID_RE.test(identifier)) {
    const { data, error } = await base.eq('id', identifier).limit(1);
    if (error) throw error;
    return (data?.[0] as CommunityRef | undefined) ?? null;
  }
  const bare = identifier.replace(/^c\//, '');
  const bySlug = await supabase
    .from('forum_communities')
    .select('id, slug, category')
    .in('slug', [`c/${bare}`, bare])
    .limit(1);
  if (bySlug.error) throw bySlug.error;
  if (bySlug.data?.[0]) return bySlug.data[0] as CommunityRef;
  const byCategory = await supabase
    .from('forum_communities')
    .select('id, slug, category')
    .ilike('category', bare)
    .limit(1);
  if (byCategory.error) throw byCategory.error;
  return (byCategory.data?.[0] as CommunityRef | undefined) ?? null;
}

const SEEDED_KEY = 'lioris_default_spaces_seeded';

async function defaultsSeeded(userId: string): Promise<boolean> {
  try {
    const key = `${SEEDED_KEY}:${userId}`;
    const raw = isWeb ? (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null) : await SecureStore.getItemAsync(key);
    return raw === '1';
  } catch {
    return false;
  }
}

async function markDefaultsSeeded(userId: string): Promise<void> {
  try {
    const key = `${SEEDED_KEY}:${userId}`;
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, '1');
    } else {
      await SecureStore.setItemAsync(key, '1');
    }
  } catch {
    // best effort
  }
}

/**
 * Returns the community ids / slugs / categories the current user has joined.
 *
 * The DATABASE decides. Everyone used to be shown four built-in spaces as "joined" with nothing behind
 * them, so Leave could never stick and cross-device state disagreed. A student with no memberships yet gets
 * those four spaces joined for real, once; after that, leaving one removes it everywhere. The cached copy is
 * only used when the server cannot be reached.
 */
export async function listMyJoinedCommunityIds(userId?: string): Promise<string[]> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getSession();
    userId = authData?.session?.user?.id;
  }

  const cached = await readLocalJoinedIds(userId);
  if (!userId) return cached ?? DEFAULT_JOINED_COMMUNITY_IDS;

  try {
    const { data, error } = await supabase
      .from('forum_community_members')
      .select('community_id, community:forum_communities(id, slug, category)')
      .eq('user_id', userId);
    if (error) throw error;

    let rows = (data ?? []) as any[];

    if (rows.length === 0 && !(await defaultsSeeded(userId))) {
      await markDefaultsSeeded(userId);
      for (const id of DEFAULT_JOINED_COMMUNITY_IDS) {
        try {
          await joinCommunity(id, userId);
        } catch {
          // a default space that does not exist on this campus is simply skipped
        }
      }
      const again = await supabase
        .from('forum_community_members')
        .select('community_id, community:forum_communities(id, slug, category)')
        .eq('user_id', userId);
      if (!again.error) rows = (again.data ?? []) as any[];
    }

    const ids = new Set<string>();
    for (const row of rows) {
      if (row.community_id) ids.add(row.community_id);
      const c = Array.isArray(row.community) ? row.community[0] : row.community;
      if (c) for (const alias of aliasesOf(c as CommunityRef)) ids.add(alias);
    }
    const result = Array.from(ids);
    await writeLocalJoinedIds(result, userId);
    return result;
  } catch {
    // table or network error: the last known server answer, else the built-in defaults
    return cached ?? DEFAULT_JOINED_COMMUNITY_IDS;
  }
}

/** Join a discussion space / community. Throws when the join could not be saved. */
export async function joinCommunity(communityIdentifier: string, userId?: string): Promise<void> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getSession();
    userId = authData?.session?.user?.id;
  }
  if (!userId) throw new Error('Sign in to join spaces.');

  const community = await resolveCommunity(communityIdentifier);
  if (!community) throw new Error('That space is not available right now.');

  const { error } = await supabase.from('forum_community_members').insert({ community_id: community.id, user_id: userId });
  // 23505: already a member (another tab / device) - that is the state we wanted.
  if (error && (error as { code?: string }).code !== '23505') {
    throw new Error('Could not join this space. Check your connection and try again.');
  }

  const current = new Set((await readLocalJoinedIds(userId)) ?? []);
  for (const alias of aliasesOf(community)) current.add(alias);
  await writeLocalJoinedIds(Array.from(current), userId);
}

/** Leave a discussion space / community. Throws when the change could not be saved. */
export async function leaveCommunity(communityIdentifier: string, userId?: string): Promise<void> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getSession();
    userId = authData?.session?.user?.id;
  }
  if (!userId) throw new Error('Sign in to manage your spaces.');

  const community = await resolveCommunity(communityIdentifier);
  if (community) {
    const { error } = await supabase
      .from('forum_community_members')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', userId);
    if (error) throw new Error('Could not leave this space. Check your connection and try again.');
  }

  // Remove EVERY alias, otherwise the slug or category still marks it joined.
  const gone = new Set<string>([communityIdentifier, communityIdentifier.replace(/^c\//, '')].map((s) => s.toLowerCase()));
  if (community) for (const alias of aliasesOf(community)) gone.add(alias.toLowerCase());
  const remaining = ((await readLocalJoinedIds(userId)) ?? []).filter((id) => !gone.has(id.toLowerCase()));
  await writeLocalJoinedIds(remaining, userId);
}

/** Authentic member counts - initialized to zero, populated strictly from real database counts */
export const BASELINE_COMMUNITY_MEMBERS: Record<string, number> = {
  all: 0,
  tech: 0,
  academic: 0,
  polls: 0,
  housing: 0,
  social: 0,
  lost: 0,
};

/**
 * Fetch member count and thread count for each community from real database rows.
 */
export async function getCommunityStatsMap(): Promise<Map<string, { members: number; threads: number }>> {
  const stats = new Map<string, { members: number; threads: number }>();

  // Initialize with zero
  for (const c of FORUM_COMMUNITIES) {
    stats.set(c.id, {
      members: 0,
      threads: 0,
    });
  }

  try {
    const { data, error } = await supabase.rpc('get_forum_communities_stats');
    if (!error && Array.isArray(data) && data.length > 0) {
      let totalMembersAcross = 0;
      let totalPostsAcross = 0;
      for (const row of data) {
        const mCount = Number(row.members_count || 0);
        const pCount = Number(row.posts_count || 0);
        stats.set(row.community_id, {
          members: mCount,
          threads: pCount,
        });
        totalMembersAcross += mCount;
        totalPostsAcross += pCount;
      }
      stats.set('all', {
        members: totalMembersAcross,
        threads: totalPostsAcross,
      });
      return stats;
    }
  } catch {
    // Fallback to direct query
  }

  // Fallback: query database tables directly for real counts
  try {
    const [membersRes, postsRes] = await Promise.all([
      supabase.from('forum_community_members').select('community_id'),
      supabase.from('posts').select('category'),
    ]);

    if (membersRes.data && Array.isArray(membersRes.data)) {
      for (const row of membersRes.data) {
        if (row.community_id) {
          const s = stats.get(row.community_id) || { members: 0, threads: 0 };
          s.members += 1;
          stats.set(row.community_id, s);
        }
      }
    }

    if (postsRes.data && Array.isArray(postsRes.data)) {
      for (const row of postsRes.data) {
        const cat = (row.category || '').toLowerCase();
        for (const c of FORUM_COMMUNITIES) {
          if (c.id !== 'all' && (c.id === cat || c.label.toLowerCase().includes(cat))) {
            const s = stats.get(c.id) || { members: 0, threads: 0 };
            s.threads += 1;
            stats.set(c.id, s);
          }
        }
      }
      stats.set('all', {
        members: membersRes.data?.length ?? 0,
        threads: postsRes.data.length,
      });
    }
  } catch (err) {
    console.warn('[forumMemberships] getCommunityStatsMap fallback error:', err);
  }

  return stats;
}

