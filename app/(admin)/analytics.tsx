import React, { useState, useMemo } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AppButton } from '@/components/AppButton';
import { AnalyticsSummarySkeleton, ListItemSkeletonList } from '@/components/Skeleton';
import { ErrorStateView } from '@/components/ErrorStateView';
import { GlassCard } from '@/components/GlassCard';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { fetchAdminAnalyticsSummary, AdminAnalyticsSummary } from '@/api/analytics';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';
import { listCampuses } from '@/api/institutions';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { buildCsv, downloadCsv } from '@/utils/csvExport';
import { useAuth } from '@/auth/AuthContext';

interface RecentActiveUser {
  id: string;
  fullName: string;
  role: string;
  campusCode: string;
  verificationStatus: string;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  avatarUrl: string | null;
}

/** A user counts as active once they've used the app in the last 7 days; otherwise inactive. */
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
function isActiveUser(lastActiveAt: string | null): boolean {
  return !!lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() <= ACTIVE_WINDOW_MS;
}

/** Builds the multi-section export CSV: one small table per card on this screen, in the order they appear. */
function buildAnalyticsCsv(summary: AdminAnalyticsSummary, timeRangeDays: number, campusLabel: string): string {
  const summaryRows = [
    { label: 'Active Right Now (15m)', value: summary.active_15m },
    { label: 'Active Today (24h)', value: summary.active_24h },
    { label: 'Weekly Active (7d)', value: summary.active_7d },
    { label: 'Total Users', value: summary.real_users },
    { label: `New Signups (${timeRangeDays}d)`, value: summary.new_signups },
    { label: 'Forum Threads', value: summary.total_posts },
    { label: 'Comments', value: summary.total_comments },
    { label: 'Poll Votes Cast', value: summary.total_poll_votes },
    { label: 'Academic Resources', value: summary.total_resources },
    { label: 'Campus Events', value: summary.total_events },
    { label: 'Pending ID Verifications', value: summary.pending_verifications },
  ];

  return [
    `Platform Analytics Summary - ${campusLabel} (${timeRangeDays}d window)`,
    buildCsv(summaryRows, [
      { header: 'Metric', value: (r) => r.label },
      { header: 'Value', value: (r) => r.value },
    ]),
    '',
    'Most Visited Pages',
    buildCsv(summary.most_visited_pages, [
      { header: 'Page', value: (p) => p.name },
      { header: 'Visits', value: (p) => p.visits },
      { header: 'Unique Visitors', value: (p) => p.unique_visitors },
    ]),
    '',
    'Most Used Features',
    buildCsv(summary.most_used_features, [
      { header: 'Feature', value: (f) => f.name },
      { header: 'Uses', value: (f) => f.uses },
      { header: 'Unique Users', value: (f) => f.unique_users },
    ]),
    '',
    'Higher Institution & Campus Breakdown',
    buildCsv(summary.campus_metrics, [
      { header: 'Campus Code', value: (c) => c.campus_code },
      { header: 'Total Members', value: (c) => c.total_members },
      { header: 'Real Members', value: (c) => c.real_members },
      { header: 'Verified Members', value: (c) => c.verified_members },
      { header: 'Active (7d)', value: (c) => c.active_7d },
    ]),
  ].join('\n');
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
  const { user } = useAuth();
  const adminBadges = useAdminBadges();
  const lockedCampus = user?.isCampusAdmin && user?.campusCode ? user.campusCode.toUpperCase() : null;
  const { data: institutions = [] } = useQuery({ queryKey: ['campuses'], queryFn: listCampuses });

  const [timeRangeDays, setTimeRangeDays] = useState<number>(30);
  const [requestedCampusFilter, setRequestedCampusFilter] = useState<string>('ALL');
  const campusFilter = lockedCampus || requestedCampusFilter;
  const setCampusFilter = (value: string) => {
    if (!lockedCampus) setRequestedCampusFilter(value);
  };
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Fetch real aggregated analytics summary (campus-filtered, zero fake stats)
  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErrObj, refetch: refetchSummary } = useQuery({
    queryKey: ['admin-analytics-summary', timeRangeDays, campusFilter],
    queryFn: () => fetchAdminAnalyticsSummary(timeRangeDays, campusFilter),
    staleTime: 30_000,
  });

  // Fetch recent users via SECURITY DEFINER RPC (bypasses profile RLS for admin view)
  const { data: recentUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<RecentActiveUser[]>({
    queryKey: ['admin-active-users-roster', campusFilter],
    queryFn: async () => {
      // Use admin_get_user_profiles RPC which uses SECURITY DEFINER to bypass
      // the profiles table RLS (which would otherwise only return the admin's own row).
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_user_profiles', {
        p_campus_code: campusFilter !== 'ALL' ? campusFilter : null,
        p_limit: 500,
      });

      const isSeededBot = (p: any) => Boolean(p.is_bot || (p.id && p.id.startsWith('00000000-0000-4000-a000-')));

      if (!rpcError && rpcData && rpcData.length > 0) {
        return (rpcData as any[])
          .filter((p) => !isSeededBot(p))
          .map((p: any) => ({
            id: p.id,
            fullName: p.full_name || 'Campus Member',
            role: p.role || 'student',
            campusCode: p.campus_code || 'GLOBAL',
            verificationStatus: p.verification_status || 'unverified',
            lastActiveAt: p.last_active_at,
            lastLoginAt: p.last_login_at,
            avatarUrl: p.avatar_url,
          }));
      }

      if (rpcError) {
        console.warn('[Analytics] admin_get_user_profiles RPC failed, trying direct query:', rpcError.message);
      }

      // Safe fallback: direct table query (only request columns that always exist in production)
      let query = supabase
        .from('profiles')
        .select('id, full_name, role, campus_code, verification_status, avatar_url, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (campusFilter !== 'ALL') {
        query = query.ilike('campus_code', campusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Analytics] Fallback profile fetch failed:', error.message);
        return [];
      }

      return (data ?? [])
        .filter((p: any) => !isSeededBot(p))
        .map((p: any) => ({
          id: p.id,
          fullName: p.full_name || 'Campus Member',
          role: p.role || 'student',
          campusCode: p.campus_code || 'GLOBAL',
          verificationStatus: p.verification_status || 'unverified',
          lastActiveAt: null,
          lastLoginAt: null,
          avatarUrl: p.avatar_url,
        }));
    },
    staleTime: 30_000,
  });

  // Filtered users for activity stream
  const filteredUsers = useMemo(() => {
    let list = recentUsers;

    if (statusFilter === 'active') {
      list = list.filter((u) => isActiveUser(u.lastActiveAt));
    } else if (statusFilter === 'inactive') {
      list = list.filter((u) => !isActiveUser(u.lastActiveAt));
    }

    if (campusFilter !== 'ALL') {
      list = list.filter((u) => u.campusCode?.toUpperCase() === campusFilter.toUpperCase());
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

    // Most recently active first.
    return [...list].sort((a, b) => {
      const timeA = new Date(a.lastActiveAt || a.lastLoginAt || 0).getTime();
      const timeB = new Date(b.lastActiveAt || b.lastLoginAt || 0).getTime();
      return timeB - timeA;
    });
  }, [recentUsers, statusFilter, campusFilter, userSearch]);

  const maxVisits = Math.max(1, ...(summary?.most_visited_pages.map((p) => p.visits) ?? [1]));
  const maxUses = Math.max(1, ...(summary?.most_used_features.map((f) => f.uses) ?? [1]));

  const activeCampusName = useMemo(() => {
    if (campusFilter === 'ALL') return 'All Higher Institutions';
    const found = institutions.find((i) => i.code === campusFilter);
    return found ? found.name : campusFilter;
  }, [campusFilter, institutions]);

  async function handleExportCsv() {
    if (!summary) return;
    haptics.medium();
    setExportingCsv(true);
    try {
      const csvContent = buildAnalyticsCsv(summary, timeRangeDays, activeCampusName);
      await downloadCsv(csvContent, `campus_analytics_${campusFilter}`, {
        successTitle: 'Analytics Exported',
        successMessage: 'Compliance CSV download has been initiated.',
        shareTitle: 'Export Platform Analytics CSV',
      });
    } catch (err) {
      console.error('[Analytics] Export failed:', err);
      Alert.alert('Export Error', 'Unable to export analytics. Please try again.');
    } finally {
      setExportingCsv(false);
    }
  }

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
        {/* Platform Group Navigation Tabs */}
        <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
          <AdminSectionTabs group="platform" />
        </View>

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

            {/* Export CSV */}
            <AppButton
              label="Export CSV"
              variant="secondary"
              size="sm"
              onPress={handleExportCsv}
              loading={exportingCsv}
              disabled={!summary || summaryLoading || exportingCsv}
            />

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

        {/* Super Admin can compare campuses; Campus Admin is locked to their assignment. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <AppText variant="caption" weight="bold" tone="secondary">
              {lockedCampus ? 'ASSIGNED UNIVERSITY / CAMPUS:' : 'FILTER BY UNIVERSITY / CAMPUS:'}
            </AppText>
            {!lockedCampus && campusFilter !== 'ALL' && (
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCampusFilter('ALL');
                }}
                hitSlop={8}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  Reset (Show All)
                </AppText>
              </Pressable>
            )}
          </View>
          {lockedCampus ? (
            <Pressable
              disabled
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: radius.pill,
                alignSelf: 'flex-start',
                backgroundColor: colors.brandPrimary,
                borderWidth: 1,
                borderColor: colors.brandPrimary,
              }}
            >
              <AppText variant="caption" weight="bold" tone="inverse">
                {activeCampusName}
              </AppText>
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs, alignItems: 'center' }}
              {...({ 'data-horizontal-scroll': 'true' } as any)}
            >
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCampusFilter('ALL');
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: campusFilter === 'ALL' ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                  borderWidth: 1,
                  borderColor: campusFilter === 'ALL' ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption" weight="bold" tone={campusFilter === 'ALL' ? 'inverse' : 'primary'}>
                  All Institutions
                </AppText>
              </Pressable>
              {institutions.filter((inst) => inst.isActive !== false).map((inst) => {
                const active = campusFilter === inst.code;
                return (
                  <Pressable
                    key={inst.code}
                    onPress={() => {
                      haptics.light();
                      setCampusFilter(inst.code);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      backgroundColor: active ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: active ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={active ? 'inverse' : 'primary'}>
                      {inst.shortName || inst.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
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
              Users online in the last 15m
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

          {/* Total Community */}
          <SolidCard style={{ flex: 1, minWidth: isDesktop ? 220 : '45%', padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                TOTAL USERS
              </AppText>
              <Ionicons name="shield-checkmark-outline" size={16} color="#F59E0B" />
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

        {/* Needs Attention - open items across trust & safety queues */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <AppText variant="bodySmall" weight="bold" tone="secondary" style={{ marginRight: spacing.xs }}>
            Needs Attention:
          </AppText>
          {[
            { label: 'Reports', count: adminBadges.reports, icon: 'flag-outline' as const },
            { label: 'Verifications', count: adminBadges.verification, icon: 'shield-checkmark-outline' as const },
            { label: 'Support Tickets', count: adminBadges.support, icon: 'help-buoy-outline' as const },
            { label: 'Takedowns', count: adminBadges.takedowns, icon: 'alert-circle-outline' as const },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: item.count > 0 ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2') : colors.divider,
              }}
            >
              <Ionicons name={item.icon} size={13} color={item.count > 0 ? '#EF4444' : colors.textSecondary} />
              <AppText variant="caption" weight="bold" style={{ color: item.count > 0 ? '#EF4444' : colors.textSecondary }}>
                {item.count} {item.label}
              </AppText>
            </View>
          ))}
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
            <View style={{ flex: 1, minWidth: 0 }}>
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

            {/* Comments */}
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
                COMMENTS
              </AppText>
              <AppText variant="h2" weight="bold" style={{ marginTop: 4, color: colors.brandPrimary }}>
                {summary?.total_comments ?? 0}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Replies across all threads
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
              <View style={{ flex: 1, minWidth: 0 }}>
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
              <View style={{ flex: 1, minWidth: 0 }}>
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
                <Ionicons name="analytics-outline" size={32} color={colors.textSecondary} />
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
              <View style={{ flex: 1, minWidth: 0 }}>
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
                const institution = institutions.find((i) => i.code === campus.campus_code);
                const name = institution ? institution.shortName : campus.campus_code;
                const fullName = institution ? institution.name : campus.campus_code;
                const verifyPct = campus.real_members > 0 ? Math.round((campus.verified_members / campus.real_members) * 100) : 0;
                const isSelected = campusFilter === campus.campus_code;
                const inactiveCount = Math.max(0, campus.real_members - campus.active_7d);

                return (
                  <Pressable
                    key={campus.campus_code}
                    onPress={() => {
                      haptics.light();
                      setCampusFilter(campus.campus_code);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${name}`}
                    style={{
                      flex: 1,
                      minWidth: isDesktop ? 220 : '100%',
                      backgroundColor: isSelected ? (isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF') : colors.surface,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <AppText variant="body" weight="bold" numberOfLines={1} style={{ flex: 1, marginRight: 6 }}>
                        {name}
                      </AppText>
                      <Badge label={campus.campus_code} tone={isSelected ? 'brand' : 'neutral'} />
                    </View>

                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginBottom: spacing.xs, fontSize: 11 }}>
                      {fullName}
                    </AppText>

                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <AppText variant="h2" weight="bold">
                        {campus.real_members}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        total members
                      </AppText>
                    </View>

                    {/* Verification Rate Progress Bar */}
                    <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>Verification Rate</AppText>
                        <AppText variant="caption" weight="bold" style={{ color: '#10B981', fontSize: 11 }}>{verifyPct}%</AppText>
                      </View>
                      <View style={{ height: 4, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${verifyPct}%`, backgroundColor: '#10B981', borderRadius: 2 }} />
                      </View>
                    </View>

                    <View style={{ marginTop: spacing.xs, gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="caption" tone="secondary">Active (7d):</AppText>
                        <AppText variant="caption" weight="bold" tone="brand">{campus.active_7d}</AppText>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="caption" tone="secondary">Inactive:</AppText>
                        <AppText variant="caption" weight="semiBold" tone="secondary">{inactiveCount}</AppText>
                      </View>
                    </View>

                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <AppText variant="caption" weight="bold" tone={isSelected ? 'brand' : 'secondary'} style={{ fontSize: 11 }}>
                        {isSelected ? '✓ Currently filtered' : 'Tap to filter this campus →'}
                      </AppText>
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
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="h3" weight="bold">
                User Activity & Login Monitor
              </AppText>
              <AppText variant="caption" tone="secondary">
                Track active students and recent logins for {activeCampusName}
              </AppText>
            </View>

            {/* Status selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
              {(['all', 'active', 'inactive'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    haptics.light();
                    setStatusFilter(type);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: statusFilter === type ? colors.brandPrimary : colors.surface,
                    borderWidth: 1,
                    borderColor: statusFilter === type ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={statusFilter === type ? 'inverse' : 'secondary'}
                  >
                    {type === 'all' ? 'All Users' : type === 'active' ? 'Active (7d)' : 'Inactive'}
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
                      <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', gap: 4 }}>
                        <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                          {u.fullName}
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {isActiveUser(u.lastActiveAt) ? (
                            <Badge label="Active" tone="success" />
                          ) : (
                            <Badge label="Inactive" tone="neutral" />
                          )}
                          <Badge label={u.campusCode} tone="brand" />
                        </View>
                      </View>
                      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
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
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                <AppText variant="bodySmall" weight="bold">
                  {statusFilter === 'active' ? `No users active in the last 7 days for ${activeCampusName}` : 'No members found matching current filters'}
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ textAlign: 'center', maxWidth: 400 }}>
                  {statusFilter === 'active'
                    ? 'When students use the app, their profile and live activity will be tracked here.'
                    : 'Try changing the university selector or switching the filter above.'}
                </AppText>
              </View>
            ) : null}
          </View>
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
