import { router } from 'expo-router';

/**
 * `router.back()` does nothing when the screen was opened without history (a shared link, a reload, a new tab):
 * the "Back" control then looks dead. Go to `fallback` in that case.
 */
export function goBackOr(fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}
