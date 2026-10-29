import { useQuery } from '@tanstack/react-query';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';
import { getAllSupportTickets } from '@/api/supportTickets';
import { listTakedownRequests } from '@/api/takedown';
import { listMinors } from '@/api/adminMinors';
import { useAuth } from '@/auth/AuthContext';
import { classifyQueryError, refetchFailedQueries } from '@/utils/queryError';

/**
 * How many things are waiting in each admin area. One place, shared by the Overview cards and the
 * section pills, so the same number is never fetched (or shown) two different ways.
 */
// How often these badge counts refresh on their own. A screen left open (the
// Overview hub, any of the safety screens) would otherwise only ever see
// these numbers at the moment it mounted - the same staleness gap
// MaintenanceGate's own 60s refetchInterval exists to avoid.
const BADGE_REFETCH_INTERVAL_MS = 30_000;

export function useAdminBadges() {
  const { user } = useAuth();
  const campusFilter = user?.isCampusAdmin && user?.campusCode ? user.campusCode : undefined;

  const reports = useQuery({
    queryKey: ['reports', 'open', campusFilter || 'all'],
    queryFn: () => listReports({ status: 'open', institutionCode: campusFilter }),
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });
  const verification = useQuery({
    queryKey: ['verifications', 'pending', campusFilter || 'all'],
    queryFn: () => listVerificationRequests(campusFilter),
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });
  const support = useQuery({
    queryKey: ['support-tickets', 'open-count'],
    queryFn: () => getAllSupportTickets({ status: 'open' }),
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });
  const takedowns = useQuery({
    queryKey: ['takedown-requests', 'pending'],
    queryFn: () => listTakedownRequests('pending'),
    // The table may not exist on a project that has not applied the migration yet; that shows as an unknown count, not 0.
    retry: false,
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });

  const minors = useQuery({
    queryKey: ['admin-minors', 'pending-count', campusFilter || 'all'],
    queryFn: () => listMinors('pending', campusFilter),
    // Refused for anyone who is not a campus administrator / Super Admin, and absent before the migration: unknown, not 0.
    retry: false,
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });

  // A count is undefined (not 0) while it is loading or when its load failed, so no screen can show "0 waiting"
  // for a queue it could not read. `hasError` / `error` / `refetch` let a screen say so and offer a retry.
  const all = [reports, verification, support, takedowns, minors];
  // Two counts are legitimately unavailable to some admins (a refusal) or on a database that has not been migrated
  // yet (missing table): those stay unknown, but are not reported as a failed load.
  const notApplicable = (q: (typeof all)[number]) => {
    const code = String((q.error as { code?: unknown } | null)?.code ?? '');
    return classifyQueryError(q.error) === 'permission' || code === '42P01' || code === 'PGRST205' || code === 'PGRST202';
  };
  const failed = all.filter((q) => q.isError && !((q === takedowns || q === minors) && notApplicable(q)));

  return {
    reports: reports.data?.length,
    verification: verification.data?.length,
    support: support.data?.length,
    takedowns: takedowns.data?.length,
    minors: minors.data?.length,
    hasError: failed.length > 0,
    error: failed[0]?.error ?? null,
    refetch: () => refetchFailedQueries(all),
  };
}
