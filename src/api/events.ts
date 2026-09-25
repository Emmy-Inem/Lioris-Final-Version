import { CampusEvent, EventAttendeeInfo } from './types';
import { recordAuditLogEntry } from './auditLog';
import { getSessionUser } from '@/auth/tokenStorage';
import { supabase } from './supabase';
import { isUserBlocked } from './connections';
import { generateUUID } from '../utils/uuid';
import { getInstitutionForEmail } from './institutions';
import { parseRpcError, RpcError } from '../utils/rpcErrors';


let locallyCreatedEvents: CampusEvent[] = [];

// Maps the DB's event_status_type enum ('upcoming' | 'ongoing' | 'completed' |
// 'cancelled' | 'pending_approval') onto the app-facing approvalStatus. Every
// real status value must land somewhere sane - only 'pending_approval' is
// pending and only 'cancelled'/'rejected' is rejected; everything else
// (upcoming/ongoing/completed, and any future status) is a published event.
function mapApprovalStatus(status: string | null | undefined): 'pending' | 'approved' | 'rejected' {
 if (status === 'pending_approval') return 'pending';
 if (status === 'cancelled' || status === 'rejected') return 'rejected';
 return 'approved';
}

/** Payment / ticket columns of an events row, in the shape the screens use. */
function mapPaidFields(row: any) {
  return {
    ticketType: (row.ticket_type === 'paid' ? 'paid' : 'free') as 'free' | 'paid',
    paymentMethod: (row.payment_method ?? null) as CampusEvent['paymentMethod'],
    reservationHeld: !!row.reservation_held,
    bookingDeadline: (row.booking_deadline ?? null) as string | null,
    paymentReviewStatus: (row.payment_review_status ?? 'not_required') as CampusEvent['paymentReviewStatus'],
    paymentReviewNote: (row.payment_review_note ?? null) as string | null,
  };
}

/** Database errors raised as "<code>: <sentence>" (or a bare code) become a readable RpcError that keeps the code. */
function throwReadable(error: unknown, fallback: string): never {
  throw new RpcError(parseRpcError(error, fallback));
}

export interface EventsQuery {
  scope?: 'student' | 'alumni' | 'global' | 'campus' | 'all';
  category?: string;
  q?: string;
  sponsored?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'all';
  campusCode?: string;
}

