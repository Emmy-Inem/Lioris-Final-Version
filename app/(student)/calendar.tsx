import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { MonthCalendarGrid } from '@/components/MonthCalendarGrid';
import { AgendaList } from '@/components/AgendaList';
import { EmptyState } from '@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { CampusMapModal } from '@/components/CampusMapModal';
import { listEvents } from '@/api/events';
import { useAuth } from '@/auth/AuthContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { isSuperAdminIdentity } from '@/utils/campusAccess';
import { queryErrorMode } from '@/utils/queryError';

const TABS = ['Monthly Grid', 'Agenda'] as const;

export default function CalendarScreen() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { isFeatureEnabled } = useFeatureFlags();
 const { user } = useAuth();
 const { campusCode, activeCampusCode } = useCampusScope();
 const isSuperAdmin = isSuperAdminIdentity(user);
 const currentCampus = isSuperAdmin
   ? (activeCampusCode && activeCampusCode !== 'GLOBAL' && activeCampusCode !== 'ALL' ? activeCampusCode : 'ALL')
   : campusCode;
 const [tab, setTab] = useState<(typeof TABS)[number]>('Monthly Grid');
  const [mapModalOpen, setMapModalOpen] = useState(false);

 const { data: events, isError, error, refetch } = useQuery({
   queryKey: ['events', isSuperAdmin ? 'all' : 'student', 'calendar', currentCampus],
   queryFn: () => listEvents({ scope: isSuperAdmin ? 'all' : 'student', campusCode: currentCampus }),
 });

 const errorMode = queryErrorMode({ isError, data: events });

 if (!isFeatureEnabled('utility_cards')) {
  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: spacing.xl, alignItems: 'center' }}>
        <EmptyState
          icon="calendar-outline"
          title="Calendar & Timetable Inactive"
          description="Campus timetable and schedule modules have been temporarily hidden by campus administration."
        />
      </View>
      <CampusMapModal visible={mapModalOpen} onClose={() => setMapModalOpen(false)} />
    </ScreenContainer>
  );
 }

 return (
 <ScreenContainer glow={false}>
 {!isDesktop && <AppHeader />}
  <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
    <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
      Calendar & Timetable
    </AppText>
    <AppText tone="secondary" variant="bodySmall" style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 2 }}>
      Class lectures, test deadlines & campus schedule
    </AppText>
  </View>

 {!isDesktop && (
 <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
 {TABS.map((t) => {
 const selected = tab === t;
 return (
 <Pressable
 key={t}
 onPress={() => setTab(t)}
 accessibilityRole="tab"
 accessibilityState={{ selected }}
 aria-selected={selected}
 accessibilityLabel={t}
 style={{
 flex: 1,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 alignItems: 'center',
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 }}
 >
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'onBrand' : 'secondary'}>
 {t}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 )}

 {errorMode === 'inline' && (
  <ErrorStateView compact subject="the calendar" title="Couldn't refresh the calendar" error={error} onRetry={refetch} style={{ marginBottom: spacing.md }} />
 )}

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
 {errorMode === 'blocking' ? (
 <ErrorStateView subject="the calendar" error={error} onRetry={refetch} />
 ) : isDesktop ? (
 <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
 {/* Left Column: Month Grid */}
 <View style={{ flex: 1.1 }}>
 <SolidCard radius={22} style={{ padding: spacing.lg }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
 Monthly Overview
 </AppText>
 <MonthCalendarGrid events={events ?? []} />
 </SolidCard>
 </View>

 {/* Right Column: Upcoming Agenda */}
 <View style={{ flex: 1 }}>
 <SolidCard radius={22} style={{ padding: spacing.lg }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
 Upcoming Schedule & Deadlines
 </AppText>
 <AgendaList events={events ?? []} />
 </SolidCard>
 </View>
 </View>
 ) : (
 tab === 'Monthly Grid' ? <MonthCalendarGrid events={events ?? []} /> : <AgendaList events={events ?? []} />
 )}
 </ScrollView>
 </ScreenContainer>
 );
}
