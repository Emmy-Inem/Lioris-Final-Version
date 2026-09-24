import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { StudyGroupCard, openPod } from '@/components/StudyGroupCard';
import { EmptyState } from '@/components/EmptyState';
import { CreateStudyGroupModal, PodFormValues } from '@/components/CreateStudyGroupModal';
import { SegmentedTabs } from '@/components/common/SegmentedTabs';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { createStudyGroup, listStudyGroups } from '@/api/studyGroups';
import { getMyProfile } from '@/api/profile';
import { parseRpcError } from '@/utils/rpcErrors';

type Tab = 'mine' | 'discover';

export default function StudyGroupsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { campusCode } = useCampusScope();
  const [tab, setTab] = useState<Tab | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [course, setCourse] = useState('All');

  const groups = useQuery({
    queryKey: ['study-groups', campusCode, debouncedSearch],
    queryFn: () => listStudyGroups(campusCode, { q: debouncedSearch || undefined }),
  });
  const { data: me } = useQuery({ queryKey: ['profile', 'me', user?.id], queryFn: () => getMyProfile(user!), enabled: !!user });

  const all = groups.data ?? [];
  const mine = all.filter((g) => g.myStatus === 'active');
  const discover = all.filter((g) => g.myStatus !== 'active');
  // Land on "My pods" when there are some, otherwise on Discover - but never override a tab the user chose.
  const activeTab: Tab = tab ?? (groups.isLoading || mine.length > 0 ? 'mine' : 'discover');
  const shown = activeTab === 'mine' ? mine : discover;

  const courses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of shown) if (g.courseCode) counts.set(g.courseCode, (counts.get(g.courseCode) ?? 0) + 1);
    return ['All', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => code)];
  }, [shown]);
  const filtered = shown.filter((g) => course === 'All' || g.courseCode === course);
  const requestsWaiting = mine.reduce((sum, g) => sum + (g.pendingCount ?? 0), 0);
  const unread = mine.reduce((sum, g) => sum + (g.unreadCount ?? 0), 0);

  async function handleCreate(payload: PodFormValues) {
    const created = await createStudyGroup({ ...payload, campusCode: undefined });
    await queryClient.invalidateQueries({ queryKey: ['study-groups'] });
    toast.success('Study pod created.');
    openPod(created.id);
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['study-groups'] });

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={groups.isRefetching} onRefresh={refresh} />}
      >
        <View
          style={{
            flexDirection: isDesktop ? 'row' : 'column',
            alignItems: isDesktop ? 'center' : 'stretch',
            justifyContent: 'space-between',
            gap: isDesktop ? spacing.sm : 10,
            marginTop: isDesktop ? spacing.xs : spacing.sm,
          }}
        >
          <View style={{ flex: isDesktop ? 1 : undefined, minWidth: 0 }}>
            <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
              Study Pods
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 2 }}>
              Small groups for a course: their own discussion, study sessions and members.
            </AppText>
          </View>
          <View style={{ alignSelf: isDesktop ? 'center' : 'flex-start' }}>
            <AppButton label="Create a pod" icon="add" size={isDesktop ? 'md' : 'sm'} onPress={() => setCreateOpen(true)} />
          </View>
        </View>

        {requestsWaiting > 0 ? (
          <Pressable
            onPress={() => {
              setTab('mine');
              const target = mine.find((g) => g.pendingCount > 0);
              if (target) openPod(target.id);
            }}
            accessibilityRole="button"
          >
            <SolidCard radius={16} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary }}>
              <Ionicons name="person-add-outline" size={20} color={colors.brandPrimary} />
              <AppText variant="bodySmall" weight="semiBold" style={{ flex: 1 }}>
                {requestsWaiting} request{requestsWaiting === 1 ? '' : 's'} to join your pods {requestsWaiting === 1 ? 'is' : 'are'} waiting.
              </AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.brandPrimary} />
            </SolidCard>
          </Pressable>
        ) : null}

        <SegmentedTabs
          tabs={[
            { key: 'mine', label: 'My pods', badge: unread },
            { key: 'discover', label: 'Discover' },
          ]}
          active={activeTab}
          onChange={(k) => {
            setTab(k as Tab);
            setCourse('All');
          }}
        />

        <AppTextField label="" value={search} onChangeText={setSearch} placeholder="Search pods by name, course or topic…" leftIcon="search" />

        {courses.length > 2 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 16 }} {...({ 'data-horizontal-scroll': 'true' } as any)}>
            {courses.map((c) => {
              const selected = course === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCourse(c)}
                  style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: selected ? colors.brandPrimary : colors.surface, borderWidth: 1, borderColor: selected ? colors.brandPrimary : colors.border }}
                >
                  <AppText variant="caption" weight={selected ? 'bold' : 'medium'} style={{ color: selected ? '#FFFFFF' : colors.textSecondary }}>
                    {c}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {groups.isError ? (
          <EmptyState icon="cloud-offline-outline" title="Could not load study pods" description={parseRpcError(groups.error).message} actionLabel="Try again" onAction={() => groups.refetch()} />
        ) : null}

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: spacing.md }}>
          {filtered.map((g) => (
            <View key={g.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 340, maxWidth: 560 } : undefined}>
              <StudyGroupCard group={g} onJoined={refresh} />
            </View>
          ))}
        </View>

        {!groups.isLoading && !groups.isError && filtered.length === 0 ? (
          activeTab === 'mine' ? (
            <EmptyState
              icon="people-outline"
              title="You are not in a study pod yet"
              description="Join one on the Discover tab, or start your own and invite classmates."
              actionLabel={discover.length > 0 ? 'Discover pods' : 'Create a pod'}
              onAction={() => (discover.length > 0 ? setTab('discover') : setCreateOpen(true))}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title={debouncedSearch || course !== 'All' ? 'No pods match' : 'No pods to join yet'}
              description={debouncedSearch || course !== 'All' ? 'Try a different search or course.' : 'Be the first: start a pod for your course and invite classmates.'}
              actionLabel="Create a pod"
              onAction={() => setCreateOpen(true)}
            />
          )
        ) : null}
      </ScrollView>

      <CreateStudyGroupModal visible={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} defaultDepartment={me?.department ?? undefined} />
    </ScreenContainer>
  );
}
