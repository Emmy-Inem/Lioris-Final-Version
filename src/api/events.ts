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
      .select('*')
      .order('start_at', { ascending: true });

    if (!error && data && data.length > 0) {
      const dbEvents: CampusEvent[] = data.map((row: any) => ({
        id: row.id,
        organizerId: row.organizer_id || 'organizer',
        organizerName: row.organizer_name || 'Campus Event Organizer',
        title: row.title,
        description: row.description,
        category: row.category as any,
        location: row.location,
        startAt: row.start_at,
        endAt: row.end_at,
        capacity: row.capacity,
        rsvpCount: row.rsvp_count || 0,
        isRsvpd: false,
        approvalStatus: (row.approval_status as any) || 'approved',
        visibilityScope: (row.visibility_scope as any) || 'global',
        coverImageUrl: row.image_url,
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
  } catch {
    // Fallback to local session
  }
  return filterMockEvents(query);
}

export async function getEvent(id?: string | null): Promise<CampusEvent | null> {
  if (!id) return null;
  const found = eventsState.find((e) => e.id === id);
  if (found) return found;
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
    if (!error && data) {
      return {
        id: data.id,
        organizerId: data.organizer_id,
        organizerName: data.organizer_name || 'Campus Event Organizer',
        title: data.title,
        description: data.description,
        category: data.category,
        location: data.location,
        startAt: data.start_at,
        endAt: data.end_at,
        capacity: data.capacity,
        rsvpCount: data.rsvp_count || 0,
        isRsvpd: false,
        approvalStatus: data.approval_status || 'approved',
        visibilityScope: data.visibility_scope || 'global',
        coverImageUrl: data.image_url,
      };
    }
  } catch {
    // Fallback
  }
  return null;
}

export interface CreateEventPayload {
  title: string;
  description: string;
  category: EventCategory;
  location: string;
  visibilityScope: 'student' | 'alumni' | 'global';
  startAt: string;
  endAt: string;
  imageUrl?: string | null;
  sponsored?: boolean;
}

export async function createEvent(payload: CreateEventPayload): Promise<CampusEvent> {
  const eventId = `event-${Date.now()}`;

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
    approvalStatus: 'pending',
    ...payload,
  };
  eventsState = [created, ...eventsState];

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      const { error } = await supabase.from('events').insert({
        id: eventId,
        creator_id: authData.user.id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        location: payload.location,
        visibility_scope: payload.visibilityScope || 'global',
        start_at: payload.startAt,
        end_at: payload.endAt,
        image_url: payload.imageUrl,
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
        const { error } = await supabase.from('event_attendees').insert({ event_id: id, user_id: userId, status: 'confirmed' });
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
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.patch<CampusEvent>(`/events/${id}`, updates);
    return data;
  }
  try {
    const { data } = await api.patch<CampusEvent>(`/events/${id}`, updates);
    return data;
  } catch {
    let updated: CampusEvent | null = null;
    eventsState = eventsState.map((e) => {
      if (e.id === id) {
        updated = { ...e, ...updates };
        return updated;
      }
      return e;
    });
    return updated;
  }
}

export async function approveEvent(id: string) {
  const target = eventsState.find((e) => e.id === id);
  if (!FALL_BACK_TO_MOCKS) {
    await api.patch(`/events/${id}`, { approvalStatus: 'approved' });
  } else {
    try {
      await api.patch(`/events/${id}`, { approvalStatus: 'approved' });
    } catch {
      eventsState = eventsState.map((e) => (e.id === id ? { ...e, approvalStatus: 'approved' } : e));
    }
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
  if (!FALL_BACK_TO_MOCKS) {
    await api.patch(`/events/${id}`, { approvalStatus: 'rejected' });
  } else {
    try {
      await api.patch(`/events/${id}`, { approvalStatus: 'rejected' });
    } catch {
      eventsState = eventsState.map((e) => (e.id === id ? { ...e, approvalStatus: 'rejected' } : e));
    }
  }
  // PRD Section 6.2 — moderation decisions must be audit-logged.
  await recordAuditLogEntry({
    action: 'event_approval_revoked',
    summary: `Revoked approval on event"${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}

export async function purgeEvent(id: string) {
  const target = eventsState.find((e) => e.id === id);
  if (!FALL_BACK_TO_MOCKS) {
    await api.delete(`/events/${id}`);
  } else {
    try {
      await api.delete(`/events/${id}`);
    } catch {
      eventsState = eventsState.filter((e) => e.id !== id);
    }
  }
  await recordAuditLogEntry({
    action: 'event_purged',
    summary: `Purged event"${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}
