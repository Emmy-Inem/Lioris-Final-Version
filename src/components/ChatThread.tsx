import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listMessages, sendMessage } from '@/api/messaging';
import { Message } from '@/api/types';
import { haptics } from '@/utils/haptics';

interface OutgoingMessage extends Message {
  failed?: boolean;
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  useRealtimeChannel();

  const { data } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => listMessages(conversationId),
  });

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  // PRD Section 8 gesture-interactions — swipe a message to reply.
  // There's no real threaded-reply data model on Message (no
  // replyToId field per PRD Section 15.4's contract), so this is a
  // lightweight client-side quoting convenience: the quoted text gets
  // prepended to the outgoing message content, not a real relationship
  // persisted anywhere.
  const [replyingTo, setReplyingTo] = useState<OutgoingMessage | null>(null);

  const allMessages: OutgoingMessage[] = [...(data?.items ?? []), ...pending];

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;
    haptics.medium();
    const outgoingContent = replyingTo ? `\u21aa ${replyingTo.content}\n${content}` : content;
    setDraft('');
    setReplyingTo(null);

    const optimistic: OutgoingMessage = {
      id: `pending-${Date.now()}`,
      conversationId,
      senderId: 'me',
      content: outgoingContent,
      messageType: 'text',
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
    setPending((prev) => [...prev, optimistic]);

    try {
      await sendMessage(conversationId, outgoingContent);
      setPending((prev) => prev.filter((m) => m.id !== optimistic.id));
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      // Brief "typing..." affordance — there's no real backend presence
      // signal yet, so this simulates the partner responding.
      setPartnerTyping(true);
      setTimeout(() => setPartnerTyping(false), 1800);
    } catch {
      // PRD Section 7.6: failed messages must show a retryable state.
      haptics.error();
      setPending((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'failed', failed: true } : m)),
      );
    }
  }

  function retry(message: OutgoingMessage) {
    setPending((prev) => prev.filter((m) => m.id !== message.id));
    setDraft(message.content);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={allMessages}
        keyExtractor={(item) => item.id}
        inverted={false}
        contentContainerStyle={{ paddingVertical: spacing.md }}
        renderItem={({ item }) => {
          const isMe = item.senderId === 'me';
          const bubble = (
            <View
              style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: isMe ? colors.brandPrimary : colors.surface,
                borderRadius: radius.md,
                borderWidth: isMe ? 0 : 1,
                borderColor: colors.border,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <AppText tone={isMe ? 'inverse' : 'primary'}>{item.content}</AppText>
              {item.status === 'failed' ? (
                <Pressable
                  onPress={() => retry(item)}
                  accessibilityRole="button"
                  accessibilityLabel="Failed to send. Tap to retry"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                >
                  <Ionicons name="refresh" size={12} color={colors.critical} />
                  <AppText variant="caption" tone="critical">
                    Failed — tap to retry
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          );

          // Pending/failed messages aren't real yet — nothing to reply to.
          if (item.id.startsWith('pending-')) return bubble;

          return (
            <Swipeable
              renderLeftActions={() => (
                <View style={{ justifyContent: 'center', paddingHorizontal: spacing.md }}>
                  <Ionicons name="arrow-undo" size={18} color={colors.brandPrimary} />
                </View>
              )}
              onSwipeableWillOpen={() => setReplyingTo(item)}
            >
              {bubble}
            </Swipeable>
          );
        }}
        ListEmptyComponent={
          <EmptyState title="Say hello 👋" description="This is the start of your conversation." />
        }
      />

      {partnerTyping ? <TypingIndicator /> : null}

      {replyingTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.divider,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginBottom: spacing.sm,
          }}
        >
          <Ionicons name="arrow-undo" size={14} color={colors.brandPrimary} />
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ flex: 1 }}>
            Replying to: {replyingTo.content}
          </AppText>
          <Pressable
            onPress={() => setReplyingTo(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppTextField label="" placeholder="Message..." value={draft} onChangeText={setDraft} />
        </View>
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !draft.trim() }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          <Ionicons name="send" size={18} color={colors.textInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