function filterEvents(pool: CampusEvent[], query: EventsQuery, currentUserId?: string, isStaffOrAdmin: boolean = false): CampusEvent[] {
  let results = pool.filter((e) => !isUserBlocked(e.organizerId));

  if (query.approvalStatus && query.approvalStatus !== 'all') {
    results = results.filter((e) => e.approvalStatus === query.approvalStatus);
  } else if (!query.approvalStatus) {
    // If no specific approval status was requested:
    // Admin / Staff see all events except explicitly rejected ones.
    // Regular students see approved events, plus any unapproved events they themselves submitted.
    if (isStaffOrAdmin) {
      results = results.filter((e) => e.approvalStatus !== 'rejected');
    } else {
      results = results.filter((e) => e.approvalStatus === 'approved' || (currentUserId && e.organizerId === currentUserId));
    }
  }

  if (query.campusCode && query.campusCode !== 'GLOBAL' && query.campusCode !== 'ALL' && query.campusCode !== 'all') {
    const targetCampus = query.campusCode.toUpperCase();
    results = results.filter(
      (e) => !e.campusCode || e.campusCode.toUpperCase() === 'GLOBAL' || e.campusCode.toUpperCase() === targetCampus,
    );
  }

  if (query.scope && query.scope !== 'all') {
    if (query.scope === 'global') {
      results = results.filter((e) => e.visibilityScope === 'global');
    } else if (query.scope === 'campus') {
      results = results.filter((e) => e.visibilityScope === 'campus');
    } else if (query.scope === 'student') {
      // Student portal: ONLY student campus events. Alumni events are strictly hidden.
      results = results.filter((e) => e.category !== 'alumni' && e.targetCohort !== 'Alumni' && e.targetCohort !== 'Alumni & Postgraduates');
    } else if (query.scope === 'alumni') {
      // Alumni portal: ONLY alumni events (reunions, homecomings, networking galas, mentorship mixers).
      results = results.filter((e) => e.category === 'alumni' || e.targetCohort === 'Alumni' || e.targetCohort === 'Alumni & Postgraduates');
    }
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
    const { data: authData } = await supabase.auth.getUser();
    let userCampus = query.campusCode;
    let userRole = 'student';

    if (authData?.user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('campus_code, role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
      if (prof?.role) userRole = prof.role;
    }

    if (!userCampus && authData?.user?.email) {
      // Domain match, not substring. The previous chain mis-assigned campuses
      // (`includes('oau')` claimed joaustin@unilag.edu.ng for OAU) and hardcoded
      // demo names above the real domain. Every demo account is @ui.edu.ng, so
      // plain domain matching already covers them.
      userCampus = getInstitutionForEmail(authData.user.email)?.code;
    }

    const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';
    const currentUserId = authData?.user?.id;

    let listQuery = supabase
      .from('events')
      .select('*, profiles:creator_id(full_name), event_attendees(user_id)')
      .order('start_time', { ascending: true });
    // The RSVP table is private: everybody may embed their own row (that is all "am I registered?" needs).
    if (currentUserId) listQuery = listQuery.eq('event_attendees.user_id', currentUserId);
    const { data, error } = await listQuery;

    if (error) throw error;

    const dbEvents: CampusEvent[] = (data ?? [])
      .filter((row: any) => !isUserBlocked(row.creator_id))
      .filter((row: any) => {
        // Strict university workspace isolation:
        // Only members of that university see that university's events.
        const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
        const activeCampus = (userCampus || 'GLOBAL').toUpperCase();
        if (activeCampus === 'GLOBAL') {
          return rowCampus === 'GLOBAL';
        }
        return rowCampus === activeCampus || rowCampus === 'GLOBAL';
      })
      .map((row: any) => {
        const isRsvpd = currentUserId ? (row.event_attendees ?? []).some((a: any) => a.user_id === currentUserId) : false;
        return {
          id: row.id,
          organizerId: row.creator_id,
          organizerName: row.profiles?.full_name || 'Campus Event Organizer',
          title: row.title,
          description: row.description,
          category: row.category as any,
          location: row.venue || 'Campus Main Venue',
          startAt: row.start_time,
          endAt: row.end_time,
          capacity: row.capacity,
          rsvpCount: row.registered_count || 0,
          isRsvpd,
          approvalStatus: mapApprovalStatus(row.status),
          visibilityScope: (row.visibility_scope as any) || 'global',
          campusCode: row.campus_code || 'GLOBAL',
          coverImageUrl: row.banner_url,
          venueType: row.venue_type || 'physical',
          virtualLink: row.virtual_link ?? null,
          isSpotlight: !!row.is_spotlight,
          sponsored: !!row.sponsored,
          ticketPrice: row.ticket_price != null ? Number(row.ticket_price) : undefined,
          targetCohort: row.target_cohort ?? undefined,
          ...mapPaidFields(row),
        };
      });

    // Merge unique - local pool only ever contributes this session's own
    // just-created events (always) plus seed fixtures (only when the admin
    // mock-data toggle is on).
    const pool = [...locallyCreatedEvents];
    const merged = [...dbEvents];
    const activeCampus = (userCampus || 'GLOBAL').toUpperCase();
    for (const e of pool) {
      if (!merged.some((m) => m.id === e.id) && !isUserBlocked(e.organizerId)) {
        const eCampus = (e.campusCode || 'GLOBAL').toUpperCase();
        if (activeCampus === 'GLOBAL') {
          if (eCampus === 'GLOBAL') merged.push(e);
        } else if (eCampus === 'GLOBAL' || eCampus === activeCampus) {
          merged.push(e);
        }
      }
    }
    return filterEvents(merged, { ...query, campusCode: userCampus }, currentUserId, isStaffOrAdmin);
  } catch (err) {
    console.warn('[Events] Supabase listEvents error, showing local pool only:', err);
    return filterEvents([...locallyCreatedEvents], query);
  }
}

export async function getEvent(id?: string | null): Promise<CampusEvent | null> {
  if (!id) return null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;

    let detailQuery = supabase
      .from('events')
      .select('*, profiles:creator_id(full_name), event_attendees(user_id)')
      .eq('id', id);
    if (currentUserId) detailQuery = detailQuery.eq('event_attendees.user_id', currentUserId);
    const { data, error } = await detailQuery.single();
    if (!error && data) {
      const isRsvpd = currentUserId ? (data.event_attendees ?? []).some((a: any) => a.user_id === currentUserId) : false;
      const freshEvent: CampusEvent = {
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
        isRsvpd,
        approvalStatus: mapApprovalStatus(data.status),
        visibilityScope: data.visibility_scope || 'global',
        campusCode: data.campus_code || 'GLOBAL',
        coverImageUrl: data.banner_url,
        venueType: data.venue_type || 'physical',
        virtualLink: data.virtual_link ?? null,
        isSpotlight: !!data.is_spotlight,
        sponsored: !!data.sponsored,
        ticketPrice: data.ticket_price != null ? Number(data.ticket_price) : undefined,
        targetCohort: data.target_cohort ?? undefined,
        ...mapPaidFields(data),
      };
      locallyCreatedEvents = locallyCreatedEvents.map((e) => (e.id === id ? { ...e, ...freshEvent } : e));
      return freshEvent;
    }
  } catch (err) {
    console.warn('[Events] Supabase getEvent error:', err);
  }

  const found = [...locallyCreatedEvents].find((e) => e.id === id);
  if (found) return found;

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
 venueType?: 'physical' | 'virtual' | 'external';
 virtualLink?: string | null;
 capacity?: number | null;
 isSpotlight?: boolean;
 ticketPrice?: number;
 targetCohort?: string;
 /** Paid events: Lioris only lists them; the organiser takes the money (their link, or at the venue). */
 ticketType?: 'free' | 'paid';
 paymentMethod?: CampusEvent['paymentMethod'];
 reservationHeld?: boolean;
 bookingDeadline?: string | null;
 /** Saved with save_event_payment_details() right after the event row; only for paid events. */
 paymentUrl?: string | null;
 paymentInstructions?: string | null;
}

