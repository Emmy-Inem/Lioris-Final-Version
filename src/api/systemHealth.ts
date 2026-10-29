import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { recordAuditLogEntry } from './auditLog';

export interface IntegrityIssue {
  id: string;
  type: 'orphaned_comments' | 'dangling_rsvps' | 'unlinked_reports' | 'unindexed_profiles';
  description: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  remediation: string;
}

export interface EdgeFunctionHealth {
  name: string;
  label: string;
  reachable: boolean;
  latencyMs: number;
  error?: string;
}

export interface SystemHealthReport {
  latencyMs: number;
  status: 'optimal' | 'degraded' | 'offline';
  timestamp: string;
  /** Row counts. null = that count could not be read (never shown as 0). */
  counts: {
    profiles: number | null;
    posts: number | null;
    comments: number | null;
    resources: number | null;
    events: number | null;
    supportTickets: number | null;
    moderationQueue: number | null;
    activeSessions: number | null;
  };
  integrityIssues: IntegrityIssue[];
  /** False when the orphan scan could not run, so an empty `integrityIssues` does not mean "all clean". */
  integrityChecked: boolean;
  edgeFunctions: EdgeFunctionHealth[];
}

/**
 * Confirms an edge function is deployed and reachable without running its real logic.
 * Every function in supabase/functions answers its CORS preflight (`handlePreflight` in
 * `_shared/cors.ts`) before any auth, rate-limiting, or upstream API call happens, so an
 * OPTIONS request is a free, honest connectivity probe - unlike a POST, which would trigger
 * a real (and billable) Gemini/Overpass call every time an admin loads this screen.
 */
async function probeEdgeFunction(name: string, label: string): Promise<EdgeFunctionHealth> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    if (res.status === 204 || res.ok) {
      return { name, label, reachable: true, latencyMs };
    }
    return { name, label, reachable: false, latencyMs, error: `Unexpected status ${res.status}` };
  } catch (err: any) {
    return { name, label, reachable: false, latencyMs: Date.now() - startTime, error: err?.message ?? 'Request failed' };
  }
}

export async function fetchSystemHealth(): Promise<SystemHealthReport> {
  const startTime = Date.now();
  let latencyMs = 0;
  let status: 'optimal' | 'degraded' | 'offline' = 'optimal';
  let pingFailure: unknown = null;

  try {
    const { error: pingError } = await supabase.from('campuses').select('code').limit(1);
    latencyMs = Date.now() - startTime;
    if (pingError) {
      status = 'degraded';
      pingFailure = pingError;
    } else if (latencyMs > 1500) {
      status = 'degraded';
    }
  } catch (err) {
    status = 'offline';
    latencyMs = -1;
    pingFailure = err;
  }

  // Row count monitors. A count that fails to load stays null (shown as a dash), never 0.
  const counts: SystemHealthReport['counts'] = {
    profiles: null,
    posts: null,
    comments: null,
    resources: null,
    events: null,
    supportTickets: null,
    moderationQueue: null,
    activeSessions: null,
  };

  try {
    const results = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('post_comments').select('*', { count: 'exact', head: true }),
      supabase.from('resources').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
      supabase.from('moderation_queue').select('*', { count: 'exact', head: true }),
    ]);
    const countOf = (r: { count: number | null; error: unknown }) => (r.error ? null : (r.count ?? 0));
    counts.profiles = countOf(results[0]);
    counts.posts = countOf(results[1]);
    counts.comments = countOf(results[2]);
    counts.resources = countOf(results[3]);
    counts.events = countOf(results[4]);
    counts.supportTickets = countOf(results[5]);
    counts.moderationQueue = countOf(results[6]);
  } catch (err) {
    console.warn('[SystemHealth] Table count error:', err);
  }

  // Nothing could be read from the database at all: that is a failed load (the screen shows an error with a retry),
  // not a report of zeros. A partial failure still reports what it could read.
  if (pingFailure && Object.values(counts).every((c) => c === null)) {
    throw pingFailure;
  }

  try {
    // admin_active_users_count(): members active in the last 15 minutes (bots excluded), campus-scoped
    // for Campus Admins by the database. (It replaces a read of last_active_at / an analytics summary the
    // admin role was not granted, which silently showed 0.)
    const { data: activeNow, error: activeError } = await supabase.rpc('admin_active_users_count', { p_minutes: 15 });
    if (!activeError && typeof activeNow === 'number') {
      counts.activeSessions = activeNow;
    } else if (activeError) {
      console.warn('[SystemHealth] admin_active_users_count RPC error:', activeError.message);
    }
  } catch (err) {
    console.warn('[SystemHealth] Active sessions RPC error:', err);
  }

  // Integrity scanner: check for dangling/orphaned rows
  const integrityIssues: IntegrityIssue[] = [];
  let integrityChecked = true;

  try {
    // Check for comments referencing deleted posts
    const { data: orphanedComments, error: commentsError } = await supabase
      .from('post_comments')
      .select('id, post_id')
      .limit(100);
    if (commentsError) throw commentsError;

    // If any comment has no matching post in DB, flag it
    if (orphanedComments && orphanedComments.length > 0) {
      // In healthy DB foreign keys cascade delete, but if raw rows were inserted without FK:
      const postIds = Array.from(new Set(orphanedComments.map((c) => c.post_id)));
      const { data: existingPosts, error: postsError } = await supabase
        .from('posts')
        .select('id')
        .in('id', postIds);
      if (postsError) throw postsError;
      const existingSet = new Set((existingPosts || []).map((p) => p.id));
      const orphans = orphanedComments.filter((c) => !existingSet.has(c.post_id));
      if (orphans.length > 0) {
        integrityIssues.push({
          id: 'orphaned_comments',
          type: 'orphaned_comments',
          description: `${orphans.length} comments reference archived or deleted discussions.`,
          count: orphans.length,
          severity: 'medium',
          remediation: 'Purge orphaned comment records to keep thread counters accurate.',
        });
      }
    }
  } catch {
    // Non-blocking, but reported: an empty list must not read as "no orphaned records".
    integrityChecked = false;
  }

  const edgeFunctions = await Promise.all([
    probeEdgeFunction('gemini-proxy', 'AI Study Copilot (Gemini)'),
    probeEdgeFunction('overpass-proxy', 'Campus Map (Overpass)'),
  ]);

  return {
    latencyMs: Math.max(0, latencyMs),
    status,
    timestamp: new Date().toISOString(),
    counts,
    integrityIssues,
    integrityChecked,
    edgeFunctions,
  };
}

