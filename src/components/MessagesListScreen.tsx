import React, { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { ConversationRow } from './ConversationRow';
import { ChatThread } from './ChatThread';
import { SolidCard } from './SolidCard';
import { NewChatModal } from './NewChatModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listConversations, archiveConversation, getOrCreateConversationWithUser, UserToMessage } from '@/api/messaging';

export function MessagesListScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const segments = useSegments();
  const roleGroup = segments[0] || '(student)';
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  useRealtimeChannel();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
  });

  async function handleArchive(id: string) {
    await archiveConversation(id);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  async function handleStartNewChat(user: UserToMessage) {
    setNewChatModalOpen(false);
    const conv = await getOrCreateConversationWithUser(user.id, user.fullName, user.avatarUrl);
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (isDesktop) {
      setSelectedConversationId(conv.id);
    } else {
      router.push(`/${roleGroup}/messages/${conv.id}` as any);
    }
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

  const activeSelectedId = selectedConversationId ?? (filtered.length > 0 ? filtered[0].id : null);

  return (
    <ScreenContainer glow={false} fluidWidth={isDesktop}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', flex: 1, height: '100%', gap: 20, paddingTop: spacing.sm, paddingBottom: 20 }}>
          {/* Left Pane: Conversations List */}
          <View
            style={{
              width: 380,
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header & Search */}
            <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <AppText variant="h2" weight="bold">
                  Messages
                </AppText>
                <Pressable
                  onPress={() => setNewChatModalOpen(true)}
                  hitSlop={8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: colors.brandPrimary,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                  }}
                >
                  <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                  <AppText variant="caption" weight="bold" tone="inverse">
                    New Chat
                  </AppText>
                </Pressable>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: spacing.sm,
                  height: 38,
                  marginTop: spacing.xs,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search chats..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              renderItem={({ item }) => (
                <ConversationRow
                  conversation={item}
                  onArchive={() => handleArchive(item.id)}
                  onSelect={(id) => setSelectedConversationId(id)}
                  isSelected={activeSelectedId === item.id}
                />
              )}
              ListEmptyComponent={
                !isLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md }}>
                    <Ionicons name="chatbubbles-outline" size={36} color={colors.brandPrimary} />
                    <AppText variant="bodySmall" weight="bold" style={{ marginTop: spacing.sm }}>
                      No Conversations Found
                    </AppText>
                    <Pressable
                      onPress={() => setNewChatModalOpen(true)}
                      style={{
                        marginTop: spacing.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: colors.pastelPrimaryBg,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                      }}
                    >
                      <Ionicons name="add" size={16} color={colors.brandPrimary} />
                      <AppText variant="caption" weight="bold" tone="brand">
                        Start New Chat
                      </AppText>
                    </Pressable>
                  </View>
                ) : null
              }
            />
          </View>

          {/* Right Pane: Active Chat Conversation */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            {activeSelectedId ? (
              <ChatThread conversationId={activeSelectedId} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: colors.pastelPrimaryBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: spacing.md,
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.brandPrimary} />
                </View>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                  Your Academic Inbox
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', maxWidth: 360, marginBottom: spacing.lg }}>
                  Select a conversation on the left to review chat history, share study attachments, and collaborate with your peers.
                </AppText>
                <Pressable
                  onPress={() => setNewChatModalOpen(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: colors.brandPrimary,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: radius.pill,
                  }}
                >
                  <Ionicons name="create-outline" size={16} color="#FFFFFF" />
                  <AppText variant="bodySmall" weight="bold" tone="inverse">
                    Start a New Conversation
                  </AppText>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : (
        /* Mobile View */
        <>
          <AppHeader />

          {/* Screen Title & Action */}
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText weight="bold" style={{ fontSize: 20, lineHeight: 26 }}>
                Messages
              </AppText>
              <Pressable
                onPress={() => setNewChatModalOpen(true)}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.brandPrimary,
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  flexShrink: 0,
                }}
              >
                <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11.5 }}>
                  New Chat
                </AppText>
              </Pressable>
            </View>
            <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>
              Classmates, mentors & campus peers
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
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search conversations..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
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
                  <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                    {tab === 'all' ? 'All Messages' : 'Unread'}
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
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
              renderItem={({ item }) => (
                <Animated.View layout={LinearTransition} exiting={FadeOut.duration(200)}>
                  <ConversationRow conversation={item} onArchive={() => handleArchive(item.id)} />
                </Animated.View>
              )}
              ListEmptyComponent={
                !isLoading ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.md, flex: 1 }}>
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
                      <Ionicons name="chatbubbles-outline" size={32} color={colors.brandPrimary} />
                    </View>
                    <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs, textAlign: 'center' }}>
                      No Conversations Yet
                    </AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                      Start direct chats with students, mentors, or campus representatives.
                    </AppText>
                    <Pressable
                      onPress={() => setNewChatModalOpen(true)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: colors.brandPrimary,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: 11,
                        borderRadius: radius.pill,
                      }}
                    >
                      <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                      <AppText weight="bold" tone="inverse" variant="bodySmall">
                        Start a Conversation
                      </AppText>
                    </Pressable>
                  </View>
                ) : null
              }
            />
          </SolidCard>
        </>
      )}

      {/* New Chat Modal */}
      <NewChatModal
        visible={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
        onSelectUser={handleStartNewChat}
      />
    </ScreenContainer>
  );
}
