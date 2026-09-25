import { supabase } from './supabase';
import { parseRpcError, RpcError } from '../utils/rpcErrors';
import { PaymentMethod } from './types';

// Paid events are discovery + referral: Lioris never takes the payment. Everything here talks to the
// SECURITY DEFINER functions / edge function from supabase/migrations/20260925140000_paid_events.sql and
// supabase/functions/admin-review-paid-event. See docs/operations/paid-events.md.

function fail(error: unknown, fallback: string): never {
  throw new RpcError(parseRpcError(error, fallback));
}

// ---------------------------------------------------------------------------------------------------
// student: my pass, payment info, payment page
// ---------------------------------------------------------------------------------------------------
export interface EventTicket {
  ticketCode: string;
  registeredAt: string;
  checkedInAt: string | null;
  purchaseConfirmedAt: string | null;
  sharedDetails: boolean;
}

/** My own registration for an event (the RSVP table only ever returns a person's own row to them). */
export async function getMyTicket(eventId: string, userId: string): Promise<EventTicket | null> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('ticket_code, registered_at, checked_in_at, purchase_confirmed_at, shared_details')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(error, 'Could not load your registration.');
  if (!data) return null;
  return {
    ticketCode: data.ticket_code,
    registeredAt: data.registered_at,
    checkedInAt: data.checked_in_at ?? null,
    purchaseConfirmedAt: data.purchase_confirmed_at ?? null,
    sharedDetails: !!data.shared_details,
  };
}

export interface EventPaymentInfo {
  /** false while the admin has not approved the payment details, or paid events are paused */
  available: boolean;
  reason?: 'free' | 'paused' | 'in_review' | 'pending' | 'rejected' | null;
  instructions?: string | null;
  hasOnlineLink?: boolean;
  /** Host of the organiser's payment page, shown before leaving Lioris */
  linkHost?: string | null;
  /** Only returned to the organiser/admin: why the payment details were sent back */
  reviewNote?: string | null;
}

export async function getEventPaymentInfo(eventId: string): Promise<EventPaymentInfo> {
  const { data, error } = await supabase.rpc('get_event_payment_info', { p_event: eventId });
  if (error) fail(error, 'Could not load the payment information.');
  const d = (data ?? {}) as any;
  return {
    available: !!d.available,
    reason: d.reason ?? null,
    instructions: d.instructions ?? null,
    hasOnlineLink: !!d.has_online_link,
    linkHost: d.link_host ?? null,
    reviewNote: d.review_note ?? null,
  };
}

export interface PaymentPage {
  url: string;
  host: string;
  organiserName: string;
  price: number;
}

/** Records that this student opened the organiser's payment page (a referral click), and returns the link. */
export async function openEventPaymentPage(eventId: string): Promise<PaymentPage> {
  const { data, error } = await supabase.rpc('open_event_payment_page', { p_event: eventId });
  if (error) fail(error, 'Could not open the payment page.');
  const d = data as any;
  return { url: d.url, host: d.host, organiserName: d.organiser_name, price: Number(d.price) };
}

// ---------------------------------------------------------------------------------------------------
// organiser: payment details, door tools, report
// ---------------------------------------------------------------------------------------------------
export interface LinkCheckResult {
  status: 'ok' | 'warning' | 'failed';
  url: string;
  final_host: string | null;
  http_status: number | null;
  redirects: string[];
  known_provider: boolean;
  warnings: string[];
  problem?: string;
  checked_at: string;
}

export interface EventPaymentDetails {
  paymentUrl: string;
  instructions: string;
  linkCheck: LinkCheckResult | null;
}

/** The organiser's (or an admin's) own copy of the payment link and instructions. */
export async function getEventPaymentDetails(eventId: string): Promise<EventPaymentDetails | null> {
  const { data, error } = await supabase
    .from('event_payment_details')
    .select('payment_url, instructions, link_check')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) fail(error, 'Could not load the payment details.');
  if (!data) return null;
  return { paymentUrl: data.payment_url ?? '', instructions: data.instructions ?? '', linkCheck: (data.link_check as LinkCheckResult) ?? null };
}

