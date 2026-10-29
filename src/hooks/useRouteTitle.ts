import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { routeTitle } from '@/utils/routeTitle';

/**
 * Web only: keeps the browser tab title in step with the current route (see src/utils/routeTitle.ts for the
 * mapping and the privacy rules). Mount once, near the root. The public legal pages map to the same titles
 * public/pwa-boot.js already set before the app booted, so there is nothing to fight over.
 */
export function useRouteTitle(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = routeTitle(pathname);
  }, [pathname]);
}
