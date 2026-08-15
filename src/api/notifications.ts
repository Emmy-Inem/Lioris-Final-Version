import { api } from'./client';
import { AppNotification } from'./types';
import { mockNotifications } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';

let notificationsState = [...mockNotifications];

export interface CreateNotificationPayload {
  type: AppNotification['type'];
  title: string;
  body: string;
  deepLinkPath?: string;
}

// Not in PRD Section 15.5's excerpted read/mutate-status endpoints —
// those assume notifications already exist. This is the missing
// piece: previously nothing anywhere in the app ever called anything
// that created one, so the list was pure static seed data for the
// entire session regardless of what the user actually did (sent a
// connection request, got verified, etc.). Called from the specific
// actions where a notification is the obviously-expected outcome
// (see connections.ts, verification.ts) — deliberately not wired into
// every conceivable trigger (e.g. new chat messages, which already
// surface via ConversationRow's own unread badge instead).
export function createNotification(payload: CreateNotificationPayload): AppNotification {
  const notification: AppNotification = {
    id: `mock-notif-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    channel: 'in_app',
    deliveryStatus: 'delivered',
    openedAt: null,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  notificationsState = [notification, ...notificationsState];
  return notification;
}

export interface NotificationsQuery {
  status?: 'unread' | 'read';
  type?: AppNotification['type'];
}

// GET /notifications?status=&type= — PRD Section 15.5
export async function listNotifications(
  query: NotificationsQuery = {},
): Promise<AppNotification[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: AppNotification[] }>('/notifications', {
      params: query,
    });
    return data.items;
  }, notificationsState);
}

// PATCH /notifications/{id}/read — PRD Section 15.5
export async function markNotificationRead(id: string) {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.patch(`/notifications/${id}/read`);
    return data;
  }
  try {
    const { data } = await api.patch(`/notifications/${id}/read`);
    return data;
  } catch {
    const openedAt = new Date().toISOString();
    notificationsState = notificationsState.map((n) => (n.id === id ? { ...n, openedAt } : n));
    return { id, openedAt };
  }
}

// "Read All" — marks every notification as opened.
export async function markAllNotificationsRead() {
  if (!FALL_BACK_TO_MOCKS) {
    await api.patch('/notifications/read-all');
    return;
  }
  try {
    await api.patch('/notifications/read-all');
  } catch {
    const openedAt = new Date().toISOString();
    notificationsState = notificationsState.map((n) => ({ ...n, openedAt: n.openedAt ?? openedAt }));
  }
}

// "Clear" — removes every notification from the list.
export async function clearAllNotifications() {
  if (!FALL_BACK_TO_MOCKS) {
    await api.delete('/notifications');
    return;
  }
  try {
    await api.delete('/notifications');
  } catch {
    notificationsState = [];
  }
}

// Ported from NotificationsScreen's per-item delete (×) button
// (AdminAndOther.kt) — removes the notification from the local list.
export async function deleteNotification(id: string) {
  if (!FALL_BACK_TO_MOCKS) {
    await api.delete(`/notifications/${id}`);
    return;
  }
  try {
    await api.delete(`/notifications/${id}`);
  } catch {
    notificationsState = notificationsState.filter((n) => n.id !== id);
  }
}

// Registers the device's Expo push token with the Notification Service
// (see src/notifications/registerPushToken.ts for the client-side flow).
export async function registerDevicePushToken(expoPushToken: string) {
  await api.post('/notifications/devices', { expoPushToken }).catch(() => {
    // Non-fatal in dev/mock mode.
  });
}
