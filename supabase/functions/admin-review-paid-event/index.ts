// admin-review-paid-event
//
// Supabase Edge Function behind the admin "Paid events" desk. Lioris never takes a ticket payment: the organiser
// collects it on their own payment page or at the venue. What Lioris does own is the decision to show students
// an organiser's price and payment link, so every paid event is reviewed by an administrator first.
//
// Actions (POST { action, eventId, ... }):
//   check_link       Look at the organiser's payment link from the server (DNS, HTTPS, redirects, HTTP status) and
//                    store the result next to the link. Nothing is read from the page itself.
//   review           approve | reject the payment details (optionally publishing the event in the same step).
//                    Approving an online payment needs a passing link check of the CURRENT link, or an override
//                    with a written reason.
//   set_partnership  Record (or update) the revenue arrangement for the event: none / proposed / agreed / ended,
//                    the fee per verified paying attendee and the dispute window.
//
// Why here and not in the browser or SQL: fetching an organiser-supplied URL from a server is a classic SSRF risk,
// so it is done here with strict rules (https only, no IP addresses, no private or loopback DNS answers, at most 4
// redirects that are each re-checked, no response body read). The database functions it calls
// (admin_store_link_check / admin_apply_payment_review / admin_save_partnership) are granted to service_role only,
// so the review cannot be done around this function, and every one of them writes the audit trail.
//
// Guard rails: caller must be a non-suspended admin (AAL2 step-up when they enrolled a factor, see _shared/auth.ts);
// 40 link checks and 60 decisions per admin per hour.
//
// Deployment (verify_jwt ON):  supabase functions deploy admin-review-paid-event

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 8 * 1024;
const FETCH_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

// Providers an organiser commonly uses. Informational only: an unknown host is not refused, it is flagged.
const KNOWN_PROVIDERS = [
  'paystack.com', 'paystack.shop', 'flutterwave.com', 'flutterwave.cc', 'selar.co', 'selar.com', 'eventbrite.com', 'tix.africa',
];
const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'cutt.ly', 'rebrand.ly', 'buff.ly', 'ow.ly', 'shorturl.at', 'tiny.cc', 'goo.gl', 't.ly',
];

interface Body {
  action?: unknown;
  eventId?: unknown;
  decision?: unknown;
  note?: unknown;
  overrideLinkCheck?: unknown;
  publish?: unknown;
  status?: unknown;
  organiserName?: unknown;
  organiserContact?: unknown;
  fee?: unknown;
  disputeWindowDays?: unknown;
  notes?: unknown;
}

class Fail extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

const onList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith('.' + d));

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(':')) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]);
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  const p = lower.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function resolveAll(host: string): Promise<string[] | null> {
  const resolver = (Deno as unknown as { resolveDns?: (q: string, t: string) => Promise<string[]> }).resolveDns;
  if (typeof resolver !== 'function') return null; // runtime without DNS access: cannot vet the addresses
  const out: string[] = [];
  for (const type of ['A', 'AAAA']) {
    try {
      const records = await resolver(host, type);
      if (Array.isArray(records)) out.push(...records);
    } catch (err) {
      if ((err instanceof Error ? err.name : '') !== 'NotFound') throw err;
    }
  }
  return out;
}

