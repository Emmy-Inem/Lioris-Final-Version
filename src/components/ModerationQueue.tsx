import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { EmptyState } from './EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listReports, resolveReport } from '@/api/moderation';
import { Report } from '@/api/types';

const STATUS_TONE: Record<Report['status'], 'warning' | 'brand' | 'success' | 'neutral'> = {
  open: 'warning',
  under_review: 'brand',
  resolved: 'success',
  dismissed: 'neutral',
};

interface ModerationQueueProps {
  /**
   * Scopes the queue to one launch institution — Staff pass their own
   * campus here, so they only ever see and resolve reports from their
   * own institution. Admin omits this (or explicitly passes undefined
   * for "All Campuses") to see across every launch university, which
   * is the actual functional distinction between the two roles rather
   * than just a different-looking screen with identical data.
   */
  institutionCode?: string;
  emptyTitle?: string;
}

export function ModerationQueue({ institutionCode, emptyTitle = 'Queue is clear' }: ModerationQueueProps) {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', 'open', institutionCode ?? 'all'],
    queryFn: () => listReports({ status: 'open', institutionCode }),
  });

  async function handleAction(id: string, action: 'resolved' | 'dismissed') {
    setSubmittingId(id);
    try {
      await resolveReport(id, action);
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <FlatList
      data={reports ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <SolidCard style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Badge label={item.targetType} tone="neutral" />
              {item.institutionCode ? <Badge label={item.institutionCode} tone="brand" /> : null}
            </View>
            <Badge label={item.status.replace('_', ' ')} tone={STATUS_TONE[item.status]} />
          </View>
          <AppText weight="semiBold" style={{ marginBottom: spacing.xs }}>
            Reported content
          </AppText>
          <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
            {item.reason}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton
              label="Resolve"
              onPress={() => handleAction(item.id, 'resolved')}
              loading={submittingId === item.id}
            />
            <AppButton label="Dismiss" variant="secondary" onPress={() => handleAction(item.id, 'dismissed')} />
          </View>
        </SolidCard>
      )}
      ListEmptyComponent={
        !isLoading ? <EmptyState title={emptyTitle} description="No open reports right now." /> : null
      }
    />
  );
}
