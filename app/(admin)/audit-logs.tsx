import React, { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { ChipSelect } from '@/components/ChipSelect';
import { EmptyState } from '@/components/EmptyState';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listAuditLogEntriesPage } from '@/api/auditLog';
import { AuditLogAction, AuditLogEntry } from '@/api/types';
import { haptics } from '@/utils/haptics';
import { buildCsv, downloadCsv, CsvColumn } from '@/utils/csvExport';
import { useAuth } from '@/auth/AuthContext';

/**
 * The one audit trail. (There used to be two screens over the same log - "System Audit Trail" and
 * "Moderation & Admin Action Log" - with different filters; they are merged here.)
 */
const CATEGORIES: Array<{ label: string; match?: (action: AuditLogAction) => boolean }> = [
  { label: 'All' },
  {
    label: 'Moderation',
    match: (a) =>
      a.startsWith('report_') ||
      a.startsWith('community_') ||
      a.startsWith('event_') ||
      a.startsWith('giving_campaign_') ||
      a === 'item_moderated',
  },
  { label: 'Verification', match: (a) => a.startsWith('verification_') },
  {
    label: 'Accounts',
    match: (a) => a.startsWith('user_') || a.startsWith('impersonation_') || a === 'profile_updated',
  },
  { label: 'Support', match: (a) => a.startsWith('support_ticket_') },
  {
    label: 'Platform',
    match: (a) =>
      a === 'feature_flag_toggled' ||
      a.startsWith('portal_link_') ||
      a === 'institution_provisioned' ||
      a === 'platform_config_updated' ||
      a === 'global_push_broadcast' ||
      a === 'maintenance_mode_toggled' ||
      a === 'storage_quotas_enforced' ||
      a === 'system_cleanup_executed' ||
      a === 'policy_updated',
  },
];

const ACTION_TONE: Partial<Record<AuditLogAction, 'success' | 'critical' | 'warning' | 'brand' | 'neutral'>> = {
  report_resolved: 'success',
  report_dismissed: 'neutral',
  event_approved: 'success',
  event_approval_revoked: 'warning',
  event_cancelled: 'warning',
  event_purged: 'critical',
  verification_approved: 'success',
  verification_rejected: 'neutral',
  community_approved: 'success',
  community_rejected: 'neutral',
  community_deleted: 'critical',
  escrow_funds_released: 'critical',
  impersonation_started: 'critical',
  impersonation_ended: 'neutral',
  user_blocked: 'warning',
  user_suspended: 'critical',
  user_unsuspended: 'success',
  user_role_changed: 'warning',
  user_account_deleted: 'critical',
  feature_flag_toggled: 'warning',
  portal_link_created: 'success',
  portal_link_updated: 'brand',
  portal_link_deleted: 'critical',
  institution_provisioned: 'success',
  platform_config_updated: 'brand',
  storage_quotas_enforced: 'warning',
  global_push_broadcast: 'critical',
  maintenance_mode_toggled: 'critical',
  item_moderated: 'warning',
  policy_updated: 'brand',
  support_ticket_updated: 'brand',
  support_ticket_resolved: 'success',
  system_cleanup_executed: 'warning',
  profile_updated: 'brand',
  event_updated: 'brand',
  event_spotlight_enabled: 'success',
  event_spotlight_disabled: 'neutral',
  event_payment_approved: 'success',
  event_payment_rejected: 'warning',
  event_link_checked: 'brand',
  event_partnership_updated: 'brand',
  giving_campaign_approved: 'success',
  giving_campaign_rejected: 'neutral',
  giving_campaign_total_updated: 'brand',
};

const PAGE_SIZE = 100;
// Export batches are bigger than the on-screen page (fewer round trips), and the
// sequential loop is capped so exporting against a campus's entire history can't
// run away - 40 x 500 = 20,000 rows is far more than any admin needs in one CSV.
const EXPORT_PAGE_SIZE = 500;
const MAX_EXPORT_PAGES = 40;
const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

const AUDIT_LOG_CSV_COLUMNS: CsvColumn<AuditLogEntry>[] = [
  { header: 'ID', value: (e) => e.id },
  { header: 'Timestamp', value: (e) => e.createdAt },
  { header: 'Actor', value: (e) => e.actorName },
  { header: 'Role', value: (e) => e.actorRole },
  { header: 'Action', value: (e) => e.action },
  { header: 'Summary', value: (e) => e.summary },
  { header: 'TargetType', value: (e) => e.targetType },
  { header: 'Institution', value: (e) => e.institutionCode ?? 'GLOBAL' },
  { header: 'Reason', value: (e) => e.reason ?? '' },
];

