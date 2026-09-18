import React from 'react';
import { OnboardingVerificationStep } from '@/components/OnboardingVerificationStep';

export default function VerifySchoolScreen() {
  return <OnboardingVerificationStep currentPath="/(auth)/verify-school" mode="student" />;
}
