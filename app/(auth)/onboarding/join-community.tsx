import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OnboardingShell } from '@/components/OnboardingShell';
import { ChipSelect } from '@/components/ChipSelect';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useToast } from '@/context/ToastContext';
import { listStudyGroups, joinStudyGroup } from '@/api/studyGroups';

/**
 * Final onboarding step: join a real study group on your campus.
 *
 * This screen used to render six invented communities ("Class of 2027",
 * "Robotics Club", ...) and then throw the selection away - handleFinish
 * only called advance(), so nothing was ever joined. Now it lists the study
 * groups that actually exist for the viewer's campus and persists each join.
 */
export default function JoinCommunityScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/join-community');
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['study-groups', 'onboarding'],
    queryFn: () => listStudyGroups(),
  });

  const available = (groups ?? []).filter((g) => !g.isJoined);
  const labelToId = new Map(available.map((g) => [g.name, g.id]));
  const options = available.map((g) => g.name);
  const selectedLabels = available.filter((g) => selectedIds.includes(g.id)).map((g) => g.name);

  function toggle(label: string) {
    const id = labelToId.get(label);
    if (!id) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => joinStudyGroup(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.warning(
          failed === selectedIds.length
            ? 'We couldn’t join those groups just now - you can join them from Study Groups.'
            : `${failed} of ${selectedIds.length} groups couldn’t be joined. You can retry from Study Groups.`,
        );
      }
    } finally {
      // Never trap someone on the last onboarding step over a failed join.
      setSubmitting(false);
      await advance();
    }
  }

  const nothingToJoin = !isLoading && available.length === 0;

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/join-community"
      title="Join your first community"
      subtitle={
        nothingToJoin
          ? 'No study groups have been created on your campus yet - you can start one from your dashboard.'
          : 'Pick at least one to get relevant posts and events in your feed.'
      }
      footer={
        <AppButton
          label="Go to my dashboard"
          onPress={handleFinish}
          loading={submitting}
          // Only require a pick when there is actually something to pick.
          disabled={!nothingToJoin && selectedIds.length < 1}
          fullWidth
        />
      }
    >
      {isLoading ? (
        <AppText tone="secondary">Loading campus study groups…</AppText>
      ) : nothingToJoin ? (
        <AppText tone="secondary">
          Nothing here yet. Head to Study Groups after onboarding to create the first one for your course.
        </AppText>
      ) : (
        <ChipSelect options={options} selected={selectedLabels} onToggle={toggle} />
      )}
    </OnboardingShell>
  );
}
