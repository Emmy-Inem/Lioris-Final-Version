import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listPendingJobs, approveJob, rejectJob } from '@/api/jobs';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

export function JobsModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: pendingJobs = [], isLoading, refetch } = useQuery({
    queryKey: ['jobs', 'admin-pending'],
    queryFn: listPendingJobs,
  });

  async function handleApprove(job: (typeof pendingJobs)[number]) {
    haptics.medium();
    setActingId(job.id);
    try {
      await approveJob(job.id);
      recordAuditLogEntry({
        action: 'report_resolved',
        summary: `Approved job posting: "${job.title}" at ${job.company} by ${job.postedByName}`,
        targetType: 'job',
        targetId: job.id,
        reason: 'Posting reviewed and meets community standards',
      });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      await refetch();
      Alert.alert('Posting Approved', `"${job.title}" is now live on the career board.`);
    } finally {
      setActingId(null);
    }
  }

  function handleRejectConfirm(job: (typeof pendingJobs)[number]) {
    haptics.error();
    const doReject = async (reason?: string) => {
      setActingId(job.id);
      try {
        await rejectJob(job.id, reason || 'Did not meet posting standards.');
        await queryClient.invalidateQueries({ queryKey: ['jobs'] });
        await refetch();
        Alert.alert('Posting Rejected', 'The poster will see this was declined.');
      } finally {
        setActingId(null);
      }
    };
    if (Alert.prompt) {
      Alert.prompt(
        'Reject Posting',
        `Provide a reason for declining "${job.title}":`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (reason?: string) => doReject(reason) },
        ],
        'plain-text',
        'Looks like spam or off-topic for this community.',
      );
    } else {
      Alert.alert('Reject Posting?', `Decline "${job.title}" from ${job.postedByName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => doReject() },
      ]);
    }
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Pending Job Postings ({pendingJobs.length})
        </AppText>
        <AppText tone="secondary" variant="caption">
          New postings from students and alumni are held here until approved - staff/admin postings go live immediately.
        </AppText>
      </View>

      {pendingJobs.map((job) => (
        <SolidCard key={job.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.brandPrimary}50` }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="body" weight="bold">
                {job.title}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                {job.company} • {job.location}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                Posted by <AppText weight="bold" variant="caption">{job.postedByName}</AppText>
              </AppText>
            </View>
            <Badge label="Pending Review" tone="warning" />
          </View>

          {job.description ? (
            <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginTop: spacing.sm }}>
              {job.description}
            </AppText>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
            <Ionicons name={job.acceptsInAppApplications ? 'document-text-outline' : 'link-outline'} size={13} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary">
              {job.acceptsInAppApplications ? 'Accepts in-app applications' : 'External apply link only'}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Reject" variant="ghost" onPress={() => handleRejectConfirm(job)} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton label="Approve" variant="primary" loading={actingId === job.id} onPress={() => handleApprove(job)} />
            </View>
          </View>
        </SolidCard>
      ))}

      {!isLoading && pendingJobs.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="No pending job postings"
          description="Every student and alumni posting has been reviewed."
        />
      ) : null}
    </View>
  );
}
