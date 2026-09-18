import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { SuggestedConnectionCard } from './SuggestedConnectionCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import {
 listNotifications,
 markNotificationRead,
 deleteNotification,
 markAllNotificationsRead,
 clearAllNotifications,
} from '@/api/notifications';
import { listIncomingConnectionRequests, listSuggestedConnections } from '@/api/connections';
import { AppNotification } from '@/api/types';

const NOTIFICATION_ICONS: Record<
 AppNotification['type'],
 { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }
> = {
 announcement: { icon: 'megaphone-outline', bg: '#E0F5F2', color: '#0B7A75' },
 system_announcement: { icon: 'notifications-outline', bg: '#FEE2E2', color: '#DC2626' },
 event: { icon: 'calendar-outline', bg: '#E6F4EA', color: '#137333' },
 message: { icon: 'chatbubble-outline', bg: '#E8F0FE', color: '#1A73E8' },
 moderation: { icon: 'shield-checkmark-outline', bg: '#FCE8E6', color: '#C5221F' },
 system: { icon: 'information-circle-outline', bg: '#F3E8FD', color: '#7C3AED' },
};

function formatNotificationTime(iso?: string) {
 if (!iso) return '9:30 AM';
 const d = new Date(iso);
 return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function NotificationsScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'Alerts' | 'Connections'>('Alerts');
  const [filter, setFilter] = useState<'all' | 'unread' | 'announcements' | 'academic'>('all');

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

  const filteredNotifications = (notifications ?? []).filter((item) => {
    if (filter === 'unread') return !item.openedAt;
    if (filter === 'announcements') return item.type === 'announcement' || item.type === 'system_announcement';
    if (filter === 'academic') return item.type === 'event' || item.type === 'moderation';
    return true;
  });

  const renderAlertsSection = () => (
    <View style={{ flex: 1 }}>
      {/* Category Filter Pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[
          { id: 'all', label: `All (${notifications?.length ?? 0})` },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'announcements', label: 'Broadcasts' },
          { id: 'academic', label: 'Academic' },
        ].map((f) => {
          const isActive = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id as any)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: isActive ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: isActive ? colors.brandPrimary : colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText
                variant="caption"
                weight={isActive ? 'bold' : 'medium'}
                style={{ color: isActive ? '#FFFFFF' : colors.textSecondary }}
              >
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <SolidCard radius={20} style={{ padding: spacing.xs, marginBottom: spacing.md }}>
        {filteredNotifications.map((item, idx) => {
          const meta = NOTIFICATION_ICONS[item.type] ?? NOTIFICATION_ICONS.system;
          const isUnread = !item.openedAt;
          return (
            <Pressable
              key={item.id}
              onPress={() => handlePress(item)}
              style={({ hovered }: any) => [
                {
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: spacing.md,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: isUnread
                    ? colors.pastelPrimaryBg
                    : hovered
                    ? colors.surface
                    : 'transparent',
                  marginBottom: idx < filteredNotifications.length - 1 ? 2 : 0,
                },
              ]}
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
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                    {item.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ fontSize: 11, flexShrink: 0 }}>
                    {formatNotificationTime(item.createdAt)}
                  </AppText>
                </View>

                <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2, lineHeight: 18 }}>
                  {item.body}
                </AppText>

                {item.deepLinkPath ? (
                  <AppText variant="caption" weight="bold" tone="brand" style={{ marginTop: 4 }}>
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

        {filteredNotifications.length === 0 && !isLoading ? (
          <View style={{ paddingVertical: isDesktop ? spacing.xl : spacing.lg, paddingHorizontal: 16, alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colors.pastelPrimaryBg,
                borderWidth: 1.5,
                borderColor: colors.brandPrimary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 2,
              }}
            >
              <Ionicons name="checkmark-done-circle" size={28} color={colors.brandPrimary} />
            </View>

            <AppText weight="bold" variant="body">
              {filter === 'unread' ? 'No Unread Alerts' : "You're All Caught Up"}
            </AppText>

            <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', maxWidth: 360, lineHeight: 18 }}>
              {filter === 'unread'
                ? 'All university announcements and messages have been reviewed.'
                : 'No pending alerts or unread course notifications. You are completely up to date.'}
            </AppText>

            {/* Quick Campus Shortcuts */}
            <View style={{ width: '100%', maxWidth: 440, marginTop: 10, gap: 8 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
                Quick Campus Shortcuts
              </AppText>

              {[
                { label: 'Browse Campus Discussions', icon: 'chatbubbles-outline' as const, href: '/(student)/feed' },
                { label: 'Explore Events & Meetups', icon: 'calendar-outline' as const, href: '/(student)/events-list' },
                { label: 'Academic Past Questions Vault', icon: 'folder-open-outline' as const, href: '/(student)/resources' },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => router.push(item.href as any)}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: radius.md,
                    backgroundColor: hovered
                      ? colors.pastelPrimaryBg
                      : isDark
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(0,0,0,0.02)',
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name={item.icon} size={18} color={colors.brandPrimary} />
                    <AppText variant="bodySmall" weight="medium">
                      {item.label}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>

            {/* Real-time Status indicator */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                marginTop: 6,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
              <AppText variant="caption" weight="bold" style={{ color: '#059669', fontSize: 11 }}>
                Campus Sync: Real-Time Active
              </AppText>
            </View>
          </View>
        ) : null}
      </SolidCard>
    </View>
  );

  const renderConnectionsSection = () => (
    <View style={{ flex: 1 }}>
      {/* Directory Overview Card */}
      <SolidCard radius={20} style={{ padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.pastelPrimaryBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.brandPrimary,
            }}
          >
            <Ionicons name="people" size={22} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText weight="bold" variant="bodySmall">Campus Network Directory</AppText>
              <Badge label="VERIFIED" tone="brand" />
            </View>
            <AppText tone="secondary" variant="caption" style={{ marginTop: 2, lineHeight: 16 }}>
              Connect with coursemates, find project partners, and message alumni advisors.
            </AppText>
          </View>
        </View>
      </SolidCard>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Suggested Classmates & Peers
        </AppText>
        <AppText variant="caption" tone="secondary">
          {suggestions?.length ?? 0} recommendations
        </AppText>
      </View>

      {/* Full-width Responsive Connections List */}
      <View style={{ width: '100%' }}>
        {suggestions?.map((person, index) => (
          <SuggestedConnectionCard key={person.id} person={person} index={index} />
        ))}
      </View>
    </View>
  );

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Actions */}
      <View style={{ marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
            Notifications & Network
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {unreadCount > 0 && (
              <AppButton
                label="Mark all read"
                variant="secondary"
                size={isDesktop ? 'md' : 'sm'}
                onPress={handleReadAll}
              />
            )}
            <Pressable
              onPress={() => router.push('/(student)/settings' as any)}
              accessibilityLabel="Notification settings"
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="settings-outline" size={15} color={colors.textSecondary} />
              <AppText variant="caption" weight="medium" tone="secondary">
                Settings
              </AppText>
            </Pressable>
          </View>
        </View>
        <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 2 }}>
          {unreadCount > 0 ? `${unreadCount} unread campus updates` : 'All caught up'}
        </AppText>
      </View>

      {/* Mobile Tab Switcher */}
      {!isDesktop && (
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
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  backgroundColor: selected ? colors.brandPrimary : 'transparent',
                }}
              >
                <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                  {t} {t === 'Alerts' && unreadCount > 0 ? `(${unreadCount})` : ''}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 130 }}
      >
        {isDesktop ? (
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            {/* Left Column: Alerts Feed */}
            <View style={{ flex: 1.15 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs, textTransform: 'uppercase' }}>
                Campus Alerts & Updates
              </AppText>
              {renderAlertsSection()}
            </View>

            {/* Right Column: Connections & Network */}
            <View style={{ flex: 1 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs, textTransform: 'uppercase' }}>
                Suggested Connections
              </AppText>
              {renderConnectionsSection()}
            </View>
          </View>
        ) : tab === 'Alerts' ? (
          renderAlertsSection()
        ) : (
          renderConnectionsSection()
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
