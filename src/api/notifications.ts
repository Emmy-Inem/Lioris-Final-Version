import { supabase } from './supabase';
import { AppNotification } from './types';
import { mockNotifications } from './mockData';
import { getSessionUser } from '../auth/tokenStorage';

let notificationsState = [...mockNotifications];

export interface CreateNotificationPayload {
  type: AppNotification['type'];
  title: string;
  body: string;
  deepLinkPath?: string;
  recipientId?: string;
  senderId?: string;
}

export async function createNotification(payload: CreateNotificationPayload): Promise<AppNotification> {
  const notifId = `notif-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const now = new Date().toISOString();

  // Resolve authentic sender and recipient identities
  let currentUserId: string | null = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      currentUserId = authData.user.id;
    } else {
      const stored = await getSessionUser();
      if (stored?.id) currentUserId = stored.id;
    }
  } catch {
    // fallback
  }

  const targetRecipientId = payload.recipientId || currentUserId || 'me';
  const notificationSenderId = payload.senderId || currentUserId || null;

  const notification: AppNotification = {
    id: notifId,
    channel: 'in_app',
    deliveryStatus: 'delivered',
    openedAt: null,
    createdAt: now,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    deepLinkPath: payload.deepLinkPath,
  };
  notificationsState = [notification, ...notificationsState];

  try {
    const { error } = await supabase.from('notifications').insert({
      id: notifId,
      recipient_id: targetRecipientId,
      sender_id: notificationSenderId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      action_url: payload.deepLinkPath,
      is_read: false,
    });
    if (error) {
      console.warn('[Notifications] Supabase persistence error:', error.message);
    }
  } catch (err) {
    console.warn('[Notifications] Failed to reach backend:', err);
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
        deepLinkPath: row.action_url,
        deliveryStatus: 'delivered',
        openedAt: row.is_read ? row.created_at : null,
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
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  } catch {
    // Fallback
  }
  return { id, openedAt };
}

export async function markAllNotificationsRead() {
  const openedAt = new Date().toISOString();
  notificationsState = notificationsState.map((n) => ({ ...n, openedAt }));
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  } catch {
    // Fallback
  }
  return { success: true, count: notificationsState.length };
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
