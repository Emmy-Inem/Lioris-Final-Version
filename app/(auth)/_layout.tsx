import React from'react';
import { Redirect, Stack } from'expo-router';
import { useAuth } from'@/auth/AuthContext';
import { roleRequiresMfa } from'@/auth/mfaPolicy';

export default function AuthLayout() {
  const { user, isLoading } = useAuth();

  // Only bounce away if the user is fully onboarded AND has cleared MFA
  // (if their role requires it) — otherwise a freshly-registered user
  // gets redirected out of verify-email/onboarding before ever seeing
  // it (register() sets the session immediately), and a staff/admin
  // user gets bounced out of verify-mfa before entering their code,
  // since login() also sets onboardingComplete immediately for them.
  const mfaPending = !!user && roleRequiresMfa(user.role) && !user.mfaVerified;
  if (!isLoading && user?.onboardingComplete && !mfaPending) {
    return <Redirect href="/" />;
  }

  // PRD Section 8's Design Philosophy calls for deliberate page
  // transitions. `fade` here (rather than leaving the platform default,
  // which is slide-from-right on iOS but can differ on Android) reads
  // as a state change between auth checkpoints (login → verify → MFA)
  // rather than a step forward — that's what the nested onboarding
  // stack below is for, which uses slide_from_right instead.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="verify-school" />
      <Stack.Screen name="verify-alumni" />
      <Stack.Screen name="verify-mfa" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
