import React, { useState } from'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from'react-native';
import Animated, { FadeInUp } from'react-native-reanimated';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { SolidCard } from'./SolidCard';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { PostCard } from './PostCard';
import { PublishThreadModal } from './PublishThreadModal';
import { DiscussionWorkspacesModal } from './DiscussionWorkspacesModal';

import { ActionSheetModal } from './ActionSheetModal';
import { AnnouncementsWidget } from './AnnouncementsWidget';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts, createPost } from '@/api/posts';
import { getMyProfile } from '@/api/profile';
import { useViewScope } from '@/hooks/useViewScope';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { ShimmerCardList } from './ShimmerSkeleton';
import { UserProfileQuickViewModal, QuickViewUser } from './UserProfileQuickViewModal';
import { EmptyState } from './EmptyState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PostVisibilityScope } from '@/api/types';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

const CHANNELS = [
  { id: 'all', label: 'All Threads', category: null, icon: 'chatbubbles' as const },
  { id: 'polls', label: 'Polls & Votes', category: 'Polls', icon: 'stats-chart' as const, flagKey: 'discussion_workspaces' as const },
  { id: 'tech', label: 'Tech & Code Hub', category: 'Tech Hub', icon: 'code-slash' as const },
  { id: 'academic', label: 'Academic & Courses', category: 'Academic', icon: 'school' as const },
  { id: 'housing', label: 'Hostel & Housing', category: 'Housing', icon: 'home' as const },
  { id: 'social', label: 'Campus Life & Sports', category: 'Social', icon: 'people' as const },
  { id: 'lost', label: 'Lost & Found', category: 'Lost & Found', icon: 'search' as const },
];

