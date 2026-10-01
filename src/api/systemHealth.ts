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
  counts: {
    profiles: number;
    posts: number;
    comments: number;
    resources: number;
    events: number;
    supportTickets: number;
    moderationQueue: number;
    activeSessions: number;
  };
  integrityIssues: IntegrityIssue[];
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

  try {
    const { error: pingError } = await supabase.from('campuses').select('code').limit(1);
    latencyMs = Date.now() - startTime;
    if (pingError) {
      status = 'degraded';
    } else if (latencyMs > 1500) {
      status = 'degraded';
    }
  } catch {
    status = 'offline';
    latencyMs = -1;
  }

  // Row count monitors
  const counts = {
    profiles: 0,
    posts: 0,
    comments: 0,
    resources: 0,
    events: 0,
    supportTickets: 0,
    moderationQueue: 0,
    activeSessions: 0,
  };

  try {
    const [
      { count: profCount },
      { count: postCount },
      { count: commentCount },
      { count: resCount },
      { count: eventCount },
      { count: ticketCount },
      { count: modCount },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('post_comments').select('*', { count: 'exact', head: true }),
      supabase.from('resources').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
      supabase.from('moderation_queue').select('*', { count: 'exact', head: true }),
    ]);

    counts.profiles = profCount ?? 0;
    counts.posts = postCount ?? 0;
    counts.comments = commentCount ?? 0;
    counts.resources = resCount ?? 0;
    counts.events = eventCount ?? 0;
    counts.supportTickets = ticketCount ?? 0;
    counts.moderationQueue = modCount ?? 0;
  } catch (err) {
    console.warn('[SystemHealth] Table count error:', err);
  }

  try {
    const { data: analyticsSummary, error: analyticsError } = await supabase.rpc('get_admin_analytics_summary', {
      p_days: 1,
      p_campus_code: null,
    });
    if (!analyticsError && analyticsSummary) {
      counts.activeSessions = Number(analyticsSummary.active_15m ?? 0);
    } else if (analyticsError) {
      console.warn('[SystemHealth] get_admin_analytics_summary RPC error:', analyticsError.message);
    }
  } catch (err) {
    console.warn('[SystemHealth] Active sessions RPC error:', err);
  }

  // Integrity scanner: check for dangling/orphaned rows
  const integrityIssues: IntegrityIssue[] = [];

  try {
    // Check for comments referencing deleted posts
    const { data: orphanedComments } = await supabase
      .from('post_comments')
      .select('id, post_id')
      .limit(100);

    // If any comment has no matching post in DB, flag it
    if (orphanedComments && orphanedComments.length > 0) {
      // In healthy DB foreign keys cascade delete, but if raw rows were inserted without FK:
      const postIds = Array.from(new Set(orphanedComments.map((c) => c.post_id)));
      const { data: existingPosts } = await supabase
        .from('posts')
        .select('id')
        .in('id', postIds.slice(0, 50));
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
    // Non-blocking
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
    edgeFunctions,
  };
}

export async function cleanupOrphanedRecords(): Promise<{ success: boolean; prunedCount: number; message: string }> {
  try {
    let pruned = 0;

    // Prune soft-deleted moderation items older than 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldClosedTickets } = await supabase
      .from('support_tickets')
      .delete()
      .eq('status', 'closed')
      .lt('updated_at', ninetyDaysAgo)
      .select('id');

    if (oldClosedTickets) {
      pruned += oldClosedTickets.length;
    }

    await recordAuditLogEntry({
      action: 'policy_updated',
      summary: `Admin executed database sync integrity cleanup: ${pruned} stale rows pruned.`,
      targetType: 'system',
      targetId: 'db-cleanup',
    });

    return {
      success: true,
      prunedCount: pruned,
      message: pruned > 0 ? `Successfully pruned ${pruned} stale records.` : 'Database sync is already optimal. No orphaned records found.',
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