interface LinkCheck {
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

function hostProblem(u: URL): string | null {
  if (u.protocol !== 'https:') return 'The link must use https://.';
  if (u.username || u.password) return 'The link contains a username or password.';
  if (u.port && u.port !== '443') return 'The link uses a non-standard port.';
  const h = u.hostname.toLowerCase();
  if (/^[0-9.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return 'The link uses an IP address instead of a website name.';
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(h)) return 'The link is not a valid public website address.';
  if (/\.(local|internal|localhost|lan|test|invalid)$/.test(h)) return 'The link is not a public website.';
  return null;
}

async function checkLink(rawUrl: string): Promise<LinkCheck> {
  const result: LinkCheck = {
    status: 'ok', url: rawUrl, final_host: null, http_status: null, redirects: [], known_provider: false, warnings: [],
    checked_at: new Date().toISOString(),
  };
  const fail = (problem: string): LinkCheck => ({ ...result, status: 'failed', problem });

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return fail('The link is not a valid web address.');
  }
  const submittedHost = current.hostname.toLowerCase();
  if (onList(submittedHost, SHORTENERS)) {
    result.warnings.push('The link is a shortened link. Ask the organiser for the real payment page address.');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = hostProblem(current);
    if (problem) return fail(hop === 0 ? problem : `A redirect led somewhere unsafe: ${problem}`);
    const host = current.hostname.toLowerCase();
    result.final_host = host;

    let addresses: string[] | null;
    try {
      addresses = await resolveAll(host);
    } catch {
      return fail(`Could not look up ${host} in DNS.`);
    }
    if (addresses !== null) {
      if (addresses.length === 0) return fail(`${host} does not exist in DNS.`);
      if (addresses.some(isPrivateIp)) return fail(`${host} points at a private network address.`);
    } else {
      result.warnings.push('DNS could not be checked from the server.');
    }

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'LiorisLinkCheck/1.0 (+https://lioris-campus.vercel.app)', Range: 'bytes=0-1023', Accept: 'text/html,*/*;q=0.5' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return fail(timedOut ? `${host} did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds.` : `Could not connect to ${host}.`);
    }
    result.http_status = res.status;
    const location = res.headers.get('location');
    await res.body?.cancel().catch(() => {}); // never read the page

    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === MAX_REDIRECTS) return fail('The link redirects too many times.');
      try {
        current = new URL(location, current);
      } catch {
        return fail('The link redirects to an invalid address.');
      }
      result.redirects.push(current.hostname.toLowerCase());
      continue;
    }
    break;
  }

  const status = result.http_status ?? 0;
  const finalHost = result.final_host ?? '';
  result.known_provider = onList(finalHost, KNOWN_PROVIDERS);
  if (finalHost && finalHost !== submittedHost) {
    result.warnings.push(`The link redirects to ${finalHost}.`);
  }
  if (status >= 200 && status < 300) {
    /* reachable */
  } else if ([401, 403, 429, 503].includes(status)) {
    result.warnings.push(`${finalHost} answered ${status}: it may block automated checks. Open the link yourself before approving.`);
  } else if (status >= 300 && status < 400) {
    return fail('The link redirects without saying where.');
  } else {
    return fail(`${finalHost} answered ${status || 'with an error'}.`);
  }
  if (!result.known_provider) result.warnings.push(`${finalHost} is not a payment provider Lioris recognises. Make sure the organiser owns it.`);
  result.status = result.warnings.some((w) => !w.includes('not a payment provider Lioris recognises')) ? 'warning' : 'ok';
  return result;
}

