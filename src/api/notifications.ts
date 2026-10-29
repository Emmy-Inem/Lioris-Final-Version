import { Platform } from 'react-native';
import { supabase } from './supabase';
import { AppNotification } from './types';
import { getSessionUser } from '../auth/tokenStorage';
import { getSessionUserId } from './sessionUser';
import { queryClient } from './queryClient';
import { generateUUID } from '../utils/uuid';
import { isViewedNotificationExpired, VIEWED_NOTIFICATION_RETENTION_MS } from '../utils/notificationExpiry';

// Real notifications only (db-fetched or locally created) - there are no
// bundled fixtures to seed this cache with.
let localNotificationsCache: AppNotification[] = [];

/**
 * Clears this session's local notification cache. Call on sign-out so a
 * second account signing in on the same device/session (notably on web,
 * where the module stays loaded across accounts) never sees the previous
 * user's just-created notifications merged into their own list.
 */
export function clearLocalNotificationsCache(): void {
  localNotificationsCache = [];
}

/**
 * Notification types gated by notification_preferences, and the column each
 * one checks. Mirrors the send-push edge function's own preference check
 * (supabase/functions/send-push/index.ts), which only gates the push ping -
 * this gates the in-app row itself so a muted category doesn't clutter the
 * list or inflate the unread badge either.
 */
const PREFERENCE_GATED_TYPES: Record<string, 'announcements_enabled' | 'events_enabled'> = {
  announcement: 'announcements_enabled',
  system_announcement: 'announcements_enabled',
  event: 'events_enabled',
};

/** True when the recipient has explicitly muted this notification's category. No row yet means every category defaults on. */
async function isCategoryMuted(recipientId: string, type: string): Promise<boolean> {
  const column = PREFERENCE_GATED_TYPES[type];
  if (!column) return false;
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(column)
      .eq('user_id', recipientId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as Record<string, unknown>)[column] === false;
  } catch {
    return false;
  }
}

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

export interface BroadcastNotificationPayload {
 type: AppNotification['type'];
 title: string;
 body: string;
 deepLinkPath?: string;
 /** One campus code, or omit / 'ALL' for every campus (Super Admin only - campus admins and staff are always limited to their own campus). */
 campusCode?: string;
 /** Limit to these roles; omit for everyone. */
 roles?: Array<'student' | 'alumni' | 'staff' | 'admin'>;
 /** Also reach members whose campus is GLOBAL (Super Admin only). */
 includeGlobal?: boolean;
 /** Links the notifications to an announcement so deleting it removes them too. */
 announcementId?: string;
 /** Count the audience only (same authority checks and filters): nothing is sent, recorded or rate limited. */
 dryRun?: boolean;
}

/** Turns the database's "<code>: sentence" refusals into something an admin can act on. */
function broadcastErrorMessage(message: string | undefined): string {
 const m = (message ?? '').trim();
 if (/rate_limited/i.test(m)) return 'You have sent too many broadcasts recently. Try again in a while.';
 if (/permission_disabled/i.test(m)) return 'Broadcasting is switched off for your role.';
 if (/not_allowed/i.test(m)) return m.replace(/^not_allowed:\s*/i, '') || 'You are not allowed to broadcast to that audience.';
 if (/invalid_input/i.test(m)) return m.replace(/^invalid_input:\s*/i, '') || 'The alert is not valid.';
 return 'The broadcast could not be sent. Nothing was delivered.';
}

/**
 * Sends a notification to an audience through admin_broadcast_notification() and returns how many
 * members it was REALLY delivered to (suspended and bot accounts and members who muted the category are
 * excluded server-side). Throws when nothing was sent - never report success after a failure.
 */
