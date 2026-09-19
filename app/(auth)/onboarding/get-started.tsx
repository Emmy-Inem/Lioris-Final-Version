import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { OnboardingShell } from '@/components/OnboardingShell';
import { EventCard } from '@/components/EventCard';
import { ChipSelect } from '@/components/ChipSelect';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useToast } from '@/context/ToastContext';
import { listStudyGroups, joinStudyGroup } from '@/api/studyGroups';
import { listEvents } from '@/api/events';

/**
 * Final onboarding step for both roles. Lets students join study groups
 * and lets alumni view upcoming campus events right away.
 */
export default function GetStartedScreen() {
  const { spacing } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/get-started');
  const toast = useToast();
  const isAlumni = user?.role === 'alumni';
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['study-groups', 'onboarding'],
    queryFn: () => listStudyGroups(),
    enabled: !isAlumni,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'alumni', 'onboarding'],
    queryFn: () => listEvents({ scope: 'alumni' }),
    enabled: isAlumni,
  });

  const availableGroups = (groups ?? []).filter((g) => !g.isJoined);
  const labelToId = new Map(availableGroups.map((g) => [g.name, g.id]));
  const groupOptions = availableGroups.map((g) => g.name);
  const selectedGroupLabels = availableGroups.filter((g) => selectedGroupIds.includes(g.id)).map((g) => g.name);

  function toggleGroup(label: string) {
    const id = labelToId.get(label);
    if (!id) return;
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      if (!isAlumni && selectedGroupIds.length > 0) {
        const results = await Promise.allSettled(selectedGroupIds.map((id) => joinStudyGroup(id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          toast.warning(
            failed === selectedGroupIds.length
              ? 'We couldn’t join those groups just now - you can join them from Study Groups.'
              : `${failed} of ${selectedGroupIds.length} groups couldn’t be joined. You can retry from Study Groups.`,
          );
        }
      }
    } finally {
      setSubmitting(false);
      await advance();
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/get-started"
      title="Get started"
      subtitle={
        isAlumni
          ? "Here are upcoming alumni gatherings to help you get started - you can always find more later."
          : "Join campus study groups for your courses - you can always discover more on your dashboard."
      }
      footer={<AppButton label="Go to my dashboard" onPress={handleFinish} loading={submitting} fullWidth />}
    >
      <View style={{ marginTop: spacing.xs }}>
        {isAlumni ? (
          <>
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
              UPCOMING ALUMNI EVENTS
            </AppText>
            {!eventsLoading && events?.slice(0, 2).map((event) => <EventCard key={event.id} event={event} />)}
            {!eventsLoading && (events?.length ?? 0) === 0 ? (
              <AppText tone="secondary">No alumni events listed yet - check back soon.</AppText>
            ) : null}
          </>
        ) : (
          <>
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
              JOIN A STUDY GROUP
            </AppText>
            {groupsLoading ? (
              <AppText tone="secondary">Loading campus study groups…</AppText>
            ) : availableGroups.length === 0 ? (
              <AppText tone="secondary">
                Nothing here yet. Head to Study Groups after onboarding to create the first one for your course.
              </AppText>
            ) : (
              <ChipSelect options={groupOptions} selected={selectedGroupLabels} onToggle={toggleGroup} />
            )}
          </>
        )}
      </View>
    </OnboardingShell>
  );
}
