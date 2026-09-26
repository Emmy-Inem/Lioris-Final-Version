import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { recordUserActivity } from '@/api/analytics';

export function useActivityTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastPathRef = useRef<string | null>(null);
  const sessionStartedRef = useRef(false);

  // Track session start once when user is signed in
  useEffect(() => {
    if (user?.id && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      recordUserActivity({
        eventType: 'session_start',
        name: 'app_launch',
        metadata: { role: user.role },
      }).catch(() => {});
    }
  }, [user?.id, user?.role]);

  // Track page views on route transitions
  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    // Small timeout to avoid tracking intermediate redirect states
    const timer = setTimeout(() => {
      recordUserActivity({
        eventType: 'page_view',
        name: pathname,
      }).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [pathname]);

  // Periodic heartbeat every 5 minutes while app is alive
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      recordUserActivity({
        eventType: 'feature_use',
        name: 'heartbeat',
      }).catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id]);
}
