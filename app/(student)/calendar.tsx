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
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { listEvents } from '@/api/events';

const TABS = ['Monthly Grid', 'Agenda'] as const;

export default function CalendarScreen() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { isFeatureEnabled } = useFeatureFlags();
 const [tab, setTab] = useState<(typeof TABS)[number]>('Monthly Grid');

 const { data: events } = useQuery({ queryKey: ['events', 'student', 'calendar'], queryFn: () => listEvents({ scope: 'student' }) });

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
    </ScreenContainer>
  );
 }

 return (
 <ScreenContainer glow={false}>
 {!isDesktop && <AppHeader />}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold" numberOfLines={1}>
        Calendar & Timetable
      </AppText>
      <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ marginTop: 2 }}>
        Class lectures, test deadlines & campus schedule
      </AppText>
    </View>
  </View>

 {!isDesktop && (
 <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
 {TABS.map((t) => {
 const selected = tab === t;
 return (
 <Pressable
 key={t}
 onPress={() => setTab(t)}
 accessibilityRole="tab"
 accessibilityState={{ selected }}
 accessibilityLabel={t}
 style={{
 flex: 1,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 alignItems: 'center',
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 }}
 >
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
 {t}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 )}

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
 {isDesktop ? (
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
