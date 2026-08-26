import { Platform } from'react-native';
import * as Notifications from'expo-notifications';
import * as Device from'expo-device';
import Constants from'expo-constants';
import { registerDevicePushToken } from'@/api/notifications';

Notifications.setNotificationHandler({
 handleNotification: async () => ({
 shouldShowAlert: true,
 shouldPlaySound: false,
 shouldSetBadge: true,
 shouldShowBanner: true,
 shouldShowList: true,
 }),
});

/**
 * Requests permission and registers the device's Expo push token with
 * the backend Notification Service (PRD Section 12.3). Call this after
 * login rather than on cold start - PRD's"Useful over noisy"principle
 * favors asking for permission at a moment tied to clear user benefit
 * (e.g. right after enabling notifications in onboarding) over an
 * immediate app-launch prompt.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
 if (!Device.isDevice) {
 // Push tokens aren't available on simulators/emulators.
 return null;
 }

 const { status: existingStatus } = await Notifications.getPermissionsAsync();
 let finalStatus = existingStatus;

 if (existingStatus !== 'granted') {
 const { status } = await Notifications.requestPermissionsAsync();
 finalStatus = status;
 }

 if (finalStatus !== 'granted') {
 return null;
 }

 if (Platform.OS === 'android') {
 // Separate channels so"critical"emergency broadcasts (PRD Section 17)
 // can use max importance/bypass-DND, distinct from routine notifications.
 await Notifications.setNotificationChannelAsync('default', {
 name: 'General',
 importance: Notifications.AndroidImportance.DEFAULT,
 });
 await Notifications.setNotificationChannelAsync('critical', {
 name: 'Emergency Alerts',
 importance: Notifications.AndroidImportance.MAX,
 sound: 'default',
 vibrationPattern: [0, 250, 250, 250],
 });
 }

 const projectId = Constants.expoConfig?.extra?.eas?.projectId;
 const tokenResponse = await Notifications.getExpoPushTokenAsync(
 projectId ? { projectId } : undefined,
 );

 await registerDevicePushToken(tokenResponse.data);
 return tokenResponse.data;
}

/**
 * Wires notification-tap handling to expo-router deep links. Mount once
 * near the app root (see app/_layout.tsx).
 */
export function addNotificationResponseListener(
 onDeepLink: (path: string) => void,
) {
 return Notifications.addNotificationResponseReceivedListener((response) => {
 const path = response.notification.request.content.data?.deepLinkPath as
 | string
 | undefined;
 if (path) onDeepLink(path);
 });
}
