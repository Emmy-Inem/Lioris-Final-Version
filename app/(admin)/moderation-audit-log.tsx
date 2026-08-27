import React, { useState } from'react';
import { FlatList, Pressable, View } from'react-native';
import { useQuery } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listAuditLog } from '@/api/auditLog';
import { AuditLogAction, AuditLogEntry } from '@/api/types';

// PRD Section 14 (AuditLog model) / Section 6.2's acceptance criteria
// ("moderation decisions must be audit-logged"). This is the real
// implementation of that gap - distinct from the"E2EE Cryptography
// Audit Logs"screen (app/(admin)/audit-logs.tsx), which is a Tier-4
// reference-app parity surface for key-rotation events, not moderation
// decisions. Every entry here is written by a real mutation
// (resolveReport, revokeEventApproval, purgeEvent,
// respondToVerificationRequest, or one of the two HighRiskModals
// actions) via src/api/auditLog.ts - nothing on this screen is
// decorative.

const FILTERS: Array<{ label: string; actions?: AuditLogAction[] }> = [
 { label: 'All' },
 { label: 'Reports', actions: ['report_resolved', 'report_dismissed'] },
 { label: 'Events', actions: ['event_approval_revoked', 'event_purged'] },
 { label: 'Verification', actions: ['verification_approved', 'verification_rejected'] },
 { label: 'High-Risk', actions: ['escrow_funds_released', 'impersonation_started'] },
];

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

const ACTION_LABEL: Record<AuditLogAction, string> = {
 report_resolved: 'Report resolved',
 report_dismissed: 'Report dismissed',
 event_approval_revoked: 'Event approval revoked',
 event_purged: 'Event purged',
 verification_approved: 'Verification approved',
 verification_rejected: 'Verification rejected',
 escrow_funds_released: 'Escrow funds released',
 impersonation_started: 'Impersonation started',
 user_blocked: 'User blocked',
 user_suspended: 'User account suspended',
 user_unsuspended: 'User account restored',
 user_role_changed: 'User role changed',
 user_account_deleted: 'User account deleted',
 feature_flag_toggled: 'Feature flag toggled',
 portal_link_created: 'Portal link created',
 portal_link_updated: 'Portal link updated',
 portal_link_deleted: 'Portal link deleted',
 institution_provisioned: 'University tenant provisioned',
 platform_config_updated: 'Platform settings updated',
 domain_authority_updated: 'Domain authority updated',
 tenant_toggles_updated: 'Tenant modules updated',
 xp_multiplier_updated: 'XP multiplier updated',
 level_badges_updated: 'Level badges updated',
 seasonal_leaderboard_deployed: 'Leaderboard season deployed',
 escrow_config_updated: 'Escrow parameters updated',
 toxicity_thresholds_deployed: 'Toxicity thresholds deployed',
 storage_quotas_enforced: 'Storage limits enforced',
 global_push_broadcast: 'Global push notification broadcast',
};

function formatTimestamp(iso: string) {
 return new Date(iso).toLocaleString(undefined, {
 month: 'short',
 day: 'numeric',
 hour: 'numeric',
 minute: '2-digit',
 });
}

export default function ModerationAuditLogScreen() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const [filterIndex, setFilterIndex] = useState(0);
 const activeFilter = FILTERS[filterIndex];

 const { data: entries, isLoading } = useQuery({
 queryKey: ['audit-log', activeFilter.label],
 queryFn: () => listAuditLog(),
 // Filtering client-side across the small mock set rather than
 // round-tripping per-chip queries - see the render below.
 });

 const visibleEntries: AuditLogEntry[] = (entries ?? []).filter(
 (e) => !activeFilter.actions || activeFilter.actions.includes(e.action),
 );

 return (
 <ScreenContainer glow={false}>
 {!isDesktop && <AppHeader />}
 <AppText variant="h1"weight="bold"style={{ paddingTop: isDesktop ? spacing.xs : spacing.lg, marginBottom: spacing.xs }}>
 Moderation & Admin Action Log
 </AppText>
 <AppText tone="secondary"style={{ marginBottom: spacing.lg }}>
 Every resolved report, event takedown, verification decision, and high-risk action - who
 did it, when, and why. Backs PRD Section 14's audit trail requirement.
 </AppText>

 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg }}>
 {FILTERS.map((f, i) => {
 const selected = i === filterIndex;
 return (
 <Pressable
 key={f.label}
 onPress={() => setFilterIndex(i)}
 accessibilityRole="tab"accessibilityState={{ selected }}
 accessibilityLabel={f.label}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.xs,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'inverse' : 'secondary'}>
 {f.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <FlatList
 data={visibleEntries}
 keyExtractor={(item) => item.id}
 contentContainerStyle={{ paddingBottom: 130 }}
 renderItem={({ item }) => (
 <SolidCard style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <Badge label={ACTION_LABEL[item.action]} tone={ACTION_TONE[item.action]} />
 <AppText tone="secondary"variant="caption">
 {formatTimestamp(item.createdAt)}
 </AppText>
 </View>
 <AppText weight="semiBold"style={{ marginBottom: 2 }}>
 {item.summary}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: item.reason ? spacing.xs : 0 }}>
 <Ionicons name="person-circle-outline"size={14} color={colors.textSecondary} />
 <AppText tone="secondary"variant="bodySmall">
 {item.actorName} {'\u00b7'} {item.actorRole}
 {item.institutionCode ? ` \u00b7 ${item.institutionCode}` : ''}
 </AppText>
 </View>
 {item.reason ? (
 <AppText tone="secondary"variant="bodySmall"style={{ fontStyle: 'italic' }}>
 Reason: {item.reason}
 </AppText>
 ) : null}
 </SolidCard>
 )}
 ListEmptyComponent={
 !isLoading ? (
 <EmptyState
 title="No entries yet"description={activeFilter.label === 'All' ? 'Moderation and admin actions will appear here as they happen.' : `No ${activeFilter.label.toLowerCase()} entries yet.`}
 />
 ) : null
 }
 />
 </ScreenContainer>
 );
}