/**
 * Throws if there's no authenticated organizer or the Supabase insert
 * fails, instead of quietly returning a fabricated "published" event.
 * Callers must catch this and show a real error - see PublishEventModal.
 */
export async function createEvent(payload: CreateEventPayload): Promise<CampusEvent> {
 const eventId = generateUUID();

 // Dates must come from the caller - no fabricated fallback. A missing or
 // invalid start/end must fail loudly instead of silently publishing an
 // event with a made-up date.
 if (!payload.startAt || !payload.endAt) {
 throw new Error('Event start and end date/time are required.');
 }
 const startDate = new Date(payload.startAt);
 const endDate = new Date(payload.endAt);
 if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
 throw new Error('Event start and end date/time must be valid dates.');
 }
 if (endDate < startDate) {
 throw new Error('Event end date/time cannot be before the start date/time.');
 }

 let permanentImageUrl: string | null = payload.imageUrl || null;
 if (payload.imageUrl) {
 const { resolveMediaUrl } = await import('./storage');
 permanentImageUrl = await resolveMediaUrl(payload.imageUrl, 'events');
 }

 const { data: authData } = await supabase.auth.getUser();
 let organizerId = authData?.user?.id;
 if (!organizerId) {
 const stored = await getSessionUser();
 if (stored?.id) organizerId = stored.id;
 }

 if (!organizerId) {
 throw new Error('You need to be signed in to publish an event.');
 }

 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code, role')
 .eq('id', organizerId)
 .maybeSingle();

  let campusCode = payload.campusCode;
  if (!campusCode) campusCode = profile?.campus_code || 'GLOBAL';
  if (!campusCode) campusCode = 'GLOBAL';
  campusCode = campusCode.trim().toUpperCase();

  // Every event starts pending review, regardless of the creator's role.
  // This used to auto-approve when profiles.role was 'admin'/'staff', which
  // sounds right in isolation but breaks the moment "Preview Workspace As
  // Role" is in play (see AuthContext.tsx's `role` vs `actualRole`): that
  // feature only changes which portal UI renders - the underlying Supabase
  // session, and therefore profiles.role for that session, is always the
  // real account. An admin previewing the Student portal would have had
  // every "student" event instantly published live with no review step,
  // same bug class already fixed for src/api/communities.ts's
  // proposeCommunity. The `events` table's INSERT RLS policy enforces
  // status = 'pending_approval' server-side too, so this can't be bypassed
  // by a modified client either - approval always goes through the
  // moderation queue's admin/staff-only UPDATE path (approveEvent /
  // revokeEventApproval).
  const initialStatus = 'pending_approval';
  const isPaid = payload.ticketType === 'paid';

  const dbVisibilityScope = payload.visibilityScope === 'campus' ? 'campus' : 'global';

  const { error } = await supabase.from('events').insert({
    id: eventId,
    creator_id: organizerId,
    campus_code: campusCode,
    title: payload.title,
    description: payload.description,
    category: payload.category || 'Academic',
    venue: payload.location || 'Campus Auditorium',
    visibility_scope: dbVisibilityScope,
    start_time: payload.startAt,
    end_time: payload.endAt,
    banner_url: permanentImageUrl,
    registered_count: 0,
    status: initialStatus,
    venue_type: payload.venueType || 'physical',
    virtual_link: payload.virtualLink ?? null,
    capacity: payload.capacity ?? null,
    is_spotlight: false,
    sponsored: false,
    ticket_price: isPaid ? payload.ticketPrice ?? 0 : 0,
    target_cohort: payload.targetCohort ?? null,
    ticket_type: isPaid ? 'paid' : 'free',
    payment_method: isPaid ? payload.paymentMethod ?? 'online' : null,
    reservation_held: isPaid ? !!payload.reservationHeld : false,
    booking_deadline: isPaid ? payload.bookingDeadline ?? null : null,
  });

  if (error) {
    console.warn('[Events] Supabase create event error:', error.message);
    throwReadable(error, 'Could not publish this event. Please try again.');
  }

  if (isPaid) {
    const { error: detailsError } = await supabase.rpc('save_event_payment_details', {
      p_event: eventId,
      p_url: payload.paymentUrl ?? null,
      p_instructions: payload.paymentInstructions ?? null,
    });
    if (detailsError) {
      // Never leave a paid event behind without its payment details.
      await supabase.from('events').delete().eq('id', eventId);
      console.warn('[Events] Saving payment details failed:', detailsError.message);
      throwReadable(detailsError, 'Could not save the payment details. Please try again.');
    }
  }

 const created: CampusEvent = {
 id: eventId,
 organizerId,
 rsvpCount: 0,
 isRsvpd: false,
 approvalStatus: mapApprovalStatus(initialStatus),
 ...payload,
 ticketType: isPaid ? 'paid' : 'free',
 paymentReviewStatus: isPaid ? 'pending' : 'not_required',
 ticketPrice: isPaid ? payload.ticketPrice ?? 0 : 0,
 category: (payload.category as any) || 'academic',
 visibilityScope: (payload.visibilityScope as any) || 'global',
 campusCode,
 coverImageUrl: permanentImageUrl,
 venueType: payload.venueType || 'physical',
 capacity: payload.capacity ?? null,
 isSpotlight: false,
 sponsored: false,
 };

 locallyCreatedEvents = [created, ...locallyCreatedEvents];
 return created;
}

