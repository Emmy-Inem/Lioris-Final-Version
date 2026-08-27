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
          /* Universal Desktop Smooth Mouse Wheel Scrolling & Scrollbars */
          html, body, #root {
            height: 100% !important;
            width: 100% !important;
            overflow: hidden !important;
            overscroll-behavior: none !important;
          }

          /* Enable smooth mouse wheel scrolling across all React Native Web scroll containers */
          div[style*="overflow-y: auto"],
          div[style*="overflow-y: scroll"],
          div[style*="overflow: auto"],
          div[style*="overflow: scroll"],
          .r-overflowY-156q2ks,
          .r-overflow-1udh08x {
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain !important;
            touch-action: pan-y !important;
          }

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
            box-sizing: border-box;
          }
        `;
        document.head.appendChild(style);
      }
    }
    if (typeof window !== 'undefined') {
      const handleGlobalKeyboardScroll = (e: KeyboardEvent) => {
        // Do not intercept if user is typing in an input, textarea, or contentEditable
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (['input', 'textarea', 'select'].includes(activeTag) || isEditable) {
          return;
        }

        const scrollKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', ' ', 'Home', 'End'];
        if (!scrollKeys.includes(e.key)) {
          return;
        }

        // Find best scroll container
        let targetContainer: HTMLElement | null = null;
        const allScrollables = Array.from(document.querySelectorAll('*')).filter((el) => {
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          return (
            (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') &&
            htmlEl.scrollHeight > htmlEl.clientHeight &&
            htmlEl.clientHeight > 150
          );
        }) as HTMLElement[];

        targetContainer = allScrollables[allScrollables.length - 1] || null;
        if (!targetContainer) return;

        let deltaY = 0;
        if (e.key === 'ArrowDown') deltaY = 120;
        else if (e.key === 'ArrowUp') deltaY = -120;
        else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) || (e.key === 'Space' && !e.shiftKey)) deltaY = targetContainer.clientHeight * 0.85;
        else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) || (e.key === 'Space' && e.shiftKey)) deltaY = -targetContainer.clientHeight * 0.85;
        else if (e.key === 'Home') {
          e.preventDefault();
          targetContainer.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        } else if (e.key === 'End') {
          e.preventDefault();
          targetContainer.scrollTo({ top: targetContainer.scrollHeight, behavior: 'smooth' });
          return;
        }

        if (deltaY !== 0) {
          e.preventDefault();
          targetContainer.scrollBy({ top: deltaY, behavior: 'smooth' });
        }
      };

      const handleGlobalWheel = (e: WheelEvent) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        let el: HTMLElement | null = target;
        let canScroll = false;
        while (el && el !== document.body && el !== document.documentElement) {
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            canScroll = true;
            break;
          }
          el = el.parentElement;
        }
        if (!canScroll) {
          const mainScrollable = Array.from(document.querySelectorAll('*')).find((el) => {
            const htmlEl = el as HTMLElement;
            const style = window.getComputedStyle(htmlEl);
            return (
              (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
              htmlEl.scrollHeight > htmlEl.clientHeight &&
              htmlEl.clientHeight > 250
            );
          }) as HTMLElement;
          if (mainScrollable) {
            mainScrollable.scrollTop += e.deltaY;
          }
        }
      };

      window.addEventListener('keydown', handleGlobalKeyboardScroll, { passive: false });
      window.addEventListener('wheel', handleGlobalWheel, { passive: true });
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyboardScroll);
        window.removeEventListener('wheel', handleGlobalWheel);
      };
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
