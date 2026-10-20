import { useFeatureFlags, FeatureKey } from '@/context/FeatureFlagsContext';
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { EmptyState } from './EmptyState';
import { PostCard } from './PostCard';
import { EventCard } from './EventCard';
import { ResourceCard } from './ResourceCard';
import { ResourceReaderModal } from './ResourceReaderModal';
import { ReportResourceModal } from './ReportResourceModal';
import { JobCard } from './JobCard';
import { DirectoryCard } from './DirectoryCard';
import { MarketplaceItemCard } from './MarketplaceItemCard';
import { Resource } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts } from '@/api/posts';
import { listEvents } from '@/api/events';
import { listResources } from '@/api/resources';
import { listJobs } from '@/api/jobs';
import { searchAlumniDirectory } from '@/api/connections';
import { listMarketplaceListings } from '@/api/marketplace';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useForumScope } from '@/hooks/useForumScope';
import { useCampusRegistry } from '@/hooks/useCampusRegistry';
import { isSuperAdminIdentity } from '@/utils/campusAccess';

type SearchTab = 'posts' | 'events' | 'resources' | 'jobs' | 'alumni' | 'marketplace';

const SEARCH_TAB_FLAG: Partial<Record<SearchTab, FeatureKey>> = {
  posts: 'discussion_workspaces',
  events: 'campus_events',
  resources: 'academic_resources',
  marketplace: 'marketplace',
};

const TAB_LABEL: Record<SearchTab, string> = {
  posts: 'Threads',
  events: 'Events',
  resources: 'Resources',
  jobs: 'Jobs',
  alumni: 'Alumni',
  marketplace: 'Marketplace',
};

const TAB_EMPTY_TITLE: Record<SearchTab, string> = {
  posts: 'No posts found',
  events: 'No events found',
  resources: 'No resources found',
  jobs: 'No jobs found',
  alumni: 'No alumni found',
  marketplace: 'No listings found',
};

