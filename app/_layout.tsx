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

import { loadBlockedUserIds } from '@/api/connections';

import { FeatureFlagsProvider } from '@/context/FeatureFlagsContext';

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
 loadBlockedUserIds().catch(() => {
 // background load
 });
 if (typeof document !== 'undefined') {
 document.title = 'Lioris';

 const styleId = 'lioris-desktop-scrollbars';
 if (!document.getElementById(styleId)) {
 const style = document.createElement('style');
 style.id = styleId;
 style.textContent = `
 /* Desktop visible sleek scrollbars */
 ::-webkit-scrollbar {
 width: 8px;
 height: 8px;
 }
 ::-webkit-scrollbar-track {
 background: transparent;
 }
 ::-webkit-scrollbar-thumb {
 background-color: rgba(148, 163, 184, 0.4);
 border-radius: 4px;
 }
 ::-webkit-scrollbar-thumb:hover {
 background-color: rgba(148, 163, 184, 0.7);
 }
 * {
 scrollbar-width: thin;
 scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
 }
 `;
 document.head.appendChild(style);
 }
 }
 }, [onLayoutRootView]);

 useEffect(() => {
 const subscription = addNotificationResponseListener((path) => {
 router.push(path as any);
 });
 return () => subscription.remove();
 }, []);

 if (!fontsLoaded && !fontError) {
 // Splash screen is still showing - render nothing underneath it.
 return null;
 }

 return (
 <GestureHandlerRootView style={{ flex: 1 }}>
 <SafeAreaProvider>
 <QueryClientProvider client={queryClient}>
 <AuthProvider>
 <ThemeProvider>
 <FeatureFlagsProvider>
 <StatusBarForTheme />
 <OfflineBanner />
 <ErrorBoundary>
 <Slot />
 </ErrorBoundary>
 </FeatureFlagsProvider>
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
