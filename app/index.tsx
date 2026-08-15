import React from'react';
import { ActivityIndicator, View } from'react-native';
import { Redirect } from'expo-router';
import { useAuth } from'@/auth/AuthContext';
import { useTheme } from'@/theme/ThemeProvider';
import { firstOnboardingStep } from'@/auth/onboardingSteps';
import { roleRequiresMfa } from'@/auth/mfaPolicy';

// PRD Section 6.1 (Dashboard Routing): each role lands on its own
// dedicated dashboard. This is a client-side convenience redirect only —
// the backend re-validates role on every protected request regardless
// (PRD Section 12.1).
//
// Admin is a deliberate exception: it lands on Platform Config (the
// "Admin Desk"tab) instead of the plain dashboard, since that's where
// the"Preview As"role switcher lives — landing there first means an
// admin can jump straight to switching roles without an extra tap. The
// regular admin dashboard is still one tap away via the"Home"tab.
const DASHBOARD_BY_ROLE = {
  student: '/(student)/dashboard',
  alumni: '/(alumni)/dashboard',
  staff: '/(staff)/dashboard',
  admin: '/(admin)/platform-config',
} as const;

export default function Index() {
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!user.onboardingComplete) {
    // Resume exactly where they left off (PRD Section 5's onboarding
    // flowcharts) rather than dropping them back at step one every reload.
    const resumePath = user.onboardingStep ?? firstOnboardingStep(user.role);
    return <Redirect href={resumePath as any} />;
  }

  if (roleRequiresMfa(user.role) && !user.mfaVerified) {
    // PRD Section 11 — staff/admin must clear MFA every sign-in before
    // reaching their dashboard.
    return <Redirect href="/(auth)/verify-mfa" />;
  }

  return <Redirect href={DASHBOARD_BY_ROLE[user.role] as any} />;
}
