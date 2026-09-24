import React, { useState, useRef, useEffect } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { SolidCard } from './SolidCard';
import { GlassCard } from './GlassCard';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { PostCard } from './PostCard';
import { PublishThreadModal } from './PublishThreadModal';

import { ActionSheetModal } from './ActionSheetModal';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts, createPost } from '@/api/posts';
import { listCommunities, proposeCommunity, listMyModeratedCommunityIds, ForumCommunityRecord } from '@/api/communities';
import { getInstitutionByCode } from '@/api/institutions';
import { CommunityManageModal } from './CommunityManageModal';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { GuestTeaserBanner } from './GuestTeaserBanner';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { useForumScope } from '@/hooks/useForumScope';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { AppTextField } from './AppTextField';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PostVisibilityScope } from '@/api/types';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

// Virtual, always-present tile meaning "no category filter" - not a real row
// in forum_communities, so it's never subject to approval.
const ALL_THREADS_CHANNEL: ForumCommunityRecord = {
  id: 'all',
  slug: 'c/all',
  label: 'All Threads',
  category: '',
  icon: 'planet-outline',
  description: 'Unified feed aggregating student discussions, academic questions, and polls across every space.',
  moderatorBadge: 'Moderation Desk',
  moderatorTitle: 'Verified Faculty Staff & Student Union Council',
  rules: [
    'Maintain civil and constructive discourse at all times.',
    'Tag your threads with the accurate community space.',
    'No hate speech, unverified rumors, or academic dishonesty.',
  ],
  bannerColor: '#3B82F6',
  accentColor: '#2563EB',
  approvalStatus: 'approved',
};

function findActiveChannel(channels: ForumCommunityRecord[], selected: string | null): ForumCommunityRecord {
  if (selected === null) return channels.find((c) => c.id === 'all') ?? channels[0];
  return channels.find((c) => c.category === selected) ?? channels[0];
}

