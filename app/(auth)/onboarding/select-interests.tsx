import React, { useState } from'react';
import { OnboardingShell } from'@/components/OnboardingShell';
import { ChipSelect } from'@/components/ChipSelect';
import { AppButton } from'@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { updateMyProfile } from '@/api/profile';

const INTERESTS = [
  'Career & Networking',
  'Mentorship',
  'Research',
  'Entrepreneurship',
  'Arts & Culture',
  'Sports',
  'Volunteering',
  'Technology',
  'Alumni Events',
];

export default function SelectInterestsScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/select-interests');
  const [interests, setInterests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggle(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      await updateMyProfile({ interests });
      await advance();
    } catch {
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/select-interests"title="Pick a few interests"subtitle="Choose at least 3 — we'll use these to recommend communities and events."footer={
        <AppButton
          label="Continue"onPress={handleContinue}
          loading={submitting}
          disabled={interests.length < 3}
          fullWidth
        />
      }
    >
      <ChipSelect options={INTERESTS} selected={interests} onToggle={toggle} />
    </OnboardingShell>
  );
}
