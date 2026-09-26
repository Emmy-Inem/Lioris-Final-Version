import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useLoadFonts } from '@/theme/useLoadFonts';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { queryClient } from '@/api/queryClient';
import { ErrorBoundary, RouteErrorBoundary } from '@/components/ErrorBoundary';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { OfflineBanner, setupNetworkAwareQueries } from '@/components/OfflineBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ReConsentGate } from '@/components/ReConsentGate';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { useCampusRegistry } from '@/hooks/useCampusRegistry';
import { addNotificationResponseListener } from '@/notifications/push';
import { resolveNotificationRoute } from '@/utils/notificationRouter';

import { loadBlockedUserIds } from '@/api/connections';
import { AppLockOverlay } from '@/components/AppLockOverlay';

import { FeatureFlagsProvider, useFeatureFlags } from '@/context/FeatureFlagsContext';
import { ToastProvider } from '@/context/ToastContext';
import { LiquidGlassProvider } from '@/context/LiquidGlassContext';
import { installWebAlertPolyfill, AlertHost } from '@/polyfills/webAlert';

// Export root ErrorBoundary for Expo Router file-system routing
export { RouteErrorBoundary as ErrorBoundary };

SplashScreen.preventAutoHideAsync().catch(() => {
 // No-op: harmless if called more than once (e.g. fast refresh in dev).
});

installWebAlertPolyfill();

setupNetworkAwareQueries();

