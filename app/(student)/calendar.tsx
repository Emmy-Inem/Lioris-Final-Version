import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { MonthCalendarGrid } from '@/components/MonthCalendarGrid';
import { AgendaList } from '@/components/AgendaList';
import { useTheme } from '@/theme/ThemeProvider';
import { listEvents } from '@/api/events';

const TABS = ['Monthly Grid', 'Agenda'] as const;

export default function CalendarScreen() {
  const { colors, spacing, radius } = useTheme();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Monthly Grid');

  const { data: events } = useQuery({ queryKey: ['events', 'student', 'calendar'], queryFn: () => listEvents({ scope: 'student' }) });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, marginBottom: spacing.lg }}>
        <AppText variant="h1" weight="bold">
          My Scheduler 🗓️
        </AppText>
      </View>

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {tab === 'Monthly Grid' ? <MonthCalendarGrid events={events ?? []} /> : <AgendaList events={events ?? []} />}
      </ScrollView>
    </ScreenContainer>
  );
}
