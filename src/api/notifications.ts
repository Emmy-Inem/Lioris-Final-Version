import { Platform } from 'react-native';
import { supabase } from './supabase';
import { AppNotification } from './types';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isViewedNotificationExpired, VIEWED_NOTIFICATION_RETENTION_MS } from '../utils/notificationExpiry';

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
 /** Broadcast only: limit the audience to one campus (profiles.campus_code). Omit for everyone. */
 campusCode?: string;
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
 // Broadcast to all active profiles - paginate through every page of
 // profiles (instead of a single capped page) so campuses with more
 // than one page of users don't silently lose everyone past the cap.
 const pageSize = 1000;
 let offset = 0;
 const allProfileIds: string[] = [];
 for (;;) {
 let pageQuery = supabase.from('profiles').select('id');
 if (payload.campusCode && payload.campusCode !== 'ALL') {
 pageQuery = pageQuery.eq('campus_code', payload.campusCode);
 }
 const { data: page, error: pageError } = await pageQuery.range(offset, offset + pageSize - 1);
 if (pageError) {
 console.warn('[Notifications] Broadcast profile page fetch error:', pageError.message);
 break;
 }
 if (!page || page.length === 0) break;
 allProfileIds.push(...page.map((p) => p.id));
 if (page.length < pageSize) break;
 offset += pageSize;
 }

 if (allProfileIds.length > 0) {
 const rows = allProfileIds.map((id) => ({
 recipient_id: id,
 sender_id: notificationSenderId,
 title: payload.title,
 body: payload.body,
 type: payload.type || 'system_announcement',
 action_url: payload.deepLinkPath,
 is_read: false,
 }));
 // Still bulk-insert (not one row at a time), just chunked so a single
 // request doesn't try to carry every recipient across every page.
 const insertChunkSize = 500;
 for (let i = 0; i < rows.length; i += insertChunkSize) {
 const { error: insertError } = await supabase
 .from('notifications')
 .insert(rows.slice(i, i + insertChunkSize));
 if (insertError) {
 console.warn('[Notifications] Broadcast insert chunk error:', insertError.message);
 }
 }
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

/** Best-effort cleanup of the caller's own expired rows (RLS only lets a user delete their own). */
async function purgeExpiredViewedNotifications(userId: string): Promise<void> {
 try {
 const cutoff = new Date(Date.now() - VIEWED_NOTIFICATION_RETENTION_MS).toISOString();
 await supabase
 .from('notifications')
 .delete()
 .eq('recipient_id', userId)
 .eq('is_read', true)
 .lt('read_at', cutoff);
 } catch {
 // The list is already filtered, so a failed cleanup changes nothing the user sees.
 }
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

 const allDbNotifs: AppNotification[] = (data ?? []).map((row: any) => ({
 id: row.id,
 channel: 'in_app',
 type: row.type || 'system_announcement',
 title: row.title,
 body: row.body,
 deepLinkPath: row.action_url,
 deliveryStatus: 'delivered',
 // read_at is stamped by the database when is_read flips to true (see the
 // notification_read_expiry migration); rows from before it fall back to created_at.
 openedAt: row.is_read ? row.read_at || row.created_at : null,
 createdAt: row.created_at,
 }));

 // A notification that has been viewed disappears 30 days after it was viewed.
 // Filtering here makes that immediate for the person looking at the list; the
 // owner-scoped delete below also removes the rows so they don't pile up.
 const dbNotifs = allDbNotifs.filter((n) => !isViewedNotificationExpired(n.openedAt));
 if (dbNotifs.length !== allDbNotifs.length) {
 void purgeExpiredViewedNotifications(uid);
 }

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

// The most recently registered token, so logout can unregister this device
// without having to re-query the Expo token.
let lastRegisteredPushToken: string | null = null;

/**
 * Stores this device's Expo push token in public.push_tokens (owner-only RLS;
 * the send-push edge function reads it with the service role). The token is
 * unique, so a device that changes hands re-parents to the new signed-in user.
 */
export async function registerDevicePushToken(token: string): Promise<void> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let userId = authData?.user?.id;
 if (!userId) {
 const stored = await getSessionUser();
 if (stored?.id) userId = stored.id;
 }
 if (userId) {
 // RPC (not a plain upsert): when a phone changes hands its token still belongs to the
 // previous account, and RLS would (correctly) stop the new user updating that row.
 // register_push_token() re-parents it to the caller and validates the token shape.
 const { error } = await supabase.rpc('register_push_token', {
 p_token: token,
 p_platform: Platform.OS,
 });
 if (error) {
 console.warn('[Notifications] Register push token error:', error.message);
 } else {
 lastRegisteredPushToken = token;
 }
 }
 } catch (err) {
 console.warn('[Notifications] Push token error:', err);
 }
}

/**
 * Removes this device's push token so a signed-out device stops receiving the
 * previous user's notifications. Call BEFORE supabase.auth.signOut() (RLS needs
 * the session). With no argument it uses the token registered in this session.
 * Never throws.
 */
export async function unregisterDevicePushToken(token?: string): Promise<void> {
 const target = token ?? lastRegisteredPushToken;
 if (!target) return;
 try {
 const { error } = await supabase.from('push_tokens').delete().eq('token', target);
 if (error) {
 console.warn('[Notifications] Unregister push token error:', error.message);
 return;
 }
 if (target === lastRegisteredPushToken) lastRegisteredPushToken = null;
 } catch (err) {
 console.warn('[Notifications] Unregister push token error:', err);
 }
}
