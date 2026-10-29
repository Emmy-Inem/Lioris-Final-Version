import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from './AuthContext';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

/**
 * UX gate for the Ambassador Console. The appointment remains database-backed
 * and every write is still enforced by RLS/RPC policy; this prevents ordinary
 * students from being presented with ambassador controls through a deep link.
 */
export function AmbassadorGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <AppLoadingScreen message="Verifying ambassador appointment..." showTimeoutAction={false} />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!user.onboardingComplete) return <Redirect href="/" />;
  if (user.actualRole !== 'student' || !user.isCampusAmbassador || user.workspaceMode !== 'ambassador') {
    return <Redirect href="/(student)/dashboard" />;
  }
  return <>{children}</>;
}
