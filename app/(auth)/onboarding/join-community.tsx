import React, { useState } from 'react';
import { OnboardingShell } from '@/components/OnboardingShell';
import { ChipSelect } from '@/components/ChipSelect';
import { AppButton } from '@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';

const COMMUNITIES = [
  'Class of 2027',
  'CS Study Group',
  'Robotics Club',
  'Career Prep Circle',
  'Outdoors & Hiking',
  'First-Gen Students',
];

export default function JoinCommunityScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/join-community');
  const [joined, setJoined] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggle(value: string) {
    setJoined((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

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
      currentPath="/(auth)/onboarding/join-community"
      title="Join your first community"
      subtitle="Pick at least one to get relevant posts and events in your feed."
      footer={
        <AppButton label="Go to my dashboard" onPress={handleFinish} loading={submitting} disabled={joined.length < 1} fullWidth />
      }
    >
      <ChipSelect options={COMMUNITIES} selected={joined} onToggle={toggle} />
    </OnboardingShell>
  );
}
