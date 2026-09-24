import { useQuery } from '@tanstack/react-query';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';
import { getAllSupportTickets } from '@/api/supportTickets';
import { listTakedownRequests } from '@/api/takedown';

/**
 * How many things are waiting in each admin area. One place, shared by the Overview cards and the
 * section pills, so the same number is never fetched (or shown) two different ways.
 */
export function useAdminBadges() {
  const reports = useQuery({ queryKey: ['reports', 'open'], queryFn: () => listReports({ status: 'open' }) });
  const verification = useQuery({ queryKey: ['verifications', 'pending'], queryFn: listVerificationRequests });
  const support = useQuery({ queryKey: ['support-tickets', 'open-count'], queryFn: () => getAllSupportTickets({ status: 'open' }) });
  const takedowns = useQuery({
    queryKey: ['takedown-requests', 'pending'],
    queryFn: () => listTakedownRequests('pending'),
    // The table may not exist on a project that has not applied the migration yet; a count of 0 is fine.
    retry: false,
  });

  return {
    reports: reports.data?.length ?? 0,
    verification: verification.data?.length ?? 0,
    support: support.data?.length ?? 0,
    takedowns: takedowns.data?.length ?? 0,
  };
}
