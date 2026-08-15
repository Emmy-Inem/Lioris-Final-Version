import React, { useState } from'react';
import { FlatList, Pressable, ScrollView, View } from'react-native';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import Animated, { FadeOut, LinearTransition } from'react-native-reanimated';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { SolidCard } from'./SolidCard';
import { Badge } from'./Badge';
import { SuggestedConnectionCard } from'./SuggestedConnectionCard';
import { useTheme } from'@/theme/ThemeProvider';
import {
  listNotifications,
  markNotificationRead,
  deleteNotification,
  markAllNotificationsRead,
  clearAllNotifications,
} from'@/api/notifications';
import { listIncomingConnectionRequests, listSuggestedConnections } from'@/api/connections';
import { AppNotification } from'@/api/types';

const NOTIFICATION_ICONS: Record<
  AppNotification['type'],
  { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }
> = {
  announcement: { icon: 'megaphone-outline', bg: '#E0F5F2', color: '#0B7A75' },
  system_announcement: { icon: 'notifications-outline', bg: '#FEE2E2', color: '#DC2626' },
  event: { icon: 'calendar-outline', bg: '#E6F4EA', color: '#137333' },
  message: { icon: 'chatbubble-outline', bg: '#E8F0FE', color: '#1A73E8' },
  moderation: { icon: 'shield-checkmark-outline', bg: '#FCE8E6', color: '#C5221F' },
  system: { icon: 'sparkles-outline', bg: '#F3E8FD', color: '#7C3AED' },
};

function formatNotificationTime(iso?: string) {
  if (!iso) return'9:30 AM';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function NotificationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'Alerts' | 'Connections'>('Alerts');

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(),
  });
  const { data: incomingRequests } = useQuery({
    queryKey: ['connections', 'incoming'],
    queryFn: listIncomingConnectionRequests,
  });
  const { data: suggestions } = useQuery({
    queryKey: ['connections', 'people-you-may-know'],
    queryFn: listSuggestedConnections,
  });

  async function handlePress(notification: AppNotification) {
    if (!notification.openedAt) {
      await markNotificationRead(notification.id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (notification.deepLinkPath) {
      router.push(notification.deepLinkPath as any);
    }
  }

  async function handleDelete(id: string) {
    await deleteNotification(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function handleReadAll() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function handleClear() {
    await clearAllNotifications();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const unreadCount = notifications?.filter((n) => !n.openedAt).length ?? 0;

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      {/* Screen Title & Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1"weight="bold">
            Notifications 
          </AppText>
          <AppText tone="secondary"variant="bodySmall">
            {unreadCount > 0 ? `${unreadCount} unread updates` : 'All caught up'}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={handleReadAll}
            style={{
              backgroundColor: colors.pastelPrimaryBg,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
            }}
          >
            <AppText weight="bold"tone="brand"variant="caption">
              Mark all read
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Tab Switcher */}
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
        {(['Alerts', 'Connections'] as const).map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"accessibilityState={{ selected }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                {t === 'Alerts' ? 'Alerts' : 'Connections 🤝'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {tab === 'Alerts' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
            TODAY
          </AppText>

          <SolidCard radius={20} style={{ padding: spacing.xs, marginBottom: spacing.md }}>
            {(notifications ?? []).map((item, idx) => {
              const meta = NOTIFICATION_ICONS[item.type] ?? NOTIFICATION_ICONS.system;
              const isUnread = !item.openedAt;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handlePress(item)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: isUnread ? colors.pastelPrimaryBg : 'transparent',
                    marginBottom: idx < (notifications?.length ?? 0) - 1 ? 2 : 0,
                  }}
                >
                  {/* Category Pastel Icon */}
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: meta.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>

                  {/* Title & Body */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AppText weight="bold"variant="bodySmall"numberOfLines={1} style={{ flex: 1, paddingRight: 4 }}>
                        {item.title}
                      </AppText>
                      <AppText tone="secondary"variant="caption"style={{ fontSize: 11 }}>
                        {formatNotificationTime(item.createdAt)}
                      </AppText>
                    </View>

                    <AppText tone="secondary"variant="bodySmall"style={{ marginTop: 2, lineHeight: 18 }}>
                      {item.body}
                    </AppText>

                    {item.deepLinkPath ? (
                      <AppText variant="caption"weight="bold"tone="brand"style={{ marginTop: 4 }}>
                        View details →
                      </AppText>
                    ) : null}
                  </View>

                  {/* Unread Dot */}
                  {isUnread ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.brandPrimary,
                        marginTop: 6,
                      }}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            {(notifications?.length ?? 0) === 0 && !isLoading ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Ionicons name="notifications-off-outline"size={32} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                <AppText weight="bold">You&apos;re all caught up</AppText>
                <AppText tone="secondary"variant="caption">
                  New campus announcements and reminders will appear here.
                </AppText>
              </View>
            ) : null}
          </SolidCard>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <SolidCard style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="git-network"size={20} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">Campus Network Directory </AppText>
                <AppText tone="secondary"variant="caption">
                  Connect with coursemates, find project partners, and message alumni advisors.
                </AppText>
              </View>
            </View>
          </SolidCard>

          <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.md }}>
            People you may know at the University
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {suggestions?.map((person, index) => (
              <SuggestedConnectionCard key={person.id} person={person} index={index} />
            ))}
          </View>
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
