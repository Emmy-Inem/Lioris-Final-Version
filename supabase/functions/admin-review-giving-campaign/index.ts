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
//   update_total  an administrator confirms the running total (owners only REPORT theirs, in reported_total).
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
import { isUuid, requireAdmin, isCallerSuperAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 4 * 1024;

interface Body {
  action?: unknown;
  campaignId?: unknown;
  decision?: unknown;
  note?: unknown;
  confirmedTotal?: unknown;
  /** Super Admin only: allow deciding a campaign that was already approved / rejected. */
  allowRereview?: unknown;
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

/**
 * A money amount from JSON: a finite number, or a plain numeric string ("1500", "1500.50").
 * Number('') / Number(null) / Number([]) / Number(true) all coerce to 0 or 1 - those are rejected here
 * instead of silently becoming a total. Returns null when the value is not a valid non-negative amount.
 */
function parseMoney(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(v.trim())) n = Number(v.trim());
  else return null;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** "<code>: sentence" errors raised by the database functions become HTTP failures. */
function mapDbError(message: string): Fail {
  const m = /^([a-z_]+)(?::\s*([\s\S]*))?$/.exec(message.trim());
  if (!m) return new Fail(500, 'db_error', 'The database rejected this change.');
  const code = m[1];
  const text = (m[2] ?? '').trim() || code.replace(/_/g, ' ');
  if (['note_required', 'invalid_total'].includes(code)) return new Fail(422, code, text);
  if (code === 'not_allowed') return new Fail(403, code, text);
  if (code === 'not_found') return new Fail(404, code, text);
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

    const isSuper = isCallerSuperAdmin(auth.caller);
    if (!isSuper) {
      const callerCampus = auth.caller.profile?.campus_code;
      const { data: campaign, error: campError } = await admin
        .from('giving_campaigns')
        .select('id, campus_code')
        .eq('id', campaignId)
        .maybeSingle();
      if (campError) throw new Fail(500, 'db_error', 'Could not verify giving campaign permissions.');
      if (!campaign) throw new Fail(404, 'not_found', 'Giving campaign not found.');
      // Fail CLOSED: a GLOBAL / NULL campaign (or a GLOBAL / campus-less admin) is Super Admin only.
      // The database function enforces the same rule; this just answers early with a clear 403.
      if (
        !callerCampus ||
        callerCampus === 'GLOBAL' ||
        !campaign.campus_code ||
        campaign.campus_code === 'GLOBAL' ||
        campaign.campus_code !== callerCampus
      ) {
        throw new Fail(403, 'forbidden', 'Campus Admins can only review giving campaigns of their own campus. Global campaigns are reviewed by a Super Admin.');
      }
    }

    const limited = await consumeRateLimit(admin, `giving-campaign-decide:${caller.id}`, 60, 3600);
    if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many requests. Try again later.' }, 429);
    if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

    if (action === 'review') {
      if (b.decision !== 'approve' && b.decision !== 'reject') throw new Fail(400, 'bad_request', 'decision must be approve or reject.');
      const note = str(b.note, 500);
      if (b.decision === 'reject' && (!note || note.length < 5)) throw new Fail(422, 'note_required', 'A rejection needs a short reason (5+ characters).');
      // The database function records the reviewer (p_actor), checks scope + that the campaign is
      // still pending, and writes the audit row in the same transaction - so there is no client audit.
      const { data, error } = await admin.rpc('admin_review_giving_campaign', {
        p_campaign: campaignId,
        p_approve: b.decision === 'approve',
        p_note: note,
        p_actor: caller.id,
        p_allow_rereview: isSuper && b.allowRereview === true,
      });
      if (error) throw mapDbError(error.message);
      return jsonResponse(req, { success: true, campaign: data }, 200);
    }

    const total = parseMoney(b.confirmedTotal);
    if (total === null || total > 1_000_000_000) {
      throw new Fail(422, 'invalid_total', 'The confirmed total must be a non-negative amount (numbers only, up to 2 decimals).');
    }
    const { data, error } = await admin.rpc('admin_update_giving_total', {
      p_campaign: campaignId,
      p_confirmed_total: total,
      p_actor: caller.id,
    });
    if (error) throw mapDbError(error.message);
    return jsonResponse(req, { success: true, campaign: data }, 200);
  } catch (err) {
    if (err instanceof Fail) return jsonResponse(req, { error: err.code, message: err.message }, err.status);
    console.error('[admin-review-giving-campaign] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error. Nothing was changed.' }, 500);
  }
});
