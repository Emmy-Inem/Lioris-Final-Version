import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
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

  const { data: mentorships = [], isLoading, refetch } = useQuery({
    queryKey: ['mentorships', 'admin-active'],
    queryFn: () => listMentorshipsForAdmin('active'),
  });

  function handleEndConfirm(m: (typeof mentorships)[number]) {
    haptics.error();
    const doEnd = async (reason?: string) => {
      setActingId(m.id);
      try {
        await endMentorship(m.id, 'end', reason || 'Ended by campus staff');
        recordAuditLogEntry({
          action: 'item_moderated',
          summary: `Ended mentorship pairing between ${m.studentName} and ${m.mentorName}`,
          targetType: 'user',
          targetId: m.studentId,
          reason: reason || 'Ended by campus staff',
        });
        await queryClient.invalidateQueries({ queryKey: ['mentorships'] });
        await refetch();
        Alert.alert('Mentorship Ended', 'Both participants have been notified.');
      } catch (err: any) {
        Alert.alert('Could Not End Mentorship', err?.message || 'Please try again.');
      } finally {
        setActingId(null);
      }
    };
    if (Alert.prompt) {
      Alert.prompt(
        'End this mentorship?',
        `Give a reason for ending the pairing between ${m.studentName} and ${m.mentorName}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Pairing', style: 'destructive', onPress: (reason?: string) => doEnd(reason) },
        ],
        'plain-text',
        'Violation of community guidelines reported by a participant.',
      );
    } else {
      Alert.alert('End this mentorship?', `End the pairing between ${m.studentName} and ${m.mentorName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Pairing', style: 'destructive', onPress: () => doEnd() },
      ]);
    }
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Active Mentorships ({mentorships.length})
        </AppText>
        <AppText tone="secondary" variant="caption">
          Every active mentor/mentee pairing platform-wide. Use this to step in on an abusive match - both
          sides are notified when a pairing is ended.
        </AppText>
      </View>

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

      {!isLoading && mentorships.length === 0 ? (
        <EmptyState icon="people-outline" title="No active mentorships" description="Nothing needs your attention right now." />
      ) : null}
    </View>
  );
}
