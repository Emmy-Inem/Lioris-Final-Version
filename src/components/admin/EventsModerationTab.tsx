import React from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listEvents, revokeEventApproval, purgeEvent } from '@/api/events';

export function EventsModerationTab() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useQuery({ queryKey: ['events', 'admin-moderation'], queryFn: () => listEvents({}) });

  async function handleRevoke(id: string) {
    await revokeEventApproval(id);
    queryClient.invalidateQueries({ queryKey: ['events'] });
  }

  async function handlePurge(id: string) {
    await purgeEvent(id);
    queryClient.invalidateQueries({ queryKey: ['events'] });
  }

  return (
    <View>
      {events?.map((event) => (
        <SolidCard key={event.id} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
            <AppText variant="h3" weight="bold" style={{ flex: 1 }}>
              {event.title}
            </AppText>
            <Badge label={event.approvalStatus === 'rejected' ? 'Revoked' : 'Live & Approved'} tone={event.approvalStatus === 'rejected' ? 'critical' : 'success'} />
          </View>
          <AppText tone="secondary" variant="caption" style={{ marginBottom: 4 }}>
            By: {event.organizerName ?? 'Unknown organizer'} {'\u00b7'} {event.category}
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: 4 }}>
            📍 {event.location}
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            {event.description}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton label="Revoke Approval" variant="secondary" onPress={() => handleRevoke(event.id)} />
            <AppButton label="Purge Event" variant="accent" onPress={() => handlePurge(event.id)} />
          </View>
        </SolidCard>
      ))}
      {!isLoading && (events?.length ?? 0) === 0 ? <EmptyState title="No events to moderate" /> : null}
    </View>
  );
}
