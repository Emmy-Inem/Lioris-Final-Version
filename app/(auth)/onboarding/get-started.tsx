import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { OnboardingShell } from '@/components/OnboardingShell';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EventCard } from '@/components/EventCard';
import { ChipSelect } from '@/components/ChipSelect';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useToast } from '@/context/ToastContext';
import { searchAlumniDirectory } from '@/api/connections';
import { listStudyGroups, joinStudyGroup } from '@/api/studyGroups';
import { listEvents } from '@/api/events';

/**
 * Final onboarding step for both roles. Replaces three screens that either
 * did nothing real (browse-directory was a read-only preview;
 * connect-classmates never saved a connection) or duplicated each other
 * (student's join-community and alumni's join-event were the same "pick
 * something real to join" idea, just role-split into separate files) with
 * one screen that does two genuinely functional things: suggests people to
 * connect with (DirectoryCard's Connect button is real), and lets you join
 * a study group (student) or see upcoming events to RSVP to (alumni).
 */
export default function GetStartedScreen() {
  const { spacing } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/get-started');
  const toast = useToast();
  const isAlumni = user?.role === 'alumni';
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: people, isLoading: peopleLoading } = useQuery({
    queryKey: ['directory', 'onboarding-suggestions', user?.role ?? 'student'],
    queryFn: () => searchAlumniDirectory({ roles: ['student', 'alumni'] }),
  });

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
      subtitle="A few suggested people to connect with, plus something real to join - you can always find more later."
      footer={<AppButton label="Go to my dashboard" onPress={handleFinish} loading={submitting} fullWidth />}
    >
      <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
        PEOPLE TO CONNECT WITH
      </AppText>
      {!peopleLoading && people?.slice(0, 2).map((entry) => <DirectoryCard key={entry.id} entry={entry} />)}
      {!peopleLoading && (people?.length ?? 0) === 0 ? (
        <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
          No suggestions available yet - check the directory later.
        </AppText>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
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
