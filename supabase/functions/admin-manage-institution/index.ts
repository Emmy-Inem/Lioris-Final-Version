// admin-manage-institution
//
// Supabase Edge Function behind the admin "Campuses" screen: adds a university to the platform, edits it,
// and switches it on/off. It runs server-side because it needs the service role (to write the audit trail
// and to look at every campus's claimed email domains) and because it does things the database cannot:
// it asks DNS whether the email domains you typed actually exist.
//
// Why so much validation? A campus's `email_domains` decide who is AUTO-VERIFIED at signup (see
// campus_for_email() / auto_verify_institutional_email()). A typo'd or hostile domain is a way to mark
// strangers as verified students, so this function (and the campuses_guard() trigger behind it) refuse:
//   * malformed domains, public mailbox providers (gmail.com ...) and bare public suffixes (edu.ng ...)
//   * a domain another campus already claims (exactly, or as a parent/sub-domain of it)
//   * domains that do not resolve in DNS (override with allowUnresolvedDomains: true)
//
// Guard rails:
//   * caller must be a non-suspended admin (AAL2 step-up when they enrolled a factor - see _shared/auth.ts)
//   * 30 changes per admin per hour
//   * every successful change is written to audit_logs with the acting admin
//
// Request:  POST { action: 'create' | 'update' | 'set_active', code, ... }   (see `Body` below)
// Response: { success: true, campus, warnings?: string[] }  or  { error, message, ...details }
//
// Deployment (verify_jwt ON):  supabase functions deploy admin-manage-institution
// SUPABASE_URL / SUPABASE_ANON_KEY are provided at runtime; SUPABASE_SERVICE_ROLE_KEY is a secret.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isUuid, requireAdmin } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 16 * 1024;

interface PortalSeed {
  title: string;
  url: string;
  category?: string;
  icon?: string;
}

interface Body {
  action?: unknown;
  code?: unknown;
  name?: unknown;
  shortName?: unknown;
  location?: unknown;
  emailDomains?: unknown;
  primaryColor?: unknown;
  websiteUrl?: unknown;
  isActive?: unknown;
  confirm?: unknown;
  dryRun?: unknown;
  allowUnresolvedDomains?: unknown;
  waitlistEntryId?: unknown;
  seedPortalLinks?: unknown;
}

// Mirrors campuses_guard() so the admin gets a precise message instead of a database error.
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'zoho.com',
  'gmx.com', 'mail.com', 'yandex.com', 'tutanota.com', 'fastmail.com', 'lioris.app', 'edu.ng', 'com.ng', 'gov.ng',
  'org.ng', 'net.ng', 'sch.ng', 'ac.uk', 'co.uk', 'ac.za', 'co.za', 'edu.gh', 'edu.au', 'edu.ke', 'ac.ke', 'ac.ug',
  'edu.eg', 'edu.in', 'ac.in',
]);
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const CODE_RE = /^[A-Z][A-Z0-9]{1,15}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

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

