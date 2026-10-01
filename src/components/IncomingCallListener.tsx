import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { CallModal } from './CallModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useRealtimeChannel, RealtimeEvent } from '@/realtime/useRealtimeChannel';
import { listConversations, sendMessage } from '@/api/messaging';
import { isCallMessage, extractCallDetails, CallDetails, CALL_DECLINED_MARKER } from '@/api/calling';
import { haptics } from '@/utils/haptics';

interface IncomingCall {
  conversationId: string;
  details: CallDetails;
  callerName: string;
  callerAvatar?: string | null;
}

/**
 * App-wide incoming-call signal. `startCallInChat` (src/api/calling.ts) only
 * ever posted the invite into the chat itself, so a call only interrupted the
 * recipient if they happened to already have that exact `ChatThread` open.
 * Mounted once in app/_layout.tsx's AppShell(), this listens on the same
 * shared Realtime channel every other screen already uses
 * (src/realtime/useRealtimeChannel.ts) for a `[CALL_INVITE]` message in any
 * channel the signed-in user is a member of, and surfaces a full-screen
 * Accept/Decline overlay wherever they are in the app.
 *
 * Scope: this only works while the app is foregrounded or
 * backgrounded-but-running, matching what a Realtime subscription can
 * actually deliver - no CallKit / native VoIP wake-from-killed-app support.
 */
export function IncomingCallListener() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null);

  // The channels this user is actually a member of - reused from the same
  // query every messages screen already keeps warm, rather than a second
  // chat_channel_members lookup of our own.
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    enabled: !!user,
    staleTime: 10000,
  });

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== 'message.created') return;
    const row: any = event.message;
    const myId = userIdRef.current;
    if (!myId || !row?.content || row.sender_id === myId) return;
    if (!isCallMessage(row.content)) return;

    const conv = conversationsRef.current?.find((c) => c.id === row.channel_id);
    if (!conv) return; // not a channel this user belongs to

    const details = extractCallDetails(row.content);
    if (!details) return;

    haptics.error();
    setIncoming({
      conversationId: row.channel_id,
      details,
      callerName: conv.participantName,
      callerAvatar: conv.participantAvatarUrl,
    });
  }, []);

  useRealtimeChannel(handleRealtimeEvent);

  // No bundled ringtone asset ships in this repo's assets/ folder, so rather
  // than fabricate or pull in a binary nobody can source, the "ring" is a
  // repeated haptic buzz for as long as the incoming-call sheet is up.
  useEffect(() => {
    if (!incoming) return;
    const id = setInterval(() => haptics.error(), 1200);
    return () => clearInterval(id);
  }, [incoming]);

  function handleDecline() {
    const target = incoming;
    if (!target) return;
    haptics.light();
    setIncoming(null);
    sendMessage(target.conversationId, `${CALL_DECLINED_MARKER} Call declined.`).catch(() => {
      // Best-effort courtesy message; the caller's own CallModal just won't
      // auto-detect the decline if this fails, it can still hang up itself.
    });
  }

  function handleAccept() {
    if (!incoming) return;
    haptics.medium();
    setActiveCall(incoming);
    setIncoming(null);
  }

  const isVoice = incoming?.details.callType === 'voice';

  return (
    <>
      <Modal visible={!!incoming} transparent animationType="fade" onRequestClose={handleDecline}>
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.content}>
            <Avatar name={incoming?.callerName || 'Campus Peer'} uri={incoming?.callerAvatar} size={110} />
            <AppText variant="h2" weight="bold" tone="inverse" style={{ marginTop: spacing.lg }}>
              {incoming?.callerName || 'Campus Peer'}
            </AppText>
            <AppText variant="bodySmall" style={{ color: '#94A3B8', marginTop: 4 }}>
              Incoming Lioris {isVoice ? 'voice' : 'video'} call
            </AppText>
          </View>

          <View style={styles.actions}>
            <View style={styles.actionColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline call"
                onPress={handleDecline}
                style={[styles.actionBtn, { backgroundColor: colors.critical }]}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </Pressable>
              <AppText variant="caption" tone="inverse" style={{ marginTop: 8 }}>Decline</AppText>
            </View>

            <View style={styles.actionColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept call"
                onPress={handleAccept}
                style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
              >
                <Ionicons name={isVoice ? 'call' : 'videocam'} size={26} color="#FFFFFF" />
              </Pressable>
              <AppText variant="caption" tone="inverse" style={{ marginTop: 8 }}>Accept</AppText>
            </View>
          </View>
        </View>
      </Modal>

      {activeCall && (
        <CallModal
          visible
          onClose={() => setActiveCall(null)}
          callType={activeCall.details.callType}
          roomName={activeCall.details.roomName}
          callUrl={activeCall.details.callUrl}
          conversationId={activeCall.conversationId}
          partnerName={activeCall.callerName}
          partnerAvatar={activeCall.callerAvatar}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0A0F1DF2',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 260,
    paddingBottom: 24,
  },
  actionColumn: {
    alignItems: 'center',
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
