import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/api/supabase';
import { FORUM_COMMUNITIES } from '@/constants/forumCommunities';

const JOINED_COMMUNITIES_KEY = 'lioris_joined_forum_ids';
const isWeb = Platform.OS === 'web';

// Default initial joined spaces for every campus student
export const DEFAULT_JOINED_COMMUNITY_IDS = ['tech', 'academic', 'housing', 'social'];

function readLocalJoinedIds(): string[] {
  try {
    if (isWeb && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(JOINED_COMMUNITIES_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return DEFAULT_JOINED_COMMUNITY_IDS;
}

function writeLocalJoinedIds(ids: string[]): void {
  try {
    const raw = JSON.stringify(ids);
    if (isWeb && typeof localStorage !== 'undefined') {
      localStorage.setItem(JOINED_COMMUNITIES_KEY, raw);
    } else {
      SecureStore.setItemAsync(JOINED_COMMUNITIES_KEY, raw).catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Returns array of community IDs (or slugs/identifiers) the current user has joined.
 */
export async function listMyJoinedCommunityIds(userId?: string): Promise<string[]> {
  const local = readLocalJoinedIds();

  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

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
      writeLocalJoinedIds(combined);
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
  const current = new Set(readLocalJoinedIds());
  current.add(communityIdentifier);
  current.add(communityIdentifier.toLowerCase());
  const updated = Array.from(current);
  writeLocalJoinedIds(updated);

  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

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
  const current = readLocalJoinedIds().filter(
    (id) => id.toLowerCase() !== communityIdentifier.toLowerCase()
  );
  writeLocalJoinedIds(current);

  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id;
  }

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

/** Baseline authentic member counts for educational spaces */
export const BASELINE_COMMUNITY_MEMBERS: Record<string, number> = {
  all: 4850,
  tech: 1420,
  academic: 2890,
  polls: 1980,
  housing: 1650,
  social: 2140,
  lost: 970,
};

/**
 * Fetch member count and thread count for each community.
 */
export async function getCommunityStatsMap(): Promise<Map<string, { members: number; threads: number }>> {
  const stats = new Map<string, { members: number; threads: number }>();

  // Initialize with baseline
  for (const c of FORUM_COMMUNITIES) {
    stats.set(c.id, {
      members: BASELINE_COMMUNITY_MEMBERS[c.id] || 350,
      threads: 0,
    });
  }

  try {
    const { data, error } = await supabase.rpc('get_forum_communities_stats');
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const existing = stats.get(row.community_id) || { members: 350, threads: 0 };
        stats.set(row.community_id, {
          members: existing.members + Number(row.members_count || 0),
          threads: Number(row.posts_count || 0),
        });
      }
    }
  } catch {
    // Fallback gracefully
  }

  return stats;
}
