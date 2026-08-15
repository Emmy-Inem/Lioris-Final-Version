import React, { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';
import { PublishThreadModal } from './PublishThreadModal';
import { DiscussionWorkspacesModal } from './DiscussionWorkspacesModal';
import { ActionSheetModal } from './ActionSheetModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { listFeedPosts, createPost } from '@/api/posts';
import { getMyProfile } from '@/api/profile';
import { useViewScope } from '@/hooks/useViewScope';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PostVisibilityScope } from '@/api/types';

// Matches PublishThreadModal's CHANNELS list — the categories a post
// can actually be created under, so "Filter by category" only offers
// values that exist in the data.
const CATEGORY_OPTIONS = ['Tech Hub', 'Housing', 'Social', 'Lost & Found'] as const;

/**
 * "Forum" in the reference app's bottom nav — the community discussion
 * feed / "Network Hub". Shared across all four roles (only the
 * audience scope differs) rather than duplicated per role.
 *
 * Content scoping rule: a post can be published for "This University
 * Only" (visible solely to users from the author's own institution) or
 * "Global" (visible everywhere). Users can always see Global content
 * regardless of which university they belong to, but never see another
 * university's campus-only posts. The My Campus / Global toggle below
 * narrows the *view* within what's already visible under that rule —
 * it doesn't grant access to anything a user couldn't already see.
 */
export function CommunityFeedScreen({ scope }: { scope: PostVisibilityScope }) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
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
    queryKey: ['feed', scope, 'full', debouncedQuery, viewScope, viewerInstitutionCode, categoryFilter],
    queryFn: () => listFeedPosts({ scope, q: debouncedQuery || undefined, viewScope, viewerInstitutionCode, category: categoryFilter ?? undefined }),
  });

  // Sort is client-side since it's just reordering what the API
  // already returned, not a separate fetch.
  const posts = rawPosts
    ? [...rawPosts].sort((a, b) =>
        sortBy === 'popular' ? b.likesCount - a.likesCount : b.createdAt.localeCompare(a.createdAt),
      )
    : rawPosts;

  async function handlePublish(payload: {
    title: string;
    content: string;
    category: string;
    visibilityScope: 'student' | 'global';
    scopeVisibility: 'campus' | 'global';
    sponsored: boolean;
    courseTags?: string;
    postFormat: 'Thread' | 'Rapid-Fire Conversation';
  }) {
    await createPost({ ...payload, authorInstitutionCode: viewerInstitutionCode });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => setWorkspacesOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open discussion workspaces"
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.brandPrimary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="menu" size={18} color="#FFFFFF" />
          </View>
        </Pressable>
        <View>
          <AppText variant="h2" weight="bold" style={{ color: colors.brandPrimary }}>
            Network Hub 🌐
          </AppText>
        </View>
      </View>

      {/* Global / My Campus toggle — the same shared state the header's workspace pill controls. */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.md }}>
        {(['campus', 'global'] as const).map((s) => {
          const selected = viewScope === s;
          return (
            <Pressable
              key={s}
              onPress={() => setViewScope(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={s === 'campus' ? 'My Campus' : 'Global'}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {s === 'campus' ? '🏫 My Campus' : '🌍 Global'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            height: 44,
          }}
        >
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search threads..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
          />
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
            borderRadius: radius.lg,
            paddingHorizontal: spacing.sm,
            height: 44,
          }}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => setFilterModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={categoryFilter ? `Filters, ${categoryFilter} active` : 'Filters'}
          style={{
            backgroundColor: colors.brandPrimary,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 4,
            height: 44,
          }}
        >
          <Ionicons name="options" size={16} color="#FFFFFF" />
          {categoryFilter ? (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
          ) : null}
        </Pressable>
      </View>

      <ActionSheetModal visible={filterModalOpen} onClose={() => setFilterModalOpen(false)}>
        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Filter by category
        </AppText>
        {[null, ...CATEGORY_OPTIONS].map((cat) => {
          const selected = categoryFilter === cat;
          return (
            <Pressable
              key={cat ?? 'all'}
              onPress={() => {
                setCategoryFilter(cat);
                setFilterModalOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={cat ?? 'All categories'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? colors.brandPrimary : colors.textSecondary}
              />
              <AppText weight={selected ? 'bold' : 'regular'} tone={selected ? 'brand' : 'primary'}>
                {cat ?? 'All categories'}
              </AppText>
            </Pressable>
          );
        })}
      </ActionSheetModal>

      <ActionSheetModal visible={sortModalOpen} onClose={() => setSortModalOpen(false)}>
        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Sort by
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
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option === 'latest' ? 'Latest' : 'Most Popular'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? colors.brandPrimary : colors.textSecondary}
              />
              <AppText weight={selected ? 'bold' : 'regular'} tone={selected ? 'brand' : 'primary'}>
                {option === 'latest' ? 'Latest' : 'Most Popular'}
              </AppText>
            </Pressable>
          );
        })}
      </ActionSheetModal>

      <Pressable
        onPress={() => setComposerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Start a new thread"
      >
        <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={user?.fullName ?? 'You'} size={32} />
            <AppText tone="secondary" style={{ flex: 1 }}>
              What's on your mind? Start a new thread...
            </AppText>
            <Ionicons name="create-outline" size={18} color={colors.brandPrimary} />
          </View>
        </SolidCard>
      </Pressable>

      <FlatList
        data={posts ?? []}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
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
              <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.md,
                    backgroundColor: colors.brandPrimary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: '-8deg' }],
                  }}
                >
                  <Ionicons name="chatbox" size={26} color="#FFFFFF" />
                </View>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginLeft: -20,
                    marginTop: 14,
                    transform: [{ rotate: '8deg' }],
                  }}
                />
              </View>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                Forums channel is silent
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                Be the first to ask questions or discuss local housing options matching your
                search.
              </AppText>
            </View>
          ) : null
        }
      />

      <Pressable
        onPress={() => setComposerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="New thread"
        style={{
          position: 'absolute',
          bottom: spacing.xl,
          right: spacing.lg,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.brandPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </Pressable>

      <PublishThreadModal visible={composerOpen} onClose={() => setComposerOpen(false)} onPublish={handlePublish} />
      <DiscussionWorkspacesModal visible={workspacesOpen} onClose={() => setWorkspacesOpen(false)} />
    </ScreenContainer>
  );
}
