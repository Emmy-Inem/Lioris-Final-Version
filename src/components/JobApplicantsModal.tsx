import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { EmptyState } from './EmptyState';
import { ErrorStateView } from './ErrorStateView';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { JobApplication, JobApplicationStatus, JobListing } from '@/api/types';
import { listJobApplicants, updateApplicationStatus } from '@/api/jobApplications';
import { useSignedUrl } from '@/api/signedUrls';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { haptics } from '@/utils/haptics';

const STATUS_FLOW: { id: JobApplicationStatus; label: string; tone: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'critical' }[] = [
  { id: 'applied', label: 'Applied', tone: 'neutral' },
  { id: 'reviewed', label: 'Reviewed', tone: 'accent' },
  { id: 'interview', label: 'Interview', tone: 'warning' },
  { id: 'hired', label: 'Hired', tone: 'success' },
  { id: 'rejected', label: 'Rejected', tone: 'critical' },
];

function ResumeButton({ resumeUrl }: { resumeUrl: string | null }) {
  const { colors } = useTheme();
  const { url, loading } = useSignedUrl('resumes', resumeUrl ?? undefined);
  if (!resumeUrl) return null;
  return (
    <Pressable
      disabled={loading || !url}
      onPress={() => {
        if (url) void openExternalUrl(url);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: colors.pastelPrimaryBg,
      }}
    >
      <Ionicons name={loading ? 'hourglass-outline' : 'document-text-outline'} size={14} color={colors.brandPrimary} />
      <AppText variant="caption" weight="bold" tone="brand">
        {loading ? 'Opening…' : 'View Résumé'}
      </AppText>
    </Pressable>
  );
}

function ApplicantRow({ application, onUpdated }: { application: JobApplication; onUpdated: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const [updating, setUpdating] = useState<JobApplicationStatus | null>(null);

  async function handleSetStatus(status: JobApplicationStatus) {
    if (status === application.status || updating) return;
    haptics.light();
    setUpdating(status);
    try {
      await updateApplicationStatus(application.id, status);
      onUpdated();
      toast.success(`Marked as ${STATUS_FLOW.find((s) => s.id === status)?.label ?? status}`);
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not update this application.');
    } finally {
      setUpdating(null);
    }
  }

  const currentStatus = STATUS_FLOW.find((s) => s.id === application.status);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Avatar name={application.applicantName || 'Applicant'} size={40} uri={application.applicantAvatarUrl || undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <AppText weight="bold" variant="bodySmall">
              {application.applicantName || 'Applicant'}
            </AppText>
            {currentStatus && <Badge label={currentStatus.label} tone={currentStatus.tone} />}
          </View>
          {application.applicantDepartment && (
            <AppText tone="secondary" variant="caption">
              {application.applicantDepartment}
            </AppText>
          )}
        </View>
        {application.matchScore !== null && (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: colors.divider,
              borderRadius: radius.md,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <AppText variant="caption" weight="bold" tone="brand">
              {Math.min(100, Math.round(application.matchScore))}%
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ fontSize: 9 }}>
              MATCH
            </AppText>
          </View>
        )}
      </View>

      {application.coverNote && (
        <AppText variant="caption" tone="secondary" numberOfLines={4} style={{ lineHeight: 17 }}>
          {application.coverNote}
        </AppText>
      )}

      {Object.keys(application.answers || {}).length > 0 && (
        <View style={{ gap: 4 }}>
          {Object.entries(application.answers).map(([qId, answer]) => (
            <AppText key={qId} variant="caption" tone="secondary" style={{ fontStyle: 'italic' }}>
              • {answer}
            </AppText>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <ResumeButton resumeUrl={application.resumeUrl} />
        {isSafeHttpUrl(application.portfolioUrl) && (
          <Pressable
            onPress={() => void openExternalUrl(application.portfolioUrl as string)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.divider,
            }}
          >
            <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
            <AppText variant="caption" weight="bold" tone="secondary">
              Portfolio
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider }}>
        {STATUS_FLOW.map((s) => {
          const active = application.status === s.id;
          return (
            <Pressable
              key={s.id}
              disabled={!!updating}
              onPress={() => handleSetStatus(s.id)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
                backgroundColor: active ? colors.pastelPrimaryBg : 'transparent',
                opacity: updating && updating !== s.id ? 0.5 : 1,
              }}
            >
              <AppText variant="caption" weight="bold" tone={active ? 'brand' : 'secondary'}>
                {updating === s.id ? 'Saving…' : s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function JobApplicantsModal({
  visible,
  job,
  onClose,
}: {
  visible: boolean;
  job: JobListing | null;
  onClose: () => void;
}) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: applicants = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['job-applicants', job?.id],
    queryFn: () => listJobApplicants(job!.id),
    enabled: visible && !!job,
  });

  function refresh() {
    if (job) void queryClient.invalidateQueries({ queryKey: ['job-applicants', job.id] });
  }

  if (!job) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 640 : '92%',
              maxHeight: isDesktop ? '85%' : '88%',
              marginBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                Applicants
              </AppText>
              <AppText tone="secondary" variant="bodySmall" numberOfLines={1}>
                {job.title} • {applicants.length} applied • ranked by automatic match score
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : isError ? (
              <ErrorStateView
                title="Could not load applicants"
                error={error}
                onRetry={refetch}
              />
            ) : applicants.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No applications yet"
                description="Candidates who apply in Lioris will show up here, ranked automatically against this posting."
              />
            ) : (
              applicants.map((app) => <ApplicantRow key={app.id} application={app} onUpdated={refresh} />)
            )}
          </ScrollView>

          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <AppButton label="Close" variant="secondary" fullWidth onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
});