export function CommunityFeedScreen({ scope }: { scope: PostVisibilityScope }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { isFeatureEnabled } = useFeatureFlags();
  const { isDesktop, isWideDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  // The Forum's own campus/global toggle. With the admin's Global toggle off it is always
  // 'campus' (never even a stale 'global' on first render) and the Global controls are hidden.
  const { scope: viewScope, setScope: setViewScope, globalEnabled: globalWorkspaceEnabled } = useForumScope();

  const params = useLocalSearchParams<{ category?: string }>();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(params.category || null);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [subForumsDirectoryOpen, setSubForumsDirectoryOpen] = useState(false);
  const [proposeCommunityOpen, setProposeCommunityOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDescription, setNewCommunityDescription] = useState('');
  const [submittingCommunity, setSubmittingCommunity] = useState(false);

  const { data: fetchedCommunities } = useQuery({
    queryKey: ['communities'],
    queryFn: listCommunities,
  });
  const CHANNELS = React.useMemo(
    () => [ALL_THREADS_CHANNEL, ...(fetchedCommunities ?? [])],
    [fetchedCommunities],
  );

  const activeSubForum = findActiveChannel(CHANNELS, selectedChannel);
  const [manageCommunityOpen, setManageCommunityOpen] = useState(false);

  // Who this session's user can moderate a post in, without being an admin
  // or staff - the community they created, or one they were appointed to
  // moderate. Kept as post `category` strings so PostCard.canModerateCommunity
  // can be a plain set lookup per post, including in the mixed-category "All
  // Threads" feed. One cheap query for "communities I moderate" (not "own"),
  // combined with `createdBy` already present on every fetched community.
  const { data: myModeratedCommunityIds } = useQuery({
    queryKey: ['my-moderated-community-ids', user?.id],
    queryFn: listMyModeratedCommunityIds,
    enabled: !!user?.id,
  });
  const myManagedCategories = React.useMemo(() => {
    const categories = new Set<string>();
    if (!user?.id) return categories;
    const moderatedIds = new Set(myModeratedCommunityIds ?? []);
    for (const c of fetchedCommunities ?? []) {
      if (isAdmin || c.createdBy === user.id || moderatedIds.has(c.id)) categories.add(c.category);
    }
    return categories;
  }, [fetchedCommunities, myModeratedCommunityIds, isAdmin, user?.id]);
  const canManageActiveCommunity =
    activeSubForum.id !== 'all' &&
    (isAdmin || activeSubForum.createdBy === user?.id || myManagedCategories.has(activeSubForum.category));

  async function handleProposeCommunity() {
    if (!newCommunityName.trim()) return;
    haptics.medium();
    setSubmittingCommunity(true);
    try {
      const created = await proposeCommunity({
        label: newCommunityName.trim(),
        description: newCommunityDescription.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['communities'] });
      setProposeCommunityOpen(false);
      setNewCommunityName('');
      setNewCommunityDescription('');
      toast.info(`"${created.label}" submitted! It will appear once a root admin approves it.`);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Could not submit this community. Please try again.'));
    } finally {
      setSubmittingCommunity(false);
    }
  }

  React.useEffect(() => {
    if (params.category) {
      setSelectedChannel(params.category);
    }
  }, [params.category]);

  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Desktop horizontal channels scrolling ref & wheel listener
  const desktopChannelsScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (desktopChannelsScrollRef.current as any)?.getScrollableNode?.() || (desktopChannelsScrollRef.current as any);
    if (!node) return;
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && node.scrollWidth > node.clientWidth) {
        e.preventDefault();
        node.scrollLeft += e.deltaY;
      }
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, []);

  const scrollDesktopChannels = (direction: 'left' | 'right') => {
    const node = (desktopChannelsScrollRef.current as any)?.getScrollableNode?.() || (desktopChannelsScrollRef.current as any);
    if (node?.scrollBy) {
      node.scrollBy({ left: direction === 'left' ? -220 : 220, behavior: 'smooth' });
    }
  };

  // activeCampusCode lets an admin's "Explore Other Campus Workspaces" pick
  // (Settings/Workdesk -> Change Workspace Scope) actually change which
  // campus's threads show here too, not just their own home campus.
  const { activeCampusCode, homeInstitutionCode, setActiveCampusCode } = useCampusScope();

  // An admin who picked a campus under "Explore Other Campus Workspaces"
  // (ChangeWorkspaceScopeModal) stays scoped to it - persisted across app
  // restarts - with no indicator anywhere on this screen. That silently
  // narrows "My Campus" to a workspace that may have zero real content,
  // which used to just look like a broken/empty forum with no way to tell
  // why. This makes the empty state explain it and offers a way out.
  const isExploringOtherCampus = !!activeCampusCode && activeCampusCode !== homeInstitutionCode;
  const exploringInstitutionName = isExploringOtherCampus
    ? getInstitutionByCode(activeCampusCode!)?.name ?? activeCampusCode
    : null;

  function renderEmptyForumState() {
    if (isExploringOtherCampus) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl }}>
          <Ionicons name="school-outline" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.md }} />
          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs, textAlign: 'center' }}>
            No Threads at {exploringInstitutionName} Yet
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', marginBottom: spacing.md }}>
            You're exploring {exploringInstitutionName}'s workspace as an admin - this isn't your home campus, so it has its own, separate thread history.
          </AppText>
          <AppButton
            label="Return to My Campus"
            variant="secondary"
            size="sm"
            onPress={() => {
              haptics.light();
              setActiveCampusCode(undefined);
            }}
          />
        </View>
      );
    }
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
        <View style={{ marginBottom: spacing.md }}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textSecondary} />
        </View>
        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
          No Threads in this Channel Yet
        </AppText>
        <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
          Be the first to share an academic question or start a discussion for your cohort.
        </AppText>
      </View>
    );
  }

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
      : undefined;

  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const isRestrictedGuest = isUnverifiedPersonalUser(profile);

  function handleOpenComposer() {
    haptics.light();
    if (isRestrictedGuest) {
      setVerificationModalOpen(true);
      return;
    }
    setComposerOpen(true);
  }

  async function handleSubmitVerification(data: {
    institutionClaimed: string;
    documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: profile?.fullName ?? user.fullName,
        documentType: data.documentType,
        documentReference: data.documentReference,
        institutionClaimed: data.institutionClaimed,
        documentPhotoUri: data.documentPhotoUri,
        photoBlob: data.photoBlob,
      });
      markVerificationPending(user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setVerificationModalOpen(false);
      toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Could not submit verification request. Please try again.'));
    }
  }

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

 const handleRefresh = async () => {
   if (manualRefreshing) return;
   haptics.light();
   setManualRefreshing(true);
   try {
     await Promise.all([
       refetch(),
       queryClient.invalidateQueries({ queryKey: ['communities'] }),
       new Promise((resolve) => setTimeout(resolve, 450)),
     ]);
   } finally {
     setManualRefreshing(false);
   }
 };

 let posts = rawPosts ?? [];
 if (selectedChannel === 'Polls') {
 posts = posts.filter((p) => !!p.poll);
 }

  // Pinned announcements always float to the top regardless of sort order -
  // previously isPinned only drove a badge in ForumsModerationTab and had
  // zero effect on the feed itself, so "pinning" a thread never actually
  // pinned anything a student would see.
  posts = [...posts].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    return sortBy === 'popular' ? b.likesCount - a.likesCount : b.createdAt.localeCompare(a.createdAt);
  });

  // Unfiltered-by-channel pool, used only to compute real per-community
  // stats for the directory/sidebar (thread counts, active contributors) -
  // replaces the fabricated membersCount/onlineCount numbers that used to
  // be hardcoded on every community.
  const { data: allCommunityPosts } = useQuery({
    queryKey: ['feed', scope, 'community-stats', viewScope, viewerInstitutionCode],
    queryFn: () => listFeedPosts({ scope, viewScope, viewerInstitutionCode }),
  });

  const communityStats = React.useMemo(() => {
    const stats = new Map<string, { threads: number; contributors: number }>();
    const pool = allCommunityPosts ?? [];
    for (const community of CHANNELS) {
      const matches = community.id === 'all' ? pool : pool.filter((p) => p.category === community.category);
      stats.set(community.id, { threads: matches.length, contributors: new Set(matches.map((p) => p.authorId)).size });
    }
    return stats;
  }, [allCommunityPosts, CHANNELS]);

  // Top Trending Discussions - real engagement only. Previously fell back to
  // 4 fabricated "#TechHackathon"-style tags with made-up engagement counts
  // whenever there weren't yet 5 real posts to rank.
  const trendingTopics = React.useMemo(() => {
    const sorted = [...(rawPosts ?? [])].sort(
      (a, b) => (b.likesCount + (b.commentsCount ?? 0) * 2) - (a.likesCount + (a.commentsCount ?? 0) * 2),
    );
    return { topPosts: sorted.slice(0, 5) };
  }, [rawPosts]);

 async function handlePublish(payload: {
 title: string;
 content: string;
 category: string;
 visibilityScope: 'student' | 'global';
 scopeVisibility: 'campus' | 'global';
 sponsored: boolean;
 isPinned?: boolean;
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
 toast.success('Thread published.');
 }

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.xs }}>
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Scope Switcher in 1 Unified Clean Row */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: spacing.xs, marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 }}>
          <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 22 }}>
            Forum
          </AppText>
        </View>

        {!isDesktop && globalWorkspaceEnabled && (
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
          <TextInput accessibilityLabel="Search discussions, topics, codes"
            value={query}
            onChangeText={setQuery}
            placeholder="Search discussions, topics, codes..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSortModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortBy === 'latest' ? 'Latest' : 'Most Helpful'}`}
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
            {sortBy === 'latest' ? 'Latest' : 'Helpful'}
          </AppText>
        </Pressable>
      </View>

      {/* Active academic discussions */}
      {isFeatureEnabled('forum_trends') && (
        <View style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="school-outline" size={15} color={colors.brandPrimary} />
              <AppText weight="bold" variant="caption" style={{ letterSpacing: 0.5, textTransform: 'uppercase', color: colors.brandPrimary }}>
                Active Discussions
              </AppText>
            </View>
            <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
              Academic forum
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
                    <Ionicons name="school-outline" size={12} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }} numberOfLines={1}>
                      {tp.category}
                    </AppText>
                  </View>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ fontSize: 12 }}>
                    {tp.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                      💡 {tp.likesCount} helpful
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                      💬 {tp.commentsCount ?? 0}
                    </AppText>
                  </View>
                </Pressable>
              ))
            ) : (
              <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                No active discussions yet — be the first to ask a useful question.
              </AppText>
            )}
          </ScrollView>
        </View>
      )}

      {/* Sub-Forums Navigation Bar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="planet-outline" size={15} color={colors.textSecondary} />
          <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
            Discussion Spaces
          </AppText>
        </View>
        <Pressable onPress={() => setSubForumsDirectoryOpen(true)} hitSlop={8}>
          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
            Browse All ({CHANNELS.length - 1}) →
          </AppText>
        </Pressable>
      </View>

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
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: selected
                    ? colors.brandPrimary
                    : isDark
                    ? 'rgba(30, 41, 59, 0.60)'
                    : 'rgba(255, 255, 255, 0.70)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: selected
                    ? colors.brandPrimary
                    : isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.08)',
                },
                Platform.OS === 'web' && !selected &&
                  ({
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    boxShadow: isDark
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
                      : 'inset 0 1px 1px rgba(255, 255, 255, 0.80)',
                  } as any),
              ]}
            >
              <Ionicons
                name={ch.icon}
                size={13}
                color={selected ? '#FFFFFF' : colors.textSecondary}
              />
              <AppText
                variant="caption"
                weight={selected ? 'bold' : 'medium'}
                tone={selected ? 'inverse' : 'secondary'}
                style={{ fontSize: 11.5 }}
              >
                {ch.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Reddit-Style Sub-Forum Space Banner when a specific community is active */}
      {selectedChannel !== null && (
        <GlassCard
          radius={18}
          padded={false}
          contentStyle={{ padding: 12, marginBottom: spacing.sm, borderLeftWidth: 4, borderLeftColor: activeSubForum.accentColor }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: `${activeSubForum.accentColor}18`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={activeSubForum.icon} size={20} color={activeSubForum.accentColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <AppText weight="bold" style={{ fontSize: 14 }}>
                    {activeSubForum.label}
                  </AppText>
                  <View style={{ backgroundColor: `${activeSubForum.accentColor}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                    <AppText weight="bold" style={{ color: activeSubForum.accentColor, fontSize: 11 }}>
                      {activeSubForum.slug}
                    </AppText>
                  </View>
                </View>
                <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 10.5, marginTop: 1 }}>
                  💬 {(communityStats.get(activeSubForum.id)?.threads ?? 0).toLocaleString()} threads • {(communityStats.get(activeSubForum.id)?.contributors ?? 0).toLocaleString()} contributors
                </AppText>
              </View>
            </View>

            <Pressable
              onPress={() => setSelectedChannel(null)}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              }}
            >
              <Ionicons name="arrow-back" size={12} color={colors.textSecondary} />
              <AppText variant="caption" weight="semiBold" tone="secondary" style={{ fontSize: 10.5 }}>
                All Feed
              </AppText>
            </Pressable>
          </View>

          <AppText tone="secondary" variant="caption" style={{ fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>
            {activeSubForum.description}
          </AppText>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 6,
              paddingHorizontal: 8,
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderRadius: 8,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <Ionicons name="shield-checkmark" size={13} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>
                <AppText weight="bold" tone="primary" style={{ fontSize: 10.5 }}>
                  Moderated by:
                </AppText>{' '}
                {activeSubForum.moderatorTitle}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {canManageActiveCommunity && (
                <Pressable
                  onPress={() => setManageCommunityOpen(true)}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                >
                  <Ionicons name="settings-outline" size={12} color={colors.textSecondary} />
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10.5 }}>
                    Manage
                  </AppText>
                </Pressable>
              )}
              <Pressable
                onPress={() => setRulesModalOpen(true)}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
              >
                <Ionicons name="document-text-outline" size={12} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10.5 }}>
                  Rules ({activeSubForum.rules.length})
                </AppText>
              </Pressable>
            </View>
          </View>
        </GlassCard>
      )}

      {/* Guest Preview Mode Banner */}
      <GuestTeaserBanner />

      {/* Interactive Quick Thread Composer Bar */}
      <Pressable
        onPress={handleOpenComposer}
        accessibilityRole="button"
        accessibilityLabel="Start a new thread or create a poll"
        style={{ marginTop: 2, marginBottom: spacing.sm }}
      >
        <GlassCard radius={16} padded={false} contentStyle={{ padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Avatar name={user?.fullName ?? 'You'} uri={profile?.avatarUrl} size={34} role={user?.role} />
            <View style={{ flex: 1, backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 }}>
              <AppText tone="secondary" variant="bodySmall" style={{ fontSize: 12 }}>
                {selectedChannel ? `Post in ${activeSubForum.slug}...` : 'Start a discussion or create a poll...'}
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
        </GlassCard>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer glow={false}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30, alignItems: 'flex-start' }}>
          {/* Main Feed Column */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Desktop Screen Title & Actions Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppText weight="bold" style={{ fontSize: 24, lineHeight: 30 }}>
                    Community Forum
                  </AppText>
                  {user?.role === 'admin' && (
                    <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                      <AppText weight="bold" style={{ color: '#FFFFFF', fontSize: 11 }}>ADMIN HUB</AppText>
                    </View>
                  )}
                </View>
                <AppText tone="secondary" variant="caption" style={{ fontSize: 12, marginTop: 2 }}>
                  {user?.role === 'admin'
                    ? 'Global discourse desk — publish announcements, pin updates, and approve pending threads.'
                    : 'Connect, ask questions, exchange notes, and participate in polls.'}
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Scope Switcher for desktop */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.surface,
                    borderRadius: radius.pill,
                    padding: 3,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {(globalWorkspaceEnabled ? (['campus', 'global'] as const) : (['campus'] as const)).map((s) => {
                    const selected = viewScope === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setViewScope(s)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: radius.pill,
                          backgroundColor: selected ? colors.brandPrimary : 'transparent',
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'} style={{ fontSize: 11 }}>
                          {s === 'campus' ? 'My Campus' : 'Global Network'}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

              </View>
            </View>

            {/* Desktop Channel Pills & Sort Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* Desktop Left Scroll Arrow */}
                <Pressable
                  onPress={() => scrollDesktopChannels('left')}
                  accessibilityRole="button"
                  accessibilityLabel="Scroll channels left"
                  style={({ hovered }: any) => [
                    {
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      opacity: hovered ? 1 : 0.75,
                    },
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  ]}
                >
                  <Ionicons name="chevron-back" size={15} color={colors.textPrimary} />
                </Pressable>

                <ScrollView
                  ref={desktopChannelsScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[
                    { flex: 1, minWidth: 0 },
                    Platform.OS === 'web' && ({ overflowX: 'auto', scrollbarWidth: 'none' } as any),
                  ]}
                  contentContainerStyle={{ gap: 8, paddingRight: spacing.sm }}
                >
                  {CHANNELS.map((ch) => {
                    const isSelected = selectedChannel === ch.category || (ch.id === 'all' && selectedChannel === null);
                    return (
                      <Pressable
                        key={ch.id}
                        onPress={() => setSelectedChannel(ch.category)}
                        style={({ hovered }: any) => [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: radius.pill,
                            backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.brandPrimary : colors.border,
                            flexShrink: 0,
                            opacity: hovered ? 0.9 : 1,
                          },
                          Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                        ]}
                      >
                        <Ionicons
                          name={ch.icon}
                          size={14}
                          color={isSelected ? '#FFFFFF' : colors.textSecondary}
                        />
                        <AppText
                          variant="bodySmall"
                          weight={isSelected ? 'bold' : 'medium'}
                          style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 12, whiteSpace: 'nowrap' } as any}
                        >
                          {ch.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Desktop Right Scroll Arrow */}
                <Pressable
                  onPress={() => scrollDesktopChannels('right')}
                  accessibilityRole="button"
                  accessibilityLabel="Scroll channels right"
                  style={({ hovered }: any) => [
                    {
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      opacity: hovered ? 1 : 0.75,
                    },
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  ]}
                >
                  <Ionicons name="chevron-forward" size={15} color={colors.textPrimary} />
                </Pressable>
              </View>

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
                <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
                <AppText variant="caption" weight="bold">
                  {sortBy === 'latest' ? 'Latest' : 'Top Upvoted'}
                </AppText>
              </Pressable>
            </View>

            {/* Desktop Reddit-Style Sub-Forum Space Banner */}
            {selectedChannel !== null && (
              <GlassCard
                radius={18}
                padded={false}
                contentStyle={{ padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 4, borderLeftColor: activeSubForum.accentColor }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: `${activeSubForum.accentColor}18`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={activeSubForum.icon} size={24} color={activeSubForum.accentColor} />
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <AppText weight="bold" variant="h3">
                          {activeSubForum.label}
                        </AppText>
                        <View style={{ backgroundColor: `${activeSubForum.accentColor}20`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                          <AppText weight="bold" style={{ color: activeSubForum.accentColor, fontSize: 11 }}>
                            {activeSubForum.slug}
                          </AppText>
                        </View>
                      </View>
                      <AppText tone="secondary" variant="caption" style={{ fontSize: 11.5, marginTop: 2 }}>
                        💬 {(communityStats.get(activeSubForum.id)?.threads ?? 0).toLocaleString()} threads • {(communityStats.get(activeSubForum.id)?.contributors ?? 0).toLocaleString()} contributors
                      </AppText>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setSelectedChannel(null)}
                    hitSlop={8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <Ionicons name="arrow-back" size={13} color={colors.textSecondary} />
                    <AppText variant="caption" weight="semiBold" tone="secondary" style={{ fontSize: 11 }}>
                      All Feed
                    </AppText>
                  </Pressable>
                </View>

                <AppText tone="secondary" variant="bodySmall" style={{ fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
                  {activeSubForum.description}
                </AppText>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderRadius: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <Ionicons name="shield-checkmark" size={15} color={colors.textSecondary} />
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11.5 }}>
                      <AppText weight="bold" tone="primary" style={{ fontSize: 11.5 }}>
                        Moderated by:
                      </AppText>{' '}
                      {activeSubForum.moderatorTitle}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => setRulesModalOpen(true)}
                    hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Ionicons name="document-text-outline" size={13} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11.5 }}>
                      Community Rules ({activeSubForum.rules.length})
                    </AppText>
                  </Pressable>
                </View>
              </GlassCard>
            )}

            {/* Quick Desktop Composer Box */}
            <GlassCard radius={18} padded={false} contentStyle={{ padding: spacing.md }} style={{ marginBottom: spacing.md }}>
              {isAdmin && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.sm,
                    marginBottom: spacing.sm,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
                  }}
                >
                  <Ionicons name="shield-checkmark" size={14} color="#3B82F6" />
                  <AppText variant="caption" weight="bold" style={{ color: '#2563EB', fontSize: 11.5 }}>
                    Posting as Campus Administrator (Verified Official Broadcast Mode)
                  </AppText>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm }}>
                <Avatar name={user?.fullName || 'User'} uri={profile?.avatarUrl} size={42} />
                <Pressable
                  onPress={handleOpenComposer}
                  style={{
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                    borderRadius: radius.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <AppText tone="secondary" variant="bodySmall">
                    {isAdmin
                      ? 'Publish an official campus announcement or thread...'
                      : selectedChannel
                      ? `Ask a question or start a discussion in ${activeSubForum.slug}...`
                      : 'Ask an academic question or start a discussion...'}
                  </AppText>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Pressable
                    onPress={handleOpenComposer}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="image-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Photo / Media</AppText>
                  </Pressable>
                  <Pressable
                    onPress={handleOpenComposer}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="stats-chart-outline" size={16} color="#10B981" />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Create Poll</AppText>
                  </Pressable>
                  <Pressable
                    onPress={handleOpenComposer}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="pricetag-outline" size={16} color="#F59E0B" />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Topic Hub</AppText>
                  </Pressable>
                </View>

                <Pressable
                  onPress={handleOpenComposer}
                  style={{
                    backgroundColor: colors.brandPrimary,
                    paddingHorizontal: 16,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone="inverse">
                    {isAdmin ? '+ Post Announcement' : '+ Post Thread'}
                  </AppText>
                </Pressable>
              </View>
            </GlassCard>



            {/* Posts Feed Stream */}
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(220)}>
                  <PostCard post={item} canModerateCommunity={myManagedCategories.has(item.category)} />
                </Animated.View>
              )}
              showsVerticalScrollIndicator={true}
              onRefresh={handleRefresh}
              refreshing={isRefetching || manualRefreshing}
              alwaysBounceVertical
              overScrollMode="always"
              ListEmptyComponent={!isLoading ? renderEmptyForumState() : null}
            />
          </View>

          {/* Right Sidebar: Hubs, Mentors & Guidelines */}
          <View
            style={[
              { width: isWideDesktop ? 320 : 280, flexShrink: 0, gap: spacing.md, paddingBottom: 80 },
              Platform.OS === 'web' ? ({ position: 'sticky', top: 16 } as any) : {},
            ]}
          >
            {selectedChannel !== null ? (
              <SolidCard radius={18} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                  <Ionicons name={activeSubForum.icon} size={18} color={activeSubForum.accentColor} />
                  <AppText variant="h3" weight="bold">
                    About {activeSubForum.slug}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm, lineHeight: 16 }}>
                  {activeSubForum.description}
                </AppText>

                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, marginBottom: spacing.sm, gap: 4 }}>
                  <AppText variant="caption" weight="bold" tone="primary">
                    Moderated by:
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {activeSubForum.moderatorTitle}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View>
                    <AppText weight="bold" variant="bodySmall">
                      {(communityStats.get(activeSubForum.id)?.threads ?? 0).toLocaleString()}
                    </AppText>
                    <AppText variant="caption" tone="secondary">Threads</AppText>
                  </View>
                  <View>
                    <AppText weight="bold" variant="bodySmall" style={{ color: '#10B981' }}>
                      {(communityStats.get(activeSubForum.id)?.contributors ?? 0).toLocaleString()}
                    </AppText>
                    <AppText variant="caption" tone="secondary">Contributors</AppText>
                  </View>
                </View>

                <Pressable
                  onPress={() => setRulesModalOpen(true)}
                  style={{
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    marginTop: spacing.xs,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone="brand">
                    View Space Rules ({activeSubForum.rules.length}) →
                  </AppText>
                </Pressable>
                {canManageActiveCommunity && (
                  <Pressable
                    onPress={() => setManageCommunityOpen(true)}
                    style={{
                      flexDirection: 'row',
                      gap: 6,
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <Ionicons name="settings-outline" size={14} color={colors.textSecondary} />
                    <AppText variant="caption" weight="bold" tone="secondary">
                      Manage Community
                    </AppText>
                  </Pressable>
                )}
              </SolidCard>
            ) : (
              <SolidCard radius={18} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <AppText variant="h3" weight="bold">
                    Communities
                  </AppText>
                  <Pressable onPress={() => setSubForumsDirectoryOpen(true)}>
                    <AppText variant="caption" weight="bold" tone="brand">All ({CHANNELS.length - 1}) →</AppText>
                  </Pressable>
                </View>
                <View style={{ gap: 8 }}>
                  {CHANNELS.filter((sf) => sf.id !== 'all').map((sf) => (
                    <Pressable
                      key={sf.id}
                      onPress={() => setSelectedChannel(sf.category)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 6,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Ionicons name={sf.icon} size={15} color={sf.accentColor} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText weight="bold" variant="caption" numberOfLines={1}>
                            {sf.label}
                          </AppText>
                          <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }} numberOfLines={1}>
                            {sf.moderatorBadge}
                          </AppText>
                        </View>
                      </View>
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                        {(communityStats.get(sf.id)?.threads ?? 0).toLocaleString()}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </SolidCard>
            )}

            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                {selectedChannel !== null ? `${activeSubForum.label} Rules` : 'Community Rules'}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
                {selectedChannel !== null
                  ? `Guidelines enforced by ${activeSubForum.moderatorBadge}.`
                  : 'Lioris is a verified academic community. Keep discussions constructive, helpful, and respectful.'}
              </AppText>
              <View style={{ gap: 6 }}>
                {(selectedChannel !== null ? activeSubForum.rules : [
                  'Maintain civil and constructive discourse.',
                  'No academic dishonesty or exam leaks.',
                  'Report violations to campus moderators.',
                ]).map((rule, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                    <AppText variant="caption" tone="secondary" numberOfLines={2}>
                      {rule}
                    </AppText>
                  </View>
                ))}
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
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(220)}>
            <PostCard post={item} canModerateCommunity={myManagedCategories.has(item.category)} />
          </Animated.View>
        )}
        showsVerticalScrollIndicator={false}
        onRefresh={handleRefresh}
        refreshing={isRefetching || manualRefreshing}
        alwaysBounceVertical
        overScrollMode="always"
        ListEmptyComponent={!isLoading ? renderEmptyForumState() : null}
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
    <ApplyForVerificationModal
      visible={verificationModalOpen}
      onClose={() => setVerificationModalOpen(false)}
      onSubmit={handleSubmitVerification}
      defaultInstitution={profile?.institutionCode}
    />
    {activeSubForum.id !== 'all' && (
      <CommunityManageModal
        visible={manageCommunityOpen}
        onClose={() => setManageCommunityOpen(false)}
        community={activeSubForum}
        isAdmin={isAdmin}
      />
    )}

    {/* Sub-Forum Rules & Guidelines Modal */}
    <Modal visible={rulesModalOpen} transparent animationType="fade" onRequestClose={() => setRulesModalOpen(false)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setRulesModalOpen(false)} />
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="shield-checkmark" size={20} color={activeSubForum.accentColor} />
              <View>
                <AppText variant="h3" weight="bold">
                  {activeSubForum.label} Rules
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {activeSubForum.slug} • Moderated Space
                </AppText>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setRulesModalOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md }}>
            <AppText variant="caption" tone="secondary" style={{ lineHeight: 17 }}>
              <AppText weight="bold" tone="primary">
                Moderator Attribution:
              </AppText>{' '}
              {activeSubForum.moderatorTitle}. Submissions violating these rules are subject to review and moderation.
            </AppText>
          </View>

          <View style={{ gap: 10, marginBottom: spacing.lg }}>
            {activeSubForum.rules.map((rule, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: `${activeSubForum.accentColor}20`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <AppText weight="bold" style={{ color: activeSubForum.accentColor, fontSize: 11 }}>
                    {idx + 1}
                  </AppText>
                </View>
                <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 18 }}>
                  {rule}
                </AppText>
              </View>
            ))}
          </View>

          <AppButton label="Understood, Close" onPress={() => setRulesModalOpen(false)} />
        </View>
      </View>
    </Modal>

    {/* Communities Directory Modal */}
    <Modal visible={subForumsDirectoryOpen} transparent animationType="slide" onRequestClose={() => setSubForumsDirectoryOpen(false)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubForumsDirectoryOpen(false)} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: isDesktop ? spacing.xl : spacing.lg,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            width: '100%',
            maxWidth: 600,
            alignSelf: 'center',
            maxHeight: '85%',
          }}
        >
          {/* Mobile grab handle */}
          {!isDesktop && (
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: 'center',
                marginBottom: spacing.sm,
              }}
            />
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="planet" size={22} color={colors.textSecondary} />
              <View>
                <AppText variant="h3" weight="bold">
                  Communities
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Select a dedicated space to view discussions & rules
                </AppText>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSubForumsDirectoryOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
            {CHANNELS.map((sf) => {
              const isSelected = selectedChannel === sf.category || (sf.id === 'all' && selectedChannel === null);
              return (
                <Pressable
                  key={sf.id}
                  onPress={() => {
                    haptics.light();
                    setSelectedChannel(sf.category);
                    setSubForumsDirectoryOpen(false);
                  }}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: isSelected ? `${colors.brandPrimary}12` : colors.background,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Ionicons name={sf.icon} size={18} color={sf.accentColor} />
                      <AppText weight="bold" variant="bodySmall">
                        {sf.label}
                      </AppText>
                      <View style={{ backgroundColor: `${sf.accentColor}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                        <AppText weight="bold" style={{ color: sf.accentColor, fontSize: 11 }}>
                          {sf.slug}
                        </AppText>
                      </View>
                      {sf.approvalStatus === 'pending' ? <Badge label="Pending Review" tone="warning" /> : null}
                    </View>
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      💬 {(communityStats.get(sf.id)?.threads ?? 0).toLocaleString()}
                    </AppText>
                  </View>

                  <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ lineHeight: 16 }}>
                    {sf.description}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.textSecondary} />
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 10.5 }}>
                      {sf.moderatorBadge}: {sf.moderatorTitle}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => {
                haptics.light();
                setSubForumsDirectoryOpen(false);
                setProposeCommunityOpen(true);
              }}
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.brandPrimary,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand" variant="bodySmall">
                Propose a New Community
              </AppText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Propose a Community Modal - held for root-admin approval before it
        becomes a real, postable space (see src/api/communities.ts) */}
    <Modal visible={proposeCommunityOpen} transparent animationType="fade" onRequestClose={() => setProposeCommunityOpen(false)}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setProposeCommunityOpen(false)} />
        <View
          style={{
            width: '100%',
            maxWidth: 460,
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border,
            maxHeight: '90%',
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="h3" weight="bold">
                Propose a Community
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setProposeCommunityOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              A root admin reviews every proposed community before it goes live - your posts, though, never wait on anyone.
            </AppText>
            <AppTextField
              label="Community Name"
              placeholder="e.g. Photography Club"
              value={newCommunityName}
              onChangeText={setNewCommunityName}
            />
            <AppTextField
              label="Description"
              placeholder="What is this space for?"
              value={newCommunityDescription}
              onChangeText={setNewCommunityDescription}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setProposeCommunityOpen(false)} />
              <AppButton
                label={submittingCommunity ? 'Submitting...' : 'Submit'}
                loading={submittingCommunity}
                disabled={!newCommunityName.trim() || submittingCommunity}
                onPress={handleProposeCommunity}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Floating Action Button (FAB) - Only shown on mobile viewports so it does not block Community Rules on desktop */}
    {!isDesktop && (
      <Pressable
        onPress={handleOpenComposer}
        accessibilityRole="button"
        accessibilityLabel="Create new thread"
        style={({ hovered }: any) => [
          {
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
            bottom: 88,
            right: 20,
            height: 48,
            width: 48,
            borderRadius: 24,
            backgroundColor: colors.brandPrimary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8,
            zIndex: 1000,
            opacity: hovered ? 0.92 : 1,
          },
          Platform.OS === 'web' && ({
            cursor: 'pointer',
            boxShadow: isDark
              ? '0 6px 20px rgba(59, 130, 246, 0.45)'
              : '0 6px 18px rgba(37, 99, 235, 0.35)',
          } as any),
        ]}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </Pressable>
    )}
  </ScreenContainer>
  );
}
