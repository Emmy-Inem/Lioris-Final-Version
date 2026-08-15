import React, { useState } from'react';
import { useQuery } from'@tanstack/react-query';
import { OnboardingShell } from'@/components/OnboardingShell';
import { EventCard } from'@/components/EventCard';
import { AppButton } from'@/components/AppButton';
import { AppText } from'@/components/AppText';
import { listEvents } from'@/api/events';
import { useAdvanceOnboarding } from'@/auth/useAdvanceOnboarding';

export default function JoinEventScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/join-event');
  const { data: events, isLoading } = useQuery({
    queryKey: ['events', 'alumni', 'onboarding'],
    queryFn: () => listEvents({ scope: 'alumni' }),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleFinish() {
    setSubmitting(true);
    try {
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/join-event"title="Join your first alumni event"subtitle="RSVP to something below, or skip and browse events later."footer={<AppButton label="Go to my dashboard"onPress={handleFinish} loading={submitting} fullWidth />}
    >
      {!isLoading && events?.slice(0, 2).map((event) => <EventCard key={event.id} event={event} />)}
      {!isLoading && (events?.length ?? 0) === 0 ? (
        <AppText tone="secondary">No alumni events listed yet — check back soon.</AppText>
      ) : null}
    </OnboardingShell>
  );
}
