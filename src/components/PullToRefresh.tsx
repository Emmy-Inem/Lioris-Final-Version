import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';

const THRESHOLD = 68; // px of pull needed to trigger a refresh
const MAX_PULL = 120;
const RESISTANCE = 0.5;
const HOLD_MS = 700; // the spinner is always visible for at least this long
const STYLE_ID = 'lioris-pull-to-refresh-css';

/**
 * Lets a screen whose data is not backed by React Query (plain useEffect fetches) take part in
 * pull-to-refresh: while it is mounted, a completed pull calls `refresh` instead of reloading
 * the page. Most recently mounted handler wins. No-op outside the web app.
 */
type PullRefreshHandler = () => Promise<unknown> | unknown;
const pullRefreshHandlers: PullRefreshHandler[] = [];

export function usePullRefreshHandler(refresh: PullRefreshHandler) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler: PullRefreshHandler = () => latest.current();
    pullRefreshHandlers.push(handler);
    return () => {
      const index = pullRefreshHandlers.indexOf(handler);
      if (index >= 0) pullRefreshHandlers.splice(index, 1);
    };
  }, []);
}

/**
 * Drag-down-to-refresh for the web app.
 *
 * react-native-web's <RefreshControl> renders nothing, and an installed (standalone)
 * PWA has no browser chrome, so there was no way to pull to refresh at all. This
 * listens for touch drags that start while the scrolled area under the finger is at
 * the very top, shows a spinner, then refetches the active data queries (or reloads
 * the page when the current screen has none to refetch).
 */
export function PullToRefresh() {
  if (Platform.OS !== 'web') return null;
  return <PullToRefreshInner />;
}

function PullToRefreshInner() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const spinnerRef = useRef<SVGSVGElement | null>(null);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '@keyframes lioris-ptr-spin{to{transform:rotate(360deg)}}' +
        '.lioris-ptr-spinning{animation:lioris-ptr-spin .8s linear infinite}';
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    let refreshing = false;
    let distance = 0;

    const indicator = () => indicatorRef.current;
    const spinner = () => spinnerRef.current;

    const paint = (pull: number, animate: boolean) => {
      const el = indicator();
      if (!el) return;
      const progress = Math.min(pull / THRESHOLD, 1);
      el.style.transition = animate ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease' : 'none';
      el.style.opacity = pull > 4 || refreshing ? '1' : '0';
      el.style.transform = `translate3d(-50%, ${pull - 56}px, 0) scale(${0.6 + progress * 0.4})`;
      const s = spinner();
      if (s && !refreshing) s.style.transform = `rotate(${progress * 270}deg)`;
    };

    const isInsideBlocked = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== document.body) {
        if (node.getAttribute?.('aria-modal') === 'true' || node.getAttribute?.('data-no-pull-refresh') === 'true') {
          return true;
        }
        const tag = node.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable) return true;
        node = node.parentElement;
      }
      return false;
    };

    /** True when every scrollable ancestor of the touch is scrolled to its very top. */
    const atTop = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== document.documentElement) {
        if (node.scrollHeight > node.clientHeight + 1) {
          const overflowY = window.getComputedStyle(node).overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollTop > 0) return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const finish = () => {
      refreshing = false;
      pulling = false;
      distance = 0;
      const s = spinner();
      s?.classList.remove('lioris-ptr-spinning');
      paint(0, true);
    };

    const runRefresh = async () => {
      refreshing = true;
      distance = THRESHOLD;
      spinner()?.classList.add('lioris-ptr-spinning');
      paint(THRESHOLD, true);
      try {
        const client = queryClientRef.current;
        const handler = pullRefreshHandlers[pullRefreshHandlers.length - 1];
        const activeQueries = client.getQueryCache().findAll({ type: 'active' });
        if (!handler && activeQueries.length === 0) {
          // Nothing on this screen can refresh itself, so a reload is the only way to refresh it.
          setTimeout(() => window.location.reload(), 250);
          return;
        }
        await Promise.all([
          client.refetchQueries({ type: 'active' }),
          Promise.resolve(handler?.()),
          new Promise((resolve) => setTimeout(resolve, HOLD_MS)),
        ]);
      } catch {
        // A failed refetch is shown by the screen itself; the spinner just stops.
      }
      finish();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1 || isInsideBlocked(e.target)) {
        tracking = false;
        return;
      }
      tracking = atTop(e.target);
      pulling = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || refreshing) return;
      const touch = e.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;

      if (!pulling) {
        // Wait until the gesture clearly goes down; anything sideways or upward is a normal scroll.
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > 8 || dy < -8) tracking = false;
          return;
        }
        if (dy < 8) return;
        pulling = true;
      }

      // No preventDefault here on purpose: at the top of a scroller a downward drag has nothing to scroll
      // (and html/body have overscroll-behavior: none), and a non-passive touchmove listener on the
      // whole document would force the browser to wait for this code on every scroll frame.
      distance = Math.min(Math.max(dy - 8, 0) * RESISTANCE, MAX_PULL);
      paint(distance, false);
    };

    const onTouchEnd = () => {
      if (!tracking && !pulling) return;
      tracking = false;
      if (!pulling) return;
      if (distance >= THRESHOLD) {
        void runRefresh();
      } else {
        finish();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: '50%',
        width: 40,
        height: 40,
        borderRadius: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
        opacity: 0,
        transform: 'translate3d(-50%, -56px, 0) scale(0.6)',
        pointerEvents: 'none',
        zIndex: 10000,
        willChange: 'transform, opacity',
      }}
    >
      <svg ref={spinnerRef} width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ transformOrigin: '50% 50%' }}>
        <circle cx="12" cy="12" r="9" stroke={colors.border} strokeWidth="2.5" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke={colors.brandPrimary} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