/** Saves the link and instructions and sends the payment details (back) to review. */
export async function saveEventPaymentDetails(eventId: string, paymentUrl: string, instructions: string): Promise<void> {
  const { error } = await supabase.rpc('save_event_payment_details', {
    p_event: eventId,
    p_url: paymentUrl.trim() || null,
    p_instructions: instructions.trim() || null,
  });
  if (error) fail(error, 'Could not save the payment details.');
}

export interface DoorResult {
  status: 'checked_in' | 'already' | 'undone';
  userId: string;
  fullName: string;
  ticketCode: string;
  checkedInAt: string | null;
  purchaseConfirmedAt: string | null;
  ticketType: 'free' | 'paid';
}

/** Check someone in by the code on their pass (typed, or read from the QR), or by picking them from the roster. */
export async function checkInAttendee(
  eventId: string,
  who: { code: string } | { userId: string },
  options: { undo?: boolean } = {},
): Promise<DoorResult> {
  const { data, error } = await supabase.rpc('checkin_event_attendee', {
    p_event: eventId,
    p_code: 'code' in who ? who.code : null,
    p_user: 'userId' in who ? who.userId : null,
    p_undo: !!options.undo,
  });
  if (error) fail(error, 'Could not check this person in.');
  const d = data as any;
  return {
    status: d.status,
    userId: d.user_id,
    fullName: d.full_name,
    ticketCode: d.ticket_code,
    checkedInAt: d.checked_in_at ?? null,
    purchaseConfirmedAt: d.purchase_confirmed_at ?? null,
    ticketType: d.ticket_type,
  };
}

/** Paid events: the organiser confirms that a checked-in student actually bought entry. */
export async function confirmPurchase(eventId: string, userId: string, confirmed = true): Promise<string | null> {
  const { data, error } = await supabase.rpc('confirm_event_purchase', { p_event: eventId, p_user: userId, p_confirmed: confirmed });
  if (error) fail(error, 'Could not record that.');
  return (data as any)?.purchase_confirmed_at ?? null;
}

export interface ReferralReport {
  eventId: string;
  ticketType: 'free' | 'paid';
  price: number | null;
  paymentMethod: PaymentMethod | null;
  capacity: number | null;
  linkClicks: number;
  rsvps: number;
  checkedIn: number;
  purchasesConfirmed: number;
  awaitingConfirmation: number;
  noShows: number | null;
  /** Admin only */
  partnershipStatus?: PartnershipStatus;
  feePerPayingAttendee?: number | null;
  estimatedAmount?: number | null;
  disputeWindowDays?: number;
  disputeWindowEndsAt?: string;
  disputeWindowOpen?: boolean;
}

export async function getReferralReport(eventId: string): Promise<ReferralReport> {
  const { data, error } = await supabase.rpc('event_referral_report', { p_event: eventId });
  if (error) fail(error, 'Could not load the report.');
  const d = data as any;
  return {
    eventId: d.event_id,
    ticketType: d.ticket_type,
    price: d.price != null ? Number(d.price) : null,
    paymentMethod: d.payment_method ?? null,
    capacity: d.capacity ?? null,
    linkClicks: d.link_clicks ?? 0,
    rsvps: d.rsvps ?? 0,
    checkedIn: d.checked_in ?? 0,
    purchasesConfirmed: d.purchases_confirmed ?? 0,
    awaitingConfirmation: d.awaiting_confirmation ?? 0,
    noShows: d.no_shows ?? null,
    partnershipStatus: d.partnership_status,
    feePerPayingAttendee: d.fee_per_paying_attendee != null ? Number(d.fee_per_paying_attendee) : null,
    estimatedAmount: d.estimated_amount != null ? Number(d.estimated_amount) : null,
    disputeWindowDays: d.dispute_window_days,
    disputeWindowEndsAt: d.dispute_window_ends_at,
    disputeWindowOpen: d.dispute_window_open,
  };
}

// ---------------------------------------------------------------------------------------------------
// admin desk
// ---------------------------------------------------------------------------------------------------
export type PartnershipStatus = 'none' | 'proposed' | 'agreed' | 'ended';

