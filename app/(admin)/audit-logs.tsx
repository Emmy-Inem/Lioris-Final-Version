import React, { useState } from 'react';
import { Alert, FlatList, Platform, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { ChipSelect } from '@/components/ChipSelect';
import { EmptyState } from '@/components/EmptyState';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listAuditLog } from '@/api/auditLog';
import { AuditLogAction } from '@/api/types';
import { haptics } from '@/utils/haptics';

/**
 * The one audit trail. (There used to be two screens over the same log - "System Audit Trail" and
 * "Moderation & Admin Action Log" - with different filters; they are merged here.)
 */
const CATEGORIES: Array<{ label: string; match?: (action: AuditLogAction) => boolean }> = [
  { label: 'All' },
  {
    label: 'Moderation',
    match: (a) =>
      a.startsWith('report_') || a.startsWith('community_') || a.startsWith('event_') || a === 'item_moderated',
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
};

export default function AuditLogsScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const [filter, setFilter] = useState('All');
  const { data: entries, isLoading } = useQuery({ queryKey: ['audit-log'], queryFn: () => listAuditLog() });

  const category = CATEGORIES.find((c) => c.label === filter) ?? CATEGORIES[0];
  const filtered = (entries ?? []).filter((e) => !category.match || category.match(e.action));

  async function handleExportCsv() {
    haptics.medium();
    const csvHeader = 'ID,Timestamp,Actor,Role,Action,Summary,TargetType,Institution,Reason\n';
    const csvRows = filtered
      .map(
        (e) =>
          `"${e.id}","${e.createdAt}","${e.actorName}","${e.actorRole}","${e.action}","${e.summary.replace(/"/g, '""')}","${e.targetType}","${e.institutionCode ?? 'GLOBAL'}","${(e.reason ?? '').replace(/"/g, '""')}"`,
      )
      .join('\n');
    const csvContent = csvHeader + csvRows;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', `campus_audit_ledger_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Alert.alert('Audit Ledger Exported', 'Compliance CSV download has been initiated.');
    } else {
      try {
        const { File, Paths } = await import('expo-file-system');
        const Sharing = await import('expo-sharing');
        const file = new File(Paths.cache, `campus_audit_ledger_${Date.now()}.csv`);
        file.create({ overwrite: true });
        file.write(csvContent);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Campus Audit Ledger CSV',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          const { Share } = await import('react-native');
          await Share.share({ title: 'Campus Audit Ledger CSV', message: csvContent });
        }
      } catch {
        try {
          const { Share } = await import('react-native');
          await Share.share({ title: 'Campus Audit Ledger CSV', message: csvContent });
        } catch {
          Alert.alert('Export Error', 'Unable to initiate export share sheet.');
        }
      }
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
            disabled={filtered.length === 0}
          />
        </View>
      </View>

      <View style={{ marginVertical: spacing.md }}>
        <ChipSelect options={CATEGORIES.map((c) => c.label)} selected={[filter]} onToggle={setFilter} />
      </View>

      <FlatList
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
      />
    </ScreenContainer>
  );
}