export interface RsvpResult {
 eventId: string;
 status: 'confirmed' | 'cancelled';
 /** The unique reference (QR / manual entry) the organiser checks at the door. */
 ticketCode?: string;
}

/**
 * Register for (or cancel) an event through the database, which enforces booking rules, capacity, the paid-event
 * acknowledgement and consent. Throws an RpcError whose `code` says why (event_full, booking_closed, ack_required...).
 * `acknowledged` must be true for paid events: the student has read that Lioris does not take the payment and what
 * the organiser will see. `shareDetails` additionally shares the matric number and department with the organiser.
 */
export async function rsvpToEvent(
 id: string,
 action: 'rsvp' | 'cancel' = 'rsvp',
 options: { shareDetails?: boolean; acknowledged?: boolean } = {},
): Promise<RsvpResult> {
 if (action === 'cancel') {
 const { error } = await supabase.rpc('cancel_event_rsvp', { p_event: id });
 if (error) throwReadable(error, 'Could not cancel your registration. Please try again.');
 locallyCreatedEvents = locallyCreatedEvents.map((e) =>
 e.id === id ? { ...e, isRsvpd: false, rsvpCount: Math.max(0, e.rsvpCount - 1) } : e,
 );
 return { eventId: id, status: 'cancelled' };
 }

 const { data, error } = await supabase.rpc('rsvp_event', {
 p_event: id,
 p_share_details: !!options.shareDetails,
 p_ack: !!options.acknowledged,
 });
 if (error) throwReadable(error, 'Could not register you for this event. Please try again.');
 const result = (data ?? {}) as { ticket_code?: string; already?: boolean };
 locallyCreatedEvents = locallyCreatedEvents.map((e) =>
 e.id === id ? { ...e, isRsvpd: true, rsvpCount: e.rsvpCount + (result.already ? 0 : 1) } : e,
 );
 return { eventId: id, status: 'confirmed', ticketCode: result.ticket_code };
}