/** "YYYY-MM-DD" -> an inclusive-day ISO bound, or undefined when blank/malformed. */
function dateInputToIsoBound(value: string, endOfDay: boolean): string | undefined {
  const trimmed = value.trim();
  if (!DATE_INPUT_RE.test(trimmed)) return undefined;
  const iso = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

export default function AuditLogsScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const lockedCampus = user?.isCampusAdmin && user?.campusCode ? user.campusCode.toUpperCase() : undefined;
  const [filter, setFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actorSearchInput, setActorSearchInput] = useState('');
  const actorSearch = useDebouncedValue(actorSearchInput);
  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<AuditLogEntry[]>([]);
  const [exporting, setExporting] = useState(false);

  const since = dateInputToIsoBound(dateFrom, false);
  const until = dateInputToIsoBound(dateTo, true);
  const trimmedActorSearch = actorSearch.trim();
  const filterKey = `${since ?? ''}|${until ?? ''}|${trimmedActorSearch.toLowerCase()}`;

  // A date-range or actor-search change starts a fresh result set at page 0 -
  // it isn't "more of" whatever was already loaded for the previous filters.
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-log', filterKey, page, lockedCampus],
    queryFn: () => listAuditLogEntriesPage({ since, until, actorSearch: trimmedActorSearch || undefined, institutionCode: lockedCampus, page, pageSize: PAGE_SIZE }),
  });

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (page === 0 ? data.entries : [...prev, ...data.entries]));
  }, [data, page]);

  const category = CATEGORIES.find((c) => c.label === filter) ?? CATEGORIES[0];
  const filtered = accumulated.filter((e) => !category.match || category.match(e.action));

  async function handleExportCsv() {
    haptics.medium();
    setExporting(true);
    try {
      const all: AuditLogEntry[] = [];
      for (let exportPage = 0; exportPage < MAX_EXPORT_PAGES; exportPage++) {
        const result = await listAuditLogEntriesPage({
          since,
          until,
          actorSearch: trimmedActorSearch || undefined,
          page: exportPage,
          pageSize: EXPORT_PAGE_SIZE,
        });
        all.push(...result.entries);
        if (!result.hasMore || result.entries.length === 0) break;
      }

      const rows = all.filter((e) => !category.match || category.match(e.action));
      if (rows.length === 0) {
        Alert.alert('Nothing to Export', 'No audit entries match the current filters.');
        return;
      }
      const csvContent = buildCsv(rows, AUDIT_LOG_CSV_COLUMNS);
      await downloadCsv(csvContent, 'campus_audit_ledger', {
        successTitle: 'Audit Ledger Exported',
        successMessage: `Compliance CSV download has been initiated (${rows.length} entries).`,
        shareTitle: 'Export Campus Audit Ledger CSV',
      });
    } catch (err) {
      console.error('[AuditLogs] Export failed:', err);
      Alert.alert('Export Error', 'Unable to export the audit ledger. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm }}>
        <AdminSectionTabs group="safety" />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', rowGap: spacing.sm, marginBottom: spacing.xs, gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            Audit Log
          </AppText>
          <AppText tone="secondary" variant="caption">
            Who did what, when and why - moderation, accounts, verification and platform changes
          </AppText>
        </View>
        <View style={{ flexShrink: 0 }}>
          <AppButton
            label="Export CSV"
            variant="secondary"
            size={isDesktop ? 'md' : 'sm'}
            onPress={handleExportCsv}
            loading={exporting}
            disabled={exporting || (accumulated.length === 0 && !isLoading)}
          />
        </View>
      </View>

      <SolidCard radius={16} style={{ marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppTextField
              label="From (YYYY-MM-DD)"
              placeholder="2026-09-01"
              value={dateFrom}
              onChangeText={setDateFrom}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppTextField
              label="To (YYYY-MM-DD)"
              placeholder="2026-09-30"
              value={dateTo}
              onChangeText={setDateTo}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppTextField
              label="Actor"
              placeholder="Search by admin/staff name"
              value={actorSearchInput}
              onChangeText={setActorSearchInput}
              leftIcon="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
        {dateFrom || dateTo || actorSearchInput ? (
          <AppButton
            label="Clear Filters"
            variant="ghost"
            size="sm"
            onPress={() => {
              setDateFrom('');
              setDateTo('');
              setActorSearchInput('');
            }}
          />
        ) : null}
      </SolidCard>

      <View style={{ marginVertical: spacing.md, gap: spacing.xs }}>
        <ChipSelect options={CATEGORIES.map((c) => c.label)} selected={[filter]} onToggle={setFilter} />
        {data ? (
          <AppText tone="secondary" variant="caption">
            {category.match
              ? `Showing ${filtered.length} loaded (${data.total} total, unfiltered)`
              : `Showing ${filtered.length} of ${data.total} matching ${data.total === 1 ? 'entry' : 'entries'}`}
          </AppText>
        ) : null}
      </View>

      <FlatList
        style={{ flex: 1, minHeight: 0 }}
        data={filtered}
        keyExtractor={(item) => item.id}
        key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
        numColumns={isDesktop ? 2 : 1}
        columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.sm }}
        renderItem={({ item }) => (
          <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
            <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs, gap: spacing.xs }}>
                <View style={{ flexShrink: 1 }}>
                  <Badge label={item.action.replace(/_/g, ' ').toUpperCase()} tone={ACTION_TONE[item.action] ?? 'neutral'} />
                </View>
                <AppText tone="secondary" variant="caption" style={{ flexShrink: 0 }}>
                  {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </AppText>
              </View>

              <AppText weight="bold" variant="bodySmall" style={{ marginVertical: 2 }}>
                {item.summary}
              </AppText>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
                <Ionicons name="shield-checkmark" size={14} color={colors.textSecondary} />
                <AppText tone="secondary" variant="caption" style={{ flex: 1 }}>
                  {item.actorName} ({item.actorRole.toUpperCase()})
                  {item.institutionCode ? ` • Campus: ${item.institutionCode}` : ''}
                </AppText>
              </View>

              {item.reason ? (
                <View style={{ backgroundColor: colors.divider, padding: spacing.xs, borderRadius: 8, marginTop: 4 }}>
                  <AppText variant="caption" tone="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                    Reason: {item.reason}
                  </AppText>
                </View>
              ) : null}
            </SolidCard>
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No audit entries"
              description={filter === 'All' ? 'System actions will be recorded here automatically.' : `No ${filter.toLowerCase()} entries yet.`}
            />
          ) : null
        }
        ListFooterComponent={
          data?.hasMore ? (
            <View style={{ paddingTop: spacing.sm, alignItems: 'center' }}>
              <AppButton label="Load More" variant="secondary" size="sm" loading={isFetching} onPress={() => setPage((p) => p + 1)} />
            </View>
          ) : null
        }
      />
    </ScreenContainer>
  );
}
