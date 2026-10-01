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

function readLocalJoinedIds(userId?: string | null): string[] {
  try {
    if (isWeb && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(joinedCommunitiesKey(userId));
      if (raw) return JSON.parse(raw);

      // One-time migration from the pre-namespacing global key, so an
      // existing user's joins on this device are not lost.
      if (userId) {
        const legacy = localStorage.getItem(JOINED_COMMUNITIES_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed)) {
            localStorage.setItem(joinedCommunitiesKey(userId), legacy);
            return parsed;
          }
        }
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_JOINED_COMMUNITY_IDS;
}

function writeLocalJoinedIds(ids: string[], userId?: string | null): void {
  try {
    const raw = JSON.stringify(ids);
    const key = joinedCommunitiesKey(userId);
    if (isWeb && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, raw);
    } else {
      SecureStore.setItemAsync(key, raw).catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Returns array of community IDs (or slugs/identifiers) the current user has joined.
 */
export async function listMyJoinedCommunityIds(userId?: string): Promise<string[]> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

  const local = readLocalJoinedIds(userId);

  if (!userId) {
    return local;
  }

  try {
    const { data, error } = await supabase
      .from('forum_community_members')
      .select('community_id, community:forum_communities(id, slug, category)')
      .eq('user_id', userId);

    if (error) throw error;

    if (data && data.length > 0) {
      const ids = new Set<string>(local);
      for (const row of data as any[]) {
        if (row.community_id) ids.add(row.community_id);
        if (row.community?.id) ids.add(row.community.id);
        if (row.community?.category) ids.add(row.community.category.toLowerCase());
        if (row.community?.slug) ids.add(row.community.slug.replace('c/', ''));
      }
      const combined = Array.from(ids);
      writeLocalJoinedIds(combined, userId);
      return combined;
    }
  } catch (err) {
    // table or network error - use local fallback
  }

  return local;
}

/**
 * Join a discussion space / community.
 */
export async function joinCommunity(communityIdentifier: string, userId?: string): Promise<void> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

  const current = new Set(readLocalJoinedIds(userId));
  current.add(communityIdentifier);
  current.add(communityIdentifier.toLowerCase());
  const updated = Array.from(current);
  writeLocalJoinedIds(updated, userId);

  if (!userId) return;

  try {
    // If identifier is not a uuid, look up the uuid in forum_communities
    let communityUuid = communityIdentifier;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityIdentifier);
    if (!isUuid) {
      const { data: comm } = await supabase
        .from('forum_communities')
        .select('id')
        .or(`slug.eq.c/${communityIdentifier},category.ilike.${communityIdentifier}`)
        .maybeSingle();
      if (comm?.id) {
        communityUuid = comm.id;
      }
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityUuid)) {
      await supabase
        .from('forum_community_members')
        .insert({
          community_id: communityUuid,
          user_id: userId,
        });
    }
  } catch (err) {
    // Non-blocking: local storage holds the state
  }
}

/**
 * Leave a discussion space / community.
 */
export async function leaveCommunity(communityIdentifier: string, userId?: string): Promise<void> {
  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

  const current = readLocalJoinedIds(userId).filter(
    (id) => id.toLowerCase() !== communityIdentifier.toLowerCase()
  );
  writeLocalJoinedIds(current, userId);

  if (!userId) return;

  try {
    let communityUuid = communityIdentifier;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityIdentifier);
    if (!isUuid) {
      const { data: comm } = await supabase
        .from('forum_communities')
        .select('id')
        .or(`slug.eq.c/${communityIdentifier},category.ilike.${communityIdentifier}`)
        .maybeSingle();
      if (comm?.id) {
        communityUuid = comm.id;
      }
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityUuid)) {
      await supabase
        .from('forum_community_members')
        .delete()
        .eq('community_id', communityUuid)
        .eq('user_id', userId);
    }
  } catch (err) {
    // Non-blocking
  }
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

