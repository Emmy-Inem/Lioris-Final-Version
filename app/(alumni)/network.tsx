import React, { useMemo, useState } from 'react';
import { FlatList, View, TextInput, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EmptyState } from '@/components/EmptyState';
import { SolidCard } from '@/components/SolidCard';
import { ListItemSkeletonList } from '@/components/Skeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { searchAlumniDirectory } from '@/api/connections';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';
import { listCommunities, ForumCommunityRecord } from '@/api/communities';
import { joinCommunity, listMyJoinedCommunityIds } from '@/api/forumMemberships';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';

interface SuggestedChapter {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  community?: ForumCommunityRecord;
}

const INDUSTRY_OPTIONS = [
  'Software & Technology',
  'Finance & Banking',
  'Healthcare',
  'Education',
  'Engineering',
  'Oil & Gas',
  'Government & Public Policy',
  'Media & Communications',
  'Consulting',
  'Agriculture',
];

export default function AlumniNetworkScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [joiningCommunityId, setJoiningCommunityId] = useState<string | null>(null);

  const isEnabled = isFeatureEnabled('alumni_network');

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => current - i);
  }, []);

  const { data: alumniList, isLoading } = useQuery({
    queryKey: ['alumni', 'directory', searchQuery, selectedYear, selectedIndustry],
    queryFn: () =>
      searchAlumniDirectory({
        q: searchQuery.trim() || undefined,
        graduationYear: selectedYear ?? undefined,
        industry: selectedIndustry ?? undefined,
      }),
    enabled: isEnabled,
  });

  const { data: myProfile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: isEnabled && !!user,
  });

  const { data: allCommunities = [] } = useQuery({
    queryKey: ['communities', 'all'],
    queryFn: () => listCommunities(),
    enabled: isEnabled,
  });

  const { data: myJoinedCommunityIds = [] } = useQuery({
    queryKey: ['my-joined-community-ids', user?.id],
    queryFn: () => listMyJoinedCommunityIds(user?.id),
    enabled: isEnabled && !!user,
  });

  const joinedIdsSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of myJoinedCommunityIds) set.add(id.toLowerCase());
    return set;
  }, [myJoinedCommunityIds]);

  const suggestedChapters = useMemo(() => {
    const findByLabel = (label: string) =>
      allCommunities.find((c) => c.label.trim().toLowerCase() === label.trim().toLowerCase());

    const suggestions: SuggestedChapter[] = [];
    if (myProfile?.graduationYear) {
      const title = `Class of ${myProfile.graduationYear}`;
      suggestions.push({
        key: 'class-year',
        icon: 'school-outline',
        title,
        subtitle: `Reconnect with fellow ${myProfile.graduationYear} graduates.`,
        community: findByLabel(title),
      });
    }
    const place = myProfile?.location?.trim() || myProfile?.institutionName?.trim();
    if (place) {
      const title = `${place} Alumni Chapter`;
      suggestions.push({
        key: 'place',
        icon: 'location-outline',
        title,
        subtitle: `Meet alumni connected to ${place}.`,
        community: findByLabel(title),
      });
    }
    return suggestions;
  }, [myProfile, allCommunities]);

  async function handleJoinSuggestedChapter(community: ForumCommunityRecord) {
    haptics.medium();
    setJoiningCommunityId(community.id);
    try {
      await joinCommunity(community.id, user?.id);
      queryClient.invalidateQueries({ queryKey: ['my-joined-community-ids'] });
      toast.success(`Joined ${community.label}! Find it in Forums.`);
      haptics.success();
    } catch {
      toast.error('Could not join this chapter. Please try again.');
    } finally {
      setJoiningCommunityId(null);
    }
  }

  function handleProposeSuggestedChapter() {
    haptics.light();
    router.push('/(alumni)/forum');
  }

  const hasActiveFilters = !!selectedYear || !!selectedIndustry;

  if (!isEnabled) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <EmptyState
            icon="people-outline"
            title="Alumni Network Unavailable"
            description="The Alumni Network directory is currently disabled by university administration."
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
          Alumni Network
        </AppText>
        <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
          Discover fellow alumni, network across industries, and expand your professional circle.
        </AppText>
      </View>

      {/* Suggested Chapters - nudges alumni toward the forum community (class year / city)
          that already fits them, instead of leaving chapter discovery to chance. */}
      {suggestedChapters.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.sm, letterSpacing: 0.3 }}>
            SUGGESTED CHAPTERS
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
            style={{ flexGrow: 0 }}
          >
            {suggestedChapters.map((chapter) => {
              const isApproved = chapter.community?.approvalStatus === 'approved';
              const isPending = chapter.community?.approvalStatus === 'pending';
              const isJoined = !!chapter.community && joinedIdsSet.has(chapter.community.id.toLowerCase());

              return (
                <SolidCard key={chapter.key} frosted style={{ width: 240 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: colors.pastelPrimaryBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={chapter.icon} size={17} color={colors.brandPrimary} />
                    </View>
                    <AppText variant="bodySmall" weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                      {chapter.title}
                    </AppText>
                  </View>
                  <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ marginBottom: spacing.sm, minHeight: 28 }}>
                    {chapter.subtitle}
                  </AppText>
                  {chapter.community && isApproved ? (
                    <AppButton
                      label={isJoined ? 'Joined' : 'Join'}
                      size="sm"
                      variant={isJoined ? 'secondary' : 'primary'}
                      disabled={isJoined}
                      loading={joiningCommunityId === chapter.community.id}
                      onPress={() => handleJoinSuggestedChapter(chapter.community!)}
                    />
                  ) : isPending ? (
                    <Badge label="Pending approval" tone="warning" />
                  ) : (
                    <AppButton
                      label="Start in Forums"
                      size="sm"
                      variant="secondary"
                      icon="add-circle-outline"
                      onPress={handleProposeSuggestedChapter}
                    />
                  )}
                </SolidCard>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Search Input Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          marginBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search alumni"
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 14,
            padding: 0,
          }}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {/* Filter chips: Class Year + Industry */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}
        style={{ flexGrow: 0, marginBottom: spacing.sm }}
      >
        {hasActiveFilters && (
          <Pressable
            onPress={() => {
              haptics.light();
              setSelectedYear(null);
              setSelectedIndustry(null);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="refresh" size={13} color={colors.critical} />
            <AppText variant="caption" weight="bold" style={{ color: colors.critical }}>
              Reset
            </AppText>
          </Pressable>
        )}
        {yearOptions.map((year) => {
          const active = selectedYear === year;
          return (
            <Pressable
              key={year}
              onPress={() => {
                haptics.light();
                setSelectedYear(active ? null : year);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight={active ? 'bold' : 'regular'} tone={active ? 'inverse' : 'secondary'}>
                Class of {year}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}
        style={{ flexGrow: 0, marginBottom: spacing.md }}
      >
        {INDUSTRY_OPTIONS.map((industry) => {
          const active = selectedIndustry === industry;
          return (
            <Pressable
              key={industry}
              onPress={() => {
                haptics.light();
                setSelectedIndustry(active ? null : industry);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.pastelPrimaryBg : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight={active ? 'bold' : 'regular'} tone={active ? 'brand' : 'secondary'}>
                {industry}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ListItemSkeletonList count={6} />
      ) : (
        <FlatList
          data={alumniList ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
              <DirectoryCard entry={item} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No alumni found"
              description={searchQuery ? 'Try adjusting your search terms.' : 'No other alumni profiles are currently registered.'}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}
