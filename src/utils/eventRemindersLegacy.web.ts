// Web only: older app versions never scheduled device notifications in the browser, so there is nothing to cancel and
// expo-notifications (~40 KB) stays out of the first-load bundle.
export async function cancelLegacyDeviceReminders(_markers: string[]): Promise<void> {}
export async function cancelAllScheduledDeviceNotifications(): Promise<void> {}
