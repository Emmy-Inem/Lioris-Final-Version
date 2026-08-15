import { Platform } from'react-native';
import * as Haptics from'expo-haptics';

/**
 * Thin wrapper around expo-haptics — the library wasn't installed at
 * all before this pass, so no interaction in the app had haptic
 * feedback. Guards against web (where there's no haptic engine and
 * calling these would throw/no-op unpredictably depending on platform
 * implementation) by just skipping there instead.
 */
export const haptics = {
  /** Light tap — toggles like RSVP, like/upvote, wishlist. */
  light() {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Slightly stronger tap — sending a message, publishing a post/event. */
  medium() {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** Success confirmation — MFA verified, verification approved, booking confirmed. */
  success() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** Error confirmation — failed message send, invalid code, failed submission. */
  error() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
