import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const STORAGE_KEY = 'lioris.reduceMotionOverride';

// Module-level so every mounted useReducedMotion() instance updates together
// the moment Settings changes the override, without routing through context.
let memoryOverride: boolean | null = null;
let loaded = false;
const listeners = new Set<(v: boolean | null) => void>();

async function loadOverride(): Promise<boolean | null> {
  if (loaded) return memoryOverride;
  try {
    const raw = isWeb
      ? typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null
      : await SecureStore.getItemAsync(STORAGE_KEY);
    memoryOverride = raw === 'on' ? true : raw === 'off' ? false : null;
  } catch {
    memoryOverride = null;
  }
  loaded = true;
  return memoryOverride;
}

/** null = follow the OS/browser setting (default); true/false = explicit in-app override. */
export async function setReducedMotionOverride(value: boolean | null): Promise<void> {
  memoryOverride = value;
  loaded = true;
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') {
        if (value === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
      }
    } else if (value === null) {
      await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, value ? 'on' : 'off');
    }
  } catch {}
  listeners.forEach((l) => l(memoryOverride));
}

export function getReducedMotionOverride(): boolean | null {
  return memoryOverride;
}

/**
 * True when motion should be reduced (WCAG 2.1 SC 2.3.3 / prefers-reduced-motion).
 * An explicit in-app override (Settings > Accessibility) always wins; otherwise
 * this reflects the OS / browser setting. Decorative animations should be
 * skipped or made static when this is true.
 */
export function useReducedMotion(): boolean {
  const [reducedOS, setReducedOS] = useState(false);
  const [override, setOverride] = useState<boolean | null>(memoryOverride);

  useEffect(() => {
    let cancelled = false;
    let removeWebListener: (() => void) | undefined;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedOS(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReducedOS(e.matches);
      mq.addEventListener?.('change', onChange);
      removeWebListener = () => mq.removeEventListener?.('change', onChange);
    } else {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((v) => {
          if (!cancelled) setReducedOS(v);
        })
        .catch(() => {});
    }

    const sub = Platform.OS === 'web' ? undefined : AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedOS);

    return () => {
      cancelled = true;
      removeWebListener?.();
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOverride().then((v) => {
      if (!cancelled) setOverride(v);
    });
    const listener = (v: boolean | null) => setOverride(v);
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return override !== null ? override : reducedOS;
}
