import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { MentorCard } from '@/components/MentorCard';
import { EmptyState } from '@/components/EmptyState';
import { SegmentedTabs } from '@/components/common/SegmentedTabs';
import { MentorshipListCard } from '@/components/mentorship/MentorshipListCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listMentorships, searchMentors } from '@/api/mentorship';
import { EXPERTISE_FILTERS, isOpenMentorship, mentorshipSortRank } from '@/utils/mentorship';
import { parseRpcError } from '@/utils/rpcErrors';
import { haptics } from '@/utils/haptics';

type Tab = 'find' | 'mine';

export default function StudentMentorshipScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { campusCode } = useCampusScope();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('find');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [expertise, setExpertise] = useState('All Fields');
  const [campusFilter, setCampusFilter] = useState<'campus' | 'all'>('campus');
  const [showPaused, setShowPaused] = useState(false);

  const activeCampus = campusFilter === 'campus' && campusCode && campusCode !== 'GLOBAL' ? campusCode : undefined;

  const mentorships = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });
  const mentors = useQuery({
    queryKey: ['mentors', debouncedQuery, expertise, activeCampus, showPaused],
    queryFn: () => searchMentors({ q: debouncedQuery || undefined, focusArea: expertise, campusCode: activeCampus, onlyAccepting: !showPaused }),
    enabled: tab === 'find',
  });

  const mine = useMemo(
    () => (mentorships.data ?? []).slice().sort((a, b) => mentorshipSortRank(a.status) - mentorshipSortRank(b.status) || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')),
    [mentorships.data],
  );
  const activeOnes = mine.filter((m) => m.status === 'active');
  const waiting = mine.filter((m) => m.status === 'pending');
  const past = mine.filter((m) => !isOpenMentorship(m.status));
  const recommended = (mentors.data ?? []).filter((m) => m.matchScore >= 3 && m.isAccepting && m.openSlots > 0);
  const others = (mentors.data ?? []).filter((m) => !recommended.includes(m));
  const showRecommended = !debouncedQuery && expertise === 'All Fields' && recommended.length > 0;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['mentorships'] });
    queryClient.invalidateQueries({ queryKey: ['mentors'] });
  }
  const open = (id: string) => router.push(`/(student)/mentorship-space/${id}` as any);

  const renderMentors = (list: typeof others) => (
    <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
      {list.map((mentor) => (
        <View key={mentor.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 560 } : undefined}>
          <MentorCard mentor={mentor} onRequested={refresh} />
        </View>
      ))}
    </View>
  );

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 130, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={mentorships.isRefetching || mentors.isRefetching} onRefresh={refresh} />}
      >
        <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm }}>
          <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold" numberOfLines={1}>
            Alumni Mentorship
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            Get one-to-one guidance from verified alumni: career advice, interview practice, projects and grad school.
          </AppText>
        </View>

        <SegmentedTabs
          tabs={[
            { key: 'find', label: 'Find a mentor' },
            { key: 'mine', label: 'My mentorships', badge: activeOnes.length + waiting.length },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />

        {tab === 'find' ? (
          <>
            <AppTextField label="" placeholder="Search by name, company or skill…" value={query} onChangeText={setQuery} leftIcon="search" />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {campusCode && campusCode !== 'GLOBAL'
                ? [
                    { id: 'campus', label: `${campusCode} mentors` },
                    { id: 'all', label: 'All campuses' },
                  ].map((f) => {
                    const selected = campusFilter === f.id;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => setCampusFilter(f.id as 'campus' | 'all')}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: radius.pill,
                          backgroundColor: selected ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          borderWidth: 1,
                          borderColor: selected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText variant="caption" weight={selected ? 'bold' : 'regular'} style={{ fontSize: 11, color: selected ? colors.textInverse : colors.textSecondary }}>
                          {f.label}
                        </AppText>
                      </Pressable>
                    );
                  })
                : null}
              <Pressable
                onPress={() => {
                  haptics.light();
                  setShowPaused((v) => !v);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: showPaused }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' }}
              >
                <Ionicons name={showPaused ? 'checkbox' : 'square-outline'} size={16} color={showPaused ? colors.brandPrimary : colors.textSecondary} />
                <AppText variant="caption" tone="secondary">
                  Include full / paused
                </AppText>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 16 }} {...({ 'data-horizontal-scroll': 'true' } as any)}>
              {EXPERTISE_FILTERS.map((f) => {
                const selected = expertise === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setExpertise(f)}
                    style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: selected ? `${colors.brandPrimary}18` : 'transparent' }}
                  >
                    <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                      {f}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {mentors.isError ? (
              <EmptyState icon="cloud-offline-outline" title="Could not load mentors" description={parseRpcError(mentors.error).message} actionLabel="Try again" onAction={() => mentors.refetch()} />
            ) : null}

            {showRecommended ? (
              <>
                <AppText variant="h3" weight="bold">
                  Recommended for you
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: -8 }}>
                  Based on your interests, department and campus.
                </AppText>
                {renderMentors(recommended)}
                <AppText variant="h3" weight="bold">
                  More mentors ({others.length})
                </AppText>
                {renderMentors(others)}
              </>
            ) : (
              <>
                <AppText variant="h3" weight="bold">
                  Verified alumni mentors ({mentors.data?.length ?? 0})
                </AppText>
                {renderMentors(mentors.data ?? [])}
              </>
            )}

            {!mentors.isLoading && !mentors.isError && (mentors.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No mentors match yet"
                description={
                  debouncedQuery || expertise !== 'All Fields'
                    ? 'Try a different search or field.'
                    : campusFilter === 'campus' && campusCode !== 'GLOBAL'
                    ? 'No alumni from your campus have opened mentoring yet. Try "All campuses".'
                    : 'Alumni are still setting up their mentor profiles. Check back soon.'
                }
                actionLabel={campusFilter === 'campus' && campusCode !== 'GLOBAL' ? 'Show all campuses' : undefined}
                onAction={campusFilter === 'campus' && campusCode !== 'GLOBAL' ? () => setCampusFilter('all') : undefined}
              />
            ) : null}
          </>
        ) : (
          <>
            {mentorships.isError ? (
              <EmptyState icon="cloud-offline-outline" title="Could not load your mentorships" description={parseRpcError(mentorships.error).message} actionLabel="Try again" onAction={() => mentorships.refetch()} />
            ) : null}

            {!mentorships.isLoading && mine.length === 0 && !mentorships.isError ? (
              <SolidCard radius={20} style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
                <Ionicons name="school-outline" size={28} color={colors.textSecondary} />
                <AppText weight="bold">You have not asked a mentor yet</AppText>
                <AppText tone="secondary" variant="bodySmall">
                  Browse verified alumni, read what they offer, and send a short request. They reply in the app, and if they accept you get a private space for sessions, goals and notes.
                </AppText>
                <AppButton label="Find a mentor" onPress={() => setTab('find')} />
              </SolidCard>
            ) : null}

            {activeOnes.length > 0 ? (
              <>
                <AppText variant="h3" weight="bold">
                  Active ({activeOnes.length})
                </AppText>
                {activeOnes.map((m) => (
                  <MentorshipListCard key={m.id} mentorship={m} viewerIsMentor={false} onPress={() => open(m.id)} />
                ))}
              </>
            ) : null}
            {waiting.length > 0 ? (
              <>
                <AppText variant="h3" weight="bold">
                  Waiting for a reply ({waiting.length})
                </AppText>
                {waiting.map((m) => (
                  <MentorshipListCard key={m.id} mentorship={m} viewerIsMentor={false} onPress={() => open(m.id)} />
                ))}
              </>
            ) : null}
            {past.length > 0 ? (
              <>
                <AppText variant="h3" weight="bold">
                  History ({past.length})
                </AppText>
                {past.map((m) => (
                  <MentorshipListCard key={m.id} mentorship={m} viewerIsMentor={false} onPress={() => open(m.id)} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
