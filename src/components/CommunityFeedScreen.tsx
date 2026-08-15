import React, { useState } from'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from'react-native';
import Animated, { FadeInUp } from'react-native-reanimated';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { SolidCard } from'./SolidCard';
import { Avatar } from'./Avatar';
import { PostCard } from'./PostCard';
import { PublishThreadModal } from'./PublishThreadModal';
import { DiscussionWorkspacesModal } from'./DiscussionWorkspacesModal';
import { ActionSheetModal } from'./ActionSheetModal';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { listFeedPosts, createPost } from'@/api/posts';
import { getMyProfile } from'@/api/profile';
import { useViewScope } from'@/hooks/useViewScope';
import { useDebouncedValue } from'@/hooks/useDebouncedValue';
import { PostVisibilityScope } from'@/api/types';

const CHANNELS = [
  { id: 'all', label: 'All Threads', category: null },
  { id: 'polls', label: 'Polls', category: 'Polls' },
  { id: 'tech', label: 'Tech Hub', category: 'Tech Hub' },
  { id: 'academic', label: 'Academic', category: 'Academic' },
  { id: 'housing', label: 'Housing', category: 'Housing' },
  { id: 'social', label: 'Campus Life', category: 'Social' },
  { id: 'lost', label: 'Lost & Found', category: 'Lost & Found' },
];

