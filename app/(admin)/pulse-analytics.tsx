import React, { useState } from'react';
import { Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

const RETENTION_COHORTS = [
  { label: 'Day 1', percent: 94, users: '22.8k' },
  { label: 'Day 7', percent: 78, users: '18.9k' },
  { label: 'Day 14', percent: 69, users: '16.7k' },
  { label: 'Day 30', percent: 61, users: '14.8k' },
  { label: 'Day 60', percent: 54, users: '13.1k' },
];

const DEPARTMENT_TRAFFIC = [
  { name: 'Computer Science & AI', percentage: 38, count: '9.2k active', color: '#0F766E' },
  { name: 'Engineering & Tech', percentage: 27, count: '6.5k active', color: '#3B82F6' },
  { name: 'Business & Economics', percentage: 19, count: '4.6k active', color: '#8B5CF6' },
  { name: 'Medical Sciences & Health', percentage: 16, count: '3.9k active', color: '#F59E0B' },
];

const TIMEFRAMES = ['7 Days', '30 Days', 'This Semester', 'All Time'] as const;

export default function PulseAnalyticsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('30 Days');

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', rowGap: spacing.sm, paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.md }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <AppText variant="h1" weight="bold">
              Campus Pulse Analytics
            </AppText>
            <AppText tone="secondary" variant="bodySmall">
              Real-time student engagement, DAU metrics & retention
            </AppText>
          </View>
          <View style={{ flexShrink: 0 }}>
            <Badge label="Live Telemetry" tone="accent" />
          </View>
        </View>

        {/* Timeframe Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.sm }}
          style={{ marginBottom: spacing.sm }}
        >
          {TIMEFRAMES.map((t) => {
            const selected = timeframe === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTimeframe(t)}
                style={{
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                  {t}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Key Metrics Grid */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <SolidCard radius={20} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="people-outline" size={16} color={colors.brandPrimary} />
              <AppText tone="secondary" variant="caption">
                DAU / MAU Ratio
              </AppText>
            </View>
            <AppText variant="h2" weight="bold" tone="brand">
              24.2k / 89.4k
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
              27.1% stickiness (+3.4%)
            </AppText>
          </SolidCard>

          <SolidCard radius={20} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="chatbubbles-outline" size={16} color={colors.brandAccent} />
              <AppText tone="secondary" variant="caption">
                Threads & Polls
              </AppText>
            </View>
            <AppText variant="h2" weight="bold" tone="accent">
              4,812
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
              +18% this month
            </AppText>
          </SolidCard>
        </View>

        <View style={isDesktop ? { flexDirection: 'row', gap: spacing.md } : undefined}>
          {/* User Retention Chart */}
          <View style={isDesktop ? { flex: 1 } : undefined}>
            <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <View>
                  <AppText weight="bold" variant="bodySmall">
                    Cohort Retention Benchmark
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    Percentage of registered students returning after N days
                  </AppText>
                </View>
                <Badge label="Healthy (Tier 1)" tone="brand" />
              </View>

              {/* Retention Bars */}
              <View style={{ gap: spacing.sm }}>
                {RETENTION_COHORTS.map((c) => (
                  <View key={c.label}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <AppText variant="caption" weight="bold">
                        {c.label}
                      </AppText>
                      <AppText variant="caption" tone="brand" weight="bold">
                        {c.percent}% ({c.users})
                      </AppText>
                    </View>
                    <View style={{ width: '100%', height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${c.percent}%`,
                          height: '100%',
                          backgroundColor: colors.brandPrimary,
                          borderRadius: 5,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </SolidCard>
          </View>

          {/* Department Engagement Breakdown */}
          <View style={isDesktop ? { flex: 1 } : undefined}>
            <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <AppText weight="bold" variant="bodySmall">
                  Departmental Activity Share
                </AppText>
                <AppText tone="secondary" variant="caption">
                  24,200 active students
                </AppText>
              </View>

              <View style={{ gap: spacing.sm }}>
                {DEPARTMENT_TRAFFIC.map((dept) => (
                  <View key={dept.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <AppText weight="medium" variant="bodySmall" numberOfLines={1}>
                        {dept.name}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {dept.count}
                      </AppText>
                    </View>
                    <View style={{ width: 100, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginHorizontal: spacing.sm }}>
                      <View style={{ width: `${dept.percentage}%`, height: '100%', backgroundColor: dept.color, borderRadius: 4 }} />
                    </View>
                    <AppText weight="bold" variant="caption" style={{ width: 35, textAlign: 'right' }}>
                      {dept.percentage}%
                    </AppText>
                  </View>
                ))}
              </View>
            </SolidCard>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
 );
}
