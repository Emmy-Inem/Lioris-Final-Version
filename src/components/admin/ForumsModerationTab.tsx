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
import { listPendingCommunities, approveCommunity, rejectCommunity, ForumCommunityRecord } from '@/api/communities';
import { Post } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { PublishThreadModal } from '@/components/PublishThreadModal';
import { FORUM_COMMUNITIES } from '@/constants/forumCommunities';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

const WORKSPACES = ['All Forums', ...FORUM_COMMUNITIES.filter((c) => c.category).map((c) => c.category as string)];

export function ForumsModerationTab() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [newThreadModalOpen, setNewThreadModalOpen] = useState(false);
  const [section, setSection] = useState<'pending' | 'threads'>('pending');
  const [selectedWorkspace, setSelectedWorkspace] = useState('All Forums');
  const [searchQuery, setSearchQuery] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: pendingCommunities = [], isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ['communities', 'admin-pending'],
    queryFn: () => listPendingCommunities(),
  });

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
    await Promise.all([refetch(), refetchPending()]);
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
            Approve pending communities, publish official announcements, and oversee discourse. Posts themselves are instant - no approval needed.
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
            setSection('pending');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'pending' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'pending' ? 'inverse' : 'secondary'}>
            Pending Communities ({pendingCommunities.length})
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            haptics.light();
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

      {section === 'pending' ? (
        <View>
          {pendingCommunities.map((community) => (
            <SolidCard key={community.id} radius={18} frosted style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.warning}40` }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                <View style={{ flex: 1, marginRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={community.icon} size={18} color={community.accentColor} />
                  <AppText weight="bold" variant="body">
                    {community.label}
                  </AppText>
                </View>
                <Badge label="Pending Review" tone="warning" />
              </View>

              <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginBottom: spacing.md }}>
                {community.description}
              </AppText>

              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
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
              </View>
            </SolidCard>
          ))}

          {!loadingPending && pendingCommunities.length === 0 ? (
            <EmptyState title="No communities awaiting approval" description="Every proposed community has been reviewed." />
          ) : null}
        </View>
      ) : (
        <View>
          {/* Search bar */}
          <View style={{ marginBottom: spacing.sm }}>
            <AppTextField
              label="" placeholder="Search forum posts by title, content, author..." value={searchQuery}
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
                    Author: {post.authorName} ({post.authorRole.toUpperCase()}) • {post.category} • {post.likesCount} Likes • {post.commentsCount} Comments
                  </AppText>
                </View>
                {post.isPinned ? <Badge label="Pinned" tone="brand" /> : null}
              </View>

              <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginBottom: spacing.md }}>
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
                <Pressable
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
            <EmptyState title="No forum discussions found" description="Try selecting a different workspace channel or search term." />
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
    </View>
  );
}
