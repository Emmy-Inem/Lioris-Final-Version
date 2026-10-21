import React from 'react';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppButton } from '@/components/AppButton';
import { GuardianDetailsForm } from '@/components/GuardianDetailsForm';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { GUARDIAN_STEP } from '@/auth/onboardingSteps';
import { useMinorStatus } from '@/hooks/useMinorStatus';

/**
 * Only members aged 13-17 are sent here (right after the profile step, see useAdvanceOnboarding). The step can be
 * skipped: the account then stays limited, and the banner at the top of the app asks again until a guardian is on
 * file and an administrator has recorded their consent.
 */
export default function GuardianDetailsScreen() {
  const advance = useAdvanceOnboarding(GUARDIAN_STEP);
  const { status, refresh } = useMinorStatus();

  return (
    <OnboardingShell
      currentPath={GUARDIAN_STEP}
      title="Add a parent or guardian"
      subtitle="Because you are under 18, we need the details of a parent or guardian. A campus administrator will contact them to confirm they are happy for you to use Lioris."
      footer={<AppButton label="Skip for now" variant="ghost" onPress={advance} fullWidth />}
    >
      <GuardianDetailsForm
        initial={status?.guardian ?? null}
        submitLabel="Save and continue"
        onSaved={async (next) => {
          await refresh(next);
          await advance();
        }}
      />
    </OnboardingShell>
  );
}
