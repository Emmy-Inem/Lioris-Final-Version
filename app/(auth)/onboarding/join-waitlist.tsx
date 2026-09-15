import React, { useState } from 'react';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useAuth } from '@/auth/AuthContext';
import { joinWaitlist } from '@/api/institutions';
import { useToast } from '@/context/ToastContext';

/**
 * Shown only to accounts whose email domain didn't match a launched
 * institution (see onboardingSteps.ts's institutionMatched param). Today
 * these accounts were silently defaulted to University of Ibadan at
 * registration with no mention that their real school isn't live yet - the
 * only way to find the waitlist was a card on the login screen nobody
 * lands on once they already have an account. This surfaces it as part of
 * onboarding itself, and actually records their real institution.
 */
function guessInstitutionName(email?: string): string {
  const domain = email?.split('@')[1] ?? '';
  const withoutTld = domain.replace(/\.(edu\.ng|edu|ac\.uk|ac\.ng)$/i, '');
  if (!withoutTld) return '';
  return withoutTld
    .split(/[.-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function JoinWaitlistScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/join-waitlist');
  const { user } = useAuth();
  const toast = useToast();
  const [universityName, setUniversityName] = useState(() => guessInstitutionName(user?.email));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleJoinWaitlist() {
    if (!universityName.trim()) return;
    setSubmitting(true);
    try {
      await joinWaitlist({ universityName: universityName.trim(), email: user?.email || '' });
      setSubmitted(true);
      toast.success("You're on the list - we'll email you when your campus goes live.");
    } catch {
      toast.warning("We couldn't add you to the waitlist just now - you can try again from Settings.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/join-waitlist"
      title="We're not at your school yet"
      subtitle="Lioris is live at a handful of campuses so far. Confirm your institution below and we'll fast-track it - you can keep using Lioris in the meantime with a default campus feed."
      footer={
        submitted ? (
          <AppButton label="Continue" onPress={() => advance()} fullWidth />
        ) : (
          <AppButton
            label="Join the waitlist"
            onPress={handleJoinWaitlist}
            loading={submitting}
            disabled={!universityName.trim()}
            fullWidth
          />
        )
      }
    >
      {submitted ? (
        <AppText tone="secondary">
          Thanks - {universityName} is on our launch list. We'll email {user?.email} the moment it goes live.
        </AppText>
      ) : (
        <AppTextField
          label="Your institution"
          value={universityName}
          onChangeText={setUniversityName}
          placeholder="e.g. Lagos State University"
        />
      )}
    </OnboardingShell>
  );
}
