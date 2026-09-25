// Pure helpers for paid events: wording, form validation and booking state.
//
// Paid events on Lioris are discovery + referral only. Lioris never takes the payment and never marks anyone
// "paid" because they clicked a link or registered; the wording below is deliberately careful about that.
// See docs/operations/paid-events.md.

export type PaymentMethod = 'online' | 'at_venue' | 'both';

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: 'online', label: "Organiser's website", hint: 'Students pay on your own payment page (Paystack, Selar, your site...).' },
  { value: 'at_venue', label: 'At the venue', hint: 'Students pay at the entrance.' },
  { value: 'both', label: 'Either', hint: 'Online through your link, or at the venue.' },
];

export function paymentMethodLabel(method: PaymentMethod | null | undefined): string {
  switch (method) {
    case 'online':
      return "Pay on the organiser's website";
    case 'at_venue':
      return 'Pay at the venue';
    case 'both':
      return 'Pay online or at the venue';
    default:
      return '';
  }
}

/** ₦2,000 / ₦1,500.50. The organiser sets the price; Lioris only displays it. */
export function formatNaira(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const whole = Number.isInteger(n);
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function paidLabel(price: number | null | undefined): string {
  return `Paid event · ${formatNaira(price)}`;
}

// ---------------------------------------------------------------------------------------------------
// payment link (mirrors payment_url_problem() in the database, so the form can explain before saving)
// ---------------------------------------------------------------------------------------------------
const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function paymentHost(url: string | null | undefined): string | null {
  const m = /^https:\/\/([^/?#]*)/i.exec((url ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

export function paymentUrlProblem(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  if (url.length > 500) return 'The payment link is too long (500 characters at most).';
  if (/\s/.test(url)) return 'The payment link cannot contain spaces.';
  if (!/^https:\/\//i.test(url)) return 'The payment link must start with https://.';
  const host = paymentHost(url);
  if (!host) return 'The payment link needs a website address.';
  if (host.includes('@')) return 'The payment link cannot contain a username or password.';
  if (host.includes(':')) return 'Use the normal website address without a port number.';
  if (/^[0-9.]+$/.test(host) || host.startsWith('[')) return "Use the organiser's website name, not an IP address.";
  if (!HOST_RE.test(host)) return 'That does not look like a valid website address.';
  if (host === 'localhost' || /\.(local|internal|localhost|lan|test|invalid)$/.test(host)) return 'That address is not a public website.';
  return null;
}

// ---------------------------------------------------------------------------------------------------
// organiser form
// ---------------------------------------------------------------------------------------------------
export interface TicketFormValues {
  ticketType: 'free' | 'paid';
  price: string;
  method: PaymentMethod;
  paymentUrl: string;
  instructions: string;
  reservationHeld: boolean;
  /** ISO string, or '' for "no deadline" */
  bookingDeadline: string;
}

export const EMPTY_TICKET_FORM: TicketFormValues = {
  ticketType: 'free',
  price: '',
  method: 'online',
  paymentUrl: '',
  instructions: '',
  reservationHeld: false,
  bookingDeadline: '',
};

export function parsePrice(text: string): number {
  const n = Number(String(text ?? '').replace(/[₦,\s]|NGN/gi, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** First problem with the ticket section of the event form, or null. */
export function validateTicketForm(v: TicketFormValues, opts: { eventEndAt?: string | null } = {}): string | null {
  if (v.ticketType === 'free') return null;
  const price = parsePrice(v.price);
  if (!Number.isFinite(price) || price <= 0) return 'Enter the ticket price in naira (more than 0), or choose Free.';
  if (price > 1_000_000) return 'The ticket price cannot be more than ₦1,000,000.';
  if (Math.round(price * 100) !== price * 100 && Math.abs(Math.round(price * 100) - price * 100) > 1e-6) {
    return 'Use at most two decimal places in the price.';
  }
  const online = v.method === 'online' || v.method === 'both';
  const venue = v.method === 'at_venue' || v.method === 'both';
  if (online) {
    if (!v.paymentUrl.trim()) return 'Add your payment link, or choose "At the venue".';
    const problem = paymentUrlProblem(v.paymentUrl);
    if (problem) return problem;
  }
  if (venue && v.instructions.trim().length < 5) return 'Say how people pay at the venue (for example "cash or transfer at the entrance").';
  if (v.instructions.trim().length > 400) return 'Keep the payment instructions under 400 characters.';
  if (v.bookingDeadline) {
    const deadline = new Date(v.bookingDeadline).getTime();
    if (!Number.isFinite(deadline)) return 'The booking deadline is not a valid date.';
    const end = opts.eventEndAt ? new Date(opts.eventEndAt).getTime() : NaN;
    if (Number.isFinite(end) && deadline > end) return 'The booking deadline must be before the event ends.';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// student side: what can I do right now?
// ---------------------------------------------------------------------------------------------------
export type BookingState = 'open' | 'closed' | 'full' | 'ended' | 'paused' | 'in_review';

export interface BookingInput {
  ticketType?: 'free' | 'paid';
  paymentReviewStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  reservationHeld?: boolean;
  capacity?: number | null;
  rsvpCount: number;
  bookingDeadline?: string | null;
  endAt: string;
}

/** Same rules the database applies in rsvp_event(), so the button is honest before it is pressed. */
export function bookingState(event: BookingInput, opts: { now?: Date; paidEventsEnabled?: boolean } = {}): BookingState {
  const now = (opts.now ?? new Date()).getTime();
  const end = new Date(event.endAt).getTime();
  if (Number.isFinite(end) && now > end) return 'ended';
  const paid = event.ticketType === 'paid';
  if (paid) {
    if (opts.paidEventsEnabled === false) return 'paused';
    if (event.paymentReviewStatus !== 'approved') return 'in_review';
  }
  const deadline = event.bookingDeadline ? new Date(event.bookingDeadline).getTime() : NaN;
  if (Number.isFinite(deadline) && now > deadline) return 'closed';
  const capped = !!event.capacity && event.capacity > 0 && (!paid || !!event.reservationHeld);
  if (capped && event.rsvpCount >= (event.capacity as number)) return 'full';
  return 'open';
}

export function bookingStateMessage(state: BookingState): string {
  switch (state) {
    case 'ended':
      return 'This event has ended.';
    case 'paused':
      return 'Paid events are paused on Lioris right now.';
    case 'in_review':
      return 'The organiser’s payment details are being checked. Check back soon.';
    case 'closed':
      return 'Booking has closed for this event.';
    case 'full':
      return 'This event is full.';
    default:
      return '';
  }
}

export function registerLabel(
  event: { ticketType?: 'free' | 'paid'; reservationHeld?: boolean; paymentMethod?: PaymentMethod | null },
  registered: boolean,
): string {
  if (event.ticketType !== 'paid') return registered ? 'Release / cancel seat' : 'Claim your seat (RSVP)';
  if (registered) return 'Cancel registration';
  return event.reservationHeld && event.paymentMethod !== 'online' ? 'Reserve a place' : 'Register interest';
}

export function registeredBadge(event: { ticketType?: 'free' | 'paid'; reservationHeld?: boolean; paymentMethod?: PaymentMethod | null }): string {
  if (event.ticketType !== 'paid') return 'Seat confirmed';
  return event.reservationHeld && event.paymentMethod !== 'online' ? 'Place reserved' : 'Interest registered';
}

// ---------------------------------------------------------------------------------------------------
// reference codes
// ---------------------------------------------------------------------------------------------------
/** a1b2c3d4e5f6 -> A1B2-C3D4-E5F6 */
export function formatTicketCode(code: string | null | undefined): string {
  const c = String(code ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return c.replace(/(.{4})(?=.)/g, '$1-');
}

/** What the QR code contains. The prefix lets a scanner tell a Lioris pass from any other QR code. */
export function qrPayload(code: string): string {
  return `LIORIS:${String(code).replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
}

/** Turn whatever was scanned or typed ("LIORIS:A1B2C3D4E5F6", "a1b2-c3d4-e5f6") into the 12-character code, or null. */
export function parseTicketScan(text: string | null | undefined): string | null {
  let c = String(text ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (c.startsWith('LIORIS')) c = c.slice(6);
  return /^[0-9A-F]{12}$/.test(c) ? c.toLowerCase() : null;
}

// ---------------------------------------------------------------------------------------------------
// funnel
// ---------------------------------------------------------------------------------------------------
export interface FunnelCounts {
  linkClicks: number;
  rsvps: number;
  checkedIn: number;
  purchasesConfirmed: number;
}

/** "3 of 10 (30%)" without dividing by zero. */
export function ratio(part: number, whole: number): string {
  if (!whole) return `${part}`;
  return `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`;
}

/** Wording for a check-in count: reach is not revenue, so only confirmed purchases are called purchases. */
export function funnelSentence(f: FunnelCounts): string {
  return `${f.linkClicks} opened the payment page · ${f.rsvps} registered · ${f.checkedIn} checked in · ${f.purchasesConfirmed} confirmed as bought entry`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? '' : String(cell);
          // A leading = + - @ makes spreadsheets run the cell as a formula.
          const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}
