import { useQuery } from '@tanstack/react-query';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';
import { getAllSupportTickets } from '@/api/supportTickets';
import { listTakedownRequests } from '@/api/takedown';
import { useAuth } from '@/auth/AuthContext';

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
    // The table may not exist on a project that has not applied the migration yet; a count of 0 is fine.
    retry: false,
    refetchInterval: BADGE_REFETCH_INTERVAL_MS,
  });

  return {
    reports: reports.data?.length ?? 0,
    verification: verification.data?.length ?? 0,
    support: support.data?.length ?? 0,
    takedowns: takedowns.data?.length ?? 0,
  };
}