export function SearchScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const isSuperAdmin = isSuperAdminIdentity(user);
  const { campusCode } = useCampusScope();
  const { scope: forumScope } = useForumScope();
  // Carries a prefilled query in from callers like DesktopTopBar's search submit
  // or a tapped #hashtag - initial value only (see CommunityFeedScreen's
  // params.category for the same "seed from the param, don't keep resyncing" convention).
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [selectedTab, setTab] = useState<SearchTab>('posts');
  // Super admins can search across every university; null = all schools.
  const [school, setSchool] = useState<string | null>(null);
  const { campuses: schoolChoices } = useCampusRegistry();
  const searchCampus = isSuperAdmin ? (school ?? 'ALL') : campusCode;
  const [readingResource, setReadingResource] = useState<Resource | null>(null);
  const [reportingResource, setReportingResource] = useState<Resource | null>(null);
  const trimmed = query.trim();
  const debouncedTrimmed = useDebouncedValue(trimmed);
  const active = debouncedTrimmed.length > 0;
  // Jobs/Career is alumni-only and Marketplace is student-only (staff/admin can
  // still search either, matching their broader cross-role visibility
  // elsewhere) - this shared search screen must not offer the other role's tab.
  const visibleTabs = (Object.keys(TAB_LABEL) as SearchTab[]).filter((t) => {
    if (t === 'jobs' && user?.role === 'student') return false;
    if (t === 'marketplace' && user?.role === 'alumni') return false;
    // An admin who switched a module off must not have it searchable either.
    const flag = SEARCH_TAB_FLAG[t];
    if (flag && !isFeatureEnabled(flag)) return false;
    return true;
  });

  // The tab that is actually shown: if the selected one was switched off (module disabled) or never applied to this
  // role, fall back to the first visible tab so no query runs for a hidden module.
  const tab: SearchTab = visibleTabs.includes(selectedTab) ? selectedTab : (visibleTabs[0] ?? 'alumni');
  const canBrowseBySchool = isSuperAdmin && (tab === 'events' || tab === 'resources');

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['search', 'posts', debouncedTrimmed, campusCode, forumScope],
    // Same rules as the Forum: own campus only, plus global posts only while the Global toggle is on -
    // a bare search used to return every post the database would let this account read.
    queryFn: () =>
      listFeedPosts({
        q: debouncedTrimmed,
        viewScope: forumScope,
        viewerInstitutionCode: campusCode && campusCode !== 'GLOBAL' ? campusCode : undefined,
        pageSize: 50,
      }),
    enabled: tab === 'posts' && active,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['search', 'events', debouncedTrimmed, searchCampus],
    queryFn: () => listEvents({ q: debouncedTrimmed || undefined, campusCode: searchCampus, scope: isSuperAdmin ? 'all' : undefined }),
    enabled: tab === 'events' && (active || canBrowseBySchool),
  });

  const { data: resources, isLoading: resourcesLoading } = useQuery({
    queryKey: ['search', 'resources', debouncedTrimmed, searchCampus],
    queryFn: () => listResources({ q: debouncedTrimmed || undefined, campusCode: searchCampus }),
    enabled: tab === 'resources' && (active || canBrowseBySchool),
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['search', 'jobs', debouncedTrimmed, campusCode],
    queryFn: () => listJobs({ q: debouncedTrimmed, campusCode }),
    enabled: tab === 'jobs' && active,
  });

  const { data: alumni, isLoading: alumniLoading } = useQuery({
    queryKey: ['search', 'alumni', debouncedTrimmed],
    queryFn: () => searchAlumniDirectory({ q: debouncedTrimmed }),
    enabled: tab === 'alumni' && active,
  });

  const { data: marketplaceItems, isLoading: marketplaceLoading } = useQuery({
    queryKey: ['search', 'marketplace', debouncedTrimmed, campusCode],
    queryFn: () => listMarketplaceListings({ q: debouncedTrimmed, campusCode }),
    enabled: tab === 'marketplace' && active,
  });

  const isLoading: Record<SearchTab, boolean> = {
    posts: postsLoading,
    events: eventsLoading,
    resources: resourcesLoading,
    jobs: jobsLoading,
    alumni: alumniLoading,
    marketplace: marketplaceLoading,
  };

  return (
    <ScreenContainer glow={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: isDesktop ? spacing.xs : spacing.lg, marginBottom: spacing.md }}>
        {!isDesktop && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <AppTextField
            label=""
            placeholder="Search threads, events, jobs, alumni, marketplace..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
        {visibleTabs.map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={TAB_LABEL[t]}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'inverse' : 'secondary'}>
                {TAB_LABEL[t]}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {isSuperAdmin && (tab === 'events' || tab === 'resources') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
          {[{ code: null as string | null, label: 'All schools' }, ...schoolChoices.map((c) => ({ code: c.code as string | null, label: c.shortName || c.code }))].map((opt) => {
            const selected = school === opt.code;
            return (
              <Pressable
                key={opt.code ?? 'all'}
                onPress={() => setSchool(opt.code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Filter by ${opt.label}`}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.pastelPrimaryBg : colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption" weight={selected ? 'bold' : 'medium'} tone={selected ? 'brand' : 'secondary'}>
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {trimmed.length === 0 && !canBrowseBySchool ? (
        <EmptyState title="Search Campus Knowledge" description="Find forum threads, events, jobs, alumni, marketplace listings, and academic past questions." />
      ) : tab === 'posts' ? (
        <FlatList
          data={posts ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}
          renderItem={({ item }) => <PostCard post={item} forceScopeBadge={isSuperAdmin} />}
          ListEmptyComponent={!isLoading.posts ? <EmptyState title={TAB_EMPTY_TITLE.posts} description={`No results for "${debouncedTrimmed}".`} /> : null}
        />
      ) : tab === 'events' ? (
        <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {(events ?? []).map((item) => (
              <View key={item.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 } : { marginBottom: spacing.sm }}>
                <EventCard event={item} />
              </View>
            ))}
          </View>
          {(events ?? []).length === 0 && !isLoading.events ? (
            <EmptyState title={TAB_EMPTY_TITLE.events} description={debouncedTrimmed ? `No results for "${debouncedTrimmed}".` : 'No events found for the selected school.'} />
          ) : null}
        </ScrollView>
      ) : tab === 'resources' ? (
        <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {(resources ?? []).map((item) => (
              <View key={item.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 } : { marginBottom: spacing.sm }}>
                <ResourceCard resource={item} onPreview={setReadingResource} onReport={setReportingResource} showCampusTag={isSuperAdmin} />
              </View>
            ))}
          </View>
          {(resources ?? []).length === 0 && !isLoading.resources ? (
            <EmptyState title={TAB_EMPTY_TITLE.resources} description={debouncedTrimmed ? `No results for "${debouncedTrimmed}".` : 'No resources found for the selected school.'} />
          ) : null}
        </ScrollView>
      ) : tab === 'jobs' ? (
        <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {(jobs ?? []).map((item) => (
              <View key={item.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 } : { marginBottom: spacing.sm }}>
                <JobCard job={item} />
              </View>
            ))}
          </View>
          {(jobs ?? []).length === 0 && !isLoading.jobs ? (
            <EmptyState title={TAB_EMPTY_TITLE.jobs} description={`No results for "${debouncedTrimmed}".`} />
          ) : null}
        </ScrollView>
      ) : tab === 'alumni' ? (
        <FlatList
          data={alumni ?? []}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={{ flex: 1, minWidth: 0 }}>
              <DirectoryCard entry={item} />
            </View>
          )}
          ListEmptyComponent={!isLoading.alumni ? <EmptyState title={TAB_EMPTY_TITLE.alumni} description={`No results for "${debouncedTrimmed}".`} /> : null}
        />
      ) : (
        <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(marketplaceItems ?? []).map((item) => (
              <View key={item.id} style={{ width: isDesktop ? 220 : '47%' }}>
                <MarketplaceItemCard item={item} />
              </View>
            ))}
          </View>
          {(marketplaceItems ?? []).length === 0 && !isLoading.marketplace ? (
            <EmptyState title={TAB_EMPTY_TITLE.marketplace} description={`No results for "${debouncedTrimmed}".`} />
          ) : null}
        </ScrollView>
      )}

      <ResourceReaderModal
        visible={!!readingResource}
        resource={readingResource}
        onClose={() => setReadingResource(null)}
      />
      {reportingResource && (
        <ReportResourceModal
          visible={!!reportingResource}
          resource={reportingResource}
          onClose={() => setReportingResource(null)}
        />
      )}
    </ScreenContainer>
  );
}
