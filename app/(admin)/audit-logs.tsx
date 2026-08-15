import React, { useState } from'react';
import { Alert, FlatList, Platform, Pressable, View } from'react-native';
import { useQuery } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from'@/theme/ThemeProvider';
import { listAuditLog } from'@/api/auditLog';
import { AuditLogAction, AuditLogEntry } from'@/api/types';
import { haptics } from'@/utils/haptics';

const CATEGORY_FILTERS = ['All Events', 'Moderation', 'Security & Keys 🔐', 'Verification 🪪', 'Escrow & Finance'];

const ACTION_TONE: Record<AuditLogAction, 'success' | 'critical' | 'warning' | 'brand' | 'neutral'> = {
  report_resolved: 'success',
  report_dismissed: 'neutral',
  event_approval_revoked: 'warning',
  event_purged: 'critical',
  verification_approved: 'success',
  verification_rejected: 'neutral',
  escrow_funds_released: 'critical',
  impersonation_started: 'critical',
  user_blocked: 'warning',
  domain_authority_updated: 'brand',
  tenant_toggles_updated: 'brand',
  xp_multiplier_updated: 'brand',
  level_badges_updated: 'brand',
  seasonal_leaderboard_deployed: 'success',
  escrow_config_updated: 'brand',
  toxicity_thresholds_deployed: 'warning',
  storage_quotas_enforced: 'warning',
  global_push_broadcast: 'critical',
};

export default function AuditLogsScreen() {
  const { colors, spacing, radius } = useTheme();
  const [filter, setFilter] = useState('All Events');
  const { data: entries, isLoading } = useQuery({ queryKey: ['audit-log', 'global'], queryFn: () => listAuditLog() });

  const filtered = (entries ?? []).filter((e) => {
    if (filter === 'Moderation') return e.action.includes('report') || e.action.includes('event');
    if (filter === 'Verification 🪪') return e.action.includes('verification');
    if (filter === 'Escrow & Finance') return e.action.includes('escrow');
    if (filter === 'Security & Keys 🔐') return e.action.includes('impersonation');
    return true;
  });

  async function handleExportCsv() {
    haptics.medium();
    const csvHeader = 'ID,Timestamp,Actor,Role,Action,Summary,TargetType,Institution,Reason\n';
    const csvRows = (entries ?? [])
      .map((e) =>
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
      Alert.alert('Audit Ledger Exported 📥', 'Compliance CSV download has been initiated.');
    } else {
      try {
        const { Share } = await import('react-native');
        await Share.share({
          title: 'Campus Audit Ledger CSV',
          message: csvContent,
        });
      } catch (err) {
        Alert.alert('Export Error', 'Unable to initiate export share sheet.');
      }
    }
  }

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, marginBottom: spacing.xs }}>
        <View>
          <AppText variant="h1"weight="bold">
            System Audit Trail 📜
          </AppText>
          <AppText tone="secondary">Immutable ledger of administrative and security events</AppText>
        </View>
        <AppButton label="Export CSV 📥"variant="secondary"onPress={handleExportCsv} />
      </View>

      <View style={{ marginVertical: spacing.md }}>
        <ChipSelect options={CATEGORY_FILTERS} selected={[filter]} onToggle={setFilter} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        renderItem={({ item }) => (
          <SolidCard radius={18} style={{ marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
              <Badge label={item.action.replace(/_/g, ' ').toUpperCase()} tone={ACTION_TONE[item.action] ?? 'neutral'} />
              <AppText tone="secondary"variant="caption">
                {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </AppText>
            </View>

            <AppText weight="bold"variant="bodySmall"style={{ marginVertical: 2 }}>
              {item.summary}
            </AppText>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
              <Ionicons name="shield-checkmark"size={14} color={colors.brandPrimary} />
              <AppText tone="secondary"variant="caption">
                Actor: {item.actorName} ({item.actorRole.toUpperCase()})
                {item.institutionCode ? ` \u2022 Campus: ${item.institutionCode}` : ''}
              </AppText>
            </View>

            {item.reason ? (
              <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.xs, borderRadius: 8, marginTop: 4 }}>
                <AppText variant="caption"tone="brand"style={{ fontSize: 11, fontStyle: 'italic' }}>
                  Justification: {item.reason}
                </AppText>
              </View>
            ) : null}
          </SolidCard>
        )}
        ListEmptyComponent={
          !isLoading ? <EmptyState title="No audit entries"description="System actions will be recorded here automatically." /> : null
        }
      />
    </ScreenContainer>
  );
}