/** Closed support tickets are kept for a year before cleanup may delete them (appeals are never deleted here). */
export const CLOSED_TICKET_RETENTION_DAYS = 365;

/**
 * What this cleanup does, in plain words (shown to the admin before they run it):
 *  - deletes comments whose discussion no longer exists (up to 200 checked per run);
 *  - deletes support tickets that were CLOSED more than 365 days ago.
 * It never deletes appeals, open or recently closed tickets, or anything else.
 */
export const CLEANUP_DESCRIPTION =
  `Deletes comments whose discussion no longer exists, and support tickets closed more than ${CLOSED_TICKET_RETENTION_DAYS} days ago. Appeals and newer tickets are never deleted.`;

export async function cleanupOrphanedRecords(): Promise<{ success: boolean; prunedCount: number; message: string }> {
  try {
    let pruned = 0;
    let prunedComments = 0;
    let prunedTickets = 0;

    // 1. Prune orphaned post_comments referencing deleted posts
    const { data: recentComments, error: recentError } = await supabase
      .from('post_comments')
      .select('id, post_id')
      .limit(200);
    if (recentError) throw recentError;
    if (recentComments && recentComments.length > 0) {
      const postIds = Array.from(new Set(recentComments.map((c) => c.post_id)));
      const { data: existingPosts, error: existingError } = await supabase
        .from('posts')
        .select('id')
        .in('id', postIds);
      // If this lookup failed, every comment would look orphaned and be deleted - stop instead.
      if (existingError) throw existingError;
      const existingSet = new Set((existingPosts || []).map((p) => p.id));
      const orphanCommentIds = recentComments.filter((c) => !existingSet.has(c.post_id)).map((c) => c.id);
      if (orphanCommentIds.length > 0) {
        const { data: deletedComments } = await supabase
          .from('post_comments')
          .delete()
          .in('id', orphanCommentIds)
          .select('id');
        if (deletedComments) {
          pruned += deletedComments.length;
          prunedComments = deletedComments.length;
        }
      }
    }

    // 2. Prune support tickets that were closed more than a year ago (never newer ones, never appeals)
    const cutoff = new Date(Date.now() - CLOSED_TICKET_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldClosedTickets, error: ticketError } = await supabase
      .from('support_tickets')
      .delete()
      .eq('status', 'closed')
      .lt('updated_at', cutoff)
      .select('id');
    if (ticketError) throw ticketError;

    if (oldClosedTickets) {
      pruned += oldClosedTickets.length;
      prunedTickets = oldClosedTickets.length;
    }

    await recordAuditLogEntry({
      action: 'system_cleanup_executed',
      summary: `Admin ran the database cleanup: deleted ${prunedComments} orphaned comment(s) and ${prunedTickets} support ticket(s) closed over ${CLOSED_TICKET_RETENTION_DAYS} days ago.`,
      targetType: 'system',
      targetId: 'db-cleanup',
    });

    return {
      success: true,
      prunedCount: pruned,
      message:
        pruned > 0
          ? `Deleted ${prunedComments} orphaned comment${prunedComments === 1 ? '' : 's'} and ${prunedTickets} support ticket${prunedTickets === 1 ? '' : 's'} closed over ${CLOSED_TICKET_RETENTION_DAYS} days ago.`
          : 'Nothing to clean up: no orphaned comments and no support tickets closed over a year ago.',
    };
  } catch (err: any) {
    console.error('[SystemHealth] cleanup failed:', err);
    return {
      success: false,
      prunedCount: 0,
      message: err.message || 'Cleanup operation encountered an error.',
    };
  }
}
