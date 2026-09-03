import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { Announcement } from './types';
import { generateUUID } from '../utils/uuid';

// Announcements this session has *successfully* written to Supabase, kept
// here only so they render instantly before the next refetch. Never mixed
// with mockData.ts fixtures - those only come from getMockPool() below,
// and only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedAnnouncements: Announcement[] = [];



export async function listAnnouncements(): Promise<Announcement[]> {
 try {
 const { data, error } = await supabase
 .from('announcements')
 .select('*, author:profiles!announcements_author_id_fkey(full_name)')
 .order('published_at', { ascending: false });

 if (error) throw error;

 const dbItems: Announcement[] = (data ?? []).map((row: any) => ({
 id: row.id,
 authorId: row.author_id,
 authorName: row.author?.full_name || 'Campus Administrator',
 campusCode: row.campus_code || 'GLOBAL',
 title: row.title,
 content: row.content,
 audienceScope: row.audience_scope as any,
 priority: row.priority as any,
 publishedAt: row.published_at,
 expiresAt: row.expires_at,
 }));

 const merged = [...dbItems];
  for (const item of [...locallyCreatedAnnouncements]) {
 if (!merged.some((m) => m.id === item.id)) {
 merged.push(item);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Announcements] Fetch error, showing local pool only:', err);
 return [...locallyCreatedAnnouncements];
 }
}

export interface PublishAnnouncementPayload {
 title: string;
 content: string;
 audienceScope: Announcement['audienceScope'];
 priority: Announcement['priority'];
 campusCode?: string;
 expiresAt?: string;
}

/**
 * Throws if there's no authenticated author or the Supabase insert fails,
 * instead of quietly reporting a campus-wide announcement as published
 * when nobody actually received it. Callers must catch this and show a
 * real error - see the staff Announcements screen.
 */
export async function publishAnnouncement(
 payload: PublishAnnouncementPayload,
): Promise<Announcement> {
 const announcementId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 const realAuthorId = authData?.user?.id;

 if (!realAuthorId) {
 throw new Error('You need to be signed in to publish an announcement.');
 }

 const sessionUser = await getSessionUser();
 const authorName = sessionUser?.fullName || authData?.user?.user_metadata?.full_name || 'Campus Staff';

 const { data: prof } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', realAuthorId)
 .maybeSingle();

 const userCampus = prof?.campus_code || payload.campusCode || 'GLOBAL';
 const publishedAt = new Date().toISOString();

 const { error } = await supabase.from('announcements').insert({
 id: announcementId,
 author_id: realAuthorId,
 campus_code: userCampus,
 title: payload.title,
 content: payload.content,
 audience_scope: payload.audienceScope,
 priority: payload.priority,
 published_at: publishedAt,
 expires_at: payload.expiresAt || null,
 });

 if (error) {
 console.warn('[Announcements] Database insert error:', error.message);
 throw new Error('Could not publish this announcement. Please try again.');
 }

 // Target audience-scoped push notifications - best-effort, doesn't block
 // the announcement itself from being reported as published, since the
 // announcement row above is what actually matters and already succeeded.
 try {
 let query = supabase.from('profiles').select('id');
 if (userCampus && userCampus !== 'GLOBAL') {
 query = query.or(`campus_code.eq.${userCampus},campus_code.eq.GLOBAL`);
 }
 if (payload.audienceScope === 'student') {
 query = query.eq('role', 'student');
 } else if (payload.audienceScope === 'alumni') {
 query = query.eq('role', 'alumni');
 } else if (payload.audienceScope === 'staff') {
 query = query.eq('role', 'staff');
 }
 const { data: targetUsers } = await query.limit(200);
 if (targetUsers && targetUsers.length > 0) {
 const notifs = targetUsers.map((u: any) => ({
 recipient_id: u.id,
 type: 'announcement',
 title: payload.priority === 'critical' ? ` ${payload.title}` : payload.title,
 body: payload.content,
 is_read: false,
 }));
 await supabase.from('notifications').insert(notifs);
 }
 } catch (err) {
 console.warn('[Announcements] Failed to fan out notifications:', err);
 }

 const created: Announcement = {
 id: announcementId,
 authorId: realAuthorId,
 authorName,
 campusCode: userCampus,
 publishedAt,
 ...payload,
 };

 locallyCreatedAnnouncements = [created, ...locallyCreatedAnnouncements];
 return created;
}
