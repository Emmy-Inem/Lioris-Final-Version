import { api } from './client';
import { withMockFallback } from './withMockFallback';

export interface PlatformHealthSummary {
  studentMauPct: number;
  alumniMauPct: number;
  eventParticipationPct: number;
  connectionActivationPct: number;
  notificationReadRatePct: number;
  moderationFalsePositivePct: number;
}

// Backs the admin analytics view; thresholds mirror the Green/Amber/Red
// bands defined in PRD Section 22 (Rollback and Kill Criteria).
export async function getPlatformHealthSummary(): Promise<PlatformHealthSummary> {
  return withMockFallback(
    async () => {
      const { data } = await api.get<PlatformHealthSummary>('/analytics/platform-health');
      return data;
    },
    {
      studentMauPct: 52,
      alumniMauPct: 24,
      eventParticipationPct: 33,
      connectionActivationPct: 21,
      notificationReadRatePct: 81,
      moderationFalsePositivePct: 3,
    },
  );
}
