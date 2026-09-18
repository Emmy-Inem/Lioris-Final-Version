import React from 'react';
import { OnboardingVerificationStep } from '@/components/OnboardingVerificationStep';

export default function VerifyAlumniScreen() {
  return <OnboardingVerificationStep currentPath="/(auth)/verify-alumni" mode="alumni" />;
}
