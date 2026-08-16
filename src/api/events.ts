import { api } from'./client';
import { CampusEvent, EventCategory } from'./types';
import { mockEvents } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';
import { recordAuditLogEntry } from'./auditLog';
import { getSessionUser } from'@/auth/tokenStorage';

const INITIAL_EVENTS: CampusEvent[] = [
  ...mockEvents.map((e) => ({ ...e, approvalStatus: 'approved'as const })),
  {
    id: 'event-sub-1',
    organizerId: 'user-chioma',
    organizerName: 'Google Developer Student Club (GDSC UI)',
    title: 'Google Cloud & AI Campus Study Jam: Gemini Pro Deep Dive',
    description: 'Hands-on practical workshop exploring Gemini API multimodal integration, Cloud Run container deployments, and fine-tuning models.',
    category: 'workshop',
    location: 'Faculty of Science Computer Laboratory 3',
    venueType: 'Physical Auditorium',
    visibilityScope: 'global',
    startAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 2 + 10800000).toISOString(),
    capacity: 120,
    rsvpCount: 45,
    isRsvpd: false,
    approvalStatus: 'pending',
    sponsored: true,
    isSpotlight: true,
    coverImageUrl: 'event_tech_hackathon',
    ticketPrice: 'Free',
    targetCohort: 'All Levels (100L - 500L)',
    attendeeNames: ['Adekunle Gold', 'Chioma Okonkwo', 'Tunde Bakare'],
  },
  {
    id: 'event-sub-2',
    organizerId: 'user-adekunle',
    organizerName: 'Engineering Students Association (ESA)',
    title: 'Annual Faculty Career Dinner & Alumni Mentorship Connect',
    description: 'Exclusive networking dinner with alumni working at Chevron, Paystack, and Flutterwave. CV reviews and open internship referrals.',
    category: 'career',
    location: 'Faculty of Technology Conference Center & Banquet Hall',
    venueType: 'Hybrid Room',
    visibilityScope: 'global',
    startAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 5 + 14400000).toISOString(),
    capacity: 250,
    rsvpCount: 88,
    isRsvpd: false,
    approvalStatus: 'pending',
    sponsored: true,
    isSpotlight: false,
    coverImageUrl: 'campus_students_photo',
    ticketPrice: 'Free',
    targetCohort: 'Penultimate & Final Year Students',
    attendeeNames: ['Folake Adeleke', 'Dr. Babatunde Lawal', 'Amina Yusuf'],
  },
];

import { supabase } from './supabase';

let eventsState: CampusEvent[] = [...INITIAL_EVENTS];

export interface EventsQuery {
  scope?: 'student' | 'alumni' | 'global';
  category?: string;
  q?: string;
  sponsored?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'all';
}

import { isUserBlocked } from './connections';

function filterMockEvents(query: EventsQuery): CampusEvent[] {
  let results = [...eventsState].filter((e) => !isUserBlocked(e.organizerId));

  if (query.approvalStatus && query.approvalStatus !== 'all') {
    results = results.filter((e) => e.approvalStatus === query.approvalStatus);
  } else if (!query.approvalStatus) {
    results = results.filter((e) => e.approvalStatus !== 'rejected');
  }

  if (query.scope) {
    results = results.filter((e) => e.visibilityScope === query.scope || e.visibilityScope === 'global');
  }
  if (query.category) {
    results = results.filter((e) => e.category === query.category);
  }
  if (query.sponsored !== undefined) {
    results = results.filter((e) => !!e.sponsored === query.sponsored);
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    results = results
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aExact = a.title.toLowerCase() === q ? 0 : 1;
        const bExact = b.title.toLowerCase() === q ? 0 : 1;
        return aExact - bExact;
      });
  }

  return results;
}