export async function updateEvent(id: string, updates: Partial<CampusEvent>): Promise<CampusEvent | null> {
 const dbPayload: any = {};
 if (updates.title) dbPayload.title = updates.title;
 if (updates.description) dbPayload.description = updates.description;
 if (updates.category) dbPayload.category = updates.category;
 if (updates.location) dbPayload.venue = updates.location;
 if (updates.startAt) dbPayload.start_time = updates.startAt;
 if (updates.endAt) dbPayload.end_time = updates.endAt;
 if (updates.coverImageUrl) dbPayload.banner_url = updates.coverImageUrl;
 if (updates.capacity !== undefined) dbPayload.capacity = updates.capacity;
 if (updates.isSpotlight !== undefined) dbPayload.is_spotlight = updates.isSpotlight;
 if (updates.venueType !== undefined) dbPayload.venue_type = updates.venueType;
 if (updates.virtualLink !== undefined) dbPayload.virtual_link = updates.virtualLink;
 if (updates.targetCohort !== undefined) dbPayload.target_cohort = updates.targetCohort;
 if (updates.campusCode) dbPayload.campus_code = updates.campusCode.toUpperCase();
 if (updates.visibilityScope) dbPayload.visibility_scope = updates.visibilityScope;
 if (updates.sponsored !== undefined) dbPayload.sponsored = updates.sponsored;
 // Ticket settings travel together: the database keeps free events free of any price, method or review.
 if (updates.ticketType !== undefined) {
 const paid = updates.ticketType === 'paid';
 dbPayload.ticket_type = updates.ticketType;
 dbPayload.ticket_price = paid ? updates.ticketPrice ?? 0 : 0;
 dbPayload.payment_method = paid ? updates.paymentMethod ?? 'online' : null;
 dbPayload.reservation_held = paid ? !!updates.reservationHeld : false;
 dbPayload.booking_deadline = paid ? updates.bookingDeadline ?? null : null;
 } else if (updates.ticketPrice !== undefined) {
 dbPayload.ticket_price = updates.ticketPrice;
 }
 if (updates.approvalStatus) {
 dbPayload.status =
 updates.approvalStatus === 'approved'
 ? 'upcoming'
 : updates.approvalStatus === 'pending'
 ? 'pending_approval'
 : 'cancelled';
 }

 if (Object.keys(dbPayload).length > 0) {
 const { data, error } = await supabase.from('events').update(dbPayload).eq('id', id).select('id');
 if (error) throwReadable(error, 'Could not save the changes. Please try again.');
 if (!data || data.length === 0) throw new Error('You do not have permission to change this event.');
 }

 let updated: CampusEvent | null = null;
 locallyCreatedEvents = locallyCreatedEvents.map((e) => {
 if (e.id === id) {
 updated = { ...e, ...updates };
 return updated;
 }
 return e;
 });
 return updated;
}

