import type * as Native from './push';

export type { PushRegistrationResult } from './push';

// Web only. expo-notifications (with expo-device, expo-application and ua-parser-js) is ~110 KB of the first-load
// bundle but is only needed once the user is signed in or taps a notification, so it is loaded on first use instead.
// The behaviour is the one of ./push.ts; iOS/Android keep importing that file directly.
const loadImpl = () => import('./push.ts');

export function registerForPushNotificationsAsync(): ReturnType<typeof Native.registerForPushNotificationsAsync> {
  return loadImpl().then((impl) => impl.registerForPushNotificationsAsync());
}

export function addNotificationResponseListener(
  onDeepLink: Parameters<typeof Native.addNotificationResponseListener>[0],
): ReturnType<typeof Native.addNotificationResponseListener> {
  let removed = false;
  let subscription: { remove: () => void } | null = null;
  loadImpl()
    .then((impl) => {
      if (!removed) subscription = impl.addNotificationResponseListener(onDeepLink);
    })
    .catch(() => {
      // The notification module is unavailable (offline on first use): taps simply do not deep-link.
    });
  return {
    remove: () => {
      removed = true;
      subscription?.remove();
      subscription = null;
    },
  } as ReturnType<typeof Native.addNotificationResponseListener>;
}
