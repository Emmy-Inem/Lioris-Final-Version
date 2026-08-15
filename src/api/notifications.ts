import { supabase } from './supabase';
import { AppNotification } from './types';
import { mockNotifications } from './mockData';

let notificationsState = [...mockNotifications];

export interface CreateNotificationPayload {
  type: AppNotification['type'];
  title: string;
  body: string;
  deepLinkPath?: string;
}

export function createNotification(payload: CreateNotificationPayload): AppNotification {
  const notifId = `notif-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const now = new Date().toISOString();
  const notification: AppNotification = {
    id: notifId,
    channel: 'in_app',
    deliveryStatus: 'delivered',
    openedAt: null,
    createdAt: now,
    ...payload,
  };
  notificationsState = [notification, ...notificationsState];

  try {
    supabase.from('notifications').insert({
      id: notifId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      deep_link: payload.deepLinkPath,
    });
  } catch {
    // Session fallback
  }

  return notification;
}

export interface NotificationsQuery {
  status?: 'unread' | 'read';
  type?: AppNotification['type'];
}

export async function listNotifications(
  query: NotificationsQuery = {},
): Promise<AppNotification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbNotifs: AppNotification[] = data.map((row: any) => ({
        id: row.id,
        channel: 'in_app',
        type: row.type || 'system_announcement',
        title: row.title,
        body: row.body,
        deepLinkPath: row.deep_link,
        deliveryStatus: 'delivered',
        openedAt: row.read_at,
        createdAt: row.created_at,
      }));
      // Merge unique
      const merged = [...dbNotifs];
      for (const n of notificationsState) {
        if (!merged.some((m) => m.id === n.id)) {
          merged.push(n);
        }
      }
      notificationsState = merged;
      return query.status === 'unread' ? merged.filter((n) => !n.openedAt) : merged;
    }
  } catch {
    // Session fallback
  }

  if (query.status === 'unread') {
    return notificationsState.filter((n) => !n.openedAt);
  }
  return notificationsState;
}

export async function markNotificationRead(id: string) {
  const openedAt = new Date().toISOString();
  notificationsState = notificationsState.map((n) => (n.id === id ? { ...n, openedAt } : n));
  try {
    await supabase.from('notifications').update({ read_at: openedAt }).eq('id', id);
  } catch {
    // Fallback
  }
  return { id, openedAt };
}

export async function markAllNotificationsRead() {
  const openedAt = new Date().toISOString();
  notificationsState = notificationsState.map((n) => ({ ...n, openedAt: n.openedAt ?? openedAt }));
  try {
    await supabase.from('notifications').update({ read_at: openedAt });
  } catch {
    // Fallback
  }
}

export async function clearAllNotifications() {
  notificationsState = [];
}

export async function deleteNotification(id: string) {
  notificationsState = notificationsState.filter((n) => n.id !== id);
}

export async function registerDevicePushToken(token: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ push_token: token }).eq('id', 'me');
  } catch {
    // Session fallback
  }
}
