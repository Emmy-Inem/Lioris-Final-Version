import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AnalyticsSummarySkeleton } from '@/components/Skeleton';
import { ErrorStateView } from '@/components/ErrorStateView';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile } from '@/api/profile';
import { fetchAdminAnalyticsSummary } from '@/api/analytics';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { haptics } from '@/utils/haptics';

export default function StaffAnalyticsScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { campusCode, homeInstitutionCode } = useCampusScope();
  const [timeRangeDays, setTimeRangeDays] = useState<number>(30);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const effectiveCampus =
    homeInstitutionCode && homeInstitutionCode !== 'GLOBAL'
      ? homeInstitutionCode
      : campusCode && campusCode !== 'GLOBAL'
      ? campusCode
      : profile?.institutionCode && profile.institutionCode !== 'GLOBAL'
      ? profile.institutionCode
      : '';

  const institutionName =
    profile?.institutionName ||
    LAUNCH_INSTITUTIONS.find((i) => i.code === effectiveCampus)?.name ||
    'your campus';

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErrObj,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['staff-analytics-summary', timeRangeDays, effectiveCampus],
    queryFn: () => fetchAdminAnalyticsSummary(timeRangeDays, effectiveCampus || 'ALL'),
    enabled: !!effectiveCampus,
    staleTime: 30_000,
  });

  const maxUses = Math.max(1, ...(summary?.most_used_features.map((f) => f.uses) ?? [1]));

  const engagementTiles = useMemo(
    () => [
      { label: 'FORUM THREADS', value: summary?.total_posts ?? 0, hint: 'Discussions published', color: colors.brandPrimary },
      { label: 'COMMENTS', value: summary?.total_comments ?? 0, hint: 'Replies across all threads', color: colors.brandPrimary },
      { label: 'POLL VOTES CAST', value: summary?.total_poll_votes ?? 0, hint: 'Student referendum votes', color: '#8B5CF6' },
      { label: 'ACADEMIC RESOURCES', value: summary?.total_resources ?? 0, hint: 'Past questions & notes', color: '#10B981' },
      { label: 'CAMPUS EVENTS', value: summary?.total_events ?? 0, hint: 'Scheduled symposia & hackathons', color: '#F59E0B' },
    ],
    [summary, colors.brandPrimary],
  );

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{
          paddingBottom: isDesktop ? 60 : 140,
          paddingTop: isDesktop ? spacing.md : spacing.sm,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={isDesktop}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: isDesktop ? 'row' : 'column',
            justifyContent: 'space-between',
            alignItems: isDesktop ? 'center' : 'flex-start',
            gap: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText variant="h2" weight="bold">
                Campus Analytics
              </AppText>
              <Badge label={effectiveCampus || 'Campus'} tone="brand" />
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Real engagement metrics for {institutionName}. No simulated data.
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            {/* Time range pills */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#F1F5F9',
                borderRadius: radius.pill,
                padding: 3,
              }}
            >
              {[
                { label: '7D', days: 7 },
                { label: '30D', days: 30 },
                { label: '90D', days: 90 },
                { label: 'All', days: 365 },
              ].map((opt) => (
                <Pressable
                  key={opt.days}
                  onPress={() => {
                    haptics.light();
                    setTimeRangeDays(opt.days);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: radius.pill,
                    backgroundColor: timeRangeDays === opt.days ? colors.brandPrimary : 'transparent',
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={timeRangeDays === opt.days ? 'inverse' : 'secondary'}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {/* Refresh button */}
            <Pressable
              onPress={() => {
                haptics.light();
                refetchSummary();
              }}
              style={{
                padding: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="refresh" size={15} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* KPI Cards */}
        {summaryLoading ? (
          <AnalyticsSummarySkeleton />
        ) : summaryError ? (
          <ErrorStateView
            title="Analytics summary unavailable"
            error={summaryErrObj}
            onRetry={refetchSummary}
          />
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, display: summaryLoading || summaryError ? 'none' : 'flex' }}>
          {/* Active Now */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                ACTIVE RIGHT NOW
              </AppText>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28, color: '#10B981' }}>
              {summary?.active_15m ?? 0}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              Students online in the last 15m
            </AppText>
          </SolidCard>

          {/* Active 24h */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                ACTIVE TODAY (24H)
              </AppText>
              <Ionicons name="people-outline" size={16} color={colors.brandPrimary} />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28 }}>
              {summary?.active_24h ?? 0}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              Daily active students
            </AppText>
          </SolidCard>

          {/* Active 7d */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                WEEKLY ACTIVE (7D)
              </AppText>
              <Ionicons name="calendar-outline" size={16} color="#8B5CF6" />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28 }}>
              {summary?.active_7d ?? 0}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              Engaged this week
            </AppText>
          </SolidCard>

          {/* Total Members */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                TOTAL MEMBERS
              </AppText>
              <Ionicons name="school-outline" size={16} color="#F59E0B" />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28 }}>
              {summary?.real_users ?? 0}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              <AppText variant="caption" weight="bold" tone="brand">
                {summary?.active_7d ?? 0} active
              </AppText>
              <AppText variant="caption" tone="secondary">
                • {Math.max(0, (summary?.real_users ?? 0) - (summary?.active_7d ?? 0))} inactive
              </AppText>
            </View>
          </SolidCard>

          {/* New Signups */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                NEW SIGNUPS
              </AppText>
              <Ionicons name="person-add-outline" size={16} color="#3B82F6" />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28 }}>
              {summary?.new_signups ?? 0}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              Joined in the last {timeRangeDays}d
            </AppText>
          </SolidCard>
        </View>

        {/* Campus Engagement */}
        <SolidCard style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="trending-up-outline" size={18} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="h3" weight="bold">
                Campus Engagement
              </AppText>
              <AppText variant="caption" tone="secondary">
                Content created at {institutionName} ({timeRangeDays}d window)
              </AppText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {engagementTiles.map((tile) => (
              <View
                key={tile.label}
                style={{
                  flex: 1,
                  minWidth: isDesktop ? 160 : '45%',
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <AppText variant="caption" tone="secondary" weight="semiBold">
                  {tile.label}
                </AppText>
                <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: tile.color }}>
                  {tile.value}
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                  {tile.hint}
                </AppText>
              </View>
            ))}
          </View>
        </SolidCard>

        {/* Most Used Features */}
        <SolidCard style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="flash-outline" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="h3" weight="bold">
                Most Used Features
              </AppText>
              <AppText variant="caption" tone="secondary">
                Real feature interactions at {institutionName} ({timeRangeDays}d)
              </AppText>
            </View>
          </View>

          {summary?.most_used_features && summary.most_used_features.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {summary.most_used_features.slice(0, 7).map((feat, index) => {
                const pct = Math.round((feat.uses / maxUses) * 100);
                return (
                  <View key={feat.name} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <Badge label={`#${index + 1}`} tone="neutral" />
                        <AppText variant="bodySmall" weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                          {feat.name.replace(/_/g, ' ')}
                        </AppText>
                      </View>
                      <AppText variant="caption" weight="bold" style={{ color: '#10B981' }}>
                        {feat.uses.toLocaleString()} <AppText variant="caption" tone="secondary">({feat.unique_users} users)</AppText>
                      </AppText>
                    </View>
                    <View
                      style={{
                        height: 6,
                        width: '100%',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          backgroundColor: '#10B981',
                          borderRadius: 3,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <Ionicons name="analytics-outline" size={32} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                No feature interactions recorded yet for this campus or timeframe.
              </AppText>
            </View>
          )}
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
