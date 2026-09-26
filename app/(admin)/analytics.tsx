import React, { useState, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AnalyticsSummarySkeleton, ListItemSkeletonList } from '@/components/Skeleton';
import { ErrorStateView } from '@/components/ErrorStateView';
import { GlassCard } from '@/components/GlassCard';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useBotVisibility } from '@/hooks/useBotVisibility';
import { fetchAdminAnalyticsSummary } from '@/api/analytics';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';

interface RecentActiveUser {
  id: string;
  fullName: string;
  role: string;
  campusCode: string;
  verificationStatus: string;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  isBot: boolean;
  avatarUrl: string | null;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminAnalyticsScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { showBots, toggleBotVisibility } = useBotVisibility();

  const [timeRangeDays, setTimeRangeDays] = useState<number>(30);
  const [campusFilter, setCampusFilter] = useState<string>('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'real' | 'bot'>('all');

  // Fetch real aggregated analytics summary (campus-filtered, zero fake stats)
  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErrObj, refetch: refetchSummary } = useQuery({
    queryKey: ['admin-analytics-summary', timeRangeDays, campusFilter],
    queryFn: () => fetchAdminAnalyticsSummary(timeRangeDays, campusFilter),
    staleTime: 30_000,
  });

  // Fetch recent users with real activity timestamps
  const { data: recentUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<RecentActiveUser[]>({
    queryKey: ['admin-active-users-roster', campusFilter],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, role, campus_code, verification_status, last_active_at, last_login_at, is_bot, avatar_url')
        .order('last_active_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (campusFilter !== 'ALL') {
        query = query.eq('campus_code', campusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Analytics] Failed to fetch recent profiles:', error);
        return [];
      }

      return (data ?? []).map((p: any) => ({
        id: p.id,
        fullName: p.full_name || 'Campus Member',
        role: p.role || 'student',
        campusCode: p.campus_code || 'GLOBAL',
        verificationStatus: p.verification_status || 'unverified',
        lastActiveAt: p.last_active_at,
        lastLoginAt: p.last_login_at,
        isBot: p.is_bot || (p.id && p.id.startsWith('00000000-0000-4000-a000-')),
        avatarUrl: p.avatar_url,
      }));
    },
    staleTime: 30_000,
  });

