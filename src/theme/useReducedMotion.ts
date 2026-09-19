import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * True when the user asked the OS / browser to reduce motion
 * (WCAG 2.1 SC 2.3.3 / prefers-reduced-motion). Decorative animations should
 * be skipped or made static when this is true.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let removeWebListener: (() => void) | undefined;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener?.('change', onChange);
      removeWebListener = () => mq.removeEventListener?.('change', onChange);
    } else {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((v) => {
          if (!cancelled) setReduced(v);
        })
        .catch(() => {});
    }

    const sub = Platform.OS === 'web' ? undefined : AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      cancelled = true;
      removeWebListener?.();
      sub?.remove();
    };
  }, []);

  return reduced;
}