function normaliseDomains(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Fail(400, 'invalid_domain', 'emailDomains must be a list of domains.');
  if (raw.length > 10) throw new Fail(400, 'invalid_domain', 'A campus can have at most 10 email domains.');
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') throw new Fail(400, 'invalid_domain', 'Each email domain must be text.');
    const d = item.trim().toLowerCase().replace(/^@/, '');
    if (!d) continue;
    if (!DOMAIN_RE.test(d)) throw new Fail(400, 'invalid_domain', `"${d}" is not a valid email domain (example: lasu.edu.ng).`);
    if (PUBLIC_DOMAINS.has(d)) {
      throw new Fail(400, 'public_domain_blocked', `"${d}" is a public email provider or shared suffix, not a university domain.`);
    }
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** true = resolves, false = definitely does not exist, null = could not check (runtime without DNS access). */
async function domainResolves(domain: string): Promise<boolean | null> {
  const resolver = (Deno as unknown as { resolveDns?: (q: string, t: string) => Promise<unknown[]> }).resolveDns;
  if (typeof resolver !== 'function') return null;
  for (const type of ['MX', 'A', 'AAAA']) {
    try {
      const records = await resolver(domain, type);
      if (Array.isArray(records) && records.length > 0) return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      // NotFound = NXDOMAIN / no such record. Anything else (permission, network) means "unknown".
      if (name !== 'NotFound') return null;
    }
  }
  return false;
}

/** Map a Postgres error raised by campuses_guard() (message starts with its code) to an HTTP failure. */
function mapDbError(message: string): Fail {
  const m = /^(invalid_code|invalid_name|invalid_domain|public_domain_blocked|domain_taken):\s*(.*)$/s.exec(message);
  if (m) return new Fail(m[1] === 'domain_taken' ? 409 : 400, m[1], m[2]);
  if (/campuses_code_key|duplicate key/i.test(message)) return new Fail(409, 'code_taken', 'A campus with this code already exists.');
  if (/campuses_details_chk/i.test(message)) return new Fail(400, 'invalid_details', 'Check the colour (#RRGGBB) and website (https://...).');
  return new Fail(500, 'db_error', 'The database rejected this change.');
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[admin-manage-institution] Missing required environment secrets.');
    return jsonResponse(req, { error: 'server_misconfigured', message: 'Server misconfiguration. Missing required secrets.' }, 500);
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { user: caller } = auth.caller;

  const limited = await consumeRateLimit(admin, `manage-institution:${caller.id}`, 30, 3600);
  if (limited === 'limited') return jsonResponse(req, { error: 'rate_limited', message: 'Too many campus changes. Try again later.' }, 429);
  if (limited === 'error') return jsonResponse(req, { error: 'unavailable', message: 'Could not verify the request rate. Try again shortly.' }, 503);

  const parsed = await readJsonBody<Body>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: 'bad_request', message: parsed.error }, parsed.status);
  const b = parsed.value;

  try {
    const action = b.action;
    if (action !== 'create' && action !== 'update' && action !== 'set_active') {
      throw new Fail(400, 'bad_request', 'action must be create, update or set_active.');
    }
    const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    if (!CODE_RE.test(code) || code === 'GLOBAL') {
      throw new Fail(400, 'invalid_code', 'The campus code needs 2 to 16 letters or digits, starting with a letter (example: LASU).');
    }
    const dryRun = b.dryRun === true;
    const warnings: string[] = [];

    const { data: existing, error: lookupError } = await admin
      .from('campuses')
      .select('id, code, name, short_name, location, primary_color, website_url, email_domains, is_active, created_at')
      .eq('code', code)
      .maybeSingle();
    if (lookupError) throw new Fail(500, 'db_error', 'Could not look up the campus.');

    // ---------------------------------------------------------------- set_active
    if (action === 'set_active') {
      if (!existing) throw new Fail(404, 'not_found', 'That campus does not exist.');
      if (typeof b.isActive !== 'boolean') throw new Fail(400, 'bad_request', 'isActive must be true or false.');
      const next = b.isActive;
      if (next === existing.is_active) return jsonResponse(req, { success: true, campus: existing, unchanged: true }, 200);

      const { count: members } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('campus_code', code);
      if (!next && (members ?? 0) > 0 && b.confirm !== true) {
        throw new Fail(409, 'confirm_required',
          `${members} member(s) belong to ${existing.name}. Turning the campus off keeps them, but new signups with its email domains will no longer be recognised.`,
          { memberCount: members });
      }
      if (dryRun) return jsonResponse(req, { success: true, dryRun: true, memberCount: members ?? 0 }, 200);
      const { data: updated, error } = await admin.from('campuses').update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('code', code).select('*').single();
      if (error) throw mapDbError(error.message);
      await audit(admin, caller.id, next ? 'institution_reactivated' : 'institution_deactivated', updated.id, code,
        `${next ? 'Reactivated' : 'Deactivated'} campus ${existing.name} (${code})`, { memberCount: members ?? 0 });
      return jsonResponse(req, { success: true, campus: updated }, 200);
    }

    // ---------------------------------------------------------------- create / update
    const name = str(b.name, 120);
    if (action === 'create' && (!name || name.length < 3)) {
      throw new Fail(400, 'invalid_name', 'Enter the full university name (at least 3 characters).');
    }
    if (name !== null && name.length < 3) throw new Fail(400, 'invalid_name', 'The university name needs at least 3 characters.');
    const shortName = str(b.shortName, 24);
    const location = str(b.location, 120);
    const websiteUrl = str(b.websiteUrl, 300);
    if (websiteUrl && !/^https?:\/\/[^\s]+$/i.test(websiteUrl)) throw new Fail(400, 'invalid_details', 'The website must start with https:// (or http://).');
    const primaryColor = str(b.primaryColor, 7);
    if (primaryColor && !COLOR_RE.test(primaryColor)) throw new Fail(400, 'invalid_details', 'The colour must look like #1D4ED8.');

    const domainsProvided = b.emailDomains !== undefined;
    const domains = domainsProvided ? normaliseDomains(b.emailDomains) : (existing?.email_domains ?? []);

    if (domainsProvided) {
      // Overlap with other campuses (the trigger enforces this too; this gives a friendlier message).
      const { data: others, error: othersError } = await admin.from('campuses').select('code, email_domains').neq('code', code);
      if (othersError) throw new Fail(500, 'db_error', 'Could not check the other campuses.');
      for (const d of domains) {
        for (const o of others ?? []) {
          for (const od of (o.email_domains ?? []) as string[]) {
            if (d === od || d.endsWith('.' + od) || od.endsWith('.' + d)) {
              throw new Fail(409, 'domain_taken', `"${d}" overlaps with ${o.code}, which already uses "${od}".`);
            }
          }
        }
      }
      // DNS reality check (only for domains that are new to this campus).
      const previous = new Set<string>(existing?.email_domains ?? []);
      const unresolved: string[] = [];
      for (const d of domains.filter((x) => !previous.has(x))) {
        const ok = await domainResolves(d);
        if (ok === false) unresolved.push(d);
        else if (ok === null) warnings.push(`Could not check whether ${d} receives email; make sure it is spelled correctly.`);
      }
      if (unresolved.length > 0 && b.allowUnresolvedDomains !== true) {
        throw new Fail(422, 'domain_unresolved',
          `${unresolved.join(', ')} ${unresolved.length === 1 ? 'does' : 'do'} not exist in DNS. Check the spelling, or confirm to add ${unresolved.length === 1 ? 'it' : 'them'} anyway.`,
          { domains: unresolved });
      }
    }
    if (domains.length === 0) warnings.push('No email domain set: members of this campus will have to be verified by document instead of automatically.');

    if (action === 'create') {
      if (existing) throw new Fail(409, 'code_taken', `The code ${code} is already used by ${existing.name}.`);
    } else if (!existing) {
      throw new Fail(404, 'not_found', 'That campus does not exist.');
    }
    if (dryRun) return jsonResponse(req, { success: true, dryRun: true, domains, warnings }, 200);

    let campus;
    if (action === 'create') {
      const { data, error } = await admin.from('campuses').insert({
        code,
        name,
        short_name: shortName ?? code,
        location: location ?? 'Nigeria',
        primary_color: primaryColor ?? '#2563EB',
        website_url: websiteUrl,
        email_domains: domains,
        is_active: true,
        created_by: caller.id,
      }).select('*').single();
      if (error) throw mapDbError(error.message);
      campus = data;

      const seeds = Array.isArray(b.seedPortalLinks) ? (b.seedPortalLinks as PortalSeed[]).slice(0, 30) : [];
      const rows = seeds
        .filter((s) => s && typeof s.title === 'string' && typeof s.url === 'string' && /^https?:\/\//i.test(s.url))
        .filter((s, i, all) => all.findIndex((o) => o.title.trim().toLowerCase() === s.title.trim().toLowerCase()) === i)
        .map((s, i) => ({
          campus_code: code,
          title: s.title.trim().slice(0, 120),
          url: s.url.trim().slice(0, 500),
          category: (s.category ?? 'Academic').toString().slice(0, 40),
          icon: (s.icon ?? 'link-outline').toString().slice(0, 40),
          is_active: true,
          display_order: i + 1,
        }));
      if (rows.length > 0) {
        const { error: seedError } = await admin.from('portal_links').insert(rows);
        if (seedError) warnings.push('The campus was created, but its starter portal links could not be added.');
      }

      if (isUuid(b.waitlistEntryId)) {
        const { error: waitlistError } = await admin.from('waitlist_entries').update({ status: 'approved' }).eq('id', b.waitlistEntryId);
        if (waitlistError) warnings.push('The campus was created, but the university request could not be marked approved.');
      }
      await audit(admin, caller.id, 'institution_provisioned', campus.id, code, `Provisioned new campus: ${name} (${code})`,
        { domains, fromRequest: isUuid(b.waitlistEntryId) });
    } else {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name) patch.name = name;
      if (b.shortName !== undefined) patch.short_name = shortName ?? code;
      if (b.location !== undefined) patch.location = location ?? 'Nigeria';
      if (b.primaryColor !== undefined && primaryColor) patch.primary_color = primaryColor;
      if (b.websiteUrl !== undefined) patch.website_url = websiteUrl;
      if (domainsProvided) patch.email_domains = domains;
      const { data, error } = await admin.from('campuses').update(patch).eq('code', code).select('*').single();
      if (error) throw mapDbError(error.message);
      campus = data;
      await audit(admin, caller.id, 'institution_updated', campus.id, code, `Updated campus ${campus.name} (${code})`,
        { changed: Object.keys(patch).filter((k) => k !== 'updated_at'), domains: domainsProvided ? domains : undefined });
    }

    return jsonResponse(req, { success: true, campus, warnings }, action === 'create' ? 201 : 200);
  } catch (err) {
    if (err instanceof Fail) {
      return jsonResponse(req, { error: err.code, message: err.message, ...err.extra }, err.status);
    }
    console.error('[admin-manage-institution] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(req, { error: 'server_error', message: 'Unexpected server error. Nothing was changed.' }, 500);
  }
});

async function audit(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  actorId: string,
  action: string,
  campusId: string,
  code: string,
  summary: string,
  extra: Record<string, unknown> = {},
) {
  const { error } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action,
    entity_type: 'institution',
    entity_id: campusId,
    metadata: { summary, institutionCode: code, targetIdRaw: code, actorRole: 'admin', ...extra },
    created_at: new Date().toISOString(),
  });
  if (error) console.error('[admin-manage-institution] Failed to write audit log entry:', error.message);
}
