import React from'react';
import { Pressable, View } from'react-native';
import { router, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import Swipeable from'react-native-gesture-handler/ReanimatedSwipeable';
import { Avatar } from'./Avatar';
import { AppText } from'./AppText';
import { PresenceHalo } from'./PresenceHalo';
import { useTheme } from'@/theme/ThemeProvider';
import { Conversation } from'@/api/types';

interface ConversationRowProps {
 conversation: Conversation;
 /** PRD Section 8 gesture-interactions - when provided, swiping the row left reveals an archive action. */
 onArchive?: () => void;
 onSelect?: (id: string) => void;
 isSelected?: boolean;
}

function formatMessageTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ConversationRow({ conversation, onArchive, onSelect, isSelected }: ConversationRowProps) {
 const { colors, spacing, isDark } = useTheme();
 const segments = useSegments();
 // segments[0] is the current role group, e.g. "(student)" - reused
 // across all four roles instead of a hardcoded basePath per screen.
 const roleGroup = segments[0];

 const handlePress = () => {
 if (onSelect) {
 onSelect(conversation.id);
 } else {
 router.push(`/${roleGroup}/messages/${conversation.id}` as any);
 }
 };

 const row = (
 <Pressable
 onPress={handlePress}
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
 paddingHorizontal: spacing.md,
 backgroundColor: isSelected
 ? isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9'
 : colors.surface,
 borderBottomWidth: 1,
 borderBottomColor: colors.divider,
 }}
 >
 <View>
 <Avatar name={conversation.participantName} uri={conversation.participantAvatarUrl} size={48} />
 {conversation.isOnline ? (
 <View style={{ position: 'absolute', bottom: -1, right: -1 }}>
 <PresenceHalo isOnline />
 </View>
 ) : null}
 </View>
 <View style={{ flex: 1, minWidth: 0 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 3 }}>
 <AppText weight="bold"variant="bodySmall"numberOfLines={1}style={{ flex: 1, minWidth: 0 }}>
 {conversation.participantName}
 </AppText>
 {conversation.lastMessageAt ? (
 <AppText variant="caption"tone="secondary"style={{ fontSize: 11, flexShrink: 0 }}>
 {formatMessageTime(conversation.lastMessageAt)}
 </AppText>
 ) : null}
 </View>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
 <AppText tone="secondary"variant="bodySmall"numberOfLines={1}style={{ flex: 1, minWidth: 0 }}>
 {conversation.lastMessagePreview ?? 'Say hello \ud83d\udc4b'}
 </AppText>
 {conversation.unreadCount > 0 && (
 <View
 style={{
 backgroundColor: colors.brandPrimary,
 borderRadius: 10,
 minWidth: 20,
 height: 20,
 alignItems: 'center',
 justifyContent: 'center',
 paddingHorizontal: 6,
 flexShrink: 0,
 }}
 >
 <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>
 {conversation.unreadCount}
 </AppText>
 </View>
 )}
 </View>
 </View>
 </Pressable>
 );

 if (!onArchive) return row;

 return (
 <Swipeable
 renderRightActions={() => (
 <Pressable
 onPress={onArchive}
 accessibilityRole="button"accessibilityLabel={`Archive conversation with ${conversation.participantName}`}
 style={{
 width: 88,
 backgroundColor: colors.critical,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="archive-outline"size={20} color="#FFFFFF" />
 </Pressable>
 )}
 >
 {row}
 </Swipeable>
 );
}
