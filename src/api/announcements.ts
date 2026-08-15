import { api } from'./client';
import { Announcement } from'./types';
import { mockAnnouncements } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';
import { createNotification } from'./notifications';

// Mutable in-memory copy so a newly published announcement actually
// persists — publishAnnouncement previously built and returned an
// Announcement without ever storing it, so the screen's own
// `invalidateQueries` call right after publishing would immediately
// refetch the static list and make the new announcement vanish.
let announcementsState = [...mockAnnouncements];

export async function listAnnouncements(): Promise<Announcement[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Announcement[] }>('/announcements');
    return data.items;
  }, announcementsState);
}

export interface PublishAnnouncementPayload {
  title: string;
  content: string;
  audienceScope: Announcement['audienceScope'];
  priority: Announcement['priority'];
  expiresAt?: string;
}

import { generateUUID } from '../utils/uuid';

// PRD Section 7.4: staff publish to approved audiences; admins may
// additionally mark a notice"critical"for emergency broadcast handling.
export async function publishAnnouncement(
  payload: PublishAnnouncementPayload,
): Promise<Announcement> {
  const created: Announcement = {
    id: generateUUID(),
    authorId: 'me',
    authorName: 'You',
    publishedAt: new Date().toISOString(),
    ...payload,
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Announcement>('/announcements', payload);
    return data;
  }
  try {
    const { data } = await api.post<Announcement>('/announcements', payload);
    announcementsState = [data, ...announcementsState];
    createNotification({
      type: 'announcement',
      title: payload.priority === 'critical' ? ` ${payload.title}` : payload.title,
      body: payload.content,
    });
    return data;
  } catch {
    announcementsState = [created, ...announcementsState];
    createNotification({
      type: 'announcement',
      title: payload.priority === 'critical' ? ` ${payload.title}` : payload.title,
      body: payload.content,
    });
    return created;
  }
}
