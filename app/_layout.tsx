import'react-native-gesture-handler';
import React, { useCallback, useEffect } from'react';
import { GestureHandlerRootView } from'react-native-gesture-handler';
import { SafeAreaProvider } from'react-native-safe-area-context';
import { QueryClientProvider } from'@tanstack/react-query';
import * as SplashScreen from'expo-splash-screen';
import { Slot, router } from'expo-router';
import { StatusBar } from'expo-status-bar';

import { ThemeProvider, useTheme } from'@/theme/ThemeProvider';
import { useLoadFonts } from'@/theme/useLoadFonts';
import { AuthProvider } from'@/auth/AuthContext';
import { queryClient } from'@/api/queryClient';
import { ErrorBoundary } from'@/components/ErrorBoundary';
import { OfflineBanner, setupNetworkAwareQueries } from'@/components/OfflineBanner';
import { addNotificationResponseListener } from'@/notifications/push';

SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op: harmless if called more than once (e.g. fast refresh in dev).
});

setupNetworkAwareQueries();

export default function RootLayout() {
  const { fontsLoaded, fontError } = useLoadFonts();

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
    if (typeof document !== 'undefined') {
      document.title = 'Lioris';
    }
  }, [onLayoutRootView]);

  useEffect(() => {
    // Was built (expo-notifications wiring, Android channel setup, the
    // works) but never actually mounted anywhere — its own comment said
    // "mount once near the app root"and nothing did. Handles someone
    // tapping a push notification while the app is backgrounded/closed,
    // routing them straight to the relevant screen instead of just
    // opening to whatever the app happened to be showing.
    const subscription = addNotificationResponseListener((path) => {
      router.push(path as any);
    });
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) {
    // Splash screen is still showing — render nothing underneath it.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <StatusBarForTheme />
              <OfflineBanner />
              <ErrorBoundary>
                <Slot />
              </ErrorBoundary>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function StatusBarForTheme() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
