import { supabase } from './supabase';

export interface AnalyticsEvent {
  eventType: 'page_view' | 'feature_use' | 'session_start';
  name: string;
  campusCode?: string;
  metadata?: Record<string, any>;
}

export interface VisitedPageMetric {
  name: string;
  visits: number;
  unique_visitors: number;
}

export interface UsedFeatureMetric {
  name: string;
  uses: number;
  unique_users: number;
}

export interface CampusAnalyticsMetric {
  campus_code: string;
  total_members: number;
  real_members: number;
  verified_members: number;
  active_7d: number;
}

export interface AdminAnalyticsSummary {
  total_users: number;
  real_users: number;
  bot_users: number;
  active_15m: number;
  active_24h: number;
  active_7d: number;
  active_30d: number;
  total_posts: number;
  total_comments: number;
  total_resources: number;
  total_events: number;
  total_rsvps: number;
  total_poll_votes: number;
  pending_verifications: number;
  most_visited_pages: VisitedPageMetric[];
  most_used_features: UsedFeatureMetric[];
  campus_metrics: CampusAnalyticsMetric[];
}

export async function recordUserActivity(event: AnalyticsEvent): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_user_activity', {
      p_event_type: event.eventType,
      p_name: event.name,
      p_campus_code: event.campusCode || null,
      p_metadata: event.metadata || {},
    });
    if (error) {
      console.warn('[Analytics] record_user_activity RPC error:', error.message);
    }
  } catch (err) {
    // Non-blocking best-effort analytics
    console.warn('[Analytics] recordUserActivity failure:', err);
  }
}

