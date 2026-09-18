import { Linking, Platform } from 'react-native';
import { isSafeContactLink, isSafeHttpUrl } from './safeUrl';

/**
 * Opens an http(s) URL in the system browser / a new tab.
 * Returns false (and does nothing) for unsafe URLs or when opening fails.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false;
  const target = url.trim();
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(target, '_blank', 'noopener,noreferrer');
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
    await Linking.openURL(url.trim());
    return true;
  } catch {
    return false;
  }
}
