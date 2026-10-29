import { lazyWeb } from './lazyWeb';
import type { NotificationsScreen as NotificationsScreenImpl } from './NotificationsList';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./NotificationsList.tsx.
export const NotificationsScreen = lazyWeb<typeof NotificationsScreenImpl>(() => import('./NotificationsList.tsx').then((m) => m.NotificationsScreen), { screen: true });