/** The people registered for an event. Organisers, admins and campus staff only (the database refuses anyone else). */
export async function listEventAttendees(eventId: string): Promise<EventAttendeeInfo[]> {
  const { data, error } = await supabase.rpc('event_roster', { p_event: eventId });
  if (error) throwReadable(error, 'Could not load the attendee list.');
  return ((data ?? []) as any[]).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name || 'Registered student',
    avatarUrl: row.avatar_url,
    role: row.role || 'student',
    matricNumber: row.matric_number ?? undefined,
    department: row.department ?? undefined,
    registeredAt: row.registered_at,
    ticketCode: row.ticket_code,
    checkedInAt: row.checked_in_at ?? null,
    purchaseConfirmedAt: row.purchase_confirmed_at ?? null,
  }));
}

/** Administrators only: the database ignores this for anyone else, so a no-op is reported as an error. */
export async function setEventSpotlight(id: string, isSpotlight: boolean) {
  const { data, error } = await supabase.from('events').update({ is_spotlight: isSpotlight }).eq('id', id).select('id, is_spotlight').maybeSingle();
  if (error) throw new Error(error.message || 'Could not update the spotlight.');
  if (!data || data.is_spotlight !== isSpotlight) {
    throw new Error('Only an administrator can feature an event.');
  }
  locallyCreatedEvents = locallyCreatedEvents.map((e) => (e.id === id ? { ...e, isSpotlight } : e));
  await recordAuditLogEntry({
    action: isSpotlight ? 'event_spotlight_enabled' : 'event_spotlight_disabled',
    summary: `${isSpotlight ? 'Enabled' : 'Disabled'} spotlight featured status on event "${id}"`,
    targetType: 'event',
    targetId: id,
  });
}

export async function approveEvent(id: string) {
  const target = locallyCreatedEvents.find((e) => e.id === id);
 locallyCreatedEvents = locallyCreatedEvents.map((e) => (e.id === id ? { ...e, approvalStatus: 'approved' } : e));
 try {
 await supabase.from('events').update({ status: 'upcoming' }).eq('id', id);
 } catch (err) {
 console.warn('[Events] Supabase approveEvent error:', err);
 }
 await recordAuditLogEntry({
 action: 'event_approved',
 summary: `Approved and published event listing: "${target?.title ?? id}"`,
 targetType: 'event',
 targetId: id,
 });
}

// Admin moderation actions - backs the Events tab in the Admin Workdesk.
export async function revokeEventApproval(id: string) {
 const target = locallyCreatedEvents.find((e) => e.id === id);
 locallyCreatedEvents = locallyCreatedEvents.map((e) => (e.id === id ? { ...e, approvalStatus: 'rejected' } : e));
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
 const target = locallyCreatedEvents.find((e) => e.id === id);
 locallyCreatedEvents = locallyCreatedEvents.filter((e) => e.id !== id);
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
