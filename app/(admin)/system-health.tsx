import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Pressable,
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
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

interface ClientErrorRow {
  id: string;
  fingerprint: string | null;
  message: string | null;
  stack: string | null;
  url: string | null;
  release: string | null;
  level: string | null;
  occurrences: number | null;
  last_seen_at: string | null;
  created_at: string | null;
}

interface ClientErrorGroup {
  key: string;
  message: string;
  stack: string | null;
  url: string | null;
  release: string | null;
  level: string;
  occurrences: number;
  lastSeenAt: string | null;
}

/** Last 50 client error rows (admin RLS), grouped by fingerprint. Never throws. */
async function fetchClientErrors(): Promise<{ groups: ClientErrorGroup[]; unavailable: boolean }> {
  try {
    const { data, error } = await supabase
      .from('client_errors')
      .select('id, fingerprint, message, stack, url, release, level, occurrences, last_seen_at, created_at')
      .order('last_seen_at', { ascending: false })
      .limit(50);
    if (error) {
      // Table missing (migration not applied yet) or not readable by this account.
      return { groups: [], unavailable: true };
    }
    const groups = new Map<string, ClientErrorGroup>();
    for (const row of (data ?? []) as ClientErrorRow[]) {
      const key = row.fingerprint || row.id;
      const existing = groups.get(key);
      if (existing) {
        existing.occurrences += row.occurrences ?? 1;
        continue;
      }
      groups.set(key, {
        key,
        message: row.message ?? '(no message)',
        stack: row.stack,
        url: row.url,
        release: row.release,
        level: row.level ?? 'error',
        occurrences: row.occurrences ?? 1,
        lastSeenAt: row.last_seen_at ?? row.created_at,
      });
    }
    return { groups: Array.from(groups.values()), unavailable: false };
  } catch {
    return { groups: [], unavailable: true };
  }
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(t).toLocaleDateString();
}

export default function SystemHealthScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [cleaning, setCleaning] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const { data: health, isLoading, refetch, isFetching } = useQuery<SystemHealthReport>({
    queryKey: ['system_health_report'],
    queryFn: fetchSystemHealth,
    refetchInterval: 15000,
  });

  const {
    data: clientErrors,
    isLoading: clientErrorsLoading,
    refetch: refetchClientErrors,
  } = useQuery({
    queryKey: ['client_errors'],
    queryFn: fetchClientErrors,
    refetchInterval: 60000,
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
        toast.error('Could not copy diagnostics to the clipboard.');
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
            <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
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
              onPress={() => {
                refetch();
                refetchClientErrors();
              }}
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
                <AppText weight="bold" style={{ fontSize: isDesktop ? 18 : 16 }}>
                  Supabase PostgreSQL: {isOptimal ? 'Online & Optimal' : 'Degraded Response'}
                </AppText>
                <AppText tone="secondary" variant="caption">
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

        {/* Client-side errors reported by the app (self-hosted sink) */}
        <SolidCard frosted style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <AppText variant="h3" weight="bold">Client errors</AppText>
              <AppText tone="secondary" variant="caption">
                Latest 50 reports from the web and mobile apps, grouped by fingerprint.
              </AppText>
            </View>
            {clientErrors && !clientErrors.unavailable ? (
              <Badge
                label={`${clientErrors.groups.length} distinct`}
                tone={clientErrors.groups.length > 0 ? 'warning' : 'success'}
              />
            ) : null}
          </View>

          {clientErrorsLoading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : clientErrors?.unavailable ? (
            <AppText tone="secondary" variant="bodySmall">
              Client error reporting is not available yet (the client_errors table is missing or not readable by this account).
            </AppText>
          ) : !clientErrors || clientErrors.groups.length === 0 ? (
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
                No client errors reported.
              </AppText>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {clientErrors.groups.map((group) => {
                const expanded = expandedError === group.key;
                return (
                  <View
                    key={group.key}
                    style={{
                      padding: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                      borderWidth: 1,
                      borderColor: isDark ? '#3F3F46' : '#E4E4E7',
                    }}
                  >
                    <Pressable
                      onPress={() => setExpandedError(expanded ? null : group.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${expanded ? 'Hide' : 'Show'} stack trace`}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <AppText weight="bold" style={{ fontSize: 14, flex: 1 }}>
                          {group.message}
                        </AppText>
                        <Badge
                          label={`${group.occurrences}x`}
                          tone={group.level === 'error' ? 'critical' : 'warning'}
                        />
                      </View>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 4 }}>
                        Last seen {formatLastSeen(group.lastSeenAt)}
                        {group.url ? ` \u00b7 ${group.url}` : ''}
                        {group.release ? ` \u00b7 ${group.release}` : ''}
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                        {expanded ? 'Hide stack trace' : 'Show stack trace'}
                      </AppText>
                    </Pressable>
                    {expanded ? (
                      <ScrollView style={{ marginTop: spacing.sm, maxHeight: 200 }} nestedScrollEnabled>
                        <AppText
                          selectable
                          tone="secondary"
                          variant="caption"
                          style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) }}
                        >
                          {group.stack || 'No stack trace was captured.'}
                        </AppText>
                      </ScrollView>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}
