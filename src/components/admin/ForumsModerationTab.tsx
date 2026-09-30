import React, { useState } from'react';
import { Alert, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { Badge } from'@/components/Badge';
import { AppButton } from'@/components/AppButton';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listFeedPosts, deletePost, updatePost, createPost } from '@/api/posts';
import { listCommunities, approveCommunity, rejectCommunity, deleteCommunity, ForumCommunityRecord } from '@/api/communities';
import { Post } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { PublishThreadModal } from '@/components/PublishThreadModal';
import { CommunityManageModal } from '@/components/CommunityManageModal';
import { FORUM_COMMUNITIES } from '@/constants/forumCommunities';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

const WORKSPACES = ['All Forums', ...FORUM_COMMUNITIES.filter((c) => c.category).map((c) => c.category as string)];

const COMMUNITY_STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'] as const;
type CommunityStatusFilter = (typeof COMMUNITY_STATUS_FILTERS)[number];

const COMMUNITY_STATUS_ORDER: Record<ForumCommunityRecord['approvalStatus'], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export function ForumsModerationTab() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [newThreadModalOpen, setNewThreadModalOpen] = useState(false);
  const [section, setSection] = useState<'communities' | 'threads'>('communities');
  const [selectedWorkspace, setSelectedWorkspace] = useState('All Forums');
  const [searchQuery, setSearchQuery] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [communityStatusFilter, setCommunityStatusFilter] = useState<CommunityStatusFilter>('All');
  const [editingCommunity, setEditingCommunity] = useState<ForumCommunityRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data: communities = [], isLoading: loadingCommunities, refetch: refetchCommunities } = useQuery({
    queryKey: ['communities', 'admin-all'],
    queryFn: () => listCommunities(),
  });

  const filteredCommunities = communities
    .filter((c) => communityStatusFilter === 'All' || c.approvalStatus === communityStatusFilter.toLowerCase())
    .slice()
    .sort((a, b) => COMMUNITY_STATUS_ORDER[a.approvalStatus] - COMMUNITY_STATUS_ORDER[b.approvalStatus]);

  const { data: posts = [], isLoading, refetch } = useQuery({
    queryKey: ['feed', 'admin-forums-moderation'],
    queryFn: () => listFeedPosts({}),
  });

  const filteredPosts = posts.filter((p) => {
    const matchesWorkspace =
      selectedWorkspace === 'All Forums' || p.category.toLowerCase() === selectedWorkspace.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.authorName.toLowerCase().includes(q);
    return matchesWorkspace && matchesSearch;
  });

  async function refreshEverything() {
    await queryClient.invalidateQueries({ queryKey: ['feed'] });
    await queryClient.invalidateQueries({ queryKey: ['communities'] });
    await Promise.all([refetch(), refetchCommunities()]);
  }

  async function handleApproveCommunity(community: ForumCommunityRecord) {
    haptics.medium();
    setActingId(community.id);
    try {
      await approveCommunity(community.id);
      recordAuditLogEntry({
        action: 'community_approved',
        summary: `Approved community: "${community.label}"`,
        targetType: 'community',
        targetId: community.id,
        reason: 'Community approval',
      });
      await refreshEverything();
      toast.success(`"${community.label}" is now live on the Forum.`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not approve this community.');
    } finally {
      setActingId(null);
    }
  }

  function handleRejectCommunityConfirm(community: ForumCommunityRecord) {
    haptics.error();
    Alert.alert(
      'Reject Community?',
      `"${community.label}" will stay hidden and its proposer will see it was not approved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActingId(community.id);
            try {
              await rejectCommunity(community.id, 'Did not meet community guidelines.');
              recordAuditLogEntry({
                action: 'community_rejected',
                summary: `Rejected community: "${community.label}"`,
                targetType: 'community',
                targetId: community.id,
                reason: 'Did not meet community guidelines.',
              });
              await refreshEverything();
              toast.info(`"${community.label}" was rejected.`);
            } catch (err: any) {
              toast.error(err?.message || 'Could not reject this community.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  function handleDeleteCommunityConfirm(community: ForumCommunityRecord) {
    haptics.error();
    Alert.alert(
      'Delete Community?',
      `"${community.label}" will be permanently removed from the Forum directory. This cannot be undone. Existing posts already published under this community keep their category tag - only the community itself (and the ability to join or post into it going forward) is removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setActingId(community.id);
            try {
              await deleteCommunity(community.id);
              recordAuditLogEntry({
                action: 'community_deleted',
                summary: `Deleted community: "${community.label}"`,
                targetType: 'community',
                targetId: community.id,
                reason: `Removed by admin (was ${community.approvalStatus}).`,
              });
              await refreshEverything();
              toast.info(`"${community.label}" was permanently deleted.`);
            } catch (err: any) {
              toast.error(err?.message || 'Could not delete this community.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

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

  async function handleBulkApproveCommunities() {
    const targets = communities.filter((c) => selectedIds.has(c.id) && c.approvalStatus === 'pending');
    if (targets.length === 0 || bulkProcessing) return;
    haptics.medium();
    setBulkProcessing(true);
    let succeeded = 0;
    let failed = 0;
    for (const community of targets) {
      try {
        await approveCommunity(community.id);
        recordAuditLogEntry({
          action: 'community_approved',
          summary: `Approved community: "${community.label}"`,
          targetType: 'community',
          targetId: community.id,
          reason: 'Community approval (bulk)',
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshEverything();
    setBulkProcessing(false);
    clearSelection();
    if (failed > 0) haptics.error();
    else haptics.success();
    Alert.alert('Bulk Approve Complete', failed > 0 ? `${succeeded} approved, ${failed} failed. Retry the failed ones individually.` : `${succeeded} communit${succeeded === 1 ? 'y' : 'ies'} approved.`);
  }

  function handleBulkRejectCommunities() {
    const targets = communities.filter((c) => selectedIds.has(c.id) && c.approvalStatus === 'pending');
    if (targets.length === 0 || bulkProcessing) return;
    haptics.error();
    Alert.alert('Reject These Communities?', `${targets.length} communit${targets.length === 1 ? 'y' : 'ies'} will stay hidden and their proposers will see they were not approved.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBulkProcessing(true);
          let succeeded = 0;
          let failed = 0;
          for (const community of targets) {
            try {
              await rejectCommunity(community.id, 'Did not meet community guidelines.');
              recordAuditLogEntry({
                action: 'community_rejected',
                summary: `Rejected community: "${community.label}"`,
                targetType: 'community',
                targetId: community.id,
                reason: 'Did not meet community guidelines (bulk).',
              });
              succeeded += 1;
            } catch {
              failed += 1;
            }
          }
          await refreshEverything();
          setBulkProcessing(false);
          clearSelection();
          if (failed > 0) haptics.error();
          else haptics.success();
          Alert.alert('Bulk Reject Complete', failed > 0 ? `${succeeded} rejected, ${failed} failed. Retry the failed ones individually.` : `${succeeded} communit${succeeded === 1 ? 'y' : 'ies'} rejected.`);
        },
      },
    ]);
  }

  async function handleTogglePin(post: Post) {
    haptics.medium();
    setActingId(post.id);
    const newPinned = !post.isPinned;
    try {
      await updatePost(post.id, { isPinned: newPinned });
      recordAuditLogEntry({
        action: 'event_approval_revoked',
        summary: `${newPinned ? 'Pinned announcement' : 'Unpinned'}: "${post.title}"`,
        targetType: 'post',
        targetId: post.id,
        reason: 'Forum announcement moderation',
      });
      await refreshEverything();
      Alert.alert(newPinned ? 'Thread Pinned' : 'Thread Unpinned', `"${post.title}" has been updated.`);
    } finally {
      setActingId(null);
    }
  }

  function handleDeleteConfirm(post: Post) {
    haptics.error();
    Alert.alert(
      'Takedown Thread?',
      `Permanently purge "${post.title}" and remove all comments?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Takedown Post',
          style: 'destructive',
          onPress: async () => {
            setActingId(post.id);
            try {
              await deletePost(post.id);
              recordAuditLogEntry({
                action: 'event_purged',
                summary: `Purged violating community post: "${post.title}" by ${post.authorName}`,
                targetType: 'post',
                targetId: post.id,
                reason: 'Community guidelines violation purge',
              });
              await refreshEverything();
              Alert.alert('Post Purged', 'The thread has been removed from the Forum.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <View>
      {/* Admin Action Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <AppText variant="h3" weight="bold">
            Forums & Discourse Control
          </AppText>
          <AppText variant="caption" tone="secondary">
            Approve, reject, or permanently remove communities, publish official announcements, and oversee discourse. Posts themselves are instant - no approval needed.
          </AppText>
        </View>
        <AppButton
          label="+ Post Official Thread"
          variant="primary"
          icon="megaphone-outline"
          onPress={() => {
            haptics.light();
            setNewThreadModalOpen(true);
          }}
        />
      </View>

      {/* Top Segmented Controls */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => {
            haptics.light();
            setSection('communities');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'communities' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'communities' ? 'inverse' : 'secondary'}>
            Communities ({communities.length})
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            haptics.light();
            clearSelection();
            setSection('threads');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'threads' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'threads' ? 'inverse' : 'secondary'}>
            Live Forum Threads ({posts.length})
          </AppText>
        </Pressable>
      </View>

      {section === 'communities' ? (
        <View>
          {/* Status Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
            style={{ flex: 1, minWidth: 0 }}
          >
            {COMMUNITY_STATUS_FILTERS.map((f) => {
              const selected = communityStatusFilter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    haptics.light();
                    setCommunityStatusFilter(f);
                  }}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 5,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.brandPrimary : colors.divider,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                    {f}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedIds.size > 0 && (
            <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
                </View>
                <View style={{ flexShrink: 0 }}>
                  <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
                </View>
                <View style={{ flexShrink: 0, minWidth: 110 }}>
                  <AppButton label="Bulk Reject" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkRejectCommunities} />
                </View>
                <View style={{ flexShrink: 0, minWidth: 130 }}>
                  <AppButton label="Bulk Approve" size="sm" loading={bulkProcessing} onPress={handleBulkApproveCommunities} />
                </View>
              </View>
            </SolidCard>
          )}

          {filteredCommunities.map((community) => {
            const badge =
              community.approvalStatus === 'pending'
                ? { label: 'Pending Review', tone: 'warning' as const }
                : community.approvalStatus === 'approved'
                ? { label: 'Approved', tone: 'success' as const }
                : { label: 'Rejected', tone: 'critical' as const };
            const borderColor =
              community.approvalStatus === 'pending'
                ? `${colors.warning}40`
                : community.approvalStatus === 'rejected'
                ? `${colors.critical}30`
                : colors.border;

            return (
              <SolidCard key={community.id} radius={18} frosted style={{ marginBottom: spacing.md, borderWidth: 1, borderColor }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                  <View style={{ flex: 1, marginRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {community.approvalStatus === 'pending' ? (
                      <Pressable
                        onPress={() => toggleSelected(community.id)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selectedIds.has(community.id) }}
                        accessibilityLabel={`Select ${community.label}`}
                      >
                        <Ionicons
                          name={selectedIds.has(community.id) ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={selectedIds.has(community.id) ? colors.brandPrimary : colors.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setEditingCommunity(community)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Ionicons name={community.icon} size={18} color={community.accentColor} />
                      <AppText weight="bold" variant="body">
                        {community.label}
                      </AppText>
                      <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>

                <AppText
                  tone="secondary"
                  variant="bodySmall"
                  style={{ marginBottom: community.approvalStatus === 'rejected' && community.rejectionReason ? spacing.xs : spacing.md }}
                >
                  {community.description}
                </AppText>

                {community.approvalStatus === 'rejected' && community.rejectionReason ? (
                  <AppText tone="secondary" variant="caption" style={{ fontStyle: 'italic', marginBottom: spacing.md }}>
                    Reason: {community.rejectionReason}
                  </AppText>
                ) : null}

                <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: community.approvalStatus === 'pending' ? 'flex-start' : 'flex-end' }}>
                  {community.approvalStatus === 'pending' ? (
                    <>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          label="Approve"
                          variant="primary"
                          loading={actingId === community.id}
                          onPress={() => handleApproveCommunity(community)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          label="Reject"
                          variant="secondary"
                          loading={actingId === community.id}
                          onPress={() => handleRejectCommunityConfirm(community)}
                        />
                      </View>
                    </>
                  ) : null}
                  <AppButton
                    label="Edit Space"
                    variant="secondary"
                    icon="create-outline"
                    onPress={() => setEditingCommunity(community)}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete"
                    onPress={() => handleDeleteCommunityConfirm(community)}
                    disabled={actingId === community.id}
                    hitSlop={8}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.md,
                      backgroundColor: colors.divider,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: actingId === community.id ? 0.5 : 1,
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.critical} />
                  </Pressable>
                </View>
              </SolidCard>
            );
          })}

          {!loadingCommunities && filteredCommunities.length === 0 ? (
            <EmptyState
              title={communityStatusFilter === 'All' ? 'No communities yet' : `No ${communityStatusFilter.toLowerCase()} communities`}
              description={
                communityStatusFilter === 'Pending'
                  ? 'Every proposed community has been reviewed.'
                  : 'Try a different status filter.'
              }
            />
          ) : null}
        </View>
      ) : (
        <View>
          {/* Search bar */}
          <View style={{ marginBottom: spacing.sm }}>
            <AppTextField
              label="" placeholder="Search posts" value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Workspace Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
            style={{ flex: 1, minWidth: 0 }}
          >
            {WORKSPACES.map((w) => {
              const selected = selectedWorkspace === w;
              return (
                <Pressable
                  key={w}
                  onPress={() => {
                    haptics.light();
                    setSelectedWorkspace(w);
                  }}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 5,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.brandPrimary : colors.divider,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                    {w}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Posts List */}
          {filteredPosts.map((post) => (
            <SolidCard key={post.id} radius={18} frosted style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {post.isPinned ? (
                      <Ionicons name="pin" size={14} color={colors.brandPrimary} />
                    ) : null}
                    <AppText weight="bold" variant="body">
                      {post.title}
                    </AppText>
                  </View>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Author: {post.authorName} ({post.authorRole.toUpperCase()}) • {post.category} • {post.likesCount} Helpful • {post.commentsCount} Replies
                  </AppText>
                </View>
                {post.isPinned ? <Badge label="Pinned" tone="neutral" /> : null}
              </View>

              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                {post.content}
              </AppText>

              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={post.isPinned ? 'Unpin' : 'Pin Announcement'}
                    variant="secondary" loading={actingId === post.id}
                    onPress={() => handleTogglePin(post)}
                  />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Delete"
                  onPress={() => handleDeleteConfirm(post)}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.divider,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.critical} />
                </Pressable>
              </View>
            </SolidCard>
          ))}

          {!isLoading && filteredPosts.length === 0 ? (
            <EmptyState title="No forum discussions found" description="Try selecting a different forum channel or search term." />
          ) : null}
        </View>
      )}
      {/* Admin Publish Thread Modal */}
      <PublishThreadModal
        visible={newThreadModalOpen}
        onClose={() => setNewThreadModalOpen(false)}
        onPublish={async (payload) => {
          await createPost(payload);
          await refreshEverything();
          toast.success('Official announcement published to the Forum!');
        }}
      />

      {editingCommunity ? (
        <CommunityManageModal
          visible={!!editingCommunity}
          onClose={() => {
            setEditingCommunity(null);
            refetchCommunities();
          }}
          community={editingCommunity}
          isAdmin={true}
        />
      ) : null}
    </View>
  );
}
