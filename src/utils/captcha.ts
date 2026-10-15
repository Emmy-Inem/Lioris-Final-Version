import { Platform } from 'react-native';

/**
 * Whether sign-in / sign-up / password-reset must show the Turnstile check on THIS platform.
 *
 * Supabase's CAPTCHA protection applies to every client, so when it is ON the phone apps need the widget too
 * (it is rendered in a WebView, see TurnstileWidget.native.tsx). If the project's CAPTCHA protection is turned
 * OFF in the Supabase dashboard, build with EXPO_PUBLIC_DISABLE_NATIVE_CAPTCHA=1 to hide it on phones.
 */
export function captchaRequired(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_DISABLE_NATIVE_CAPTCHA !== '1';
}
