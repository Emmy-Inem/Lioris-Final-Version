import React, { useState } from'react';
import { FlatList, Pressable, TextInput, View } from'react-native';
import Animated, { FadeOut, LinearTransition } from'react-native-reanimated';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { ConversationRow } from'./ConversationRow';
import { SolidCard } from'./SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { useRealtimeChannel } from'@/realtime/useRealtimeChannel';
import { listConversations, archiveConversation } from'@/api/messaging';

export function MessagesListScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread' | 'reps'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  useRealtimeChannel();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
  });

  async function handleArchive(id: string) {
    await archiveConversation(id);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  const filtered = (conversations ?? []).filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!c.participantName.toLowerCase().includes(q) && !(c.lastMessagePreview ?? '').toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filter === 'unread') return c.unreadCount > 0;
    return true;
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      {/* Screen Title */}
      <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
        <AppText variant="h1"weight="bold">
          Student Messages 
        </AppText>
        <AppText tone="secondary"variant="bodySmall">
          Direct chats with classmates, mentors & representatives
        </AppText>
      </View>

      {/* Search Input Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          height: 42,
          marginBottom: spacing.sm,
        }}
      >
        <Ionicons name="search"size={16} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search conversations..."placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle"size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs: All vs Unread */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          padding: 4,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {(['all', 'unread'] as const).map((tab) => {
          const selected = filter === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setFilter(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                {tab === 'all' ? 'All Messages' : 'Unread ✉️'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Conversation List */}
      <SolidCard radius={20} style={{ padding: spacing.xs, flex: 1 }}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          contentContainerStyle={{ paddingBottom: 130 }}
          renderItem={({ item }) => (
            <Animated.View layout={LinearTransition} exiting={FadeOut.duration(200)}>
              <ConversationRow conversation={item} onArchive={() => handleArchive(item.id)} />
            </Animated.View>
          )}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: colors.pastelPrimaryBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: spacing.md,
                  }}
                >
                  <Ionicons name="chatbubbles-outline"size={32} color={colors.brandPrimary} />
                </View>
                <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.xs }}>
                  No Conversations
                </AppText>
                <AppText tone="secondary"variant="bodySmall"style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                  Connect with students from your course or message your class representative.
                </AppText>
              </View>
            ) : null
          }
        />
      </SolidCard>
    </ScreenContainer>
  );
}