export default function RootLayout() {
 const { fontsLoaded, fontError } = useLoadFonts();
 const [appIsReady, setAppIsReady] = React.useState(false);

 useEffect(() => {
 let timer: ReturnType<typeof setTimeout> | undefined;

 if (fontsLoaded || fontError) {
 SplashScreen.hideAsync().catch(() => {});
 setAppIsReady(true);
 } else {
 // 1.8s failsafe: never allow splash screen to hang for more than 1.8 seconds
 timer = setTimeout(() => {
 SplashScreen.hideAsync().catch(() => {});
 setAppIsReady(true);
 }, 1800);
 }

 return () => {
 if (timer) clearTimeout(timer);
 };
 }, [fontsLoaded, fontError]);

 useEffect(() => {
    loadBlockedUserIds().catch(() => {
      // background load
    });

    if (Platform.OS !== 'web') return;

    if (typeof document !== 'undefined') {
      document.title = 'Lioris';

      const styleId = 'lioris-desktop-scrollbars';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          
          /* Hardware-accelerated true iPhone liquid glass refraction for floating nav */
          [data-component="floating-liquid-glass-bar"] {
            backdrop-filter: blur(18px) saturate(190%) brightness(106%) contrast(104%) !important;
            -webkit-backdrop-filter: blur(18px) saturate(190%) brightness(106%) contrast(104%) !important;
            transform: translate3d(0, 0, 0) !important;
            will-change: backdrop-filter, -webkit-backdrop-filter !important;
          }

          [data-component="floating-tab-bar-wrapper"] {
            bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important;
          }

          /* Universal Clean Layout & Mobile Touch Optimization */
          *, *::before, *::after {
            -webkit-tap-highlight-color: transparent !important;
          }

          html, body, #root {
            height: 100% !important;
            width: 100% !important;
          }

          /* Vertical scroll containers: smooth touch scroll & vertical pan with natural pull-to-refresh */
          div[style*="overflow-y: auto"],
          div[style*="overflow-y: scroll"],
          .r-overflowY-156q2ks {
            -webkit-overflow-scrolling: touch !important;
            touch-action: pan-y !important;
          }

          /* Horizontal scroll containers: smooth touch scroll & horizontal pan without blocking vertical touch */
          div[style*="overflow-x: auto"],
          div[style*="overflow-x: scroll"],
          .r-overflowX-156q2ks,
          .r-overflowX-1udh08x,
          [data-horizontal-scroll="true"] {
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-x: contain !important;
            touch-action: pan-x pan-y !important;
            display: flex !important;
          }

          /* Hide physical scrollbars everywhere on mobile viewports (< 1024px) */
          @media (max-width: 1024px) {
            ::-webkit-scrollbar {
              display: none !important;
              width: 0px !important;
              height: 0px !important;
            }
            * {
              -ms-overflow-style: none !important;
              scrollbar-width: none !important;
            }
          }

          /* On wide desktop, show a subtle translucent scrollbar */
          @media (min-width: 1025px) {
            ::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            ::-webkit-scrollbar-track {
              background: transparent;
            }
            ::-webkit-scrollbar-thumb {
              background-color: rgba(148, 163, 184, 0.3);
              border-radius: 3px;
            }
            ::-webkit-scrollbar-thumb:hover {
              background-color: rgba(148, 163, 184, 0.6);
            }
            * {
              scrollbar-width: thin;
              scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
              box-sizing: border-box;
            }
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

        // Fast target lookup without forcing synchronous style recalculation across all DOM elements
        const targetContainer =
          (document.activeElement?.closest('div[style*="overflow-y: auto"], div[style*="overflow-y: scroll"], .r-overflowY-156q2ks') as HTMLElement) ||
          (document.querySelector('div[style*="overflow-y: auto"], div[style*="overflow-y: scroll"], .r-overflowY-156q2ks') as HTMLElement) ||
          (document.scrollingElement as HTMLElement);

        if (!targetContainer) return;

        let deltaY = 0;
        if (e.key === 'ArrowDown') deltaY = 120;
        else if (e.key === 'ArrowUp') deltaY = -120;
        else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) || (e.key === 'Space' && !e.shiftKey)) deltaY = (targetContainer.clientHeight || window.innerHeight) * 0.85;
        else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) || (e.key === 'Space' && e.shiftKey)) deltaY = -(targetContainer.clientHeight || window.innerHeight) * 0.85;
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

      window.addEventListener('keydown', handleGlobalKeyboardScroll, { passive: false });
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyboardScroll);
      };
    }
  }, []);


  if (!appIsReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppLoadingScreen message="Launching Lioris Campus Platform" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

 return (
 <GestureHandlerRootView style={{ flex: 1 }}>
 <SafeAreaProvider>
 <QueryClientProvider client={queryClient}>
 <AuthProvider>
 <ThemeProvider>
 <LiquidGlassProvider>
 <ToastProvider>
 <FeatureFlagsProvider>
 <AppShell />
 </FeatureFlagsProvider>
 </ToastProvider>
 </LiquidGlassProvider>
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

/**
 * Screens used to mount and render before the feature-flags fetch resolved,
 * seeing DEFAULT_FLAGS (every flag on) for that first render. Some consumers
 * never picked up the corrected values afterward even though the provider's
 * own state updated correctly (e.g. CommunityFeedScreen's "Currently
 * Threading" section stayed visible after forum_trends was turned off).
 * Holding the whole app behind the same loading screen already used for
 * fonts until flags are known removes the bad first render entirely, so
 * there's nothing stale left for any consumer to get stuck on.
 */
function AppShell() {
  // Keeps the shared campus list (incl. campuses an admin added) fresh for email matching and pickers.
  useCampusRegistry();
  const { isLoading } = useFeatureFlags();
  const { user } = useAuth();

  useEffect(() => {
    const subscription = addNotificationResponseListener((path, data) => {
      const resolved = resolveNotificationRoute(path, data?.type, user?.role);
      if (resolved) {
        router.push(resolved as any);
      }
    });
    return () => subscription.remove();
  }, [user?.role]);

  if (isLoading) {
 return <AppLoadingScreen message="Launching Lioris Campus Platform" />;
 }

 return (
 <>
 <StatusBarForTheme />
 <ImpersonationBanner />
 <OfflineBanner />
 <ErrorBoundary>
 <MaintenanceGate>
 <Slot />
 </MaintenanceGate>
 </ErrorBoundary>
 <ReConsentGate />
 <AlertHost />
 <AppLockOverlay />
 <PullToRefresh />
 <PwaInstallPrompt />
 </>
 );
}