export async function fetchAdminAnalyticsSummary(
  days: number = 30,
  campusCode: string = 'ALL',
): Promise<AdminAnalyticsSummary> {
  const normalizedCampus = campusCode && campusCode !== 'ALL' ? campusCode : null;

  try {
    const { data, error } = await supabase.rpc('get_admin_analytics_summary', {
      p_days: days,
      p_campus_code: normalizedCampus,
    });
    if (!error && data) {
      return {
        total_users: Number(data.total_users ?? 0),
        real_users: Number(data.real_users ?? 0),
        bot_users: Number(data.bot_users ?? 0),
        active_15m: Number(data.active_15m ?? 0),
        active_24h: Number(data.active_24h ?? 0),
        active_7d: Number(data.active_7d ?? 0),
        active_30d: Number(data.active_30d ?? 0),
        total_posts: Number(data.total_posts ?? 0),
        total_comments: Number(data.total_comments ?? 0),
        total_resources: Number(data.total_resources ?? 0),
        total_events: Number(data.total_events ?? 0),
        total_rsvps: Number(data.total_rsvps ?? 0),
        total_poll_votes: Number(data.total_poll_votes ?? 0),
        pending_verifications: Number(data.pending_verifications ?? 0),
        most_visited_pages: Array.isArray(data.most_visited_pages) ? data.most_visited_pages : [],
        most_used_features: Array.isArray(data.most_used_features) ? data.most_used_features : [],
        campus_metrics: Array.isArray(data.campus_metrics) ? data.campus_metrics : [],
      };
    }
    if (error) {
      console.warn('[Analytics] get_admin_analytics_summary RPC error, falling back to direct table queries:', error.message);
    }
  } catch (err: any) {
    console.warn('[Analytics] fetchAdminAnalyticsSummary RPC invocation failed:', err);
  }

  // Pure real data fallback computed directly from database tables
  try {
    let profileQuery = supabase
      .from('profiles')
      .select('id, is_bot, campus_code, verification_status, last_active_at');

    if (normalizedCampus) {
      profileQuery = profileQuery.eq('campus_code', normalizedCampus);
    }

    const { data: profiles } = await profileQuery;
    const all = profiles ?? [];
    const bots = all.filter((p: any) => p.is_bot || (p.id && p.id.startsWith('00000000-0000-4000-a000-')));
    const real = all.filter((p: any) => !p.is_bot && (!p.id || !p.id.startsWith('00000000-0000-4000-a000-')));
    const now = Date.now();
    const active15m = real.filter((p: any) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 15 * 60 * 1000).length;
    const active24h = real.filter((p: any) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 24 * 60 * 60 * 1000).length;
    const active7d = real.filter((p: any) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
    const active30d = real.filter((p: any) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 30 * 24 * 60 * 60 * 1000).length;
    const pendingVerifications = all.filter((p: any) => p.verification_status === 'pending').length;

    // Campus aggregation
    const campusMap = new Map<string, { total: number; real: number; verified: number; active7d: number }>();
    for (const p of all) {
      const code = p.campus_code || 'GLOBAL';
      const isBot = p.is_bot || (p.id && p.id.startsWith('00000000-0000-4000-a000-'));
      const isVerified = p.verification_status === 'verified';
      const isActive7d = p.last_active_at && now - new Date(p.last_active_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
      const entry = campusMap.get(code) || { total: 0, real: 0, verified: 0, active7d: 0 };
      entry.total++;
      if (!isBot) entry.real++;
      if (isVerified) entry.verified++;
      if (isActive7d) entry.active7d++;
      campusMap.set(code, entry);
    }

    const campusMetrics: CampusAnalyticsMetric[] = Array.from(campusMap.entries()).map(([code, stat]) => ({
      campus_code: code,
      total_members: stat.total,
      real_members: stat.real,
      verified_members: stat.verified,
      active_7d: stat.active7d,
    }));

    // Real content velocity queries
    const sinceDate = new Date(Date.now() - days * 86_400_000).toISOString();

    let postsQ = supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', sinceDate);
    if (normalizedCampus) postsQ = postsQ.eq('campus_code', normalizedCampus);
    const { count: postsCount } = await postsQ;

    let resQ = supabase.from('resources').select('id', { count: 'exact', head: true }).gte('created_at', sinceDate);
    if (normalizedCampus) resQ = resQ.eq('campus_code', normalizedCampus);
    const { count: resCount } = await resQ;

    let eventsQ = supabase.from('events').select('id', { count: 'exact', head: true }).gte('created_at', sinceDate);
    if (normalizedCampus) eventsQ = eventsQ.eq('campus_code', normalizedCampus);
    const { count: eventsCount } = await eventsQ;

    // Real analytics events for visited pages & feature uses
    let eventsQuery = supabase
      .from('analytics_events')
      .select('event_type, name, user_id')
      .gte('created_at', sinceDate);

    if (normalizedCampus) {
      eventsQuery = eventsQuery.eq('campus_code', normalizedCampus);
    }

    const { data: rawEvents } = await eventsQuery;
    const pageViewCounts = new Map<string, { visits: number; visitors: Set<string> }>();
    const featureUseCounts = new Map<string, { uses: number; users: Set<string> }>();
    let rsvpsCount = 0;
    let pollVotesCount = 0;

    for (const ev of (rawEvents ?? [])) {
      const uid = ev.user_id || 'anonymous';
      if (ev.event_type === 'page_view') {
        const item = pageViewCounts.get(ev.name) || { visits: 0, visitors: new Set<string>() };
        item.visits++;
        item.visitors.add(uid);
        pageViewCounts.set(ev.name, item);
      } else if (ev.event_type === 'feature_use') {
        const item = featureUseCounts.get(ev.name) || { uses: 0, users: new Set<string>() };
        item.uses++;
        item.users.add(uid);
        featureUseCounts.set(ev.name, item);

        if (ev.name === 'event_rsvp') rsvpsCount++;
        if (ev.name === 'vote_poll') pollVotesCount++;
      }
    }

    const mostVisitedPages: VisitedPageMetric[] = Array.from(pageViewCounts.entries())
      .map(([name, data]) => ({
        name,
        visits: data.visits,
        unique_visitors: data.visitors.size,
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    const mostUsedFeatures: UsedFeatureMetric[] = Array.from(featureUseCounts.entries())
      .map(([name, data]) => ({
        name,
        uses: data.uses,
        unique_users: data.users.size,
      }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 10);

    return {
      total_users: all.length,
      real_users: real.length,
      bot_users: bots.length,
      active_15m: active15m,
      active_24h: active24h,
      active_7d: active7d,
      active_30d: active30d,
      total_posts: postsCount ?? 0,
      total_comments: 0,
      total_resources: resCount ?? 0,
      total_events: eventsCount ?? 0,
      total_rsvps: rsvpsCount,
      total_poll_votes: pollVotesCount,
      pending_verifications: pendingVerifications,
      most_visited_pages: mostVisitedPages,
      most_used_features: mostUsedFeatures,
      campus_metrics: campusMetrics,
    };
  } catch (fallbackErr) {
    console.warn('[Analytics] Real fallback computation encountered error:', fallbackErr);
    // Real zero state - never return synthetic numbers!
    return {
      total_users: 0,
      real_users: 0,
      bot_users: 0,
      active_15m: 0,
      active_24h: 0,
      active_7d: 0,
      active_30d: 0,
      total_posts: 0,
      total_comments: 0,
      total_resources: 0,
      total_events: 0,
      total_rsvps: 0,
      total_poll_votes: 0,
      pending_verifications: 0,
      most_visited_pages: [],
      most_used_features: [],
      campus_metrics: [],
    };
  }
}