  // Filtered users for activity stream
  const filteredUsers = useMemo(() => {
    let list = recentUsers;

    if (userTypeFilter === 'real') {
      list = list.filter((u) => !u.isBot);
    } else if (userTypeFilter === 'bot') {
      list = list.filter((u) => u.isBot);
    }

    if (campusFilter !== 'ALL') {
      list = list.filter((u) => u.campusCode === campusFilter);
    }

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.campusCode.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q),
      );
    }

    return list;
  }, [recentUsers, userTypeFilter, campusFilter, userSearch]);

  const maxVisits = Math.max(1, ...(summary?.most_visited_pages.map((p) => p.visits) ?? [1]));
  const maxUses = Math.max(1, ...(summary?.most_used_features.map((f) => f.uses) ?? [1]));

  const activeCampusName = useMemo(() => {
    if (campusFilter === 'ALL') return 'All Higher Institutions';
    const found = LAUNCH_INSTITUTIONS.find((i) => i.code === campusFilter);
    return found ? found.name : campusFilter;
  }, [campusFilter]);

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{
          paddingBottom: isDesktop ? 60 : 140,
          paddingTop: isDesktop ? spacing.md : spacing.sm,
          paddingHorizontal: spacing.md,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={isDesktop}
      >
        {/* Platform Analytics — top-level page, no redundant section pill row */}

        {/* Top Controls Bar */}
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
                Platform Analytics & Traffic
              </AppText>
              <Badge label={campusFilter === 'ALL' ? 'All Institutions' : campusFilter} tone="brand" />
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Real metrics computed directly from database tables. No simulated data.
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
                { label: '24H', days: 1 },
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

            {/* Bot Visibility Quick Toggle */}
            <Pressable
              onPress={() => {
                haptics.light();
                toggleBotVisibility();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: showBots ? colors.border : colors.brandPrimary,
                backgroundColor: showBots ? colors.surface : isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
              }}
            >
              <Ionicons
                name={showBots ? 'sparkles' : 'sparkles-outline'}
                size={14}
                color={showBots ? colors.textSecondary : colors.brandPrimary}
              />
              <AppText
                variant="caption"
                weight="bold"
                tone={showBots ? 'secondary' : 'brand'}
              >
                {showBots ? 'Bots Visible' : 'Bots Hidden'}
              </AppText>
            </Pressable>

            {/* Refresh button */}
            <Pressable
              onPress={() => {
                haptics.light();
                refetchSummary();
                refetchUsers();
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

        {/* Institution / Campus Filter Pills */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: spacing.xs,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <AppText variant="caption" weight="bold" tone="secondary" style={{ marginRight: spacing.xs }}>
            FILTER BY INSTITUTION:
          </AppText>
          <Pressable
            onPress={() => {
              haptics.light();
              setCampusFilter('ALL');
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: campusFilter === 'ALL' ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            }}
          >
            <AppText
              variant="caption"
              weight="bold"
              tone={campusFilter === 'ALL' ? 'inverse' : 'primary'}
            >
              All Higher Institutions
            </AppText>
          </Pressable>

          {LAUNCH_INSTITUTIONS.map((inst) => {
            const active = campusFilter === inst.code;
            return (
              <Pressable
                key={inst.code}
                onPress={() => {
                  haptics.light();
                  setCampusFilter(inst.code);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                }}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  tone={active ? 'inverse' : 'primary'}
                >
                  {inst.shortName}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Real User Activity KPI Cards */}
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
              Real users online in last 15m
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
              Daily active real students
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

          {/* Total Community */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                COMMUNITY ACCOUNTS
              </AppText>
              <Ionicons name="shield-checkmark-outline" size={16} color="#F59E0B" />
            </View>
            <AppText variant="h1" weight="bold" style={{ fontSize: 28 }}>
              {summary?.total_users ?? 0}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <AppText variant="caption" weight="bold" tone="brand">
                {summary?.real_users ?? 0} Real
              </AppText>
              <AppText variant="caption" tone="secondary">
                • {summary?.bot_users ?? 0} Bots
              </AppText>
            </View>
          </SolidCard>
        </View>

        {/* Content & Campus Velocity Dashboard */}
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
            <View>
              <AppText variant="h3" weight="bold">
                Campus Engagement & Content Velocity
              </AppText>
              <AppText variant="caption" tone="secondary">
                Total content created across {activeCampusName} ({timeRangeDays}d window)
              </AppText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {/* Forum Threads */}
            <View
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
                FORUM THREADS
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: colors.brandPrimary }}>
                {summary?.total_posts ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Discussions published
              </AppText>
            </View>

            {/* Poll Votes Cast */}
            <View
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
                POLL VOTES CAST
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: '#8B5CF6' }}>
                {summary?.total_poll_votes ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Student referendum votes
              </AppText>
            </View>

            {/* Academic Resources */}
            <View
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
                ACADEMIC RESOURCES
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: '#10B981' }}>
                {summary?.total_resources ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Past questions & notes
              </AppText>
            </View>

            {/* Campus Events */}
            <View
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
                CAMPUS EVENTS
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: '#F59E0B' }}>
                {summary?.total_events ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Scheduled symposia & hackathons
              </AppText>
            </View>

            {/* Pending ID Verifications */}
            <View
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
                ID VERIFICATION QUEUE
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: summary?.pending_verifications ? '#EF4444' : '#10B981' }}>
                {summary?.pending_verifications ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Pending approval by admin
              </AppText>
            </View>
          </View>
        </SolidCard>

        {/* Most Visited Pages & Most Used Features */}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.lg }}>
          {/* Most Visited Pages */}
          <SolidCard style={{ flex: 1, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="compass-outline" size={18} color={colors.brandPrimary} />
              </View>
              <View>
                <AppText variant="h3" weight="bold">
                  Most Visited Pages
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Real route traffic from analytics_events ({timeRangeDays}d)
                </AppText>
              </View>
            </View>

            {summary?.most_visited_pages && summary.most_visited_pages.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {summary.most_visited_pages.slice(0, 7).map((page, index) => {
                  const pct = Math.round((page.visits / maxVisits) * 100);
                  return (
                    <View key={page.name} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          <Badge label={`#${index + 1}`} tone="neutral" />
                          <AppText variant="bodySmall" weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                            {page.name}
                          </AppText>
                        </View>
                        <AppText variant="caption" weight="bold">
                          {page.visits.toLocaleString()} <AppText variant="caption" tone="secondary">({page.unique_visitors} unique)</AppText>
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
                            backgroundColor: colors.brandPrimary,
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
                <Ionicons name="bar-chart-outline" size={32} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                  No page visits recorded yet for this institution or timeframe.
                </AppText>
              </View>
            )}
          </SolidCard>

          {/* Most Used Features */}
          <SolidCard style={{ flex: 1, padding: spacing.lg }}>
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
              <View>
                <AppText variant="h3" weight="bold">
                  Most Used Features
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Real feature interactions from analytics_events ({timeRangeDays}d)
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
                <Ionicons name="sparkles-outline" size={32} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                  No feature interactions recorded yet for this institution or timeframe.
                </AppText>
              </View>
            )}
          </SolidCard>
        </View>

        {/* Multi-Campus Breakdown Section (Shown when viewing All Institutions) */}
        {campusFilter === 'ALL' && (
          <SolidCard style={{ padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="business-outline" size={18} color="#F59E0B" />
              </View>
              <View>
                <AppText variant="h3" weight="bold">
                  Higher Institution & Campus Breakdown
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Real member distribution and verification rates across universities & polytechnics
                </AppText>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {(summary?.campus_metrics ?? []).map((campus) => {
                const institution = LAUNCH_INSTITUTIONS.find((i) => i.code === campus.campus_code);
                const name = institution ? institution.shortName : campus.campus_code;
                const verifyPct = campus.total_members > 0 ? Math.round((campus.verified_members / campus.total_members) * 100) : 0;

                return (
                  <Pressable
                    key={campus.campus_code}
                    onPress={() => {
                      haptics.light();
                      setCampusFilter(campus.campus_code);
                    }}
                    style={{
                      flex: 1,
                      minWidth: isDesktop ? 220 : '46%',
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <AppText variant="body" weight="bold">
                        {name}
                      </AppText>
                      <Badge label={campus.campus_code} tone="brand" />
                    </View>

                    <AppText variant="h2" weight="bold" style={{ marginTop: 4 }}>
                      {campus.total_members} <AppText variant="caption" tone="secondary">members</AppText>
                    </AppText>

                    <View style={{ marginTop: spacing.sm, gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="caption" tone="secondary">Real Students:</AppText>
                        <AppText variant="caption" weight="bold">{campus.real_members}</AppText>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="caption" tone="secondary">Verified Rate:</AppText>
                        <AppText variant="caption" weight="bold" style={{ color: '#10B981' }}>{verifyPct}%</AppText>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="caption" tone="secondary">Active (7d):</AppText>
                        <AppText variant="caption" weight="bold">{campus.active_7d}</AppText>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </SolidCard>
        )}

        {/* Live User Activity & Login Tracker */}
        <SolidCard style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
            <View>
              <AppText variant="h3" weight="bold">
                Real User Activity & Login Monitor
              </AppText>
              <AppText variant="caption" tone="secondary">
                Track active students and recent logins for {activeCampusName}
              </AppText>
            </View>

            {/* User type selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
              {(['all', 'real', 'bot'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    haptics.light();
                    setUserTypeFilter(type);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: userTypeFilter === type ? colors.brandPrimary : colors.surface,
                    borderWidth: 1,
                    borderColor: userTypeFilter === type ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={userTypeFilter === type ? 'inverse' : 'secondary'}
                  >
                    {type === 'all' ? 'All Accounts' : type === 'real' ? 'Real Users' : 'Bots'}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Search field */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              height: 38,
              marginBottom: spacing.md,
            }}
          >
            <Ionicons name="search" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              value={userSearch}
              onChangeText={setUserSearch}
              placeholder="Search member by name, campus, or role..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
            />
            {userSearch ? (
              <Pressable onPress={() => setUserSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {/* User Roster */}
          <View style={{ gap: spacing.xs }}>
            {filteredUsers.slice(0, 30).map((u) => {
              const isOnline = u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() <= 15 * 60 * 1000;

              return (
                <View
                  key={u.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <View style={{ position: 'relative' }}>
                      <Avatar name={u.fullName} uri={u.avatarUrl} size={36} role={u.role as any} />
                      {isOnline && (
                        <View
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: '#10B981',
                            borderWidth: 2,
                            borderColor: colors.surface,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                          {u.fullName}
                        </AppText>
                        {u.isBot ? (
                          <Badge label="Bot Persona" tone="neutral" />
                        ) : (
                          <Badge label="Real User" tone="success" />
                        )}
                        <Badge label={u.campusCode} tone="brand" />
                      </View>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        Role: {u.role} • {u.verificationStatus}
                      </AppText>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons
                        name="pulse"
                        size={12}
                        color={isOnline ? '#10B981' : colors.textSecondary}
                      />
                      <AppText
                        variant="caption"
                        weight="semiBold"
                        style={{ color: isOnline ? '#10B981' : colors.textSecondary }}
                      >
                        {isOnline ? 'Online Now' : formatRelativeTime(u.lastActiveAt)}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11, marginTop: 2 }}>
                      Login: {formatRelativeTime(u.lastLoginAt)}
                    </AppText>
                  </View>
                </View>
              );
            })}

            {usersLoading ? (
              <ListItemSkeletonList count={6} />
            ) : filteredUsers.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                  No members found matching current filters.
                </AppText>
              </View>
            ) : null}
          </View>
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
