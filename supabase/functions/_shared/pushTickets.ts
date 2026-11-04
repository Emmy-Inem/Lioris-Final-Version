// Pure helper (no Deno / network imports, so node --test can import it).
//
// Interprets the tickets an Expo Push Service batch answers with. Tickets come back in the same order as
// the messages that were posted, so ticket i belongs to token i.

export interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface TicketOutcome {
  /** Messages Expo accepted for delivery (status 'ok'). */
  sent: number;
  /** Tokens Expo says no device is registered for any more: safe to delete. */
  deadTokens: string[];
  /** Error classes of every other failed ticket (never a message body or a token). */
  errors: string[];
}

export function classifyTickets(tokens: string[], tickets: ExpoTicket[]): TicketOutcome {
  const out: TicketOutcome = { sent: 0, deadTokens: [], errors: [] };
  // Only as many tickets as messages were sent: a longer answer must never be indexed past the batch
  // (that used to push the literal string "undefined" into the list of tokens to delete).
  const n = Math.min(tokens.length, tickets.length);
  for (let i = 0; i < n; i++) {
    const ticket = tickets[i];
    if (ticket?.status === 'ok') {
      out.sent++;
    } else if (ticket?.details?.error === 'DeviceNotRegistered') {
      out.deadTokens.push(tokens[i]);
    } else if (ticket?.status === 'error') {
      out.errors.push(ticket.details?.error ?? 'unknown');
    }
  }
  return out;
}

/**
 * True when NOT ONE batch got an answer from Expo (every request failed or was rejected). In that case the
 * notification was not delivered to anybody and the de-duplication slot taken for it must be given back so
 * a retry of the webhook can deliver it. When at least one batch was answered a retry would double-send to
 * the devices already served, so the slot is kept.
 */
export function nothingDelivered(batchesAttempted: number, batchesAnswered: number): boolean {
  return batchesAttempted > 0 && batchesAnswered === 0;
}
