import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useAuth } from '@/auth/AuthContext';
export default function ReturnToStudentPortal() {
  const { exitAmbassadorWorkspace } = useAuth();
  useEffect(() => { exitAmbassadorWorkspace().finally(() => router.replace('/(student)/dashboard')); }, [exitAmbassadorWorkspace]);
  return <AppLoadingScreen message="Returning to your Student Portal..." showTimeoutAction={false} />;
}