export async function listEvents(query: EventsQuery = {}): Promise<CampusEvent[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles:creator_id(full_name)')
      .order('start_time', { ascending: true });

    if (!error && data && data.length > 0) {
      const dbEvents: CampusEvent[] = data.map((row: any) => ({
        id: row.id,
        organizerId: row.creator_id || 'organizer',
        organizerName: row.profiles?.full_name || 'Campus Event Organizer',
        title: row.title,
        description: row.description,
        category: row.category as any,
        location: row.venue || 'Campus Main Venue',
        startAt: row.start_time,
        endAt: row.end_time,
        capacity: row.capacity,
        rsvpCount: row.registered_count || 0,
        isRsvpd: false,
        approvalStatus: row.status === 'cancelled' ? 'rejected' : 'approved',
        visibilityScope: (row.visibility_scope as any) || 'global',
        coverImageUrl: row.banner_url,
      }));
      // Merge unique
      const merged = [...dbEvents];
      for (const e of eventsState) {
        if (!merged.some((m) => m.id === e.id)) {
          merged.push(e);
        }
      }
      eventsState = merged;
      return filterMockEvents(query);
    }
  } catch (err) {
    console.warn('[Events] Supabase listEvents error:', err);
  }
  return filterMockEvents(query);
}

export async function getEvent(id?: string | null): Promise<CampusEvent | null> {
  if (!id) return null;
  const found = eventsState.find((e) => e.id === id);
  if (found) return found;
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles:creator_id(full_name)')
      .eq('id', id)
      .single();
    if (!error && data) {
      return {
        id: data.id,
        organizerId: data.creator_id,
        organizerName: data.profiles?.full_name || 'Campus Event Organizer',
        title: data.title,
        description: data.description,
        category: data.category,
        location: data.venue || 'Campus Main Venue',
        startAt: data.start_time,
        endAt: data.end_time,
        capacity: data.capacity,
        rsvpCount: data.registered_count || 0,
        isRsvpd: false,
        approvalStatus: data.status === 'cancelled' ? 'rejected' : 'approved',
        visibilityScope: data.visibility_scope || 'global',
        coverImageUrl: data.banner_url,
      };
    }
  } catch (err) {
    console.warn('[Events] Supabase getEvent error:', err);
  }
  return null;
}

export interface CreateEventPayload {
  title: string;
  description: string;
  category: string;
  location: string;
  campusCode?: string;
  visibilityScope?: 'campus' | 'global';
  startAt: string;
  endAt: string;
  imageUrl?: string | null;
  sponsored?: boolean;
}

import { generateUUID } from '../utils/uuid';

export async function createEvent(payload: CreateEventPayload): Promise<CampusEvent> {
  const eventId = generateUUID();

  let permanentImageUrl: string | null = payload.imageUrl || null;
  if (payload.imageUrl && !payload.imageUrl.startsWith('http://') && !payload.imageUrl.startsWith('https://')) {
    try {
      const { uploadMediaFile } = await import('./storage');
      permanentImageUrl = await uploadMediaFile('campus-media', payload.imageUrl, 'events');
    } catch (uploadErr) {
      console.warn('[Events] Banner upload warning:', uploadErr);
    }
  }

  let organizerId = 'me';
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      organizerId = authData.user.id;
    } else {
      const stored = await getSessionUser();
      if (stored?.id) organizerId = stored.id;
    }
  } catch {
    // fallback
  }

  const created: CampusEvent = {
    id: eventId,
    organizerId,
    rsvpCount: 0,
    capacity: null,
    isRsvpd: false,
    approvalStatus: 'approved' as const,
    ...payload,
    category: (payload.category as any) || 'academic',
    visibilityScope: (payload.visibilityScope as any) || 'global',
    coverImageUrl: permanentImageUrl,
  };
  eventsState = [created, ...eventsState];

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      let campusCode = payload.campusCode;
      if (!campusCode) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('campus_code')
          .eq('id', authData.user.id)
          .maybeSingle();
        campusCode = profile?.campus_code || 'GLOBAL';
      }
      if (!campusCode) campusCode = 'GLOBAL';
      created.campusCode = campusCode;

      const { error } = await supabase.from('events').insert({
        id: eventId,
        creator_id: authData.user.id,
        campus_code: campusCode,
        title: payload.title,
        description: payload.description,
        category: payload.category || 'Academic',
        venue: payload.location || 'Campus Auditorium',
        visibility_scope: payload.visibilityScope || 'global',
        start_time: payload.startAt,
        end_time: payload.endAt,
        banner_url: permanentImageUrl,
        registered_count: 0,
      });
      if (error) {
        console.warn('[Events] Supabase create event error:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Events] Backend create event error:', err);
  }

  return created;
}

