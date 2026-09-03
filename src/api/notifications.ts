import { supabase } from './supabase';
import { AppNotification } from './types';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

// Real notifications only (db-fetched or locally created) - never seeded
// with mockData.ts fixtures. Fixtures only ever come from getMockPool()
// below, and only while the admin's "Mock Data Visibility" toggle is on.
let localNotificationsCache: AppNotification[] = [];



export interface CreateNotificationPayload {
 type: AppNotification['type'];
 title: string;
 body: string;
 deepLinkPath?: string;
 recipientId?: string;
 senderId?: string;
}

export async function createNotification(payload: CreateNotificationPayload): Promise<AppNotification> {
 const notifId = generateUUID();
 const now = new Date().toISOString();

 // Resolve authentic sender identity
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

 const targetRecipientId = payload.recipientId;
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

 try {
 if (targetRecipientId) {
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
 } else {
 // Broadcast to all active profiles
 const { data: profiles } = await supabase.from('profiles').select('id').limit(100);
 if (profiles && profiles.length > 0) {
 const rows = profiles.map((p) => ({
 recipient_id: p.id,
 sender_id: notificationSenderId,
 title: payload.title,
 body: payload.body,
 type: payload.type || 'system_announcement',
 action_url: payload.deepLinkPath,
 is_read: false,
 }));
 await supabase.from('notifications').insert(rows);
 }
 }
 } catch (err) {
 console.warn('[Notifications] Failed to reach backend:', err);
 }

 // This is fire-and-forget infrastructure used by other create flows
 // (announcements, messaging, etc.) that already surface their own
 // errors - it intentionally never throws so a failed "notify people"
 // side-effect can't sink an otherwise-successful primary action. Only
 // cache it locally when it's actually for the current viewer.
 if (targetRecipientId && targetRecipientId === currentUserId) {
 localNotificationsCache = [notification, ...localNotificationsCache];
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
 const { data: authData } = await supabase.auth.getUser();
 const uid = authData?.user?.id;

 if (!uid) throw new Error('Not signed in');

 const { data, error } = await supabase
 .from('notifications')
 .select('*')
 .eq('recipient_id', uid)
 .order('created_at', { ascending: false });

 if (error) throw error;

 const dbNotifs: AppNotification[] = (data ?? []).map((row: any) => ({
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

 // Merge unique - local cache only ever contributes this session's own
 // just-created notifications (always) plus seed fixtures (only when the
 // admin mock-data toggle is on).
 const merged = [...dbNotifs];
 for (const n of [...localNotificationsCache]) {
 if (!merged.some((m) => m.id === n.id)) {
 merged.push(n);
 }
 }
 return query.status === 'unread' ? merged.filter((n) => !n.openedAt) : merged;
 } catch (err) {
 console.warn('[Notifications] listNotifications failed, showing local pool only:', err);
 const pool = [...localNotificationsCache];
 return query.status === 'unread' ? pool.filter((n) => !n.openedAt) : pool;
 }
}

export async function markNotificationRead(id: string) {
 const openedAt = new Date().toISOString();
 localNotificationsCache = localNotificationsCache.map((n) => (n.id === id ? { ...n, openedAt } : n));
 try {
 await supabase.from('notifications').update({ is_read: true }).eq('id', id);
 } catch {
 // Fallback
 }
 return { id, openedAt };
}

export async function markAllNotificationsRead() {
 const openedAt = new Date().toISOString();
 localNotificationsCache = localNotificationsCache.map((n) => ({ ...n, openedAt }));
 try {
 const { data: authData } = await supabase.auth.getUser();
 const uid = authData?.user?.id;
 if (uid) {
 await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', uid).eq('is_read', false);
 }
 } catch {
 // Fallback
 }
 return { success: true, count: localNotificationsCache.length };
}

export async function clearAllNotifications() {
 localNotificationsCache = [];
 try {
 const { data: authData } = await supabase.auth.getUser();
 const uid = authData?.user?.id;
 if (uid) {
 await supabase.from('notifications').delete().eq('recipient_id', uid);
 }
 } catch {
 // Fallback
 }
}

export async function deleteNotification(id: string) {
 localNotificationsCache = localNotificationsCache.filter((n) => n.id !== id);
 try {
 await supabase.from('notifications').delete().eq('id', id);
 } catch {
 // Fallback
 }
}

export async function registerDevicePushToken(token: string): Promise<void> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let userId = authData?.user?.id;
 if (!userId) {
 const stored = await getSessionUser();
 if (stored?.id) userId = stored.id;
 }
 if (userId) {
 const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
 if (error) console.warn('[Notifications] Register push token error:', error.message);
 }
 } catch (err) {
 console.warn('[Notifications] Push token error:', err);
 }
}
