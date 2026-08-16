import React, { useState } from'react';
import { Alert, Pressable, View } from'react-native';
import { Image } from'expo-image';
import { router, useSegments } from'expo-router';
import { useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from'react-native-reanimated';
import * as Notifications from'expo-notifications';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { AppButton } from'./AppButton';
import { Badge } from'./Badge';
import { ActionSheetModal } from'./ActionSheetModal';
import { useTheme } from'@/theme/ThemeProvider';
import { CampusEvent } from'@/api/types';
import { rsvpToEvent } from'@/api/events';
import { submitReport } from'@/api/moderation';
import { haptics } from'@/utils/haptics';

const EVENT_TECH_IMG = require('../../assets/images/event_tech_hackathon.jpg');
const EVENT_ACADEMIC_IMG = require('../../assets/images/event_academic_symposium.jpg');

function parseEventDate(startAt: string) {
  const d = new Date(startAt);
  const month = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { month, day, time };
}

export function EventCard({ event }: { event: CampusEvent }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const [rsvpd, setRsvpd] = useState(!!event.isRsvpd);
  const [rsvpCount, setRsvpCount] = useState(event.rsvpCount);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderNotificationId, setReminderNotificationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cardScale = useSharedValue(1);
  const cardAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const { month, day, time } = parseEventDate(event.startAt);
  const isFull = !!event.capacity && rsvpCount >= event.capacity && !rsvpd;

  const eventImage =
    event.coverImageUrl
      ? { uri: event.coverImageUrl }
      : event.category.toLowerCase().includes('career') || event.category.toLowerCase().includes('tech')
      ? EVENT_TECH_IMG
      : EVENT_ACADEMIC_IMG;

  function handleOpenEvent() {
    haptics.light();
    if (['(student)', '(alumni)', '(staff)', '(admin)'].includes(roleGroup)) {
      router.push(`/${roleGroup}/events/${event.id}` as any);
    }
  }

  async function handleToggleReminder() {
    haptics.light();
    if (reminderOn) {
      if (reminderNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(reminderNotificationId).catch(() => {});
      }
      setReminderOn(false);
      setReminderNotificationId(null);
      return;
    }

    const triggerDate = new Date(new Date(event.startAt).getTime() - 60 * 60 * 1000);
    if (triggerDate.getTime() <= Date.now()) {
      Alert.alert('Reminder Set', `You will receive a notification before ${event.title} begins.`);
      setReminderOn(true);
      return;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${event.title} starts soon`,
          body: event.location,
          data: { deepLinkPath: `/${roleGroup}/events/${event.id}` },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      setReminderNotificationId(id);
      setReminderOn(true);
    } catch {
      setReminderOn(true);
    }
  }

  async function handleRsvp() {
    haptics.light();
    setSubmitting(true);
    const next = !rsvpd;
    setRsvpd(next);
    setRsvpCount((prev) => prev + (next ? 1 : -1));
    try {
      await rsvpToEvent(event.id, next ? 'rsvp' : 'cancel');
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch {
      setRsvpd(!next);
      setRsvpCount((prev) => prev + (next ? -1 : 1));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReport() {
    setMenuOpen(false);
    await submitReport({
      targetType: 'event',
      targetId: event.id,
      institutionCode: (event as any).campusCode || (event as any).institutionCode || undefined,
      reason: 'Reported from event card',
    });
    Alert.alert('Reported', 'Thanks — our campus moderation team will review this event.');
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Animated.View style={cardAnimatedStyle}>
        <SolidCard radius={22} padded={false} style={{ overflow: 'hidden' }}>
          {/* Clickable Event Cover Image */}
          <Pressable
            onPress={handleOpenEvent}
            onPressIn={() => (cardScale.value = withTiming(0.985, { duration: 80 }))}
            onPressOut={() => (cardScale.value = withTiming(1, { duration: 120 }))}
            style={{ width: '100%', height: 130, position: 'relative' }}
          >
            <Image source={eventImage} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View
              style={{
                position: 'absolute',
                top: spacing.sm,
                right: spacing.sm,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: radius.sm,
              }}
            >
              <AppText variant="caption" weight="semiBold" tone="inverse" style={{ fontSize: 11 }}>
                {event.category}
              </AppText>
            </View>
          </Pressable>

          <View style={{ padding: spacing.md }}>
            {/* Date Box + Title & Quick Actions */}
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              {/* Calendar Date Box */}
              <Pressable
                onPress={handleOpenEvent}
                style={{
                  width: 54,
                  height: 58,
                  borderRadius: radius.md,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.brandPrimary,
                }}
              >
                <AppText variant="caption"weight="bold"tone="brand"style={{ fontSize: 10, letterSpacing: 0.5 }}>
                  {month}
                </AppText>
                <AppText variant="h2"weight="bold"tone="brand"style={{ lineHeight: 24 }}>
                  {day}
                </AppText>
              </Pressable>

              {/* Title & Info */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pressable onPress={handleOpenEvent} style={{ flex: 1, paddingRight: 4 }}>
                    <AppText variant="h3"weight="bold"numberOfLines={2}>
                      {event.title}
                    </AppText>
                  </Pressable>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Pressable onPress={handleToggleReminder} hitSlop={8} style={{ padding: 2 }}>
                      <Ionicons
                        name={reminderOn ? 'notifications' : 'notifications-outline'}
                        size={18}
                        color={reminderOn ? colors.brandPrimary : colors.textSecondary}
                      />
                    </Pressable>
                    <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={{ padding: 2 }}>
                      <Ionicons name="ellipsis-horizontal"size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>

                <Pressable onPress={handleOpenEvent} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="time-outline"size={13} color={colors.textSecondary} />
                  <AppText tone="secondary"variant="caption">
                    {time} | {event.location}
                  </AppText>
                </Pressable>
              </View>
            </View>

            {/* Description */}
            <Pressable onPress={handleOpenEvent}>
              <AppText tone="secondary"variant="bodySmall"numberOfLines={2} style={{ marginTop: spacing.sm, lineHeight: 18 }}>
                {event.description}
              </AppText>
            </Pressable>

            {/* Bottom Actions Bar (Separate, Un-nested) */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: spacing.md,
                paddingTop: spacing.xs,
                borderTopWidth: 1,
                borderTopColor: colors.divider,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="people"size={16} color={colors.brandPrimary} />
                <AppText variant="caption"weight="bold"tone="brand">
                  {rsvpCount} attending{event.capacity ? ` (${event.capacity} max)` : ''}
                </AppText>
              </View>

              <AppButton
                label={rsvpd ? 'Going' : isFull ? 'Join Waitlist' : 'RSVP'}
                variant={rsvpd ? 'secondary' : 'primary'}
                onPress={handleRsvp}
                loading={submitting}
              />
            </View>
          </View>
        </SolidCard>
      </Animated.View>

      <ActionSheetModal visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable
          onPress={handleReport}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="flag-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }} weight="medium">Report Event</AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            setMenuOpen(false);
            Alert.alert(
              `Block ${event.organizerName || 'Organizer'}?`,
              `You will no longer see events or posts from this organizer for this session.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block Organizer',
                  style: 'destructive',
                  onPress: async () => {
                    const { blockUser } = await import('@/api/connections');
                    await blockUser(event.organizerId, event.organizerName);
                    await queryClient.invalidateQueries({ queryKey: ['events'] });
                    haptics.medium();
                    Alert.alert('Organizer Blocked', `Events from ${event.organizerName || 'this organizer'} have been filtered.`);
                  },
                },
              ]
            );
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="ban-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }} weight="medium">Block Organizer</AppText>
        </Pressable>
      </ActionSheetModal>
    </View>
  );
}
