// admin-review-giving-campaign
//
// Supabase Edge Function behind the admin "Donations" desk. Lioris never
// processes a gift: a giving campaign just points at the org/alumnus's own
// external giving page (already validated https-only, no IPs/localhost by
// the giving_campaigns.giving_url CHECK constraint at insert time - unlike
// paid events' payment links, there is no live DNS/HTTP probe here, since a
// giving page is typically a well-known platform, not an arbitrary link a
// student is about to pay through blind).
//
// Actions (POST { action, campaignId, ... }):
//   review        approve | reject a proposed campaign (rejecting needs a note).
//   update_total  record the org's own manually-reported running total.
//
// The database functions this calls (admin_review_giving_campaign /
// admin_update_giving_total) are granted to service_role only, so the
// decision cannot be made around this function.
//
// Guard rails: caller must be a non-suspended admin (AAL2 step-up when they
// enrolled a factor, see _shared/auth.ts); 60 decisions per admin per hour.
//
// Deployment (verify_jwt ON): supabase functions deploy admin-review-giving-campaign

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 4 * 1024;

interface Body {
  action?: unknown;
  campaignId?: unknown;
  decision?: unknown;
  note?: unknown;
  confirmedTotal?: unknown;
}

class Fail extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/** "<code>: sentence" errors raised by the database functions become HTTP failures. */
function mapDbError(message: string): Fail {
  const m = /^([a-z_]+)(?::\s*([\s\S]*))?$/.exec(message.trim());
  if (!m) return new Fail(500, 'db_error', 'The database rejected this change.');
  const code = m[1];
  const text = (m[2] ?? '').trim() || code.replace(/_/g, ' ');
  if (['note_required', 'invalid_total'].includes(code)) return new Fail(422, code, text);
  return new Fail(409, code, text);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-review-giving-campaign] Missing required environment secrets.');
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
    if (action !== 'review' && action !== 'update_total') {
      throw new Fail(400, 'bad_request', 'action must be review or update_total.');
    }
    if (!isUuid(b.campaignId)) throw new Fail(400, 'bad_request', 'campaignId must be a campaign id.');
    const campaignId = b.campaignId as string;

    const limited = await consumeRateLimit(admin, `giving-campaign-decide:${caller.id}`, 60, 3600);
    if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many requests. Try again later.' }, 429);
    if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

    if (action === 'review') {
      if (b.decision !== 'approve' && b.decision !== 'reject') throw new Fail(400, 'bad_request', 'decision must be approve or reject.');
      const note = str(b.note, 500);
      if (b.decision === 'reject' && (!note || note.length < 5)) throw new Fail(422, 'note_required', 'A rejection needs a short reason (5+ characters).');
      const { error } = await admin.rpc('admin_review_giving_campaign', {
        p_campaign: campaignId,
        p_approve: b.decision === 'approve',
        p_note: note,
      });
      if (error) throw mapDbError(error.message);
      return jsonResponse(req, { success: true }, 200);
    }

    const total = Number(b.confirmedTotal);
    if (!Number.isFinite(total) || total < 0 || total > 1_000_000_000) {
      throw new Fail(422, 'invalid_total', 'The confirmed total must be a non-negative amount.');
    }
    const { error } = await admin.rpc('admin_update_giving_total', { p_campaign: campaignId, p_confirmed_total: total });
    if (error) throw mapDbError(error.message);
    return jsonResponse(req, { success: true }, 200);
  } catch (err) {
    if (err instanceof Fail) return jsonResponse(req, { error: err.code, message: err.message }, err.status);
    console.error('[admin-review-giving-campaign] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error. Nothing was changed.' }, 500);
  }
});
