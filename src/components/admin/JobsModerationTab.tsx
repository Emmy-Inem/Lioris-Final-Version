import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listPendingJobs, approveJob, rejectJob } from '@/api/jobs';
import { JobListing } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

export function JobsModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data: pendingJobs = [], isLoading, refetch } = useQuery({
    queryKey: ['jobs', 'admin-pending'],
    queryFn: listPendingJobs,
  });

  function toggleSelected(id: string) {
    haptics.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function approveCore(job: JobListing) {
    await approveJob(job.id);
    recordAuditLogEntry({
      action: 'report_resolved',
      summary: `Approved job posting: "${job.title}" at ${job.company} by ${job.postedByName}`,
      targetType: 'job',
      targetId: job.id,
      reason: 'Posting reviewed and meets community standards',
    });
  }

  async function handleApprove(job: JobListing) {
    haptics.medium();
    setActingId(job.id);
    try {
      await approveCore(job);
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      await refetch();
      Alert.alert('Posting Approved', `"${job.title}" is now live on the career board.`);
    } finally {
      setActingId(null);
    }
  }

  function handleRejectConfirm(job: JobListing) {
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

  function getSelectedJobs(): JobListing[] {
    return pendingJobs.filter((j) => selectedIds.has(j.id));
  }

  async function handleBulkApprove() {
    const targets = getSelectedJobs();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.medium();
    setBulkProcessing(true);
    let succeeded = 0;
    let failed = 0;
    for (const job of targets) {
      try {
        await approveCore(job);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    await refetch();
    setBulkProcessing(false);
    clearSelection();
    if (failed > 0) haptics.error();
    else haptics.success();
    Alert.alert('Bulk Approve Complete', failed > 0 ? `${succeeded} approved, ${failed} failed. Retry the failed ones individually.` : `${succeeded} posting${succeeded === 1 ? '' : 's'} approved.`);
  }

  function handleBulkReject() {
    const targets = getSelectedJobs();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.error();
    const doReject = async (reason?: string) => {
      setBulkProcessing(true);
      let succeeded = 0;
      let failed = 0;
      for (const job of targets) {
        try {
          await rejectJob(job.id, reason || 'Did not meet posting standards.');
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      await refetch();
      setBulkProcessing(false);
      clearSelection();
      if (failed > 0) haptics.error();
      else haptics.success();
      Alert.alert('Bulk Reject Complete', failed > 0 ? `${succeeded} rejected, ${failed} failed. Retry the failed ones individually.` : `${succeeded} posting${succeeded === 1 ? '' : 's'} rejected.`);
    };
    if (Alert.prompt) {
      Alert.prompt(
        'Reject Postings',
        `Provide a reason for declining ${targets.length} posting${targets.length === 1 ? '' : 's'}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (reason?: string) => doReject(reason) },
        ],
        'plain-text',
        'Looks like spam or off-topic for this community.',
      );
    } else {
      Alert.alert('Reject Postings?', `Decline ${targets.length} posting${targets.length === 1 ? '' : 's'}?`, [
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

      {selectedIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 110 }}>
              <AppButton label="Bulk Reject" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkReject} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 130 }}>
              <AppButton label="Bulk Approve" size="sm" loading={bulkProcessing} onPress={handleBulkApprove} />
            </View>
          </View>
        </SolidCard>
      )}

      {pendingJobs.map((job) => (
        <SolidCard key={job.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.brandPrimary}50` }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flex: 1, minWidth: 0 }}>
              <Pressable
                onPress={() => toggleSelected(job.id)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedIds.has(job.id) }}
                accessibilityLabel={`Select ${job.title}`}
                style={{ paddingTop: 2 }}
              >
                <Ionicons
                  name={selectedIds.has(job.id) ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={selectedIds.has(job.id) ? colors.brandPrimary : colors.textSecondary}
                />
              </Pressable>
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
