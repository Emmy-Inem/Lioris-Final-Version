import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { SuggestedConnectionCard } from './SuggestedConnectionCard';
import { useTheme } from '@/theme/ThemeProvider';
import {
  listNotifications,
  markNotificationRead,
  deleteNotification,
  markAllNotificationsRead,
  clearAllNotifications,
} from '@/api/notifications';
import { listIncomingConnectionRequests, listSuggestedConnections } from '@/api/connections';
import { AppNotification } from '@/api/types';

const ICON_BY_TYPE: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  announcement: 'megaphone-outline',
  event: 'calendar-outline',
  message: 'chatbubble-outline',
  moderation: 'shield-checkmark-outline',
  system: 'information-circle-outline',
};

/** Ported from NotificationsScreen (AdminAndOther.kt): Alerts/Connections tabs, Read All/Clear, "People you may know". */
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

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.lg, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1" weight="bold">
            Notification Alert Center
          </AppText>
          <AppText variant="h3">🔔</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <AppText weight="semiBold" tone="brand" onPress={handleReadAll}>
            Read All
          </AppText>
          <AppText weight="semiBold" tone="brand" onPress={handleClear}>
            Clear
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
        {(['Alerts', 'Connections'] as const).map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t}
              style={{
                flex: 1,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {t === 'Alerts' ? 'Alerts 🔔' : 'Connections 🤝'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {tab === 'Alerts' ? (
        <FlatList
          data={notifications ?? []}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <Animated.View layout={LinearTransition} exiting={FadeOut.duration(200)}>
              <Swipeable
                renderRightActions={() => (
                  <Pressable
                    onPress={() => handleDelete(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete notification"
                    style={{
                      width: 72,
                      backgroundColor: colors.critical,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                  </Pressable>
                )}
              >
                <Pressable
                  onPress={() => handlePress(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.openedAt ? '' : 'Unread. '}${item.title}. ${item.body}`}
                  accessibilityHint="Swipe left for delete option"
                  style={{
                    flexDirection: 'row',
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    backgroundColor: colors.background,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.divider,
                    opacity: item.openedAt ? 0.6 : 1,
                  }}
                >
                  <Ionicons name={ICON_BY_TYPE[item.type]} size={22} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AppText weight="semiBold" style={{ flex: 1 }}>
                        {item.title}
                      </AppText>
                      <Pressable
                        onPress={() => handleDelete(item.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete notification"
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close" size={16} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                    <AppText tone="secondary" variant="bodySmall">
                      {item.body}
                    </AppText>
                    {item.deepLinkPath ? (
                      <AppText variant="caption" weight="bold" tone="brand" style={{ marginTop: 4 }}>
                        Click to view content →
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              </Swipeable>
            </Animated.View>
          )}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <AppText weight="bold">You're all caught up</AppText>
                <AppText tone="secondary">New notifications will show up here.</AppText>
              </View>
            ) : null
          }
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <SolidCard style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.divider,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="git-network" size={20} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">Your Professional Network 🎓</AppText>
                <AppText weight="bold" tone="brand" variant="bodySmall">
                  0 Connections connected on campus
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Expand your network to unlock shared academic notes, study matches, and peer
                  mentorship.
                </AppText>
              </View>
            </View>
          </SolidCard>

          {incomingRequests && incomingRequests.length > 0 ? (
            incomingRequests.map((req) => (
              <SolidCard key={req.id} style={{ marginBottom: spacing.md }}>
                <AppText weight="bold" variant="bodySmall">
                  {req.requesterName}
                </AppText>
                {req.requesterHeadline ? (
                  <AppText tone="secondary" variant="caption">
                    {req.requesterHeadline}
                  </AppText>
                ) : null}
              </SolidCard>
            ))
          ) : (
            <SolidCard style={{ alignItems: 'center', marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.divider }} />
                <View
                  style={{ width: 24, height: 1, backgroundColor: colors.border, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border }}
                />
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pastelPrimaryBg }} />
              </View>
              <AppText weight="bold">No Pending Connection Requests 🤝</AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', marginTop: 4 }}>
                Your invitation queue is clear! Discover active peer profiles or alumni mentors
                below to build your campus network.
              </AppText>
            </SolidCard>
          )}

          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
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
