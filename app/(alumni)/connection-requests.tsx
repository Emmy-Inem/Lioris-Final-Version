import React from 'react';
import { FlatList, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ConnectionRequestCard } from '@/components/ConnectionRequestCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listIncomingConnectionRequests } from '@/api/connections';

export default function ConnectionRequestsScreen() {
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['connections', 'incoming'],
    queryFn: listIncomingConnectionRequests,
  });

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <AppText variant="h1" weight="bold" style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.md }}>
        Connection Requests
      </AppText>
      <FlatList
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
        numColumns={isDesktop ? 2 : 1}
        columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
        renderItem={({ item }) => (
          <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
            <ConnectionRequestCard
              request={item}
              onHandled={() => {
                queryClient.invalidateQueries({ queryKey: ['connections'] });
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
              }}
            />
          </View>
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
