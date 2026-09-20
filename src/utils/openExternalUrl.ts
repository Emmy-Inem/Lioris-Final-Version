import { Linking, Platform } from 'react-native';
import { isSafeContactLink, isSafeHttpUrl } from './safeUrl';

/**
 * Removes focus from whatever is currently focused. Web only; a no-op everywhere else.
 *
 * react-native-web renders pressables as focusable elements. When one that leads somewhere is tapped
 * and a new tab opens, the browser leaves its URL bubble pinned to the bottom-left of the ORIGINAL
 * page, and because that page never receives another interaction the bubble never clears. Dropping
 * focus dismisses it, and also stops hover/pressed styling sticking on touch devices.
 *
 * Exported so screens that open links some other way can clear the same bubble.
 */
export function blurActiveElement(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  try {
    const el = document.activeElement as { blur?: () => void } | null;
    if (el && typeof el.blur === 'function') el.blur();
  } catch {
    // a focus quirk must never stop a link from opening
  }
}

/**
 * Opens an http(s) URL in the system browser / a new tab.
 * Returns false (and does nothing) for unsafe URLs or when opening fails.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false;
  const target = url.trim();
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      blurActiveElement();
      window.open(target, '_blank', 'noopener,noreferrer');
      // Some engines hand focus back to the opener's last active element once the tab exists.
      setTimeout(blurActiveElement, 0);
      return true;
    }
    await Linking.openURL(target);
    return true;
  } catch {
    return false;
  }
}

/** Opens an explicit mailto:/tel: contact link. Nothing else is allowed. */
export async function openContactLink(url: string): Promise<boolean> {
  if (!isSafeContactLink(url)) return false;
  try {
    blurActiveElement();
    await Linking.openURL(url.trim());
    return true;
  } catch {
    return false;
  }
}
