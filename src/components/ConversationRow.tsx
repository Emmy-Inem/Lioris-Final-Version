import React from 'react';
import { Pressable, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Avatar } from './Avatar';
import { AppText } from './AppText';
import { PresenceHalo } from './PresenceHalo';
import { useTheme } from '@/theme/ThemeProvider';
import { Conversation } from '@/api/types';

interface ConversationRowProps {
  conversation: Conversation;
  /** PRD Section 8 gesture-interactions — when provided, swiping the row left reveals an archive action. */
  onArchive?: () => void;
}

export function ConversationRow({ conversation, onArchive }: ConversationRowProps) {
  const { colors, spacing } = useTheme();
  const segments = useSegments();
  // segments[0] is the current role group, e.g. "(student)" — reused
  // across all four roles instead of a hardcoded basePath per screen.
  const roleGroup = segments[0];

  const row = (
    <Pressable
      onPress={() => router.push(`/${roleGroup}/messages/${conversation.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conversation.participantName}${
        conversation.unreadCount > 0 ? `, ${conversation.unreadCount} unread` : ''
      }${conversation.isOnline ? ', online' : ''}`}
      accessibilityHint={conversation.lastMessagePreview ?? undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View>
        <Avatar name={conversation.participantName} uri={conversation.participantAvatarUrl} />
        {conversation.isOnline ? (
          <View style={{ position: 'absolute', bottom: -1, right: -1 }}>
            <PresenceHalo isOnline />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText weight="semiBold">{conversation.participantName}</AppText>
          {conversation.unreadCount > 0 && (
            <View
              style={{
                backgroundColor: colors.brandAccent,
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 5,
              }}
            >
              <AppText variant="caption" weight="bold" tone="inverse">
                {conversation.unreadCount}
              </AppText>
            </View>
          )}
        </View>
        <AppText tone="secondary" variant="bodySmall" numberOfLines={1}>
          {conversation.lastMessagePreview ?? 'Say hello \ud83d\udc4b'}
        </AppText>
      </View>
    </Pressable>
  );

  if (!onArchive) return row;

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onArchive}
          accessibilityRole="button"
          accessibilityLabel={`Archive conversation with ${conversation.participantName}`}
          style={{
            width: 88,
            backgroundColor: colors.critical,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
}
