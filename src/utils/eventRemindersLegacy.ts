/** Cancels notifications an older app version scheduled on this device, so the server's reminder is the only one. */
export async function cancelLegacyDeviceReminders(markers: string[]): Promise<void> {
  if (typeof localStorage !== 'undefined' || markers.length === 0) return;
  try {
    const Notifications = require('expo-notifications');
    await Promise.all(markers.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  } catch {
    // notifications unavailable: nothing was scheduled by the OS
  }
}

/** Stops this device from firing the previous account's scheduled alerts (they live in the OS scheduler). */
export async function cancelAllScheduledDeviceNotifications(): Promise<void> {
  try {
    const Notifications = require('expo-notifications');
    if (typeof localStorage === 'undefined') await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // web / test runner / notifications unavailable: nothing is scheduled by the OS
  }
}
