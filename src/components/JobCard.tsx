import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { JobApplyModal } from './JobApplyModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { JobListing } from '@/api/types';
import { hasAppliedToJob } from '@/api/jobApplications';
import { submitReport } from '@/api/moderation';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

export function JobCard({ job, onApplied }: { job: JobListing; onApplied?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [checkingApplied, setCheckingApplied] = useState(false);

  const canApplyInApp = job.acceptsInAppApplications;

  // Reflect whether the signed-in user has already applied, even across
  // sessions - applications are now real, persisted rows (not a fire-and-
  // forget notification), so this state must survive reopening the app.
  useEffect(() => {
    if (!canApplyInApp) return;
    let cancelled = false;
    setCheckingApplied(true);
    hasAppliedToJob(job.id)
      .then((result) => {
        if (!cancelled) setApplied(result);
      })
      .finally(() => {
        if (!cancelled) setCheckingApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, canApplyInApp]);

  function handleOpenApplyUrl() {
    if (isSafeHttpUrl(job.applyUrl)) {
      void openExternalUrl(job.applyUrl);
    }
  }

  function handleApplied() {
    setApplied(true);
    setModalOpen(false);
    onApplied?.();
  }

  function handleReport() {
    haptics.light();
    const doReport = async (reason?: string) => {
      try {
        await submitReport({
          targetType: 'job',
          targetId: job.id,
          institutionCode: job.campusCode,
          reason: reason?.trim() || 'Reported from the career board',
        });
        Alert.alert('Reported', 'Thanks - campus moderators will review this posting.');
      } catch (err: any) {
        Alert.alert('Report Failed', err?.message || 'Could not submit your report. Please try again.');
      }
    };
    if (Alert.prompt) {
      Alert.prompt(
        'Report this job posting',
        'What is wrong with it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Report', style: 'destructive', onPress: (reason?: string) => doReport(reason) },
        ],
        'plain-text',
      );
    } else {
      Alert.alert('Report this job posting?', 'Campus moderators will review it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => doReport() },
      ]);
    }
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.divider,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="briefcase-outline" size={22} color={colors.textSecondary} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
              {job.remote && <Badge label="Remote" tone="success" />}
            </View>
            {!job.isApproved && job.posterId === user?.id && <Badge label="Pending Review" tone="warning" />}
          </View>
          <AppText variant="h3" weight="bold" style={{ marginTop: 2 }}>
            {job.title}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {job.company} | {job.location}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: spacing.md,
          paddingTop: spacing.xs,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        <AppText tone="secondary" variant="caption" style={{ flexShrink: 1, minWidth: 60 }}>
          Posted by {job.postedByName}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexShrink: 0 }}>
          {job.posterId !== user?.id && (
            <Pressable
              onPress={handleReport}
              hitSlop={8}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Report this job posting"
            >
              <Ionicons name="flag-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
          {isSafeHttpUrl(job.applyUrl) && (
            <AppButton
              label="Job Site ↗"
              variant="ghost"
              size="sm"
              onPress={handleOpenApplyUrl}
            />
          )}
          {canApplyInApp && (
            <AppButton
              label={applied ? 'Applied ✓' : 'Apply in Lioris'}
              variant={applied ? 'secondary' : 'primary'}
              size="sm"
              disabled={applied || checkingApplied}
              onPress={() => {
                haptics.light();
                setModalOpen(true);
              }}
            />
          )}
        </View>
      </View>

      {canApplyInApp && (
        <JobApplyModal
          visible={modalOpen}
          job={job}
          onClose={() => setModalOpen(false)}
          onApplied={handleApplied}
        />
      )}
    </SolidCard>
  );
}
