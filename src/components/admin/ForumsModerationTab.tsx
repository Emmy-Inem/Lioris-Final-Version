import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listFeedPosts, deletePost, updatePost } from '@/api/posts';
import { Post } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

const WORKSPACES = ['All Forums', 'Tech Hub', 'Housing', 'Social', 'Academics'];

interface ModeratorRow {
  name: string;
  username: string;
  role: 'STAFF' | 'STUDENT' | 'ALUMNI';
  isMod: boolean;
}

const MODERATORS: Record<string, ModeratorRow[]> = {
  'Tech Hub': [
    { name: 'Inem Emmanuel', username: '@inememmanuel', role: 'STAFF', isMod: true },
    { name: 'Chioma Okonkwo', username: '@chioma_n', role: 'STUDENT', isMod: true },
  ],
  Housing: [{ name: 'Adekunle Gold', username: '@adekunleg', role: 'STUDENT', isMod: false }],
  Social: [{ name: 'Folake Adeleke', username: '@folake_a', role: 'ALUMNI', isMod: true }],
  Academics: [{ name: 'Dr. Babatunde Lawal', username: '@b_lawal', role: 'STAFF', isMod: true }],
};

export function ForumsModerationTab() {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<'threads' | 'matrix'>('threads');
  const [selectedWorkspace, setSelectedWorkspace] = useState('All Forums');
  const [searchQuery, setSearchQuery] = useState('');
  const [modQuery, setModQuery] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const [modState, setModState] = useState<Record<string, boolean>>({
    '@inememmanuel': true,
    '@chioma_n': true,
    '@adekunleg': false,
    '@folake_a': true,
    '@b_lawal': true,
  });

  const { data: posts = [], isLoading, refetch } = useQuery({
    queryKey: ['feed', 'admin-forums-moderation'],
    queryFn: () => listFeedPosts({}),
  });

  const filteredPosts = posts.filter((p) => {
    const matchesWorkspace =
      selectedWorkspace === 'All Forums' ||
      p.category.toLowerCase() === selectedWorkspace.toLowerCase() ||
      (selectedWorkspace === 'Tech Hub' && p.category.toLowerCase() === 'technology');
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.authorName.toLowerCase().includes(q);
    return matchesWorkspace && matchesSearch;
  });

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
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
      await refetch();
      Alert.alert(newPinned ? 'Thread Pinned' : 'Thread Unpinned', `"${post.title}" has been updated.`);
    } finally {
      setActingId(null);
    }
  }

  function handleDeleteConfirm(post: Post) {
    haptics.error();
    Alert.alert(
      'Takedown Community Post?',
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
              await queryClient.invalidateQueries({ queryKey: ['feed'] });
              await refetch();
              Alert.alert('Post Purged', 'The thread has been removed from all campus feeds.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  const activeMods = Object.values(modState).filter(Boolean).length;

  return (
    <View>
      {/* Top Segmented Controls */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
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

        <Pressable
          onPress={() => {
            haptics.light();
            setSection('matrix');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'matrix' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'matrix' ? 'inverse' : 'secondary'}>
            Moderator Matrix ({activeMods} Active)
          </AppText>
        </Pressable>
      </View>

      {section === 'threads' ? (
        <View>
          {/* Search bar */}
          <View style={{ marginBottom: spacing.sm }}>
            <AppTextField
              label=""
              placeholder="Search forum posts by title, content, author..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Workspace Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
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
                    Author: {post.authorName} ({post.authorRole.toUpperCase()}) &bull; {post.category} &bull; {post.likesCount} Likes &bull; {post.commentsCount} Comments
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
                    variant="secondary"
                    loading={actingId === post.id}
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
      ) : (
        <View>
          {/* Moderator Matrix */}
          <SolidCard frosted style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.brandPrimary} />
              <AppText weight="bold" variant="bodySmall">
                Channel Moderator Directory
              </AppText>
            </View>
            <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
              Toggle real-time moderator permissions for student and faculty volunteers across discussion channels.
            </AppText>
            <AppTextField
              label=""
              placeholder="Filter moderators by name or handle..."
              value={modQuery}
              onChangeText={setModQuery}
            />
          </SolidCard>

          {Object.entries(MODERATORS).map(([channel, list]) => {
            const matches = list.filter((m) => m.name.toLowerCase().includes(modQuery.toLowerCase()) || m.username.toLowerCase().includes(modQuery.toLowerCase()));
            if (matches.length === 0) return null;
            return (
              <SolidCard key={channel} radius={18} frosted style={{ marginBottom: spacing.md }}>
                <AppText weight="bold" tone="brand" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
                  {channel.toUpperCase()} CHANNEL
                </AppText>
                {matches.map((m) => (
                  <View
                    key={m.username}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: spacing.sm,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" variant="bodySmall">
                        {m.name}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {m.username} &bull; {m.role}
                      </AppText>
                    </View>
                    <Switch
                      value={modState[m.username] ?? false}
                      onValueChange={(val) => {
                        haptics.light();
                        setModState((prev) => ({ ...prev, [m.username]: val }));
                      }}
                      trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                    />
                  </View>
                ))}
              </SolidCard>
            );
          })}
        </View>
      )}
    </View>
  );
}
