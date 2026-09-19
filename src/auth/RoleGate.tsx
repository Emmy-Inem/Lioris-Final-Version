import React from'react';
import { ActivityIndicator, View } from'react-native';
import { Redirect } from'expo-router';
import { useAuth } from'./AuthContext';
import { useTheme } from'@/theme/ThemeProvider';
import { UserRole } from'@/api/types';
import { roleRequiresMfa } from'./mfaPolicy';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

/**
 * Client-side convenience gate matching PRD Section 6.2's acceptance
 * criteria ("Given my role is not student, when I access the student
 * dashboard route directly, then access is denied"). This is UX only - 
 * the backend independently re-validates role on every API call
 * (PRD Section 12.1), so this gate is not a security boundary.
 */
export function RoleGate({
  allow,
  children,
}: {
  allow: UserRole;
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen message="Verifying campus access..." showTimeoutAction={false} />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!user.onboardingComplete) {
    // Mid-onboarding - bounce through the resolver, which sends them
    // back to wherever they left off in the chain.
    return <Redirect href="/" />;
  }

  if (roleRequiresMfa(user.role) && !user.mfaVerified) {
    // PRD Section 11 - don't let a deep link straight into (staff)/(admin)
    // skip the MFA challenge. Bounce through the resolver, which sends
    // them to verify-mfa.
    return <Redirect href="/" />;
  }

  if (user.role !== allow) {
    if (user.actualRole === 'admin') {
      // Root Admin has full access across all portals (student, staff, alumni)
      // to audit, inspect, and assist users without being kicked out.
      return <>{children}</>;
    }
    // Wrong role for this group - bounce through the resolver route,
    // which will send them to their actual dashboard.
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}