export async function broadcastNotification(payload: BroadcastNotificationPayload): Promise<{ recipients: number }> {
 const campus = payload.campusCode && payload.campusCode !== 'ALL' ? payload.campusCode : null;
 const audience: Record<string, unknown> = {};
 if (campus) audience.campus = campus;
 else if (payload.campusCode === 'ALL') audience.campus = 'ALL';
 if (payload.roles && payload.roles.length > 0) audience.roles = payload.roles;
 if (payload.includeGlobal) audience.includeGlobal = true;
 const { data, error } = await supabase.rpc('admin_broadcast_notification', {
 p_title: payload.title,
 p_body: payload.body,
 p_type: payload.type || 'system_announcement',
 p_audience: audience,
 p_action_url: payload.deepLinkPath ?? null,
 p_announcement_id: payload.announcementId ?? null,
 p_dry_run: payload.dryRun === true,
 });
 if (error) {
 console.warn('[Notifications] admin_broadcast_notification failed:', error.message);
 throw new Error(broadcastErrorMessage(error.message));
 }
 return { recipients: Number(data ?? 0) };
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

 let skippedByPreference = false;

 try {
 if (targetRecipientId) {
 if (await isCategoryMuted(targetRecipientId, payload.type)) {
 // Recipient turned this category off in Settings - skip the insert
 // entirely (not just the push) so it never reaches their in-app
 // list or unread badge. Mirrors send-push's own preference check.
 skippedByPreference = true;
 } else {
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
 }
 } else {
 // Broadcast: the database function admin_broadcast_notification() does the audience resolution,
 // the authority check (Super Admin: any audience; campus admin/staff: own campus only), the
 // suspended/bot/preference filtering, the audit row and the rate limit in ONE transaction.
 // This helper stays fire-and-forget; callers that must report the real recipient count or a
 // failure use broadcastNotification() directly.
 try {
 await broadcastNotification({
 type: payload.type,
 title: payload.title,
 body: payload.body,
 deepLinkPath: payload.deepLinkPath,
 campusCode: payload.campusCode,
 });
 } catch (broadcastError) {
 console.warn('[Notifications] Broadcast failed:', broadcastError);
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
 if (targetRecipientId && targetRecipientId === currentUserId && !skippedByPreference) {
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
 /** Newest-first page size. Defaults to 100. */
 limit?: number;
 /** Show this session's local pool instead of throwing when the request fails (signed-out previews always do). */
 allowOffline?: boolean;
}

const DEFAULT_NOTIFICATION_LIMIT = 100;
const NOTIFICATION_LIST_COLUMNS = 'id, type, title, body, action_url, is_read, read_at, created_at';

/**
 * How many unread notifications the signed-in user has: a head-only count, no rows downloaded.
 * Throws on a request failure so React Query can retry (the badge simply shows nothing meanwhile).
 */
export async function getUnreadNotificationCount(): Promise<number> {
 const uid = await getSessionUserId();
 if (!uid) return 0;
 const { count, error } = await supabase
 .from('notifications')
 .select('id', { count: 'exact', head: true })
 .eq('recipient_id', uid)
 .eq('is_read', false);
 if (error) throw error;
 return count ?? 0;
}

function refreshUnreadBadges() {
 void queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
}

export async function listNotifications(
 query: NotificationsQuery = {},
): Promise<AppNotification[]> {
 const localPool = () => {
 const pool = [...localNotificationsCache];
 return query.status === 'unread' ? pool.filter((n) => !n.openedAt) : pool;
 };
 // Signed out (preview): there is nothing to fetch, show whatever this session created locally.
 const uid = await getSessionUserId();
 if (!uid) return localPool();

 try {
 let request = supabase
 .from('notifications')
 .select(NOTIFICATION_LIST_COLUMNS)
 .eq('recipient_id', uid);
 if (query.status === 'unread') request = request.eq('is_read', false);
 else if (query.status === 'read') request = request.eq('is_read', true);
 const { data, error } = await request
 .order('created_at', { ascending: false })
 .limit(query.limit ?? DEFAULT_NOTIFICATION_LIMIT);

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
 // just-created notifications.
 const merged = [...dbNotifs];
 for (const n of [...localNotificationsCache]) {
 if (!merged.some((m) => m.id === n.id)) {
 merged.push(n);
 }
 }
 return query.status === 'unread' ? merged.filter((n) => !n.openedAt) : merged;
 } catch (err) {
 // A real failure must reach React Query (error state + retry) instead of being cached as an empty success.
 if (!query.allowOffline) throw err;
 console.warn('[Notifications] listNotifications failed, showing local pool only:', err);
 return localPool();
 }
}

export async function markNotificationRead(id: string) {
 const openedAt = new Date().toISOString();
 const before = localNotificationsCache;
 localNotificationsCache = localNotificationsCache.map((n) => (n.id === id ? { ...n, openedAt } : n));
 try {
 const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
 if (error) throw error;
 refreshUnreadBadges();
 } catch {
 // Not saved: put it back so the badge is truthful (callers refetch right after; opening the item still works).
 localNotificationsCache = before;
 }
 return { id, openedAt };
}

export async function markAllNotificationsRead() {
 const openedAt = new Date().toISOString();
 const before = localNotificationsCache;
 localNotificationsCache = localNotificationsCache.map((n) => ({ ...n, openedAt }));
 try {
 const { data: authData } = await supabase.auth.getUser();
 const uid = authData?.user?.id;
 if (uid) {
 const { error } = await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', uid).eq('is_read', false);
 if (error) throw error;
 refreshUnreadBadges();
 }
 } catch {
 localNotificationsCache = before;
 throw new Error('Could not mark your notifications as read. Check your connection and try again.');
 }
 return { success: true, count: localNotificationsCache.length };
}

export async function clearAllNotifications() {
 const before = localNotificationsCache;
 localNotificationsCache = [];
 try {
 const { data: authData } = await supabase.auth.getUser();
 const uid = authData?.user?.id;
 if (uid) {
 const { error } = await supabase.from('notifications').delete().eq('recipient_id', uid);
 if (error) throw error;
 }
 } catch {
 localNotificationsCache = before;
 throw new Error('Could not clear your notifications. Check your connection and try again.');
 }
}

export async function deleteNotification(id: string) {
 const before = localNotificationsCache;
 localNotificationsCache = localNotificationsCache.filter((n) => n.id !== id);
 try {
 const { error } = await supabase.from('notifications').delete().eq('id', id);
 if (error) throw error;
 } catch {
 localNotificationsCache = before;
 throw new Error('Could not delete that notification. Check your connection and try again.');
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
 // claim_push_token() re-parents it to the caller and validates the token shape. Databases
 // that predate it fall back to register_push_token(), then to the plain owner-only upsert.
 const isMissingRpc = (e: { code?: string; message?: string } | null) =>
 !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message ?? ''));
 let { error } = await supabase.rpc('claim_push_token', { p_token: token, p_platform: Platform.OS });
 if (isMissingRpc(error)) {
 ({ error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS }));
 }
 if (isMissingRpc(error)) {
 ({ error } = await supabase
 .from('push_tokens')
 .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' }));
 }
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
