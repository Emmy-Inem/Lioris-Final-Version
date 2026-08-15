import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { HealthMetricBar } from '@/components/HealthMetricBar';
import { useTheme } from '@/theme/ThemeProvider';
import { getPlatformHealthSummary } from '@/api/analytics';

const FUNNEL_DATA = [
  { stage: '1. App Install & Open', count: '100%', users: '42,000', dropoff: 'Baseline' },
  { stage: '2. University Email Registration', count: '89.2%', users: '37,460', dropoff: '-10.8%' },
  { stage: '3. Identity / School Verification', count: '78.4%', users: '32,920', dropoff: '-10.8%' },
  { stage: '4. Complete Profile & Department', count: '71.1%', users: '29,860', dropoff: '-7.3%' },
  { stage: '5. View Campus Feed & Join Squad', count: '64.5%', users: '27,090', dropoff: '-6.6%' },
  { stage: '6. Direct Message / Video Mentorship', count: '48.2%', users: '20,240', dropoff: '-16.3%' },
  { stage: '7. Attend Event / RSVP', count: '41.6%', users: '17,470', dropoff: '-6.6%' },
  { stage: '8. Weekly Active Power User', count: '34.8%', users: '14,610', dropoff: '-6.8%' },
];

export default function AdminAnalyticsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data: health } = useQuery({ queryKey: ['analytics', 'health'], queryFn: getPlatformHealthSummary });

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, marginBottom: spacing.md }}>
          <View>
            <AppText variant="h1" weight="bold">
              Platform Analytics 📊
            </AppText>
            <AppText tone="secondary">Student onboarding conversion funnels & SLA health matrix</AppText>
          </View>
          <Badge label="Live Metrics" tone="brand" />
        </View>

        {/* SLA Health Matrix */}
        {health ? (
          <SolidCard radius={20} style={{ marginBottom: spacing.lg }}>
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
              Strategic Growth & Adoption Benchmarks
            </AppText>
            <HealthMetricBar label="Student MAU (target: 60% @ 6mo)" valuePct={health.studentMauPct} greenMin={60} amberMin={40} />
            <HealthMetricBar label="Alumni MAU (target: 30% @ 9mo)" valuePct={health.alumniMauPct} greenMin={30} amberMin={20} />
            <HealthMetricBar label="Event participation" valuePct={health.eventParticipationPct} greenMin={40} amberMin={20} />
            <HealthMetricBar label="Connection activation" valuePct={health.connectionActivationPct} greenMin={25} amberMin={15} />
            <HealthMetricBar label="Notification read rate" valuePct={health.notificationReadRatePct} greenMin={90} amberMin={70} />
            <HealthMetricBar
              label="Moderation false-positive rate"
              valuePct={health.moderationFalsePositivePct}
              greenMin={2}
              amberMin={5}
              invert
            />
          </SolidCard>
        ) : null}

        {/* Multi-Stage Conversion Funnel */}
        <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h3" weight="bold">
                Student Activation Funnel 📈
              </AppText>
              <AppText tone="secondary" variant="caption">
                Stage-by-stage progression from install to weekly active status
              </AppText>
            </View>
            <Badge label="34.8% End-to-End" tone="brand" />
          </View>

          <View style={{ gap: spacing.sm }}>
            {FUNNEL_DATA.map((item, index) => {
              const numericPercent = parseFloat(item.count);
              return (
                <View key={item.stage} style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <AppText weight="bold" variant="bodySmall" tone="primary">
                      {item.stage}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText weight="bold" tone="brand" variant="bodySmall">
                        {item.count}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        ({item.users})
                      </AppText>
                    </View>
                  </View>

                  <View style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 4 }}>
                    <View style={{ width: `${numericPercent}%`, height: '100%', backgroundColor: colors.brandPrimary, borderRadius: 3 }} />
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText tone="secondary" style={{ fontSize: 10 }}>Step conversion health</AppText>
                    <AppText tone={item.dropoff.startsWith('-1') ? 'critical' : 'secondary'} style={{ fontSize: 10, fontWeight: 'bold' }}>
                      {item.dropoff}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
