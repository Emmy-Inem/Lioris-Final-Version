import React, { useState } from 'react';
import {
  ScrollView,
  View,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { fetchSystemHealth, cleanupOrphanedRecords, SystemHealthReport } from '@/api/systemHealth';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

export default function SystemHealthScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [cleaning, setCleaning] = useState(false);

  const { data: health, isLoading, refetch, isFetching } = useQuery<SystemHealthReport>({
    queryKey: ['system_health_report'],
    queryFn: fetchSystemHealth,
    refetchInterval: 15000,
  });

  async function handleRunCleanup() {
    haptics.medium();
    setCleaning(true);
    try {
      const res = await cleanupOrphanedRecords();
      if (res.success) {
        toast.success(res.message);
        refetch();
      } else {
        toast.error(res.message);
      }
    } finally {
      setCleaning(false);
    }
  }

  async function handleExportDiagnostics() {
    if (!health) return;
    const jsonStr = JSON.stringify(health, null, 2);
    if (Platform.OS === 'web') {
      try {
        navigator.clipboard.writeText(jsonStr);
        toast.success('Diagnostics copied to clipboard.');
      } catch {
        toast.info('Export ready in console log.');
        console.log(jsonStr);
      }
    } else {
      Share.share({
        title: 'Lioris System Diagnostics',
        message: jsonStr,
      });
    }
  }

  const isOptimal = health?.status === 'optimal';

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      {/* Screen Header */}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <View>
            <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold" numberOfLines={1}>
              Database & System Health
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Real-time Supabase connection diagnostics, row monitors, and sync integrity verification.
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <AppButton
              label={isFetching ? 'Pinging...' : 'Refresh'}
              variant="secondary"
              size="sm"
              onPress={() => refetch()}
              loading={isFetching}
            />
            <AppButton
              label="Export Report"
              variant="secondary"
              size="sm"
              onPress={handleExportDiagnostics}
            />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.md }}>
        {/* Connection Status Card */}
        <SolidCard frosted style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: isOptimal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Ionicons
                  name={isOptimal ? 'checkmark-circle' : 'alert-circle'}
                  size={28}
                  color={isOptimal ? '#10B981' : '#EF4444'}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 18 : 16 }}>
                  Supabase PostgreSQL: {isOptimal ? 'Online & Optimal' : 'Degraded Response'}
                </AppText>
                <AppText tone="secondary" variant="caption" numberOfLines={1}>
                  Target Host: fdtnbluslkabwsmspbem.supabase.co
                </AppText>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="caption" tone="secondary">Round-Trip Latency</AppText>
                <AppText weight="bold" style={{ fontSize: 18, color: (health?.latencyMs ?? 0) < 500 ? '#10B981' : '#F59E0B' }}>
                  {health?.latencyMs ?? 0} ms
                </AppText>
              </View>
              <Badge
                label={isOptimal ? 'HEALTHY' : 'CHECK'}
                tone={isOptimal ? 'success' : 'warning'}
              />
            </View>
          </View>
        </SolidCard>

        {/* Database Table Row Monitors Grid */}
        <View>
          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
            Live Table Row Monitors
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            {[
              { label: 'User Profiles', count: health?.counts.profiles ?? 0, icon: 'people', color: '#3B82F6' },
              { label: 'Feed Posts', count: health?.counts.posts ?? 0, icon: 'newspaper', color: '#10B981' },
              { label: 'Comments', count: health?.counts.comments ?? 0, icon: 'chatbubbles', color: '#8B5CF6' },
              { label: 'Academic Resources', count: health?.counts.resources ?? 0, icon: 'document-text', color: '#F59E0B' },
              { label: 'Campus Events', count: health?.counts.events ?? 0, icon: 'calendar', color: '#EC4899' },
              { label: 'Support Tickets', count: health?.counts.supportTickets ?? 0, icon: 'help-buoy', color: '#06B6D4' },
              { label: 'Moderation Queue', count: health?.counts.moderationQueue ?? 0, icon: 'shield', color: '#EF4444' },
              { label: 'Active Sessions', count: health?.counts.activeSessions ?? 0, icon: 'pulse', color: '#10B981' },
            ].map((item) => (
              <SolidCard
                key={item.label}
                style={{
                  width: isDesktop ? '23.5%' : '48%',
                  flexGrow: 1,
                  padding: spacing.md,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                  <AppText weight="bold" style={{ fontSize: 20 }}>
                    {item.count.toLocaleString()}
                  </AppText>
                </View>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 6 }}>
                  {item.label}
                </AppText>
              </SolidCard>
            ))}
          </View>
        </View>

        {/* Database Sync Integrity & Orphan Scanner */}
        <SolidCard frosted style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h3" weight="bold">Sync Integrity & Hygiene</AppText>
              <AppText tone="secondary" variant="caption">
                Scans for dangling records, unlinked threads, and stale moderation rows.
              </AppText>
            </View>
            <AppButton
              label={cleaning ? 'Optimizing...' : 'Run Sync Cleanup'}
              size="sm"
              onPress={handleRunCleanup}
              loading={cleaning}
            />
          </View>

          {health?.integrityIssues && health.integrityIssues.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {health.integrityIssues.map((issue) => (
                <View
                  key={issue.id}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: isDark ? '#27272A' : '#FEF3C7',
                    borderWidth: 1,
                    borderColor: isDark ? '#3F3F46' : '#FDE68A',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText weight="bold" style={{ fontSize: 14 }}>{issue.description}</AppText>
                    <Badge label={`${issue.count} items`} tone="warning" />
                  </View>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 4 }}>
                    Remedy: {issue.remediation}
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <AppText style={{ color: '#047857', fontSize: 13.5, fontWeight: '500' }}>
                All database foreign keys, cascaded relations, and indexes are in verified sync. No orphaned records found.
              </AppText>
            </View>
          )}
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
