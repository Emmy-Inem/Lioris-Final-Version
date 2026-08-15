import React, { useState } from 'react';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';

export default function CompleteProfileScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/complete-profile');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setSubmitting(true);
    try {
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/complete-profile"
      title="Tell people a bit about you"
      subtitle="A short bio shows up on your profile and in the directory."
      footer={<AppButton label={bio ? 'Continue' : 'Skip for now'} onPress={handleContinue} loading={submitting} fullWidth />}
    >
      <AppTextField
        label="Bio"
        value={bio}
        onChangeText={setBio}
        placeholder="e.g. Junior studying CS, into robotics and hiking."
        multiline
        numberOfLines={4}
      />
    </OnboardingShell>
  );
}