/** "<code>: sentence" errors raised by the database functions become HTTP failures. */
function mapDbError(message: string): Fail {
  const m = /^([a-z_]+)(?::\s*([\s\S]*))?$/.exec(message.trim());
  if (!m) return new Fail(500, 'db_error', 'The database rejected this change.');
  const code = m[1];
  const text = (m[2] ?? '').trim() || code.replace(/_/g, ' ');
  const status = code === 'not_allowed' ? 403 : code === 'not_found' ? 404 : 409;
  if (['invalid_input', 'note_required', 'agreement_incomplete', 'payment_link_required', 'instructions_required'].includes(code)) return new Fail(422, code, text);
  return new Fail(status, code, text);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-review-paid-event] Missing required environment secrets.');
    return jsonResponse(req, { error: 'server_misconfigured', message: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { user: caller } = auth.caller;

  const parsed = await readJsonBody<Body>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: 'bad_request', message: parsed.error }, parsed.status);
  const b = parsed.value;

  try {
    const action = b.action;
    if (action !== 'check_link' && action !== 'review' && action !== 'set_partnership') {
      throw new Fail(400, 'bad_request', 'action must be check_link, review or set_partnership.');
    }
    if (!isUuid(b.eventId)) throw new Fail(400, 'bad_request', 'eventId must be an event id.');
    const eventId = b.eventId as string;

    const limit = action === 'check_link' ? 40 : 60;
    const limited = await consumeRateLimit(admin, `paid-event-${action === 'check_link' ? 'check' : 'decide'}:${caller.id}`, limit, 3600);
    if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many requests. Try again later.' }, 429);
    if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

    // ------------------------------------------------------------------ check_link
    if (action === 'check_link') {
      const { data: event, error: eventError } = await admin.from('events').select('id, ticket_type, payment_method').eq('id', eventId).maybeSingle();
      if (eventError) throw new Fail(500, 'db_error', 'Could not look up the event.');
      if (!event || event.ticket_type !== 'paid') throw new Fail(404, 'not_found', 'That paid event does not exist.');
      if (event.payment_method === 'at_venue') throw new Fail(409, 'no_payment_page', 'This event is paid at the venue, so there is no link to check.');
      const { data: details, error: detailsError } = await admin.from('event_payment_details').select('payment_url').eq('event_id', eventId).maybeSingle();
      if (detailsError) throw new Fail(500, 'db_error', 'Could not read the payment details.');
      if (!details?.payment_url) throw new Fail(409, 'payment_link_required', 'The organiser has not added a payment link yet.');

      const result = await checkLink(details.payment_url);
      const { error } = await admin.rpc('admin_store_link_check', { p_event: eventId, p_actor: caller.id, p_result: result });
      if (error) throw mapDbError(error.message);
      return jsonResponse(req, { success: true, result }, 200);
    }

    // ------------------------------------------------------------------ review
    if (action === 'review') {
      if (b.decision !== 'approve' && b.decision !== 'reject') throw new Fail(400, 'bad_request', 'decision must be approve or reject.');
      const { data, error } = await admin.rpc('admin_apply_payment_review', {
        p_event: eventId,
        p_actor: caller.id,
        p_decision: b.decision,
        p_note: str(b.note, 500),
        p_override_link_check: b.overrideLinkCheck === true,
        p_publish: b.publish === true,
      });
      if (error) throw mapDbError(error.message);
      return jsonResponse(req, { success: true, event: data }, 200);
    }

    // ------------------------------------------------------------------ set_partnership
    const status = b.status;
    if (status !== 'none' && status !== 'proposed' && status !== 'agreed' && status !== 'ended') {
      throw new Fail(400, 'bad_request', 'status must be none, proposed, agreed or ended.');
    }
    const fee = b.fee === null || b.fee === undefined || b.fee === '' ? null : Number(b.fee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000)) throw new Fail(422, 'invalid_input', 'The fee must be an amount in naira between 0 and 1,000,000.');
    const days = b.disputeWindowDays === undefined || b.disputeWindowDays === null ? 7 : Number(b.disputeWindowDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new Fail(422, 'invalid_input', 'The dispute window must be between 1 and 90 days.');
    const { data, error } = await admin.rpc('admin_save_partnership', {
      p_event: eventId,
      p_actor: caller.id,
      p_status: status,
      p_organiser_name: str(b.organiserName, 160),
      p_organiser_contact: str(b.organiserContact, 200),
      p_fee: fee,
      p_dispute_days: days,
      p_notes: str(b.notes, 1000),
    });
    if (error) throw mapDbError(error.message);
    return jsonResponse(req, { success: true, partnership: data }, 200);
  } catch (err) {
    if (err instanceof Fail) return jsonResponse(req, { error: err.code, message: err.message, ...err.extra }, err.status);
    console.error('[admin-review-paid-event] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error. Nothing was changed.' }, 500);
  }
});
