import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { HealthMetricBar } from '@/components/HealthMetricBar';
import { StaffAdminBoardCard } from '@/components/StaffAdminBoardCard';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { Avatar } from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getPlatformHealthSummary } from '@/api/analytics';
import { listReports } from '@/api/moderation';

export default function AdminDashboard() {
  const { spacing, radius } = useTheme();
  const { user } = useAuth();
  const { data: health } = useQuery({ queryKey: ['analytics', 'health'], queryFn: getPlatformHealthSummary });
  const { data: openReports } = useQuery({ queryKey: ['reports', 'open'], queryFn: () => listReports({ status: 'open' }) });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.glass, overflow: 'hidden' }}>
          <AuthHeroBackground height={128} radius={radius.glass}>
            <View style={{ flex: 1, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="inverse" style={{ letterSpacing: 1, opacity: 0.85 }}>
                    ADMIN DESK 🛡️
                  </AppText>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
                    <AppText variant="caption" weight="bold" tone="inverse">
                      Admin
                    </AppText>
                  </View>
                </View>
                <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1}>
                  Welcome, {user?.fullName?.split(' ')[0] ?? 'there'} 👋
                </AppText>
              </View>
              <Avatar name={user?.fullName ?? 'You'} size={64} />
            </View>
          </AuthHeroBackground>
        </View>

        <StaffAdminBoardCard
          role="admin"
          onOpenAdminWorkdesk={() => router.push('/(admin)/platform-config')}
          onManagePortalLinks={() => router.push('/(admin)/feature-controls')}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => router.push('/(admin)/reports')}
            accessibilityRole="button"
            accessibilityLabel={`${openReports?.length ?? 0} open reports`}
          >
            <SolidCard>
              <AppText variant="h2" weight="bold">
                {openReports?.length ?? 0}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
                Open reports
              </AppText>
            </SolidCard>
          </Pressable>
          <SolidCard style={{ flex: 1 }}>
            <AppText variant="h2" weight="bold">
              {health?.studentMauPct ?? '—'}%
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
              Student MAU
            </AppText>
          </SolidCard>
        </View>

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Platform health
        </AppText>
        {health ? (
          <SolidCard style={{ marginBottom: spacing.lg }}>
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

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <AppButton label="Full analytics" onPress={() => router.push('/(admin)/analytics')} />
          <AppButton label="Moderation queue" variant="secondary" onPress={() => router.push('/(admin)/moderation-queue')} />
          <AppButton label="Feature controls" variant="secondary" onPress={() => router.push('/(admin)/feature-controls')} />
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}
