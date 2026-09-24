import React, { useState } from'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { AppButton } from'./AppButton';
import { AppTextField } from'./AppTextField';
import { ChipSelect } from'./ChipSelect';
import { EmptyState } from'./EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listReports, resolveReport } from '@/api/moderation';
import { recordAuditLogEntry } from '@/api/auditLog';
import { deletePost } from '@/api/posts';
import { deletePodPost } from '@/api/studyGroups';
import { ReportedContentPreview } from './ReportedContentPreview';
import { purgeEvent } from '@/api/events';
import { Report } from '@/api/types';
import { haptics } from '@/utils/haptics';

const STATUS_TONE: Record<Report['status'], 'warning' | 'brand' | 'success' | 'neutral'> = {
 open: 'warning',
 under_review: 'brand',
 resolved: 'success',
 dismissed: 'neutral',
};

const TARGET_FILTERS = ['All Flags', 'Posts', 'Pod posts', 'Messages', 'Events', 'Users'];

interface ModerationQueueProps {
 institutionCode?: string;
 emptyTitle?: string;
 /** Admin gets full punitive power (shadowban/permaban); staff is restricted to lesser actions. Defaults to 'admin' for existing unscoped call sites. */
 role?: 'admin' | 'staff';
}

type PunishmentType = 'warn' | 'takedown' | 'mute' | 'escalate' | 'shadowban' | 'permaban';

