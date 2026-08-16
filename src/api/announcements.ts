import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { Announcement } from './types';
import { mockAnnouncements } from './mockData';
import { createNotification } from './notifications';
import { generateUUID } from '../utils/uuid';

let announcementsState = [...mockAnnouncements];

export async function listAnnouncements(): Promise<Announcement[]> {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, author:profiles!announcements_author_id_fkey(full_name)')
      .order('published_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbItems: Announcement[] = data.map((row: any) => ({
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
      for (const item of announcementsState) {
        if (!merged.some((m) => m.id === item.id)) {
          merged.push(item);
        }
      }
      return merged;
    }
  } catch (err) {
    console.warn('[Announcements] Fetch error:', err);
  }

  return announcementsState;
}

export interface PublishAnnouncementPayload {
  title: string;
  content: string;
  audienceScope: Announcement['audienceScope'];
  priority: Announcement['priority'];
  campusCode?: string;
  expiresAt?: string;
}

export async function publishAnnouncement(
  payload: PublishAnnouncementPayload,
): Promise<Announcement> {
  const announcementId = generateUUID();
  const sessionUser = await getSessionUser();
  const authorId = sessionUser?.id || 'me';
  const authorName = sessionUser?.fullName || 'Campus Staff';
  const campusCode = payload.campusCode || (sessionUser as any)?.campusCode || 'GLOBAL';

  const created: Announcement = {
    id: announcementId,
    authorId,
    authorName,
    campusCode,
    publishedAt: new Date().toISOString(),
    ...payload,
  };

  announcementsState = [created, ...announcementsState];

  try {
    const { data: authData } = await supabase.auth.getUser();
    const realAuthorId = authData?.user?.id;

    if (realAuthorId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('campus_code')
        .eq('id', realAuthorId)
        .maybeSingle();

      const userCampus = prof?.campus_code || campusCode;

      await supabase.from('announcements').insert({
        id: announcementId,
        author_id: realAuthorId,
        campus_code: userCampus,
        title: payload.title,
        content: payload.content,
        audience_scope: payload.audienceScope,
        priority: payload.priority,
        published_at: created.publishedAt,
        expires_at: payload.expiresAt || null,
      });

      // Target audience-scoped push notifications
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
          title: payload.priority === 'critical' ? `🚨 ${payload.title}` : payload.title,
          body: payload.content,
          is_read: false,
        }));
        await supabase.from('notifications').insert(notifs);
      }
    }
  } catch (err) {
    console.warn('[Announcements] Database insert error:', err);
  }

  return created;
}