export interface PaidEventOverview {
  eventId: string;
  title: string;
  campusCode: string;
  status: string;
  startTime: string;
  endTime: string;
  organiserId: string;
  organiserName: string;
  price: number;
  paymentMethod: PaymentMethod;
  reservationHeld: boolean;
  capacity: number | null;
  bookingDeadline: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  reviewedAt: string | null;
  paymentUrl: string | null;
  instructions: string | null;
  linkHost: string | null;
  linkCheck: LinkCheckResult | null;
  linkCheckStale: boolean;
  linkClicks: number;
  rsvps: number;
  checkedIn: number;
  purchasesConfirmed: number;
  partnershipStatus: PartnershipStatus;
  feePerPayingAttendee: number | null;
  organiserLegalName: string | null;
  organiserContact: string | null;
  disputeWindowDays: number;
  agreedAt: string | null;
  partnershipNotes: string | null;
}

export async function adminListPaidEvents(): Promise<PaidEventOverview[]> {
  const { data, error } = await supabase.rpc('admin_paid_events_overview');
  if (error) fail(error, 'Could not load the paid events.');
  return ((data ?? []) as any[]).map((d) => ({
    eventId: d.event_id,
    title: d.title,
    campusCode: d.campus_code,
    status: d.status,
    startTime: d.start_time,
    endTime: d.end_time,
    organiserId: d.organiser_id,
    organiserName: d.organiser_name,
    price: Number(d.price),
    paymentMethod: d.payment_method,
    reservationHeld: !!d.reservation_held,
    capacity: d.capacity ?? null,
    bookingDeadline: d.booking_deadline ?? null,
    reviewStatus: d.review_status,
    reviewNote: d.review_note ?? null,
    reviewedAt: d.reviewed_at ?? null,
    paymentUrl: d.payment_url ?? null,
    instructions: d.instructions ?? null,
    linkHost: d.link_host ?? null,
    linkCheck: d.link_check ?? null,
    linkCheckStale: !!d.link_check_stale,
    linkClicks: Number(d.link_clicks ?? 0),
    rsvps: Number(d.rsvps ?? 0),
    checkedIn: Number(d.checked_in ?? 0),
    purchasesConfirmed: Number(d.purchases_confirmed ?? 0),
    partnershipStatus: d.partnership_status ?? 'none',
    feePerPayingAttendee: d.fee_per_paying_attendee != null ? Number(d.fee_per_paying_attendee) : null,
    organiserLegalName: d.organiser_legal_name ?? null,
    organiserContact: d.organiser_contact ?? null,
    disputeWindowDays: Number(d.dispute_window_days ?? 7),
    agreedAt: d.agreed_at ?? null,
    partnershipNotes: d.partnership_notes ?? null,
  }));
}

async function callReviewFunction(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-review-paid-event', { body });
  if (error) {
    // Dynamic import: auth.ts pulls in a lot of the app.
    const { readEdgeFunctionError } = await import('./auth');
    throw await readEdgeFunctionError(error, 'Could not reach the review service. Please try again.');
  }
  if (!data || data.error) throw new Error(data?.message || 'The review service did not answer as expected.');
  return data;
}

/** Asks the server to look at the organiser's payment link (DNS, https, redirects, status) and stores the result. */
export async function adminCheckPaymentLink(eventId: string): Promise<LinkCheckResult> {
  const data = await callReviewFunction({ action: 'check_link', eventId });
  return data.result as LinkCheckResult;
}

export async function adminReviewPayment(input: {
  eventId: string;
  decision: 'approve' | 'reject';
  note?: string;
  overrideLinkCheck?: boolean;
  /** Also publish the event (when it is still waiting for approval) */
  publish?: boolean;
}): Promise<{ status: string; paymentReviewStatus: string }> {
  const data = await callReviewFunction({ action: 'review', ...input });
  return { status: data.event?.status, paymentReviewStatus: data.event?.payment_review_status };
}

export async function adminSavePartnership(input: {
  eventId: string;
  status: PartnershipStatus;
  organiserName?: string;
  organiserContact?: string;
  fee?: number | null;
  disputeWindowDays?: number;
  notes?: string;
}): Promise<void> {
  await callReviewFunction({ action: 'set_partnership', ...input });
}
