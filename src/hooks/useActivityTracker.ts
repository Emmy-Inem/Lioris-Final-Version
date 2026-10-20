import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { recordUserActivity } from '@/api/analytics';
import { getStoredPref, setStoredPref } from '@/utils/biometrics';
import { normalizeAnalyticsPath } from '@/utils/analyticsPath';

/** Secure-storage key for the analytics opt-out switch. Absent or anything but 'true' means tracking is on. */
export const ANALYTICS_OPT_OUT_KEY = 'lioris_analytics_opt_out';

/** At most one heartbeat per 15 minutes, and only while the app is in the foreground. */
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

let optOutCache: boolean | null = null;

async function isAnalyticsOptedOut(): Promise<boolean> {
  if (optOutCache !== null) return optOutCache;
  try {
    optOutCache = (await getStoredPref(ANALYTICS_OPT_OUT_KEY)) === 'true';
  } catch {
    optOutCache = false;
  }
  return optOutCache;
}

/** Turns analytics collection off (true) or back on (false) for this device. Takes effect immediately. */
export async function setAnalyticsOptOut(optOut: boolean): Promise<void> {
  optOutCache = optOut;
  await setStoredPref(ANALYTICS_OPT_OUT_KEY, optOut ? 'true' : 'false');
}

/** Current opt-out state, for a Settings toggle. */
export async function getAnalyticsOptOut(): Promise<boolean> {
  return isAnalyticsOptedOut();
}

async function track(event: Parameters<typeof recordUserActivity>[0]): Promise<void> {
  if (await isAnalyticsOptedOut()) return;
  await recordUserActivity(event);
}

export function useActivityTracker() {
  const pathname = usePathname();
  const { user, impersonation } = useAuth();
  const lastPathRef = useRef<string | null>(null);
  // The user id the current session_start was recorded for (null: none yet).
  const sessionStartedForRef = useRef<string | null>(null);
  // An admin viewing as a member must not generate that member's activity.
  const suppressed = impersonation.active;
  const userId = user?.id ?? null;

  // Track session start once per signed-in account (a different account on the same device starts a new one).
  useEffect(() => {
    if (!userId) {
      sessionStartedForRef.current = null;
      return;
    }
    if (suppressed || sessionStartedForRef.current === userId) return;
    sessionStartedForRef.current = userId;
    track({
      eventType: 'session_start',
      name: 'app_launch',
      metadata: { role: user?.role },
    }).catch(() => {});
  }, [userId, user?.role, suppressed]);

  // Track page views on route transitions. Dynamic segments become placeholders (/messages/[id]) so object
  // ids never reach analytics.
  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return undefined;
    lastPathRef.current = pathname;
    if (suppressed) return undefined;

    // Small timeout to avoid tracking intermediate redirect states
    const timer = setTimeout(() => {
      track({
        eventType: 'page_view',
        name: normalizeAnalyticsPath(pathname),
      }).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [pathname, suppressed]);

  // Heartbeat: every 15 minutes at most, and only while the app is foregrounded.
  useEffect(() => {
    if (!userId || suppressed) return undefined;

    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      track({
        eventType: 'feature_use',
        name: 'heartbeat',
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [userId, suppressed]);
}
