import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, router, usePathname } from 'expo-router';
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
import { DateOfBirthPromptGate } from '@/components/DateOfBirthPromptGate';
import { MinorConsentBanner } from '@/components/MinorConsentBanner';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { useCampusRegistry } from '@/hooks/useCampusRegistry';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { addNotificationResponseListener } from '@/notifications/push';
import { resolveNotificationRoute } from '@/utils/notificationRouter';
import { addBreadcrumb } from '@/monitoring/breadcrumbs';

import { loadBlockedUserIds, loadMutedUserIds } from '@/api/connections';
import { AppLockOverlay } from '@/components/AppLockOverlay';
import { IncomingCallListener } from '@/components/IncomingCallListener';

import { FeatureFlagsProvider, useFeatureFlags } from '@/context/FeatureFlagsContext';
import { RolePermissionsProvider } from '@/context/RolePermissionsContext';
import { ToastProvider } from '@/context/ToastContext';
import { LiquidGlassProvider } from '@/context/LiquidGlassContext';
import { installWebAlertPolyfill, AlertHost } from '@/polyfills/webAlert';
import { installWebA11yFixes } from '@/polyfills/webA11yFixes';

// Export root ErrorBoundary for Expo Router file-system routing
export { RouteErrorBoundary as ErrorBoundary };

SplashScreen.preventAutoHideAsync().catch(() => {
 // No-op: harmless if called more than once (e.g. fast refresh in dev).
});