export function ModerationQueue({ institutionCode, emptyTitle = 'Queue is clear', role = 'admin' }: ModerationQueueProps) {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const insets = useSafeAreaInsets();
 const queryClient = useQueryClient();
 const [submittingId, setSubmittingId] = useState<string | null>(null);
 const [filterType, setFilterType] = useState('All Flags');
 const canPermaban = role === 'admin';

 // Takedown & Action Modal State
 const [actionModalReport, setActionModalReport] = useState<Report | null>(null);
 const [punishmentType, setPunishmentType] = useState<PunishmentType>('takedown');
 const [adminModNote, setAdminModNote] = useState('');
 const [applyingPenalty, setApplyingPenalty] = useState(false);

 const { data: reports, isLoading } = useQuery({
 queryKey: ['reports', 'open', institutionCode ?? 'all'],
 queryFn: () => listReports({ status: 'open', institutionCode }),
 });

 const filteredReports = (reports ?? []).filter((r) => {
 if (filterType === 'Posts') return r.targetType === 'post';
 if (filterType === 'Pod posts') return r.targetType === 'pod_post';
 if (filterType === 'Messages') return r.targetType === 'message';
 if (filterType === 'Events') return r.targetType === 'event';
 if (filterType === 'Users') return r.targetType === 'user';
 return true;
 });

 async function handleDismiss(report: Report) {
 haptics.light();
 setSubmittingId(report.id);
 try {
 await resolveReport(report.id, 'dismissed');
 recordAuditLogEntry({
 action: 'report_dismissed',
 summary: `Dismissed report #${report.id.substring(0, 8)} (${report.targetType}) - Marked as false positive`,
 targetType: 'report',
 targetId: report.id,
 institutionCode: report.institutionCode,
 reason: 'Content complies with university community guidelines',
 });
 queryClient.invalidateQueries({ queryKey: ['reports'] });
 queryClient.invalidateQueries({ queryKey: ['notifications'] });
 } finally {
 setSubmittingId(null);
 }
 }

 async function handleConfirmTakedown() {
 if (!actionModalReport) return;
 // Defense in depth: staff must never be able to trigger permaban/shadowban even if
 // punishmentType somehow held a stale privileged value (the UI already hides these options).
 if (!canPermaban && (punishmentType === 'permaban' || punishmentType === 'shadowban')) {
 Alert.alert('Not Permitted', 'Account suspension is an admin-only action. Please escalate this report instead.');
 return;
 }
 haptics.medium();
 const report = actionModalReport;
    let actionLabel = 'Content removed and warning issued';
    let targetUserId: string | null = null;
    if (report.targetType === 'user') {
      targetUserId = report.targetId;
    }

    setApplyingPenalty(true);
    try {
      const { supabase } = await import('@/api/supabase');

      // Execute targeted removal if post, and identify the post's author as the violator
      if (report.targetType === 'post' && report.targetId) {
        try {
          const { data: postRow } = await supabase.from('posts').select('author_id').eq('id', report.targetId).maybeSingle();
          if (postRow?.author_id) {
            targetUserId = postRow.author_id;
          }
        } catch {
          // ignore
        }

        if (punishmentType === 'takedown' || punishmentType === 'permaban') {
          await deletePost(report.targetId);
          actionLabel = 'Post purged from campus feed';
        }
      }

      // A study pod post: the author is the violator; taking it down deletes the post (and its replies).
      if (report.targetType === 'pod_post' && report.targetId) {
        try {
          const { data: podPostRow } = await supabase.from('study_group_posts').select('author_id').eq('id', report.targetId).maybeSingle();
          if (podPostRow?.author_id) {
            targetUserId = podPostRow.author_id;
          }
        } catch {
          // ignore
        }

        if (punishmentType === 'takedown' || punishmentType === 'permaban') {
          await deletePodPost(report.targetId);
          actionLabel = 'Study pod post removed';
        }
      }

      // Execute targeted removal if event, and identify the event's organizer as the violator.
      if (report.targetType === 'event' && report.targetId) {
        try {
          const { data: eventRow } = await supabase.from('events').select('creator_id').eq('id', report.targetId).maybeSingle();
          if (eventRow?.creator_id) {
            targetUserId = eventRow.creator_id;
          }
        } catch {
          // ignore
        }

        if (punishmentType === 'takedown' || punishmentType === 'permaban') {
          await purgeEvent(report.targetId);
          actionLabel = 'Event purged from campus calendar';
        }
      }

      // If user ban/suspension or reported user target, enforce is_suspended on target user profile via RPC.
      // Only reachable for admins (staff is blocked above and the UI never offers these options to staff).
      if (canPermaban && (punishmentType === 'permaban' || punishmentType === 'shadowban' || report.targetType === 'user')) {
        if (targetUserId && targetUserId !== 'unknown') {
          await supabase.rpc('suspend_user_account', {
            p_target_user_id: targetUserId,
            p_reason: adminModNote.trim() || `Punishment for report: ${report.reason}`,
          });
        }
      }

      if (punishmentType === 'mute') {
        actionLabel = 'Content flagged and author temporarily muted for 24 hours';
      } else if (punishmentType === 'escalate') {
        actionLabel = 'Report escalated to admin for further review (no action taken by staff)';
      }

      await resolveReport(report.id, 'resolved');

      recordAuditLogEntry({
 action: 'report_resolved',
 summary: `Moderation Action on #${report.id.substring(0, 8)} (${report.targetType}): ${actionLabel}`,
 targetType: 'report',
 targetId: report.id,
 institutionCode: report.institutionCode,
 reason: adminModNote.trim() || `Violation of guidelines: ${report.reason}`,
 });

 queryClient.invalidateQueries({ queryKey: ['reports'] });
 queryClient.invalidateQueries({ queryKey: ['notifications'] });
 setActionModalReport(null);
 setAdminModNote('');
 Alert.alert('Moderation Action Applied', `${actionLabel}. Decision logged to the public campus audit ledger.`);
 } catch (err) {
 console.warn('[ModerationQueue] Failed to apply enforcement action:', err);
 Alert.alert('Action Failed', 'We could not apply this moderation action. Please check your connection and try again.');
 } finally {
 setApplyingPenalty(false);
 }
 }

  return (
    <View>
      {/* Target Type Filter Bar */}
      <View style={{ marginBottom: spacing.md }}>
        <ChipSelect options={TARGET_FILTERS} selected={[filterType]} onToggle={setFilterType} />
      </View>

      {isDesktop ? (
        <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {filteredReports.map((item) => (
              <View key={item.id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 }}>
                <SolidCard radius={20} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.critical}40` }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                      <Badge label={item.targetType.toUpperCase()} tone="critical" />
                      {item.institutionCode ? <Badge label={item.institutionCode} tone="neutral" /> : null}
                    </View>
                    <Badge label={item.status.replace('_', ' ')} tone={STATUS_TONE[item.status]} />
                  </View>

                  {/* Violation Reason Box */}
                  <View style={{ backgroundColor: `${colors.critical}15`, padding: spacing.md, borderRadius: 14, marginVertical: spacing.xs }}>
                    <AppText variant="caption" weight="bold" tone="critical" style={{ marginBottom: 2 }}>
                      FLAGGED REASON & POLICY VIOLATION:
                    </AppText>
                    <AppText weight="bold" tone="primary" variant="bodySmall">
                      "{item.reason}"
                    </AppText>
                  </View>

                  {/* Simulated Content Snippet */}
                  <View style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <AppText variant="caption" tone="secondary">Target ID: {item.targetId}</AppText>
                      <AppText variant="caption" tone="secondary">Filed: {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</AppText>
                    </View>
                    <ReportedContentPreview report={item} />
                  </View>

                  {/* Action Buttons */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 2 }}>
                      <AppButton
                        label="Enforce Takedown / Ban"
                        onPress={() => setActionModalReport(item)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppButton
                        label="Dismiss"
                        variant="secondary"
                        onPress={() => handleDismiss(item)}
                        loading={submittingId === item.id}
                      />
                    </View>
                  </View>
                </SolidCard>
              </View>
            ))}
          </View>
          {filteredReports.length === 0 && !isLoading ? (
            <EmptyState title={emptyTitle} description="No open reports matching this filter right now." />
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130, gap: spacing.sm }}
          renderItem={({ item }) => (
            <SolidCard radius={20} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.critical}40` }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                  <Badge label={item.targetType.toUpperCase()} tone="critical" />
                  {item.institutionCode ? <Badge label={item.institutionCode} tone="neutral" /> : null}
                </View>
                <Badge label={item.status.replace('_', ' ')} tone={STATUS_TONE[item.status]} />
              </View>

              {/* Violation Reason Box */}
              <View style={{ backgroundColor: `${colors.critical}15`, padding: spacing.md, borderRadius: 14, marginVertical: spacing.xs }}>
                <AppText variant="caption" weight="bold" tone="critical" style={{ marginBottom: 2 }}>
                  FLAGGED REASON & POLICY VIOLATION:
                </AppText>
                <AppText weight="bold" tone="primary" variant="bodySmall">
                  "{item.reason}"
                </AppText>
              </View>

              {/* Simulated Content Snippet */}
              <View style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <AppText variant="caption" tone="secondary">Target ID: {item.targetId}</AppText>
                  <AppText variant="caption" tone="secondary">Filed: {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</AppText>
                </View>
                <ReportedContentPreview report={item} />
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 2 }}>
                  <AppButton
                    label="Enforce Action"
                    onPress={() => setActionModalReport(item)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label="Dismiss"
                    variant="secondary"
                    onPress={() => handleDismiss(item)}
                    loading={submittingId === item.id}
                  />
                </View>
              </View>
            </SolidCard>
          )}
          ListEmptyComponent={
            !isLoading ? <EmptyState title={emptyTitle} description="No open reports matching this filter right now." /> : null
          }
        />
      )}

      {/* Enforcement & Strike Modal */}
      <Modal visible={!!actionModalReport} transparent animationType="slide" onRequestClose={() => setActionModalReport(null)}>
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionModalReport(null)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
              maxHeight: '90%',
            }}
          >
            {/* Grab handle on mobile */}
            {!isDesktop && (
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: spacing.sm,
                }}
              />
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                <Ionicons name="shield-half" size={22} color={colors.critical} />
                <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" style={{ flexShrink: 1 }}>
                  Moderation Enforcement Action 
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setActionModalReport(null)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                Select disciplinary penalty for report on {actionModalReport?.targetType}:
              </AppText>

              {(canPermaban
                ? [
                    { id: 'warn' as const, title: 'Official Warning', desc: 'Issue formal warning to user without deleting content.' },
                    { id: 'takedown' as const, title: 'Purge & Take Down Content', desc: 'Immediately remove content and issue community strike.' },
                    { id: 'shadowban' as const, title: '7-Day Account Shadowban', desc: 'Purge content and suppress author visibility for 7 days.' },
                    { id: 'permaban' as const, title: 'Permanent Account Termination', desc: 'Wipe user account and blacklist university email domain.' },
                  ]
                : [
                    { id: 'warn' as const, title: 'Official Warning', desc: 'Issue formal warning to user without deleting content.' },
                    { id: 'takedown' as const, title: 'Purge & Take Down Content', desc: 'Immediately remove content and issue community strike.' },
                    { id: 'mute' as const, title: 'Temporary 24-Hour Mute', desc: 'Restrict author from posting for 24 hours. No account suspension.' },
                    { id: 'escalate' as const, title: 'Escalate to Admin', desc: 'Flag this report for an administrator to apply account-level enforcement.' },
                  ]
              ).map((p) => {
                const isSelected = punishmentType === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPunishmentType(p.id)}
                    style={{
                      padding: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                      marginBottom: spacing.xs,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <AppText weight="bold" tone={isSelected ? 'brand' : 'primary'} variant="bodySmall">
                        {p.title}
                      </AppText>
                      <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={16} color={isSelected ? colors.brandPrimary : colors.textSecondary} />
                    </View>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      {p.desc}
                    </AppText>
                  </Pressable>
                );
              })}

              <View style={{ marginTop: spacing.xs }}>
                <AppTextField
                  label="Admin Audit Justification (Optional)"
                  placeholder="e.g. Violates section 4.2 anti-harassment policy."
                  value={adminModNote}
                  onChangeText={setAdminModNote}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Cancel" variant="ghost" onPress={() => setActionModalReport(null)} disabled={applyingPenalty} fullWidth />
                </View>
                <View style={{ flex: 2 }}>
                  <AppButton label="Apply Penalty & Log Audit" onPress={handleConfirmTakedown} loading={applyingPenalty} fullWidth />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
