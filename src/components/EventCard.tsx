import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Badge } from './Badge';
import { ActionSheetModal } from './ActionSheetModal';
import { useTheme } from '@/theme/ThemeProvider';
import { CampusEvent } from '@/api/types';
import { rsvpToEvent } from '@/api/events';
import { submitReport } from '@/api/moderation';
import { haptics } from '@/utils/haptics';

function formatDateRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = `${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}\u2013${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return `${dateStr} \u00b7 ${timeStr}`;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function EventCard({ event }: { event: CampusEvent }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0];
  const [rsvpd, setRsvpd] = useState(!!event.isRsvpd);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderNotificationId, setReminderNotificationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cardScale = useSharedValue(1);
  const cardAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const isFull = !!event.capacity && event.rsvpCount >= event.capacity && !rsvpd;

  // Previously purely decorative local state — toggling the bell did
  // nothing but flip an icon. Now schedules/cancels a real local
  // notification 1 hour before the event starts, using the same
  // expo-notifications wiring the app's push-registration flow
  // already sets up (Android channel, permission, etc.).
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
      Alert.alert('Too late to remind', 'This event starts in less than an hour, so there\u2019s no time left to remind you beforehand.');
      return;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${event.title} starts in 1 hour`,
          body: event.location,
          data: { deepLinkPath: `/${roleGroup}/events/${event.id}` },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      setReminderNotificationId(id);
      setReminderOn(true);
    } catch {
      // Most likely no notification permission granted — fail
      // gracefully rather than pretending the reminder is set.
      Alert.alert('Couldn\u2019t set reminder', 'Notification permission may not be granted yet.');
    }
  }

  async function handleRsvp() {
    haptics.light();
    setSubmitting(true);
    try {
      await rsvpToEvent(event.id, rsvpd ? 'cancel' : 'rsvp');
      setRsvpd((v) => !v);
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReport() {
    setMenuOpen(false);
    await submitReport({ targetType: 'event', targetId: event.id, reason: 'Reported from event card' });
    Alert.alert('Reported', 'Thanks — our moderation team will review this event.');
  }

  function handleBlockHost() {
    setMenuOpen(false);
    Alert.alert('Host blocked', `You won't see events or posts from ${event.organizerName ?? 'this host'} anymore.`);
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <AnimatedPressable
        onPress={() => {
          if (['(student)', '(alumni)', '(staff)', '(admin)'].includes(roleGroup)) {
            router.push(`/${roleGroup}/events/${event.id}` as any);
          }
        }}
        onPressIn={() => (cardScale.value = withTiming(0.98, { duration: 100 }))}
        onPressOut={() => (cardScale.value = withTiming(1, { duration: 150 }))}
        accessibilityRole="button"
        accessibilityLabel={`Open event: ${event.title}`}
        style={cardAnimatedStyle}
      >
        <SolidCard padded={false}>
          <View
            style={{
              height: 140,
              backgroundColor: colors.divider,
              borderTopLeftRadius: 25,
              borderTopRightRadius: 25,
            }}
          />
          <View style={{ padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Badge label={event.category} tone="accent" />
                {isFull && <Badge label="Full — waitlist" tone="warning" />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Pressable
                  onPress={handleToggleReminder}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reminderOn }}
                  accessibilityLabel={reminderOn ? 'Turn off reminder' : 'Turn on reminder'}
                >
                  <Ionicons
                    name={reminderOn ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={reminderOn ? colors.brandPrimary : colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setMenuOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Event options"
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
              {event.title}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <Ionicons name="location" size={12} color={colors.critical} />
              <AppText tone="secondary" variant="bodySmall">
                {event.location}
              </AppText>
            </View>
            {event.organizerName ? (
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
                Host: {event.organizerName}
              </AppText>
            ) : null}

            <AppText tone="secondary" style={{ marginBottom: spacing.sm }}>
              {event.description}
            </AppText>

            <AppText variant="bodySmall" weight="medium" style={{ marginBottom: 2 }}>
              {formatDateRange(event.startAt, event.endAt)}
            </AppText>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
              <AppText tone="secondary" variant="caption">
                {event.rsvpCount} going{event.capacity ? ` \u00b7 ${event.capacity} capacity` : ''}
              </AppText>
              <AppButton
                label={rsvpd ? 'Joined \u2713' : isFull ? 'Join waitlist' : 'RSVP'}
                variant={rsvpd ? 'secondary' : 'primary'}
                onPress={handleRsvp}
                loading={submitting}
              />
            </View>

            {event.attendeeNames && event.attendeeNames.length > 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <AppText weight="bold" variant="bodySmall">
                  Going ({event.attendeeNames.length}):
                </AppText>
                <AppText tone="secondary" variant="bodySmall">
                  {event.attendeeNames.join(', ')}
                </AppText>
              </View>
            ) : null}
          </View>
        </SolidCard>
      </AnimatedPressable>

      <ActionSheetModal visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable
          onPress={handleReport}
          accessibilityRole="button"
          accessibilityLabel="Report event"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="flag" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }}>Report Event</AppText>
        </Pressable>
        <Pressable
          onPress={handleBlockHost}
          accessibilityRole="button"
          accessibilityLabel={`Block host ${event.organizerName ?? ''}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="ban" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }}>Block Host {event.organizerName ? `@${event.organizerName}` : ''}</AppText>
        </Pressable>
      </ActionSheetModal>
    </View>
  );
}