installWebAlertPolyfill();
installWebA11yFixes();

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
    loadMutedUserIds().catch(() => {
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

          /* Vertical scroll containers: smooth touch scroll without blocking nested horizontal scrollbars */
          div[style*="overflow-y: auto"],
          div[style*="overflow-y: scroll"],
          .r-overflowY-156q2ks {
            -webkit-overflow-scrolling: touch !important;
            touch-action: pan-x pan-y !important;
          }

          /* Horizontal scroll containers: smooth horizontal touch pan */
          div[style*="overflow-x: auto"],
          div[style*="overflow-x: scroll"],
          .r-overflowX-156q2ks,
          [data-horizontal-scroll="true"] {
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-x: contain !important;
            touch-action: pan-x pan-y !important;
          }

          /* Ensure modal scroll containers always shrink properly so bottom buttons are never cut off */
          [aria-modal="true"] div[style*="overflow-y: auto"],
          [aria-modal="true"] div[style*="overflow-y: scroll"],
          [aria-modal="true"] .r-overflowY-156q2ks {
            min-height: 0 !important;
            flex-shrink: 1 !important;
          }

          /* Hide physical scrollbars everywhere on mobile viewports (< 1024px) */
          @media (max-width: 1023px) {
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

          /* On desktop (>= 1024px), show a clean physical scrollbar at the screen edge while keeping full page margins */
          @media (min-width: 1024px) {
            :root {
              --lioris-pad-x: 32px;
            }
          }
          @media (min-width: 1440px) {
            :root {
              --lioris-pad-x: 40px;
            }
          }

          @media (min-width: 1024px) {
            ::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            ::-webkit-scrollbar-track {
              background: transparent;
            }
            ::-webkit-scrollbar-thumb {
              background-color: rgba(148, 163, 184, 0.38);
              border-radius: 4px;
            }
            ::-webkit-scrollbar-thumb:hover {
              background-color: rgba(148, 163, 184, 0.65);
            }
            * {
              scrollbar-width: thin;
              scrollbar-color: rgba(148, 163, 184, 0.38) transparent;
              box-sizing: border-box;
            }

            /* Extend top-level vertical scroll views inside padded ScreenContainer to the right screen edge so the physical scrollbar sits at the screen edge while content retains right margin */
            [data-screen-container="padded"] > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]):not(:has(> .r-overflowY-156q2ks)),
            [data-screen-container="padded"] > div:not(.r-flexDirection-18u37iz):not([style*="flex-direction: row"]):not(.r-overflowY-156q2ks) > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]):not(:has(> .r-overflowY-156q2ks)) {
              width: calc(100% + var(--lioris-pad-x, 32px)) !important;
              margin-right: calc(-1 * var(--lioris-pad-x, 32px)) !important;
              padding-right: var(--lioris-pad-x, 32px) !important;
              box-sizing: border-box !important;
            }

            /* Handle RefreshControl-wrapped vertical ScrollViews on web (outer RefreshControl View + inner ScrollViewBase) */
            [data-screen-container="padded"] > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]):has(> .r-overflowY-156q2ks),
            [data-screen-container="padded"] > div:not(.r-flexDirection-18u37iz):not([style*="flex-direction: row"]):not(.r-overflowY-156q2ks) > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]):has(> .r-overflowY-156q2ks) {
              width: calc(100% + var(--lioris-pad-x, 32px)) !important;
              margin-right: calc(-1 * var(--lioris-pad-x, 32px)) !important;
              overflow-y: hidden !important;
              box-sizing: border-box !important;
            }
            [data-screen-container="padded"] > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]) > .r-overflowY-156q2ks,
            [data-screen-container="padded"] > div:not(.r-flexDirection-18u37iz):not([style*="flex-direction: row"]):not(.r-overflowY-156q2ks) > .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]) > .r-overflowY-156q2ks {
              width: 100% !important;
              padding-right: var(--lioris-pad-x, 32px) !important;
              box-sizing: border-box !important;
            }

            /* Override showsVerticalScrollIndicator={false} on primary desktop work-area vertical scroll views */
            [data-main-work-area="true"] div[style*="overflow-y: auto"]:not([data-horizontal-scroll="true"]),
            [data-main-work-area="true"] div[style*="overflow-y: scroll"]:not([data-horizontal-scroll="true"]),
            [data-main-work-area="true"] .r-overflowY-156q2ks:not([data-horizontal-scroll="true"]) {
              scrollbar-width: thin !important;
              scrollbar-color: rgba(148, 163, 184, 0.42) transparent !important;
            }
            [data-main-work-area="true"] div[style*="overflow-y: auto"]:not([data-horizontal-scroll="true"])::-webkit-scrollbar,
            [data-main-work-area="true"] div[style*="overflow-y: scroll"]:not([data-horizontal-scroll="true"])::-webkit-scrollbar,
            [data-main-work-area="true"] .r-overflowY-156q2ks:not([data-horizontal-scroll="true"])::-webkit-scrollbar {
              display: block !important;
              width: 8px !important;
              height: 8px !important;
            }
          }
        `;
        document.head.appendChild(style);
      }
    }
    if (typeof window !== 'undefined') {
      const VERTICAL_SCROLL_SELECTOR =
        'div[style*="overflow-y: auto"]:not([data-horizontal-scroll="true"]), div[style*="overflow-y: scroll"]:not([data-horizontal-scroll="true"]), .r-overflowY-156q2ks:not([data-horizontal-scroll="true"])';

      const isElementVisible = (el: HTMLElement | null): boolean => {
        if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0 || el.getClientRects().length === 0) {
          return false;
        }
        let cur: HTMLElement | null = el;
        while (cur && cur !== document.body) {
          if (cur.getAttribute('aria-hidden') === 'true') return false;
          const inlineStyle = cur.style;
          if (inlineStyle && (inlineStyle.display === 'none' || inlineStyle.visibility === 'hidden')) {
            return false;
          }
          cur = cur.parentElement;
        }
        return true;
      };

      const findActiveVerticalScrollContainer = (): HTMLElement | null => {
        // 1. If a visible modal is open, prioritize its scrollable body
        const modals = Array.from(document.querySelectorAll('[aria-modal="true"]')) as HTMLElement[];
        for (let i = modals.length - 1; i >= 0; i--) {
          const modal = modals[i];
          if (!isElementVisible(modal)) continue;
          const modalScrollers = Array.from(modal.querySelectorAll(VERTICAL_SCROLL_SELECTOR)) as HTMLElement[];
          const activeModalScroller = modalScrollers.find(
            (el) => isElementVisible(el) && el.scrollHeight > el.clientHeight + 1
          );
          if (activeModalScroller) return activeModalScroller;
        }

        // 2. If focus is already inside a visible scrollable container in the main work area, use it
        const mainWorkArea = document.querySelector('[data-main-work-area="true"]') as HTMLElement | null;
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && (!mainWorkArea || mainWorkArea.contains(activeEl))) {
          const focusedScroller = activeEl.closest(VERTICAL_SCROLL_SELECTOR) as HTMLElement | null;
          if (
            focusedScroller &&
            (!mainWorkArea || mainWorkArea.contains(focusedScroller)) &&
            isElementVisible(focusedScroller) &&
            focusedScroller.scrollHeight > focusedScroller.clientHeight + 1
          ) {
            return focusedScroller;
          }
        }

        // 3. Find the primary visible vertical scroll container in the active screen
        const searchRoot: ParentNode = mainWorkArea || document;
        const candidates = (Array.from(searchRoot.querySelectorAll(VERTICAL_SCROLL_SELECTOR)) as HTMLElement[]).filter(
          (el) => isElementVisible(el)
        );
        const scrollableCandidates = candidates.filter((el) => el.scrollHeight > el.clientHeight + 1);
        const pool = scrollableCandidates.length > 0 ? scrollableCandidates : candidates;

        if (pool.length === 0) return null;

        let best = pool[0];
        let bestArea = best.clientWidth * best.clientHeight;
        for (let i = 1; i < pool.length; i++) {
          const area = pool[i].clientWidth * pool[i].clientHeight;
          if (area > bestArea) {
            best = pool[i];
            bestArea = area;
          }
        }
        return best;
      };

      const handleGlobalKeyboardScroll = (e: KeyboardEvent) => {
        const activeEl = document.activeElement as HTMLElement | null;
        const activeTag = (activeEl?.tagName || '').toLowerCase();
        const isEditable = activeEl?.isContentEditable;
        if (['input', 'textarea', 'select'].includes(activeTag) || isEditable) {
          return;
        }

        // Allow Space to activate focused buttons naturally
        if ((e.key === ' ' || e.key === 'Space') && (activeTag === 'button' || activeEl?.getAttribute('role') === 'button')) {
          return;
        }

        const scrollKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', ' ', 'Home', 'End'];
        if (!scrollKeys.includes(e.key)) {
          return;
        }

        const targetContainer = findActiveVerticalScrollContainer() || (document.scrollingElement as HTMLElement);
        if (!targetContainer) return;

        let deltaY = 0;
        if (e.key === 'ArrowDown') deltaY = 120;
        else if (e.key === 'ArrowUp') deltaY = -120;
        else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) || (e.key === 'Space' && !e.shiftKey))
          deltaY = (targetContainer.clientHeight || window.innerHeight) * 0.85;
        else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) || (e.key === 'Space' && e.shiftKey))
          deltaY = -(targetContainer.clientHeight || window.innerHeight) * 0.85;
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

      const handleGlobalWheelScroll = (e: WheelEvent) => {
        if (e.defaultPrevented || e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          return;
        }

        const targetEl = e.target instanceof HTMLElement ? e.target : null;
        if (!targetEl) return;

        const activeTag = targetEl.tagName.toLowerCase();
        if (activeTag === 'textarea' || activeTag === 'select') return;

        // Check if cursor is already inside a vertically scrollable element that can scroll in this direction
        let cur: HTMLElement | null = targetEl;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          if (cur.getAttribute('data-horizontal-scroll') !== 'true') {
            const canScrollVertically = cur.scrollHeight > cur.clientHeight + 1;
            if (canScrollVertically) {
              const inlineOverflowY = cur.style?.overflowY;
              const isScrollNode =
                inlineOverflowY === 'auto' ||
                inlineOverflowY === 'scroll' ||
                cur.classList.contains('r-overflowY-156q2ks') ||
                window.getComputedStyle(cur).overflowY === 'auto' ||
                window.getComputedStyle(cur).overflowY === 'scroll';

              if (isScrollNode) {
                const canScrollDown = e.deltaY > 0 && cur.scrollTop + cur.clientHeight < cur.scrollHeight - 1;
                const canScrollUp = e.deltaY < 0 && cur.scrollTop > 0;
                if (canScrollDown || canScrollUp) {
                  // Native wheel scrolling will handle this container directly
                  return;
                }
              }
            }
          }
          cur = cur.parentElement;
        }

        // Only forward wheel events when inside the main work area, an open modal, or when no desktop shell is present
        const inModal = Boolean(targetEl.closest('[aria-modal="true"]'));
        const mainWorkArea = document.querySelector('[data-main-work-area="true"]');
        const inMainArea = !mainWorkArea || mainWorkArea.contains(targetEl);
        if (!inModal && !inMainArea) {
          return;
        }

        const fallbackScroller = findActiveVerticalScrollContainer();
        if (fallbackScroller && fallbackScroller.scrollHeight > fallbackScroller.clientHeight + 1) {
          fallbackScroller.scrollBy({ top: e.deltaY, behavior: 'auto' });
        }
      };

      window.addEventListener('keydown', handleGlobalKeyboardScroll, { passive: false });
      window.addEventListener('wheel', handleGlobalWheelScroll, { passive: true });
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyboardScroll);
        window.removeEventListener('wheel', handleGlobalWheelScroll);
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
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ThemeProvider>
                <LiquidGlassProvider>
                  <ToastProvider>
                    <FeatureFlagsProvider>
                      <RolePermissionsProvider>
                        <AppShell />
                      </RolePermissionsProvider>
                    </FeatureFlagsProvider>
                  </ToastProvider>
                </LiquidGlassProvider>
              </ThemeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
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
  useActivityTracker();
  const { isLoading } = useFeatureFlags();
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    addBreadcrumb('navigation', `-> ${pathname}`);
  }, [pathname]);

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
    <ErrorBoundary>
      <StatusBarForTheme />
      <ImpersonationBanner />
      <OfflineBanner />
      <MinorConsentBanner />
      <MaintenanceGate>
        <Slot />
      </MaintenanceGate>
      <ReConsentGate />
      <DateOfBirthPromptGate />
      <AlertHost />
      <AppLockOverlay />
      <PullToRefresh />
      <PwaInstallPrompt />
      {user && <IncomingCallListener />}
    </ErrorBoundary>
  );
}
