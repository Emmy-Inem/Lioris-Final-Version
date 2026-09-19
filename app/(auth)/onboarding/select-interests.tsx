import React, { useState } from 'react';
import { OnboardingShell } from '@/components/OnboardingShell';
import { ChipSelect } from '@/components/ChipSelect';
import { AppButton } from '@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { updateMyProfile } from '@/api/profile';
import { useToast } from '@/context/ToastContext';

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
  'Study Groups',
  'Hackathons',
  'Campus Politics',
];

export default function SelectInterestsScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/select-interests');
  const toast = useToast();
  const [interests, setInterests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggle(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      if (interests.length > 0) {
        await updateMyProfile({ interests });
      }
      await advance();
    } catch {
      toast.warning('We couldn’t save your interests just now - you can add them later in Settings.');
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/select-interests"
      title="Pick your interests"
      subtitle="Select topics you care about to personalize your campus feed, events, and recommendations."
      footer={
        <AppButton
          label={interests.length > 0 ? 'Continue' : 'Skip for now'}
          onPress={handleContinue}
          loading={submitting}
          fullWidth
        />
      }
    >
      <ChipSelect options={INTERESTS} selected={interests} onToggle={toggle} />
    </OnboardingShell>
  );
}
