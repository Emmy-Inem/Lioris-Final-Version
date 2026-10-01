import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';
import { ActionSheetModal } from './ActionSheetModal';
import { CallModal } from './CallModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listMessages, sendMessage, listConversations, markConversationAsRead, deleteMessageForMe } from '@/api/messaging';
import { uploadMediaFile } from '@/api/storage';
import { useSignedUrl } from '@/api/signedUrls';
import {
  startCallInChat,
  isCallMessage,
  extractCallDetails,
  CallDetails,
} from '@/api/calling';
import { isUserBlocked } from '@/api/connections';
import { Message } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

interface OutgoingMessage extends Message {
  failed?: boolean;
  mediaUrl?: string;
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
}

/**
 * Resolves a stored chat attachment reference (a safe http(s) URL, or a bare
 * `resources` storage path - that bucket is private, see src/api/storage.ts)
 * into something actually renderable, mirroring the `useSignedUrl` pattern
 * already used by ResumeButton (src/components/JobApplicantsModal.tsx) and
 * other private-media consumers.
 */
function ChatAttachment({ mediaUrl, isMe }: { mediaUrl: string; isMe: boolean }) {
  const { colors } = useTheme();
  const { url, loading } = useSignedUrl('resources', mediaUrl);

  if (isImageUrl(mediaUrl)) {
    if (!url) {
      return (
        <View
          style={{
            width: 200,
            height: 150,
            borderRadius: 12,
            marginBottom: 6,
            backgroundColor: colors.divider,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={loading ? 'hourglass-outline' : 'image-outline'} size={22} color={colors.textSecondary} />
        </View>
      );
    }
    return (
      <Image
        source={{ uri: url }}
        style={{ width: 200, height: 150, borderRadius: 12, marginBottom: 6, backgroundColor: colors.divider }}
        resizeMode="cover"
      />
    );
  }

  return (
    <Pressable
      disabled={loading || !url}
      onPress={() => { if (url) void openExternalUrl(url); }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : colors.background,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginBottom: 6,
      }}
    >
      <Ionicons name="document-text" size={16} color={isMe ? '#FFFFFF' : colors.brandPrimary} />
      <AppText variant="caption" tone={isMe ? 'inverse' : 'brand'} style={{ textDecorationLine: 'underline' }}>
        {loading ? 'Opening…' : url ? 'Open attachment' : 'Attachment unavailable'}
      </AppText>
    </Pressable>
  );
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  useRealtimeChannel();

  const { data } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => listMessages(conversationId),
    refetchInterval: 1500,
  });

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    refetchInterval: 3000,
  });

  const currentConversation = conversations?.find((c) => c.id === conversationId);
  const partnerName = currentConversation?.participantName ?? 'Student Peer';
  const partnerAvatar = currentConversation?.participantAvatarUrl;
  const partnerDepartment = currentConversation?.participantDepartment;
  const partnerRole = currentConversation?.participantRole;

  const subtitleText = partnerDepartment
    ? `Online | ${partnerDepartment}`
    : partnerRole
    ? `Online | ${partnerRole.charAt(0).toUpperCase() + partnerRole.slice(1)}`
    : 'Online | Campus Verified';

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<OutgoingMessage | null>(null);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<CallDetails | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [messageActionTarget, setMessageActionTarget] = useState<OutgoingMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);

  const allMessages: OutgoingMessage[] = [...(data?.items ?? []), ...pending];

  // Auto mark conversation as read when active
  useEffect(() => {
    if (conversationId) {
      markConversationAsRead(conversationId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  }, [conversationId, data?.items?.length]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (allMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [allMessages.length]);

  async function handleStartCall(callType: 'voice' | 'video') {
    haptics.medium();
    const callerName = user?.fullName || 'Campus Peer';
    const recipientId = currentConversation?.participantId;
    if (recipientId && isUserBlocked(recipientId)) {
      haptics.error();
      Alert.alert('Call Blocked', "You can't call a user you've blocked. Unblock them first in Settings.");
      return;
    }
    try {
      const details = await startCallInChat(conversationId, callType, callerName, recipientId);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      setActiveCall(details);
    } catch (err) {
      haptics.error();
      Alert.alert('Call Not Started', err instanceof Error ? err.message : 'Could not start the call. Please try again.');
    }
  }

  async function handleDeleteMessageForMe() {
    const target = messageActionTarget;
    setMessageActionTarget(null);
    if (!target || target.id.startsWith('pending-')) return;
    haptics.medium();
    setDeletingMessage(true);
    try {
      await deleteMessageForMe(target.id);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    } catch {
      haptics.error();
      Alert.alert('Could Not Delete', 'This message could not be removed. Please try again.');
    } finally {
      setDeletingMessage(false);
    }
  }

  function handleJoinCallFromMessage(content: string) {
    haptics.medium();
    const details = extractCallDetails(content);
    if (details) {
      setActiveCall(details);
    }
  }

  async function handleSend(contentToSend?: string, mediaUrl?: string) {
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
      mediaUrl,
    };
    setPending((prev) => [...prev, optimistic]);

    try {
      await sendMessage(conversationId, outgoingContent, mediaUrl);
      setPending((prev) => prev.filter((m) => m.id !== optimistic.id));
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setPartnerTyping(true);
      setTimeout(() => setPartnerTyping(false), 1800);
    } catch {
      haptics.error();
      setPending((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'failed', failed: true } : m)),
      );
    }
  }

  async function handlePickAndSendPhoto() {
    setAttachmentSheetOpen(false);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Needed', 'Allow photo library access to send a study photo.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingAttachment(true);
      haptics.light();
      const publicUrl = await uploadMediaFile('resources', asset.uri, 'chat_attachments');
      const fileName = asset.fileName || 'Study Photo';
      await handleSend(`📷 Shared a photo: ${fileName}`, publicUrl);
    } catch (err) {
      console.warn('[ChatThread] Photo attachment failed:', err);
      haptics.error();
      Alert.alert('Upload Failed', 'Could not send the photo. Please try again.');
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handlePickAndSendDocument() {
    setAttachmentSheetOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingAttachment(true);
      haptics.light();
      const publicUrl = await uploadMediaFile('resources', asset.uri, 'chat_attachments', asset.name);
      const sizeLabel = asset.size ? ` (${(asset.size / (1024 * 1024)).toFixed(1)} MB)` : '';
      await handleSend(`📎 Attached: ${asset.name}${sizeLabel}`, publicUrl);
    } catch (err) {
      console.warn('[ChatThread] Document attachment failed:', err);
      haptics.error();
      Alert.alert('Upload Failed', 'Could not send the document. Please try again.');
    } finally {
      setUploadingAttachment(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
          {!isDesktop && (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back"
              onPress={() => router.back()}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
              }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <Avatar name={partnerName} uri={partnerAvatar} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText weight="bold" variant="bodySmall">
              {partnerName}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success, flexShrink: 0 }} />
              <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                {subtitleText}
              </AppText>
            </View>
          </View>
        </View>

        {/* Call Action Icons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Start audio call with ${partnerName}`}
            onPress={() => handleStartCall('voice')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.divider,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="call" size={17} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Start video session with ${partnerName}`}
            onPress={() => handleStartCall('video')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.divider,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="videocam" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMe = item.senderId === 'me' || (!!user?.id && item.senderId === user.id);

          // Rich Call Invitation Card
          if (isCallMessage(item.content)) {
            const callInfo = extractCallDetails(item.content);
            const isVoice = callInfo?.callType === 'voice';
            return (
              <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 4 }}>
                <View
                  style={{
                    maxWidth: '88%',
                    width: 280,
                    backgroundColor: isMe ? (isDark ? '#1E293B' : '#EFF6FF') : colors.surface,
                    padding: spacing.md,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.brandPrimary,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: colors.brandPrimary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={isVoice ? 'call' : 'videocam'} size={20} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" variant="bodySmall">
                        {isVoice ? 'Campus Voice Call' : 'Campus Video Room'}
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                        Live Encrypted WebRTC
                      </AppText>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => handleJoinCallFromMessage(item.content)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#22C55E',
                      paddingVertical: 9,
                      borderRadius: radius.pill,
                    }}
                  >
                    <Ionicons name={isVoice ? 'call' : 'videocam'} size={16} color="#FFFFFF" />
                    <AppText weight="bold" tone="inverse" variant="bodySmall">
                      Join Live Call
                    </AppText>
                  </Pressable>

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: spacing.xs }}>
                    <AppText
                      variant="caption"
                      style={{ fontSize: 11, color: colors.textSecondary }}
                    >
                      {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </AppText>
                    {isMe && (
                      <Ionicons
                        name={item.status === 'read' ? 'checkmark-done' : 'checkmark'}
                        size={12}
                        color={item.status === 'read' ? '#68D391' : colors.textSecondary}
                      />
                    )}
                  </View>
                </View>
              </View>
            );
          }

          // Standard Text Bubble
          return (
            <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
              <Pressable
                onLongPress={() => {
                  haptics.medium();
                  setMessageActionTarget(item);
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
                {item.mediaUrl ? <ChatAttachment mediaUrl={item.mediaUrl} isMe={isMe} /> : null}
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
                    style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.75)' : colors.textSecondary }}
                  >
                    {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </AppText>
                  {isMe && (
                    <Ionicons
                      name={item.status === 'read' ? 'checkmark-done' : 'checkmark'}
                      size={12}
                      color={item.status === 'read' ? '#68D391' : 'rgba(255,255,255,0.75)'}
                    />
                  )}
                </View>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="Start your conversation"
            description="Direct messages and calls are protected with end-to-end campus security."
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
          <AppText tone="brand" variant="caption" style={{ flex: 1 }}>
            Replying to: {replyingTo.content}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setReplyingTo(null)} hitSlop={8}>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Add"
          hitSlop={8}
          onPress={() => {
            haptics.light();
            setAttachmentSheetOpen(true);
          }}
          style={{ padding: 4 }}
        >
          <Ionicons name="add-circle" size={30} color={colors.textSecondary} />
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
          <TextInput accessibilityLabel="Type message"
            value={draft}
            onChangeText={setDraft}
            placeholder="Type message..."
            placeholderTextColor={colors.textSecondary}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => handleSend()}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}
          />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Send"
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
            handleStartCall('voice');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="call-outline" size={18} color={colors.textPrimary} />
          <AppText weight="medium">Start Campus Voice Call</AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            setAttachmentSheetOpen(false);
            handleStartCall('video');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="videocam-outline" size={18} color={colors.textPrimary} />
          <AppText weight="medium">Start Campus Video Meeting</AppText>
        </Pressable>

        <Pressable
          onPress={handlePickAndSendPhoto}
          disabled={uploadingAttachment}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, opacity: uploadingAttachment ? 0.5 : 1 }}
        >
          <Ionicons name="image-outline" size={18} color={colors.textPrimary} />
          <AppText weight="medium">Send Study Photo / Diagram</AppText>
        </Pressable>

        <Pressable
          onPress={handlePickAndSendDocument}
          disabled={uploadingAttachment}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, opacity: uploadingAttachment ? 0.5 : 1 }}
        >
          <Ionicons name="document-attach-outline" size={18} color={colors.textPrimary} />
          <AppText weight="medium">Attach Course PDF / Lecture Notes</AppText>
        </Pressable>
      </ActionSheetModal>

      {/* Per-message actions: reply or delete-for-me */}
      <ActionSheetModal
        visible={!!messageActionTarget}
        onClose={() => setMessageActionTarget(null)}
      >
        <Pressable
          onPress={() => {
            setReplyingTo(messageActionTarget);
            setMessageActionTarget(null);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="arrow-undo-outline" size={18} color={colors.textPrimary} />
          <AppText weight="medium">Reply</AppText>
        </Pressable>

        <Pressable
          onPress={handleDeleteMessageForMe}
          disabled={deletingMessage}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, opacity: deletingMessage ? 0.5 : 1 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.critical} />
          <AppText weight="medium" style={{ color: colors.critical }}>Delete for me</AppText>
        </Pressable>
      </ActionSheetModal>

      {/* Live Call Modal */}
      {activeCall && (
        <CallModal
          visible={!!activeCall}
          onClose={() => setActiveCall(null)}
          callType={activeCall.callType}
          roomName={activeCall.roomName}
          callUrl={activeCall.callUrl}
          conversationId={conversationId}
          partnerName={partnerName}
          partnerAvatar={partnerAvatar}
          partnerDepartment={partnerDepartment}
        />
      )}
    </KeyboardAvoidingView>
  );
}
