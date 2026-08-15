import React from 'react';
import { FlatList, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { ConversationRow } from './ConversationRow';
import { EmptyState } from './EmptyState';
import { AuthHeroBackground } from './AuthHeroBackground';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listConversations, archiveConversation } from '@/api/messaging';

export function MessagesListScreen() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  useRealtimeChannel();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
  });

  async function handleArchive(id: string) {
    await archiveConversation(id);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader />
      </View>
      <AuthHeroBackground height={84}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
          <AppText variant="h1" weight="bold" tone="inverse">
            Messages
          </AppText>
        </View>
      </AuthHeroBackground>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <FlatList
          data={conversations ?? []}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <Animated.View layout={LinearTransition} exiting={FadeOut.duration(200)}>
              <ConversationRow conversation={item} onArchive={() => handleArchive(item.id)} />
            </Animated.View>
          )}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState title="No conversations yet" description="Connect with someone to start messaging." />
            ) : null
          }
        />
      </View>
    </ScreenContainer>
  );
}