export async function rsvpToEvent(
  id: string,
  action: 'rsvp' | 'cancel' = 'rsvp',
): Promise<{ eventId: string; status: string }> {
  const result = { eventId: id, status: action === 'rsvp' ? 'confirmed' : 'cancelled' };

  eventsState = eventsState.map((e) => {
    if (e.id !== id) return e;
    const nextRsvpd = action === 'rsvp';
    const nextCount = Math.max(0, e.rsvpCount + (nextRsvpd ? 1 : -1));
    return { ...e, isRsvpd: nextRsvpd, rsvpCount: nextCount };
  });

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (userId) {
      if (action === 'rsvp') {
        const { error } = await supabase.from('event_attendees').insert({ event_id: id, user_id: userId });
        if (error) console.warn('[Events] RSVP error:', error.message);
      } else {
        const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', userId);
        if (error) console.warn('[Events] Cancel RSVP error:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Events] RSVP failure:', err);
  }

  return result;
}

export async function updateEvent(id: string, updates: Partial<CampusEvent>): Promise<CampusEvent | null> {
  let updated: CampusEvent | null = null;
  eventsState = eventsState.map((e) => {
    if (e.id === id) {
      updated = { ...e, ...updates };
      return updated;
    }
    return e;
  });

  try {
    const dbPayload: any = {};
    if (updates.title) dbPayload.title = updates.title;
    if (updates.description) dbPayload.description = updates.description;
    if (updates.category) dbPayload.category = updates.category;
    if (updates.location) dbPayload.venue = updates.location;
    if (updates.startAt) dbPayload.start_time = updates.startAt;
    if (updates.endAt) dbPayload.end_time = updates.endAt;
    if (updates.coverImageUrl) dbPayload.banner_url = updates.coverImageUrl;

    if (Object.keys(dbPayload).length > 0) {
      await supabase.from('events').update(dbPayload).eq('id', id);
    }
  } catch (err) {
    console.warn('[Events] Supabase updateEvent error:', err);
  }

  return updated;
}

export async function approveEvent(id: string) {
  const target = eventsState.find((e) => e.id === id);
  eventsState = eventsState.map((e) => (e.id === id ? { ...e, approvalStatus: 'approved' } : e));
  try {
    await supabase.from('events').update({ status: 'upcoming' }).eq('id', id);
  } catch (err) {
    console.warn('[Events] Supabase approveEvent error:', err);
  }
  await recordAuditLogEntry({
    action: 'event_approval_revoked',
    summary: `Approved and published event listing: "${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}

// Admin moderation actions — backs the Events tab in the Admin Workdesk.
export async function revokeEventApproval(id: string) {
  const target = eventsState.find((e) => e.id === id);
  eventsState = eventsState.map((e) => (e.id === id ? { ...e, approvalStatus: 'rejected' } : e));
  try {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id);
  } catch (err) {
    console.warn('[Events] Supabase revokeEventApproval error:', err);
  }
  await recordAuditLogEntry({
    action: 'event_approval_revoked',
    summary: `Revoked approval on event "${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}

export async function purgeEvent(id: string) {
  const target = eventsState.find((e) => e.id === id);
  eventsState = eventsState.filter((e) => e.id !== id);
  try {
    await supabase.from('events').delete().eq('id', id);
  } catch (err) {
    console.warn('[Events] Supabase purgeEvent error:', err);
  }
  await recordAuditLogEntry({
    action: 'event_purged',
    summary: `Purged event "${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}
