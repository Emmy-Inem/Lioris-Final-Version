import React from 'react';
import { ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { HealthMetricBar } from '@/components/HealthMetricBar';
import { useTheme } from '@/theme/ThemeProvider';
import { getPlatformHealthSummary } from '@/api/analytics';

const FUNNEL_STAGES = [
  'Install',
  'Register',
  'Verify School',
  'Complete Profile',
  'View Feed',
  'Send Connection',
  'Message Someone',
  'Attend Event',
  'Become Weekly Active User',
];

export default function AdminAnalyticsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data: health } = useQuery({ queryKey: ['analytics', 'health'], queryFn: getPlatformHealthSummary });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <AppText variant="h1" weight="bold" style={{ paddingVertical: spacing.lg }}>
          Analytics
        </AppText>

        {health ? (
          <SolidCard style={{ marginBottom: spacing.lg }}>
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
              Success metrics (Section 1.5)
            </AppText>
            <HealthMetricBar label="Student MAU" valuePct={health.studentMauPct} greenMin={60} amberMin={40} />
            <HealthMetricBar label="Alumni MAU" valuePct={health.alumniMauPct} greenMin={30} amberMin={20} />
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

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Activation funnel (Section 11.1)
        </AppText>
        <SolidCard>
          {FUNNEL_STAGES.map((stage, index) => (
            <FunnelRow key={stage} label={stage} isLast={index === FUNNEL_STAGES.length - 1} />
          ))}
        </SolidCard>

        <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.md }}>
          Funnel conversion percentages require the Analytics Service (PRD Section 12.3) —
          wire this view to real event data once that backend is live.
        </AppText>
      </ScrollView>
    </ScreenContainer>
  );
}

function FunnelRow({ label, isLast }: { label: string; isLast: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <AppText
      variant="body"
      weight="medium"
      style={{
        paddingVertical: spacing.sm,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.divider,
      }}
    >
      {label}
    </AppText>
  );
}