export function CommunityFeedScreen({ scope }: { scope: PostVisibilityScope }) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const { scope: viewScope, setScope: setViewScope } = useViewScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });
  const viewerInstitutionCode = profile?.institutionCode;

  const { data: rawPosts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed', scope, 'full', debouncedQuery, viewScope, viewerInstitutionCode, selectedChannel],
    queryFn: () =>
      listFeedPosts({
        scope,
        q: debouncedQuery || undefined,
        viewScope,
        viewerInstitutionCode,
        category: selectedChannel === 'Polls' ? undefined : selectedChannel ?? undefined,
      }),
  });

  let posts = rawPosts ?? [];
  if (selectedChannel === 'Polls') {
    posts = posts.filter((p) => !!p.poll);
  }
  posts = [...posts].sort((a, b) =>
    sortBy === 'popular' ? b.likesCount - a.likesCount : b.createdAt.localeCompare(a.createdAt),
  );

  async function handlePublish(payload: {
    title: string;
    content: string;
    category: string;
    visibilityScope: 'student' | 'global';
    scopeVisibility: 'campus' | 'global';
    sponsored: boolean;
    courseTags?: string;
    postFormat: 'Thread' | 'Rapid-Fire Conversation';
    imageUrl?: string;
    videoUrl?: string;
    pollQuestion?: string;
    pollOptions?: string[];
  }) {
    const { pollQuestion, pollOptions, ...rest } = payload;
    const poll =
      pollQuestion && pollOptions && pollOptions.length > 0
        ? {
            question: pollQuestion,
            options: pollOptions.map((opt, i) => ({ id: `opt-${i + 1}`, label: opt, votes: 0, isVotedByMe: false })),
            totalVotes: 0,
            expiresIn: '7 days left',
          }
        : undefined;

    await createPost({
      ...rest,
      poll: poll || undefined,
      pollQuestion: pollQuestion || undefined,
      authorInstitutionCode: viewerInstitutionCode,
    });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  }

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.sm }}>
      <AppHeader />

      {/* Screen Title & Workspace Selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
          <AppText variant="h1" weight="bold">
            Campus Forum 
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ fontSize: 12 }}>
            Trending discussions, polls, and academic threads
          </AppText>
        </View>

        <Pressable
          onPress={() => setWorkspacesOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open discussion workspaces"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.pastelPrimaryBg,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 7,
            flexShrink: 0,
          }}
        >
          <Ionicons name="chatbubbles" size={15} color={colors.brandPrimary} />
          <AppText weight="bold" tone="brand" variant="caption">
            Channels
          </AppText>
        </Pressable>
      </View>

      {/* Scope Switcher: My Campus vs. Global */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          padding: 4,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {(['campus', 'global'] as const).map((s) => {
          const selected = viewScope === s;
          return (
            <Pressable
              key={s}
              onPress={() => setViewScope(s)}
              accessibilityRole="tab"accessibilityState={{ selected }}
              accessibilityLabel={s === 'campus' ? 'My Campus Feed' : 'Global Network Feed'}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
                alignItems: 'center',
              }}
            >
              <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                {s === 'campus' ? 'My Campus' : '🌍 Global Network'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Quick Search & Sort Bar */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            height: 42,
          }}
        >
          <Ionicons name="search"size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search discussions, polls, courses..."placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle"size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSortModalOpen(true)}
          accessibilityRole="button"accessibilityLabel={`Sort: ${sortBy === 'latest' ? 'Latest' : 'Most Popular'}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            height: 42,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name="swap-vertical"size={16} color={colors.textSecondary} />
          <AppText variant="caption"weight="semiBold"tone="secondary">
            {sortBy === 'latest' ? 'Latest' : 'Top'}
          </AppText>
        </Pressable>
      </View>

      {/* Horizontal Channel Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.sm }}
        style={{ marginBottom: spacing.xs }}
      >
        {CHANNELS.map((ch) => {
          const selected = selectedChannel === ch.category;
          return (
            <Pressable
              key={ch.id}
              onPress={() => setSelectedChannel(ch.category)}
              accessibilityRole="button"accessibilityState={{ selected }}
              style={{
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText
                variant="caption"weight={selected ? 'bold' : 'medium'}
                tone={selected ? 'inverse' : 'secondary'}
              >
                {ch.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Interactive Quick Thread Composer Bar */}
      <Pressable
        onPress={() => setComposerOpen(true)}
        accessibilityRole="button"accessibilityLabel="Start a new thread or create a poll"
      >
        <SolidCard backgroundColor={colors.surface} radius={18} style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={user?.fullName ?? 'You'} size={38} role={user?.role} />
            <View style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
              <AppText tone="secondary"variant="bodySmall">
                Start a discussion or create a poll...
              </AppText>
            </View>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.brandPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="add"size={20} color="#FFFFFF" />
            </View>
          </View>
        </SolidCard>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer glow={true}>
      {/* Single Unified Threads FlatList for 100% smooth scrolling */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 130 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(220)}>
            <PostCard post={item} />
          </Animated.View>
        )}
        showsVerticalScrollIndicator={false}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name="chatbubbles-outline"size={32} color={colors.brandPrimary} />
              </View>
              <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.xs }}>
                No Threads in this Channel Yet
              </AppText>
              <AppText tone="secondary"variant="bodySmall"style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                Be the first to share an academic question or start a discussion for your cohort.
              </AppText>
            </View>
          ) : null
        }
      />

      {/* Sort Options Modal */}
      <ActionSheetModal visible={sortModalOpen} onClose={() => setSortModalOpen(false)}>
        <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.md }}>
          Sort Threads By 
        </AppText>
        {(['latest', 'popular'] as const).map((option) => {
          const selected = sortBy === option;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setSortBy(option);
                setSortModalOpen(false);
              }}
              accessibilityRole="radio"accessibilityState={{ checked: selected }}
              accessibilityLabel={option === 'latest' ? 'Most Recent' : 'Most Upvoted'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? colors.brandPrimary : colors.textSecondary}
              />
              <AppText weight={selected ? 'bold' : 'regular'} tone={selected ? 'brand' : 'primary'}>
                {option === 'latest' ? 'Most Recent (Latest First)' : 'Most Upvoted (Top Discussion)'}
              </AppText>
            </Pressable>
          );
        })}
      </ActionSheetModal>

      <PublishThreadModal visible={composerOpen} onClose={() => setComposerOpen(false)} onPublish={handlePublish} />
      <DiscussionWorkspacesModal visible={workspacesOpen} onClose={() => setWorkspacesOpen(false)} />
    </ScreenContainer>
  );
}
