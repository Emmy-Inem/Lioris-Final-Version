import React from 'react';
import { FlatList } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ConnectionRequestCard } from '@/components/ConnectionRequestCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listIncomingConnectionRequests } from '@/api/connections';

export default function ConnectionRequestsScreen() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['connections', 'incoming'],
    queryFn: listIncomingConnectionRequests,
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingVertical: spacing.lg }}>
        Connection Requests
      </AppText>
      <FlatList
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConnectionRequestCard
            request={item}
            onHandled={() => {
              queryClient.invalidateQueries({ queryKey: ['connections'] });
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }}
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState title="No pending requests" description="New connection requests will show up here." />
          ) : null
        }
      />
    </ScreenContainer>
  );
}
