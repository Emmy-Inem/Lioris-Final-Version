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
import { HorizontalTrendsSlider } from './HorizontalTrendsSlider';
import { ActionSheetModal } from './ActionSheetModal';
import { AnnouncementsWidget } from './AnnouncementsWidget';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts, createPost } from '@/api/posts';
import { getMyProfile } from '@/api/profile';
import { useViewScope } from '@/hooks/useViewScope';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PostVisibilityScope } from '@/api/types';

const CHANNELS = [
 { id: 'all', label: 'All Threads', category: null, icon: 'chatbubbles' as const },
 { id: 'polls', label: 'Polls & Votes', category: 'Polls', icon: 'stats-chart' as const },
 { id: 'tech', label: 'Tech & Code Hub', category: 'Tech Hub', icon: 'code-slash' as const },
 { id: 'academic', label: 'Academic & Courses', category: 'Academic', icon: 'school' as const },
 { id: 'housing', label: 'Hostel & Housing', category: 'Housing', icon: 'home' as const },
 { id: 'social', label: 'Campus Life & Sports', category: 'Social', icon: 'people' as const },
 { id: 'lost', label: 'Lost & Found', category: 'Lost & Found', icon: 'search' as const },
];

export function CommunityFeedScreen({ scope }: { scope: PostVisibilityScope }) {
 const { colors, spacing, radius, isDark } = useTheme();
 const { user } = useAuth();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [composerOpen, setComposerOpen] = useState(false);
 const [workspacesOpen, setWorkspacesOpen] = useState(false);
 const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
 const [selectedTrend, setSelectedTrend] = useState<string | null>(null);
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
 if (selectedTrend) {
 const trendKeywords: Record<string, string[]> = {
 CONVOCATION_2026: ['convocation', 'graduate', 'gown', 'ceremony'],
 DEANS_CUP_FINALS: ["dean's cup", 'football', 'finals', 'match', 'sports'],
 HOSTEL_TOWNHALL: ['hostel', 'townhall', 'accommodation', 'hall', 'room'],
 CAMPUS_TECH_FEST: ['tech', 'hackathon', 'coding', 'ai', 'developer', 'demo'],
 LIORIS_VIRAL: ['lioris', 'campus', 'launch', 'viral'],
 };
 const keywords = trendKeywords[selectedTrend] ?? [selectedTrend.toLowerCase()];
 posts = posts.filter((p) => {
 const targetText = `${p.title} ${p.content} ${p.category} ${p.courseTags ?? ''}`.toLowerCase();
 return keywords.some((kw) => targetText.includes(kw));
 });
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
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
 <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
 <AppText variant="h1" weight="bold">
 Campus Forum
 </AppText>
 <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ fontSize: 12 }}>
 Trending discussions, academic queries, and cohort threads
 </AppText>
 </View>

 <Pressable
 onPress={() => setWorkspacesOpen(true)}
 accessibilityRole="button"
 accessibilityLabel="Open discussion workspaces"
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 backgroundColor: colors.pastelPrimaryBg,
 borderRadius: radius.pill,
 paddingHorizontal: spacing.md,
 paddingVertical: 7,
 flexShrink: 0,
 }}
 >
 <Ionicons name="chatbubbles" size={15} color={colors.brandPrimary} />
 <AppText weight="bold" tone="brand" variant="caption">
 All Channels
 </AppText>
 </Pressable>
 </View>

 {/* Scope Switcher: Mobile Only (Desktop has it in sidebar) */}
 {!isDesktop && (
 <View
 style={{
 flexDirection: 'row',
 backgroundColor: colors.surface,
 borderRadius: radius.pill,
 padding: 3,
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
 accessibilityRole="tab"
 accessibilityState={{ selected }}
 accessibilityLabel={s === 'campus' ? 'My Campus Feed' : 'Global Network Feed'}
 style={{
 flex: 1,
 paddingVertical: 7,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 alignItems: 'center',
 }}
 >
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
 {s === 'campus' ? 'My Campus' : 'Global Network'}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 )}

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

 {/* Official Campus Announcements & Broadcasts */}
 <AnnouncementsWidget scope={scope as any} compact={true} />

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

 {/* Trending Topics Slider */}
 <HorizontalTrendsSlider selectedTrend={selectedTrend} onSelectTrend={setSelectedTrend} />

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
 {isDesktop ? (
 <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30 }}>
 {/* Left Column: Channels & Filters */}
 <View style={{ width: 240, gap: spacing.md }}>
 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
 Channels
 </AppText>
 <View style={{ gap: 4 }}>
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
 gap: 10,
 paddingHorizontal: 12,
 paddingVertical: 8,
 borderRadius: radius.md,
 backgroundColor: isSelected
 ? colors.brandPrimary
 : hovered
 ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons
 name={ch.icon}
 size={16}
 color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
 />
 <AppText
 variant="bodySmall"
 weight={isSelected ? 'bold' : 'medium'}
 style={{ color: isSelected ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B', flex: 1 }}
 >
 {ch.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </SolidCard>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
 Sort Feed
 </AppText>
 <View style={{ gap: 6 }}>
 {(['latest', 'popular'] as const).map((opt) => (
 <Pressable
 key={opt}
 onPress={() => setSortBy(opt)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 8,
 paddingVertical: 6,
 }}
 >
 <Ionicons
 name={sortBy === opt ? 'radio-button-on' : 'radio-button-off'}
 size={16}
 color={sortBy === opt ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText
 variant="bodySmall"
 weight={sortBy === opt ? 'bold' : 'regular'}
 tone={sortBy === opt ? 'brand' : 'primary'}
 >
 {opt === 'latest' ? 'Latest First' : 'Most Upvoted'}
 </AppText>
 </Pressable>
 ))}
 </View>
 </SolidCard>
 </View>

 {/* Center Column: Feed Stream */}
 <View style={{ flex: 1 }}>
 {/* Quick Desktop Composer Box */}
 <SolidCard radius={18} style={{ padding: spacing.md, marginBottom: spacing.md }}>
 <Pressable
 onPress={() => setComposerOpen(true)}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
 >
 <Avatar name={user?.fullName || 'User'} uri={profile?.avatarUrl} size={40} />
 <View
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
 </View>
 <View
 style={{
 backgroundColor: colors.brandPrimary,
 paddingHorizontal: 14,
 paddingVertical: 8,
 borderRadius: radius.pill,
 }}
 >
 <AppText variant="caption" weight="bold" tone="inverse">
 + Post
 </AppText>
 </View>
 </Pressable>
 </SolidCard>

 <View style={{ marginBottom: spacing.sm }}>
 <HorizontalTrendsSlider
 selectedTrend={selectedTrend}
 onSelectTrend={(trend) => setSelectedTrend(selectedTrend === trend ? null : trend)}
 />
 </View>

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

 {/* Right Column: Workspaces & Guidelines */}
 <View style={{ width: 280, gap: spacing.md }}>
 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText variant="h3" weight="bold">
 Discussion Hubs
 </AppText>
 <Pressable onPress={() => setWorkspacesOpen(true)}>
 <AppText variant="caption" weight="bold" tone="brand">Explore →</AppText>
 </Pressable>
 </View>
 <View style={{ gap: 8 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
 <Ionicons name="code-slash-outline" size={16} color={colors.brandPrimary} />
 <AppText variant="bodySmall" weight="semiBold" style={{ flex: 1 }}>Tech Hackathon 2026</AppText>
 <Badge label="Active" tone="brand" />
 </View>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
 <Ionicons name="book-outline" size={16} color="#3B82F6" />
 <AppText variant="bodySmall" weight="semiBold" style={{ flex: 1 }}>Finals Revision Squad</AppText>
 <Badge label="Hot" tone="warning" />
 </View>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
 <Ionicons name="briefcase-outline" size={16} color="#10B981" />
 <AppText variant="bodySmall" weight="semiBold" style={{ flex: 1 }}>Internship Hub</AppText>
 <Badge label="12 New" tone="success" />
 </View>
 </View>
 </SolidCard>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
 Community Rules 
 </AppText>
 <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
 Lioris is a verified academic community. Keep discussions constructive, helpful, and respectful.
 </AppText>
 <View style={{ gap: 4 }}>
 <AppText variant="caption" tone="secondary">• Be helpful & respectful</AppText>
 <AppText variant="caption" tone="secondary">• No academic dishonesty</AppText>
 <AppText variant="caption" tone="secondary">• Report spam to Campus Staff</AppText>
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
 contentContainerStyle={{ paddingBottom: 130 }}
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
 )}

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
