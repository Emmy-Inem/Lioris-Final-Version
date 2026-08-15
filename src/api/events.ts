import { api } from './client';
import { CampusEvent, EventCategory } from './types';
import { mockEvents } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';
import { recordAuditLogEntry } from './auditLog';
import { getSessionUser } from '@/auth/tokenStorage';

// Mutable in-memory copy so newly created events persist for the session.
let eventsState = [...mockEvents];

export interface EventsQuery {
  scope?: 'student' | 'alumni' | 'global';
  category?: string;
  q?: string;
  /** Backs the Events screen's "Sponsored & Featured" section. */
  sponsored?: boolean;
}

// Client-side stand-in for PRD Section 16's search spec — used only
// while there's no real backend to search/filter against.
function filterMockEvents(query: EventsQuery): CampusEvent[] {
  let results = [...eventsState];

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
        // Exact title match ranks first, then partial — PRD Section
        // 16.3's ranking order (exact > partial > ...).
        const aExact = a.title.toLowerCase() === q ? 0 : 1;
        const bExact = b.title.toLowerCase() === q ? 0 : 1;
        return aExact - bExact;
      });
  }

  return results;
}

// GET /events?scope=&category=&q= — PRD Section 15.2
export async function listEvents(query: EventsQuery = {}): Promise<CampusEvent[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: CampusEvent[] }>('/events', { params: query });
    return data.items;
  }, filterMockEvents(query));
}

export async function getEvent(id: string): Promise<CampusEvent | undefined> {
  return withMockFallback(async () => {
    const { data } = await api.get<CampusEvent>(`/events/${id}`);
    return data;
  }, eventsState.find((e) => e.id === id));
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

// Backs the "Publish Event" flow (PublishEventModal). No direct PRD
// Section 15.2 contract for creation was specified, so this follows the
// same convention as the read endpoints.
export async function createEvent(payload: CreateEventPayload): Promise<CampusEvent> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<CampusEvent>('/events', payload);
    return data;
  }
  try {
    const { data } = await api.post<CampusEvent>('/events', payload);
    return data;
  } catch {
    const created: CampusEvent = {
      id: `mock-event-${Date.now()}`,
      organizerId: 'me',
      rsvpCount: 0,
      capacity: null,
      isRsvpd: false,
      ...payload,
    };
    eventsState = [created, ...eventsState];
    return created;
  }
}

// POST /events/{id}/rsvp — PRD Section 15.2
// PRD Section 15.2. Previously used withMockFallback's plain-value
// form, which never touched `eventsState` at all — meaning
// `rsvpCount`/`attendeeNames` (both displayed in EventCard and
// EventDetailScreen) never actually reflected a real RSVP, and a
// refetch would silently look like nobody had RSVP'd. Same bug class
// as the earlier listConversations/createListing fixes.
export async function rsvpToEvent(
  id: string,
  action: 'rsvp' | 'cancel' = 'rsvp',
): Promise<{ eventId: string; status: string }> {
  const result = { eventId: id, status: action === 'rsvp' ? 'confirmed' : 'cancelled' };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post(`/events/${id}/rsvp`, { action });
    return data;
  }
  try {
    const { data } = await api.post(`/events/${id}/rsvp`, { action });
    return data;
  } catch {
    const me = await getSessionUser();
    const myName = me?.fullName ?? 'You';
    eventsState = eventsState.map((e) => {
      if (e.id !== id) return e;
      const attendeeNames = e.attendeeNames ?? [];
      if (action === 'rsvp') {
        return {
          ...e,
          isRsvpd: true,
          rsvpCount: e.rsvpCount + (e.isRsvpd ? 0 : 1),
          attendeeNames: attendeeNames.includes(myName) ? attendeeNames : [...attendeeNames, myName],
        };
      }
      return {
        ...e,
        isRsvpd: false,
        rsvpCount: Math.max(0, e.rsvpCount - (e.isRsvpd ? 1 : 0)),
        attendeeNames: attendeeNames.filter((n) => n !== myName),
      };
    });
    return result;
  }
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
    summary: `Revoked approval on event "${target?.title ?? id}"`,
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
    summary: `Purged event "${target?.title ?? id}"`,
    targetType: 'event',
    targetId: id,
  });
}
