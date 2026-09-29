import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { JobApplyModal } from './JobApplyModal';
import { useTheme } from '@/theme/ThemeProvider';
import { JobListing } from '@/api/types';
import { hasAppliedToJob } from '@/api/jobApplications';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

export function JobCard({ job, onApplied }: { job: JobListing; onApplied?: () => void }) {
  const { colors, spacing, radius } = useTheme();
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
            {job.remote && <Badge label="Remote" tone="success" />}
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