export function CommunityFeedScreen({ scope }: { scope: PostVisibilityScope }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const { isDesktop, isWideDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';

  const params = useLocalSearchParams<{ category?: string }>();
  const toast = useToast();
  const [quickViewUser, setQuickViewUser] = useState<QuickViewUser | null>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(params.category || null);

  React.useEffect(() => {
    if (params.category) {
      setSelectedChannel(params.category);
    }
  }, [params.category]);

 const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
 const [sortModalOpen, setSortModalOpen] = useState(false);
 const { scope: viewScope, setScope: setViewScope } = useViewScope();
 // activeCampusCode lets an admin's "Explore Other Campus Workspaces" pick
 // (Settings/Workdesk -> Change Workspace Scope) actually change which
 // campus's threads show here too, not just their own home campus.
  const { activeCampusCode, homeInstitutionCode } = useCampusScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });
  const viewerInstitutionCode =
    activeCampusCode && activeCampusCode !== 'GLOBAL'
      ? activeCampusCode
      : homeInstitutionCode && homeInstitutionCode !== 'GLOBAL'
      ? homeInstitutionCode
      : profile?.institutionCode && profile.institutionCode !== 'GLOBAL'
      ? profile.institutionCode
      : 'UI';

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

  // Top Trending Discussions & Hot Topics
  const trendingTopics = React.useMemo(() => {
    const sorted = [...(rawPosts ?? [])].sort(
      (a, b) => (b.likesCount + (b.commentsCount ?? 0) * 2) - (a.likesCount + (a.commentsCount ?? 0) * 2),
    );
    const topPosts = sorted.slice(0, 5);
    const hotTags = [
      { id: 'tag-1', title: '#TechHackathon', category: 'Tech Hub', engagement: '🔥 42 active' },
      { id: 'tag-2', title: '#FinalsRevision', category: 'Academic', engagement: '📚 118 students' },
      { id: 'tag-3', title: '#HostelAllocations', category: 'Housing', engagement: '⚡ Hot topic' },
      { id: 'tag-4', title: '#CampusSportsFest', category: 'Social', engagement: '🏆 28 teams' },
    ];
    return { topPosts, hotTags };
  }, [rawPosts]);

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
    <View style={{ marginBottom: spacing.xs }}>
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Scope Switcher in 1 Unified Clean Row */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: spacing.xs, marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 }}>
          <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 22 }}>
            Campus Forum
          </AppText>
        </View>

        {!isDesktop && (
          <View
            style={{
              flexDirection: 'row',
              flexShrink: 0,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              padding: 2,
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
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.brandPrimary : 'transparent',
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'} style={{ fontSize: 11 }}>
                    {s === 'campus' ? 'My Campus' : 'Global'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* 24h Campus Stories & Fleets */}

      {/* Gamification & Streaks Widget */}

      {/* Quick Search & Sort Bar */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            backgroundColor: colors.surface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            height: 40,
          }}
        >
          <Ionicons name="search" size={15} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search discussions, topics, codes..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSortModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortBy === 'latest' ? 'Latest' : 'Most Popular'}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            height: 40,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
          <AppText variant="caption" weight="semiBold" tone="secondary" style={{ fontSize: 11 }}>
            {sortBy === 'latest' ? 'Latest' : 'Top'}
          </AppText>
        </Pressable>
      </View>

      {/* 🔥 Currently Threading Section */}
      {isFeatureEnabled('forum_trends') && (
        <View style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="flame" size={15} color="#EF4444" />
              <AppText weight="bold" variant="caption" style={{ letterSpacing: 0.5, textTransform: 'uppercase', color: '#EF4444' }}>
                Currently Threading
              </AppText>
            </View>
            <AppText tone="secondary" variant="caption" style={{ fontSize: 10 }}>
              Live Discussions
            </AppText>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
            style={{ width: '100%', flexGrow: 0 }}
            {...({ 'data-horizontal-scroll': 'true' } as any)}
          >
            {trendingTopics.topPosts.length > 0 ? (
              trendingTopics.topPosts.map((tp) => (
                <Pressable
                  key={tp.id}
                  onPress={() => router.push(`/${roleGroup}/post/${tp.id}` as any)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    maxWidth: 220,
                    minWidth: 160,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Ionicons name="flame" size={12} color="#EF4444" />
                    <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }} numberOfLines={1}>
                      {tp.category}
                    </AppText>
                  </View>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ fontSize: 12 }}>
                    {tp.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <AppText tone="secondary" variant="caption" style={{ fontSize: 10 }}>
                      ❤️ {tp.likesCount}
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ fontSize: 10 }}>
                      💬 {tp.commentsCount ?? 0}
                    </AppText>
                  </View>
                </Pressable>
              ))
            ) : (
              trendingTopics.hotTags.map((ht) => (
                <Pressable
                  key={ht.id}
                  onPress={() => setQuery(ht.title.replace('#', ''))}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText weight="bold" variant="caption" tone="brand">
                    {ht.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ fontSize: 10, marginTop: 2 }}>
                    {ht.engagement}
                  </AppText>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Horizontal Channel Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 16, paddingBottom: 6 }}
        style={{ width: '100%', flexGrow: 0, marginBottom: spacing.xs }}
        {...({ 'data-horizontal-scroll': 'true' } as any)}
      >
        {CHANNELS.filter((ch: any) => (ch.flagKey ? isFeatureEnabled(ch.flagKey) : true)).map((ch) => {
          const selected = selectedChannel === ch.category;
          return (
            <Pressable
              key={ch.id}
              onPress={() => setSelectedChannel(ch.category)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText
                variant="caption"
                weight={selected ? 'bold' : 'medium'}
                tone={selected ? 'inverse' : 'secondary'}
                style={{ fontSize: 11 }}
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
        accessibilityRole="button"
        accessibilityLabel="Start a new thread or create a poll"
        style={{ marginTop: 2, marginBottom: spacing.sm }}
      >
        <SolidCard backgroundColor={colors.surface} radius={16} style={{ padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Avatar name={user?.fullName ?? 'You'} size={34} role={user?.role} />
            <View style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 }}>
              <AppText tone="secondary" variant="bodySmall" style={{ fontSize: 12 }}>
                Start a discussion or create a poll...
              </AppText>
            </View>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.brandPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
            </View>
          </View>
        </SolidCard>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer glow={true}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30, alignItems: 'flex-start' }}>
          {/* Main Feed Column */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Desktop Channel Pills & Sort Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8, paddingRight: spacing.sm }}>
                {CHANNELS.map((ch) => {
                  const isSelected = selectedChannel === ch.category || (ch.id === 'all' && selectedChannel === null);
                  return (
                    <Pressable
                      key={ch.id}
                      onPress={() => setSelectedChannel(ch.category)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Ionicons
                        name={ch.icon}
                        size={14}
                        color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={isSelected ? 'bold' : 'medium'}
                        style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                      >
                        {ch.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Sort Pill */}
              <Pressable
                onPress={() => setSortBy(sortBy === 'latest' ? 'popular' : 'latest')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexShrink: 0,
                }}
              >
                <Ionicons name="swap-vertical" size={14} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">
                  {sortBy === 'latest' ? 'Latest' : 'Top Upvoted'}
                </AppText>
              </Pressable>
            </View>

            {/* Quick Desktop Composer Box */}
            <SolidCard radius={18} style={{ padding: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm }}>
                <Avatar name={user?.fullName || 'User'} uri={profile?.avatarUrl} size={42} />
                <Pressable
                  onPress={() => setComposerOpen(true)}
                  style={{
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                    borderRadius: radius.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <AppText tone="secondary" variant="bodySmall">
                    What's on your mind? Share an update or start a thread...
                  </AppText>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Pressable
                    onPress={() => setComposerOpen(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="image-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Photo / Media</AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => setComposerOpen(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="stats-chart-outline" size={16} color="#10B981" />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Create Poll</AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => setComposerOpen(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="pricetag-outline" size={16} color="#F59E0B" />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Topic Hub</AppText>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => setComposerOpen(true)}
                  style={{
                    backgroundColor: colors.brandPrimary,
                    paddingHorizontal: 16,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone="inverse">
                    + Post Thread
                  </AppText>
                </Pressable>
              </View>
            </SolidCard>



            {/* Posts Feed Stream */}
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(220)}>
                  <PostCard post={item} />
                </Animated.View>
              )}
              showsVerticalScrollIndicator={true}
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
                      <Ionicons name="chatbubbles-outline" size={32} color={colors.brandPrimary} />
                    </View>
                    <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                      No Threads in this Channel Yet
                    </AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                      Be the first to share an academic question or start a discussion for your cohort.
                    </AppText>
                  </View>
                ) : null
              }
            />
          </View>

          {/* Right Sidebar: Hubs, Mentors & Guidelines */}
          <View style={{ width: isWideDesktop ? 320 : 280, flexShrink: 0, gap: spacing.md }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <AppText variant="h3" weight="bold">
                  Discussion Hubs
                </AppText>
                <Pressable onPress={() => setWorkspacesOpen(true)}>
                  <AppText variant="caption" weight="bold" tone="brand">Explore →</AppText>
                </Pressable>
              </View>
              <AppText tone="secondary" variant="caption">
                No active discussion hubs for this workspace yet.
              </AppText>
            </SolidCard>

            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                Community Rules
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
                Lioris is a verified academic community. Keep discussions constructive, helpful, and respectful.
              </AppText>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                  <AppText variant="caption" tone="secondary">Be helpful & respectful</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                  <AppText variant="caption" tone="secondary">No academic dishonesty</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                  <AppText variant="caption" tone="secondary">Report spam to Campus Staff</AppText>
                </View>
              </View>
            </SolidCard>
          </View>
        </View>
      ) : (
      /* Mobile Single Column FlatList */
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 120 }}
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
                <Ionicons name="chatbubbles-outline" size={32} color={colors.brandPrimary} />
              </View>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                No Threads in this Channel Yet
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                Be the first to share an academic question or start a discussion for your cohort.
              </AppText>
            </View>
          ) : null
        }
      />
    )}

    {/* Sort Options Modal */}
    <ActionSheetModal visible={sortModalOpen} onClose={() => setSortModalOpen(false)}>
      <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
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
    <UserProfileQuickViewModal user={quickViewUser} visible={!!quickViewUser} onClose={() => setQuickViewUser(null)} />

    {/* Floating Action Button (FAB) - Compact Floating Plus Icon */}
    <Pressable
      onPress={() => {
        haptics.medium();
        setComposerOpen(true);
      }}
      accessibilityRole="button"
      accessibilityLabel="Create new thread"
      style={{
        position: 'absolute',
        bottom: isDesktop ? 30 : 88,
        right: 18,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.brandPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
        elevation: 8,
        zIndex: 999,
      }}
    >
      <Ionicons name="add" size={26} color="#FFFFFF" />
    </Pressable>
  </ScreenContainer>
  );
}
