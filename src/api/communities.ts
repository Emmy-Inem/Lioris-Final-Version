import { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { FORUM_COMMUNITIES } from '../constants/forumCommunities';

export interface ForumCommunityRecord {
  id: string;
  slug: string;
  label: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  moderatorBadge: string;
  moderatorTitle: string;
  rules: string[];
  bannerColor: string;
  accentColor: string;
  createdBy?: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
}

/** The 6 launch communities, presented as already-approved records, used only
 * as a fallback when `forum_communities` hasn't been migrated onto the live
 * database yet (see supabase_migration_align.sql) or the request fails -
 * mirrors the graceful-degradation pattern used throughout src/api/posts.ts. */
function fallbackCommunities(): ForumCommunityRecord[] {
  return FORUM_COMMUNITIES.filter((c) => c.category !== null).map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    category: c.category as string,
    icon: c.icon,
    description: c.description,
    moderatorBadge: c.moderatorBadge,
    moderatorTitle: c.moderatorTitle,
    rules: c.rules,
    bannerColor: c.bannerColor,
    accentColor: c.accentColor,
    approvalStatus: 'approved',
  }));
}

function mapRow(row: any): ForumCommunityRecord {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    category: row.category,
    icon: (row.icon || 'chatbubbles-outline') as any,
    description: row.description || '',
    moderatorBadge: row.moderator_badge || 'Community Lead',
    moderatorTitle: row.moderator_title || 'Volunteer Moderators',
    rules: Array.isArray(row.rules) ? row.rules : [],
    bannerColor: row.banner_color || '#3B82F6',
    accentColor: row.accent_color || '#2563EB',
    createdBy: row.created_by || null,
    approvalStatus: (row.approval_status as any) || 'approved',
    rejectionReason: row.rejection_reason || null,
  };
}

/** Approved communities, plus the caller's own pending/rejected proposals so they can track status. */
export async function listCommunities(): Promise<ForumCommunityRecord[]> {
  try {
    const { data, error } = await supabase.from('forum_communities').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return fallbackCommunities();
    return data.map(mapRow);
  } catch (err) {
    console.warn('[Communities] listCommunities failed, showing launch defaults only:', err);
    return fallbackCommunities();
  }
}

export async function listPendingCommunities(): Promise<ForumCommunityRecord[]> {
  try {
    const { data, error } = await supabase
      .from('forum_communities')
      .select('*')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  } catch (err) {
    console.warn('[Communities] listPendingCommunities failed:', err);
    return [];
  }
}

export interface ProposeCommunityPayload {
  label: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
}

function slugify(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `c/${base || generateUUID().slice(0, 8)}`;
}

/**
 * Throws if there's no identifiable proposer or the insert fails, instead of
 * quietly reporting a community as proposed when it was never saved.
 *
 * Every proposal - including a root admin's own - starts 'pending' and must
 * go through ForumsModerationTab's approval queue. This used to auto-approve
 * when the proposer's `profiles.role` was 'admin', which sounds right in
 * isolation but breaks the moment "Preview Workspace As Role" is in play:
 * that feature only changes which portal UI renders (see
 * AuthContext.tsx's `role` vs `actualRole`) - the underlying Supabase auth
 * session, and therefore `profiles.role` for that session, is always the
 * real admin account. So an admin previewing the Student portal would have
 * every "student" proposal instantly published, with no way to tell from
 * the UI that approval was silently skipped. Removing the bypass here means
 * this can never again depend on who happens to be signed in - the RLS
 * INSERT policy on forum_communities enforces the same rule server-side
 * (approval_status must be 'pending' unless the request is an admin's), so
 * a non-pending value sent by a modified/malicious client is rejected too.
 */
export async function proposeCommunity(payload: ProposeCommunityPayload): Promise<ForumCommunityRecord> {
  const { data: authData } = await supabase.auth.getUser();
  let userId = authData?.user?.id;
  if (!userId) {
    const stored = await getSessionUser();
    if (stored?.id) userId = stored.id;
  }
  if (!userId) {
    throw new Error('You need to be signed in to propose a community.');
  }

  const slug = slugify(payload.label);
  const row = {
    slug,
    label: payload.label.trim(),
    category: payload.label.trim(),
    description: payload.description.trim() || 'A new community space for students to connect.',
    icon: payload.icon || 'chatbubbles-outline',
    accent_color: payload.accentColor || '#2563EB',
    banner_color: payload.accentColor || '#3B82F6',
    created_by: userId,
    approval_status: 'pending',
  };

  const { data, error } = await supabase.from('forum_communities').insert(row).select('*').maybeSingle();
  if (error) {
    console.warn('[Communities] proposeCommunity error:', error.message);
    throw new Error('Could not submit this community. Please try again.');
  }
  return data ? mapRow(data) : { ...mapRow(row), id: generateUUID() };
}

export async function approveCommunity(id: string): Promise<void> {
  const { error } = await supabase
    .from('forum_communities')
    .update({ approval_status: 'approved', rejection_reason: null })
    .eq('id', id);
  if (error) {
    console.warn('[Communities] approveCommunity error:', error.message);
    throw new Error('Could not approve this community. Please try again.');
  }
}

export async function rejectCommunity(id: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('forum_communities')
    .update({ approval_status: 'rejected', rejection_reason: reason || 'Did not meet community guidelines.' })
    .eq('id', id);
  if (error) {
    console.warn('[Communities] rejectCommunity error:', error.message);
    throw new Error('Could not reject this community. Please try again.');
  }
}

/**
 * Root-admin-only (enforced by the forum_communities DELETE RLS policy, not
 * just this check) - permanently removes a community, live or pending.
 * Posts already published into it keep their `category` text as-is (posts
 * reference a community by category string, not a foreign key), so deleting
 * a community only removes it from the directory/composer going forward; it
 * does not touch or hide existing threads.
 */
export async function deleteCommunity(id: string): Promise<void> {
  const { error } = await supabase.from('forum_communities').delete().eq('id', id);
  if (error) {
    console.warn('[Communities] deleteCommunity error:', error.message);
    throw new Error('Could not delete this community. Please try again.');
  }
}
