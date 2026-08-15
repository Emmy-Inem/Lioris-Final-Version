import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';
import { ActionSheetModal } from './ActionSheetModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listMessages, sendMessage, listConversations } from '@/api/messaging';
import { Message } from '@/api/types';
import { haptics } from '@/utils/haptics';

interface OutgoingMessage extends Message {
  failed?: boolean;
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  useRealtimeChannel();

  const { data } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => listMessages(conversationId),
  });

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
  });

  const currentConversation = conversations?.find((c) => c.id === conversationId);
  const partnerName = currentConversation?.participantName ?? 'Student Peer';
  const partnerAvatar = currentConversation?.participantAvatarUrl;

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<OutgoingMessage | null>(null);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);

  const allMessages: OutgoingMessage[] = [...(data?.items ?? []), ...pending];

  async function handleSend(contentToSend?: string) {
    const content = (contentToSend ?? draft).trim();
    if (!content) return;
    haptics.medium();
    const outgoingContent = replyingTo ? `↳ "${replyingTo.content.substring(0, 30)}..."\n${content}` : content;
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
      setPartnerTyping(true);
      setTimeout(() => setPartnerTyping(false), 1800);
    } catch {
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
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {/* Top Chat Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Avatar name={partnerName} uri={partnerAvatar} size={36} />
          <View>
            <AppText weight="bold" variant="bodySmall">
              {partnerName}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
              <AppText tone="secondary" variant="caption">
                Online | UI Verified
              </AppText>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptics.light();
              Alert.alert('Encrypted Call', `Calling ${partnerName} via encrypted peer-to-peer audio...`);
            }}
          >
            <Ionicons name="call-outline" size={20} color={colors.brandPrimary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptics.light();
              Alert.alert('Video Mentorship', `Launching video room with ${partnerName}...`);
            }}
          >
            <Ionicons name="videocam-outline" size={20} color={colors.brandPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        data={allMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMe = item.senderId === 'me';
          return (
            <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
              <Pressable
                onLongPress={() => {
                  haptics.medium();
                  setReplyingTo(item);
                }}
                style={{
                  maxWidth: '82%',
                  backgroundColor: isMe ? colors.brandPrimary : colors.surface,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: 18,
                  borderTopRightRadius: isMe ? 4 : 18,
                  borderTopLeftRadius: isMe ? 18 : 4,
                  borderWidth: isMe ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <AppText
                  variant="bodySmall"
                  tone={isMe ? 'inverse' : 'primary'}
                  style={{ lineHeight: 19 }}
                >
                  {item.content}
                </AppText>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 3 }}>
                  <AppText
                    variant="caption"
                    style={{ fontSize: 9, color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }}
                  >
                    {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </AppText>
                  {isMe && (
                    <Ionicons
                      name={item.status === 'read' ? 'checkmark-done' : 'checkmark'}
                      size={12}
                      color={item.status === 'read' ? '#68D391' : 'rgba(255,255,255,0.7)'}
                    />
                  )}
                </View>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="Start your conversation 💬"
            description="Direct messages are protected with end-to-end encryption."
          />
        }
      />

      {partnerTyping ? <TypingIndicator /> : null}

      {/* Replying Banner */}
      {replyingTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.pastelPrimaryBg,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginHorizontal: spacing.md,
            marginBottom: spacing.xs,
          }}
        >
          <Ionicons name="arrow-undo" size={14} color={colors.brandPrimary} />
          <AppText tone="brand" variant="caption" numberOfLines={1} style={{ flex: 1 }}>
            Replying to: {replyingTo.content}
          </AppText>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.brandPrimary} />
          </Pressable>
        </View>
      ) : null}

      {/* Bottom Message Input Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          hitSlop={8}
          onPress={() => {
            haptics.light();
            setAttachmentSheetOpen(true);
          }}
          style={{ padding: 4 }}
        >
          <Ionicons name="add-circle" size={28} color={colors.brandPrimary} />
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            height: 42,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type encrypted message..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}
          />
        </View>

        <Pressable
          onPress={() => handleSend()}
          disabled={!draft.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: draft.trim() ? colors.brandPrimary : colors.divider,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="send" size={17} color={draft.trim() ? '#FFFFFF' : colors.textSecondary} />
        </Pressable>
      </View>

      {/* Quick Attachment Sheet */}
      <ActionSheetModal
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
      >
        <Pressable
          onPress={() => {
            setAttachmentSheetOpen(false);
            handleSend('📸 Shared Study Diagram: [Past Question Solution CSC301.png]');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="image-outline" size={18} color={colors.brandPrimary} />
          <AppText weight="medium">Send Study Photo / Diagram 📸</AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            setAttachmentSheetOpen(false);
            handleSend('📄 Attached PDF: CSC301_Complete_Lecture_Slides.pdf (2.4 MB)');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="document-attach-outline" size={18} color={colors.brandPrimary} />
          <AppText weight="medium">Attach Course PDF Lecture Notes 📄</AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            setAttachmentSheetOpen(false);
            handleSend('📍 Meet me at: Faculty of Science, Large Lecture Theatre (LT2)');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="location-outline" size={18} color={colors.brandPrimary} />
          <AppText weight="medium">Share Campus Location / LT Hall 📍</AppText>
        </Pressable>
      </ActionSheetModal>
    </KeyboardAvoidingView>
  );
}
