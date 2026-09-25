import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingState,
  EMPTY_TICKET_FORM,
  formatNaira,
  formatTicketCode,
  funnelSentence,
  paidLabel,
  parsePrice,
  parseTicketScan,
  paymentHost,
  paymentUrlProblem,
  qrPayload,
  ratio,
  registeredBadge,
  registerLabel,
  toCsv,
  validateTicketForm,
  // @ts-ignore TS5097
} from './paidEvents.ts';

test('naira formatting shows whole amounts without decimals', () => {
  assert.equal(formatNaira(2000), '₦2,000');
  assert.equal(formatNaira(1500.5), '₦1,500.50');
  assert.equal(formatNaira(NaN), '');
  assert.equal(paidLabel(2000), 'Paid event · ₦2,000');
});

test('price text accepts naira signs, commas and NGN', () => {
  assert.equal(parsePrice('₦2,500'), 2500);
  assert.equal(parsePrice('NGN 1000'), 1000);
  assert.ok(Number.isNaN(parsePrice('free')));
});

test('payment link rules match the database', () => {
  assert.equal(paymentUrlProblem(''), null);
  assert.equal(paymentUrlProblem('https://paystack.com/pay/lioris'), null);
  for (const bad of [
    'http://paystack.com/x',
    'https://192.168.0.1/x',
    'https://user:pw@example.com/x',
    'https://example.com:8443/x',
    'https://localhost/x',
    'https://has space.com',
    'javascript:alert(1)',
    'https://nodot/x',
    `https://example.com/${'a'.repeat(500)}`,
  ]) {
    assert.notEqual(paymentUrlProblem(bad), null, bad);
  }
  assert.equal(paymentHost('https://Paystack.com/pay/x?y=1'), 'paystack.com');
  assert.equal(paymentHost('http://paystack.com'), null);
});

test('the ticket form asks for what each payment method needs', () => {
  const paid = { ...EMPTY_TICKET_FORM, ticketType: 'paid' as const, price: '2000' };
  assert.equal(validateTicketForm(EMPTY_TICKET_FORM), null);
  assert.match(validateTicketForm({ ...paid, price: '' }) ?? '', /price/);
  assert.match(validateTicketForm({ ...paid, price: '0' }) ?? '', /price/);
  assert.match(validateTicketForm({ ...paid, price: '2000000' }) ?? '', /1,000,000/);
  assert.match(validateTicketForm({ ...paid, method: 'online' }) ?? '', /payment link/);
  assert.equal(validateTicketForm({ ...paid, method: 'online', paymentUrl: 'https://paystack.com/pay/x' }), null);
  assert.match(validateTicketForm({ ...paid, method: 'at_venue' }) ?? '', /at the venue/i);
  assert.equal(validateTicketForm({ ...paid, method: 'at_venue', instructions: 'Cash at the door' }), null);
  assert.match(validateTicketForm({ ...paid, method: 'both', paymentUrl: 'https://paystack.com/x' }) ?? '', /at the venue/i);
  const late = validateTicketForm(
    { ...paid, method: 'at_venue', instructions: 'Cash at the door', bookingDeadline: '2026-10-02T10:00:00Z' },
    { eventEndAt: '2026-10-01T18:00:00Z' },
  );
  assert.match(late ?? '', /before the event ends/);
});

const base = { rsvpCount: 0, endAt: '2026-10-01T18:00:00Z' };
const now = new Date('2026-09-30T12:00:00Z');

test('booking state follows the same rules as rsvp_event()', () => {
  assert.equal(bookingState(base, { now }), 'open');
  assert.equal(bookingState({ ...base, endAt: '2026-09-29T00:00:00Z' }, { now }), 'ended');
  assert.equal(bookingState({ ...base, capacity: 10, rsvpCount: 10 }, { now }), 'full');
  assert.equal(bookingState({ ...base, bookingDeadline: '2026-09-30T11:00:00Z' }, { now }), 'closed');
  const paid = { ...base, ticketType: 'paid' as const };
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'pending' }, { now }), 'in_review');
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'rejected' }, { now }), 'in_review');
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'approved' }, { now, paidEventsEnabled: false }), 'paused');
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'approved' }, { now }), 'open');
  // interest in a paid event is not limited by capacity unless the organiser holds places
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'approved', capacity: 5, rsvpCount: 9 }, { now }), 'open');
  assert.equal(bookingState({ ...paid, paymentReviewStatus: 'approved', capacity: 5, rsvpCount: 5, reservationHeld: true }, { now }), 'full');
});

test('button wording never promises a ticket for a paid event', () => {
  assert.equal(registerLabel({ ticketType: 'free' }, false), 'Claim your seat (RSVP)');
  assert.equal(registerLabel({ ticketType: 'paid', paymentMethod: 'online' }, false), 'Register interest');
  assert.equal(registerLabel({ ticketType: 'paid', paymentMethod: 'at_venue' }, false), 'Register interest');
  assert.equal(registerLabel({ ticketType: 'paid', paymentMethod: 'at_venue', reservationHeld: true }, false), 'Reserve a place');
  assert.equal(registerLabel({ ticketType: 'paid', paymentMethod: 'online', reservationHeld: true }, false), 'Register interest');
  assert.equal(registerLabel({ ticketType: 'paid', paymentMethod: 'at_venue' }, true), 'Cancel registration');
  assert.equal(registeredBadge({ ticketType: 'paid', paymentMethod: 'online' }), 'Interest registered');
  assert.equal(registeredBadge({ ticketType: 'paid', paymentMethod: 'both', reservationHeld: true }), 'Place reserved');
  for (const label of [registeredBadge({ ticketType: 'paid' }), registerLabel({ ticketType: 'paid' }, true)]) {
    assert.doesNotMatch(label, /ticket|paid|confirmed/i);
  }
});

test('reference codes round-trip through the QR text and manual entry', () => {
  assert.equal(formatTicketCode('a1b2c3d4e5f6'), 'A1B2-C3D4-E5F6');
  assert.equal(qrPayload('a1b2c3d4e5f6'), 'LIORIS:A1B2C3D4E5F6');
  for (const text of ['LIORIS:A1B2C3D4E5F6', 'lioris:a1b2-c3d4-e5f6', ' A1B2 C3D4 E5F6 ', 'a1b2c3d4e5f6']) {
    assert.equal(parseTicketScan(text), 'a1b2c3d4e5f6', text);
  }
  for (const text of ['', 'hello', 'https://example.com', 'A1B2C3D4E5F', 'A1B2C3D4E5F6G']) assert.equal(parseTicketScan(text), null, text);
});

test('the funnel counts reach separately from confirmed purchases', () => {
  assert.equal(ratio(3, 10), '3 of 10 (30%)');
  assert.equal(ratio(0, 0), '0');
  const line = funnelSentence({ linkClicks: 12, rsvps: 10, checkedIn: 6, purchasesConfirmed: 4 });
  assert.match(line, /12 opened the payment page/);
  assert.match(line, /4 confirmed as bought entry/);
});

test('csv export neutralises spreadsheet formulas and quotes', () => {
  const csv = toCsv([['Name', 'Note'], ['=HYPERLINK("x")', 'said "hi"'], ['+1', null]]);
  assert.equal(csv, '"Name","Note"\r\n"\'=HYPERLINK(""x"")","said ""hi"""\r\n"\'+1",""');
});
