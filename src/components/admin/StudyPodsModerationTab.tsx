import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { useTheme } from '@/theme/ThemeProvider';
import { supabase } from '@/api/supabase';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

interface AdminPodPost {
  id: string;
  groupId: string;
  groupName: string;
  authorName: string;
  title: string | null;
  body: string;
  kind: string;
  isPinned: boolean;
  createdAt: string;
}

/**
 * Cross-pod admin listing: `study_group_posts` has no existing "every pod,
 * any admin" query in src/api/studyGroups.ts (that module only ever reads
 * one group at a time), so this queries Supabase directly - same pattern
 * app/(admin)/dashboard.tsx already uses for its own admin-only counts.
 * Admins already have unrestricted SELECT/DELETE on study_group_posts via
 * the `sgp_select`/`sgp_delete` RLS policies (supabase/migrations/
 * 20260925110000_study_pods_v2.sql), so no schema change is needed here.
 */
async function listAllPodPostsForAdmin(): Promise<AdminPodPost[]> {
  const { data, error } = await supabase
    .from('study_group_posts')
    .select('id, group_id, title, body, kind, is_pinned, created_at, study_groups(name), profiles(full_name)')
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.study_groups?.name || 'Study pod',
    authorName: row.profiles?.full_name || 'Member',
    title: row.title ?? null,
    body: row.body,
    kind: row.kind,
    isPinned: !!row.is_pinned,
    createdAt: row.created_at,
  }));
}

async function deletePodPostAsAdmin(id: string): Promise<void> {
  const { data, error } = await supabase.from('study_group_posts').delete().eq('id', id).select('id');
  if (error) {
    console.warn('[StudyPodsModerationTab] delete error:', error.message);
    throw new Error('Could not remove this post. Please try again.');
  }
  if (!data || data.length === 0) {
    throw new Error('This post could not be removed. It may already be gone.');
  }
}

/**
 * Lets an admin browse and bulk-remove study pod posts proactively, the same
 * list/search/bulk-delete pattern ResourcesModerationTab uses - there was
 * previously no way to manage pod posts except reactively, through a report
 * landing in the Reports queue.
 */
export function StudyPodsModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data: posts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['study-group-posts', 'admin-all'],
    queryFn: listAllPodPostsForAdmin,
  });

  const filtered = posts.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.title ?? '').toLowerCase().includes(q) ||
      p.body.toLowerCase().includes(q) ||
      p.authorName.toLowerCase().includes(q) ||
      p.groupName.toLowerCase().includes(q)
    );
  });

  function toggleSelected(id: string) {
    haptics.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['study-group-posts'] });
    await refetch();
  }

  async function removeCore(post: AdminPodPost) {
    await deletePodPostAsAdmin(post.id);
    recordAuditLogEntry({
      action: 'event_purged',
      summary: `Removed study pod post in "${post.groupName}" by ${post.authorName}`,
      targetType: 'pod_post',
      targetId: post.id,
      reason: 'Administrative pod cleanup',
    });
  }

  function handleDeleteConfirm(post: AdminPodPost) {
    haptics.error();
    Alert.alert(
      'Remove Post?',
      `Permanently remove this post from "${post.groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActingId(post.id);
            try {
              await removeCore(post);
              await refreshAll();
              Alert.alert('Post Removed', 'The post has been removed from the study pod.');
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not remove this post.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  function getSelectedPosts(): AdminPodPost[] {
    return filtered.filter((p) => selectedIds.has(p.id));
  }

  function handleBulkDelete() {
    const targets = getSelectedPosts();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.error();
    Alert.alert(
      'Remove Posts?',
      `Permanently remove ${targets.length} post${targets.length === 1 ? '' : 's'} from their study pods?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBulkProcessing(true);
            let succeeded = 0;
            let failed = 0;
            for (const post of targets) {
              try {
                await removeCore(post);
                succeeded += 1;
              } catch {
                failed += 1;
              }
            }
            await refreshAll();
            setBulkProcessing(false);
            clearSelection();
            if (failed > 0) haptics.error();
            else haptics.success();
            Alert.alert(
              'Bulk Remove Complete',
              failed > 0
                ? `${succeeded} removed, ${failed} failed. Retry the failed ones individually.`
                : `${succeeded} post${succeeded === 1 ? '' : 's'} removed.`,
            );
          },
        },
      ],
    );
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Study Pod Posts ({filtered.length})
        </AppText>
        <AppText tone="secondary" variant="caption">
          Browse and remove pod posts proactively, not only when a member reports one.
        </AppText>
      </View>

      <View style={{ marginBottom: spacing.md }}>
        <AppTextField label="" placeholder="Search posts, authors, pods..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      {selectedIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 130 }}>
              <AppButton label="Bulk Remove" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkDelete} />
            </View>
          </View>
        </SolidCard>
      )}

      {filtered.map((post) => (
        <SolidCard key={post.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => toggleSelected(post.id)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedIds.has(post.id) }}
              accessibilityLabel={`Select post by ${post.authorName}`}
              style={{ paddingTop: 2 }}
            >
              <Ionicons
                name={selectedIds.has(post.id) ? 'checkbox' : 'square-outline'}
                size={20}
                color={selectedIds.has(post.id) ? colors.brandPrimary : colors.textSecondary}
              />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
                <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                  {post.title || post.groupName}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {post.isPinned ? <Badge label="Pinned" tone="brand" /> : null}
                  <Badge label={post.kind} tone="neutral" />
                </View>
              </View>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                {post.groupName} • by <AppText weight="bold" variant="caption">{post.authorName}</AppText>
              </AppText>
              <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginTop: spacing.xs }}>
                {post.body}
              </AppText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
            <AppButton
              label="Remove"
              variant="secondary"
              size="sm"
              loading={actingId === post.id}
              onPress={() => handleDeleteConfirm(post)}
            />
          </View>
        </SolidCard>
      ))}

      {isError ? (
        <ErrorStateView title="Could not load study pod posts" error={error} onRetry={refetch} />
      ) : !isLoading && filtered.length === 0 ? (
        <EmptyState icon="people-outline" title="No posts found" description="Study pod posts will appear here." />
      ) : null}
    </View>
  );
}
