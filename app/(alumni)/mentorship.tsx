import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listMentorships, respondToMentorshipRequest } from '@/api/mentorship';

const STATUS_TONE = {
  pending: 'warning',
  active: 'success',
  completed: 'neutral',
  declined: 'critical',
} as const;

export default function AlumniMentorshipScreen() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data: mentorships, isLoading } = useQuery({
    queryKey: ['mentorships'],
    queryFn: listMentorships,
  });

  async function respond(id: string, action: 'accept' | 'decline') {
    setSubmittingId(id);
    try {
      await respondToMentorshipRequest(id, action);
      queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <AppText variant="h1" weight="bold" style={{ paddingVertical: spacing.lg }}>
          Mentorship
        </AppText>

        {mentorships?.map((m) => (
          <SolidCard key={m.id} style={{ marginBottom: spacing.md }}>
            <Badge label={m.status} tone={STATUS_TONE[m.status]} />
            <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm }}>
              Student mentee request
            </AppText>
            {m.focusArea ? (
              <AppText tone="secondary" style={{ marginTop: 2, marginBottom: spacing.sm }}>
                Focus: {m.focusArea}
              </AppText>
            ) : null}

            {m.status === 'pending' ? (
              <AppButtonRow>
                <AppButton label="Accept" onPress={() => respond(m.id, 'accept')} loading={submittingId === m.id} />
                <AppButton label="Decline" variant="secondary" onPress={() => respond(m.id, 'decline')} />
              </AppButtonRow>
            ) : null}
          </SolidCard>
        ))}

        {!isLoading && (mentorships?.length ?? 0) === 0 ? (
          <EmptyState title="No mentorship activity" description="Requests from students will appear here." />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function AppButtonRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>{children}</ScrollView>;
}
