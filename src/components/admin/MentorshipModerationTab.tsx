import React, { useState } from 'react';
import { Alert, Modal, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { EmptyState } from '@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { queryErrorMode } from '@/utils/queryError';
import { useTheme } from '@/theme/ThemeProvider';
import { endMentorship, listMentorshipsForAdmin } from '@/api/mentorship';
import { mentorshipStatusLabel, mentorshipStatusTone } from '@/utils/mentorship';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

/**
 * Platform-wide view of mentor <-> mentee pairings, for stepping in on an abusive match.
 * Ending a pairing here goes through the same end_mentorship() function participants use;
 * it is only widened (see 20261003000000_trust_safety_gaps.sql) to also let an admin end
 * (never withdraw) a pairing they are not part of, and it notifies both sides either way.
 */
export function MentorshipModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: mentorshipsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mentorships', 'admin-active'],
    queryFn: () => listMentorshipsForAdmin('active'),
  });
  const mentorships = mentorshipsData ?? [];
  // A failed load is not "No active mentorships": with nothing cached the error replaces the list and the count.
  const errorMode = queryErrorMode({ isError, data: mentorshipsData });

  // The reason goes to BOTH participants, so it must be written for this pairing: no pre-filled
  // default (a one-tap "End Pairing" used to send the same stock accusation every time) and no
  // Alert.prompt (iOS only). A small modal with a real text field works on every platform.
  const [endTarget, setEndTarget] = useState<(typeof mentorships)[number] | null>(null);
  const [endReason, setEndReason] = useState('');
  const END_REASON_MIN = 10;

  function handleEndConfirm(m: (typeof mentorships)[number]) {
    haptics.error();
    setEndReason('');
    setEndTarget(m);
  }

  async function doEnd() {
    const m = endTarget;
    const reason = endReason.trim();
    if (!m || reason.length < END_REASON_MIN) return;
    setEndTarget(null);
    setActingId(m.id);
    try {
      await endMentorship(m.id, 'end', reason);
      recordAuditLogEntry({
        action: 'item_moderated',
        summary: `Ended mentorship pairing between ${m.studentName} and ${m.mentorName}`,
        targetType: 'user',
        targetId: m.studentId,
        reason,
        institutionCode: m.campusCode ?? undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      await refetch();
      Alert.alert('Mentorship Ended', 'Both participants have been notified.');
    } catch (err: any) {
      Alert.alert('Could Not End Mentorship', err?.message || 'Please try again.');
    } finally {
      setActingId(null);
      setEndReason('');
    }
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Active Mentorships{mentorshipsData ? ` (${mentorships.length})` : ''}
        </AppText>
        <AppText tone="secondary" variant="caption">
          Every active mentor/mentee pairing platform-wide. Use this to step in on an abusive match - both
          sides are notified when a pairing is ended.
        </AppText>
      </View>

      {errorMode === 'inline' ? (
        <ErrorStateView compact subject="mentorships" title="Couldn't refresh mentorships" error={error} onRetry={refetch} style={{ marginBottom: spacing.sm }} />
      ) : null}

      {mentorships.map((m) => (
        <SolidCard key={m.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="body" weight="bold">
                {m.studentName} <AppText tone="secondary">↔</AppText> {m.mentorName}
              </AppText>
              {m.focusArea ? (
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  Focus: {m.focusArea}
                </AppText>
              ) : null}
              {m.campusCode ? (
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  Campus: {m.campusCode}
                </AppText>
              ) : null}
            </View>
            <Badge label={mentorshipStatusLabel(m.status)} tone={mentorshipStatusTone(m.status)} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            <AppButton
              label="End Pairing"
              variant="ghost"
              loading={actingId === m.id}
              onPress={() => handleEndConfirm(m)}
            />
          </View>
        </SolidCard>
      ))}

      <Modal visible={!!endTarget} transparent animationType="fade" onRequestClose={() => setEndTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
              End this mentorship?
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              {endTarget ? `${endTarget.studentName} and ${endTarget.mentorName} will both be notified, and they will both see the reason you write below. ` : ''}
              It is also recorded in the audit log.
            </AppText>
            <AppTextField
              label={`Reason (min. ${END_REASON_MIN} characters)`}
              value={endReason}
              onChangeText={setEndReason}
              placeholder="What happened, in words both people can read"
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setEndTarget(null)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="End Pairing" onPress={doEnd} disabled={endReason.trim().length < END_REASON_MIN} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {!isLoading && errorMode === 'blocking' ? (
        <ErrorStateView subject="mentorships" error={error} onRetry={refetch} />
      ) : !isLoading && mentorships.length === 0 ? (
        <EmptyState icon="people-outline" title="No active mentorships" description="Nothing needs your attention right now." />
      ) : null}
    </View>
  );
}
