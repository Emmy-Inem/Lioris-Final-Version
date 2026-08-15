import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { getEvent, rsvpToEvent } from '@/api/events';

/** Ported from the event-detail screenshots: offline map mock, walking directions, attendee list, calendar export actions. */
export function EventDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rsvpd, setRsvpdState] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: event, isLoading } = useQuery({ queryKey: ['events', 'detail', id], queryFn: () => getEvent(id) });
  const isRsvpd = rsvpd ?? !!event?.isRsvpd;

  async function handleCancelAttendance() {
    if (!event) return;
    setSubmitting(true);
    try {
      await rsvpToEvent(event.id, 'cancel');
      setRsvpdState(false);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !event) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText tone="secondary">Loading event...</AppText>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer glow={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <AppText variant="h1" weight="bold" style={{ marginBottom: spacing.sm }}>
          {event.title}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md }}>
          <Badge label={event.category} tone="brand" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="bodySmall">
              {event.location}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="bodySmall">
              {event.rsvpCount} joined
            </AppText>
          </View>
        </View>
        <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
          {event.description}
        </AppText>

        {/* Offline map mock — illustrative, not a real map/routing engine */}
        <View
          style={{
            height: 220,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.divider,
            marginBottom: spacing.md,
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', top: 16, left: 16, width: 60, height: 40, backgroundColor: colors.border, borderRadius: 6 }} />
          <View style={{ position: 'absolute', top: 60, left: 90, width: 50, height: 30, backgroundColor: colors.border, borderRadius: 6 }} />
          <View style={{ position: 'absolute', top: 16, right: 60, width: 40, height: 40, backgroundColor: colors.mintBg, borderRadius: 6 }} />
          <View style={{ position: 'absolute', bottom: 40, left: 20, width: 55, height: 35, backgroundColor: colors.border, borderRadius: 6 }} />
          <View style={{ position: 'absolute', top: 30, left: 30, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.critical }} />
          <View style={{ position: 'absolute', top: 38, left: 33, width: 2, height: 40, backgroundColor: colors.brandPrimary }} />
          <View style={{ position: 'absolute', top: 76, left: 33, width: 40, height: 2, backgroundColor: colors.brandPrimary }} />
          <View style={{ position: 'absolute', bottom: 8, left: 12 }}>
            <AppText variant="caption" tone="secondary">
              🚶 4 min walk (310m)
            </AppText>
          </View>
          <View style={{ position: 'absolute', right: 10, top: 10, gap: spacing.xs }}>
            <MapButton icon="add" />
            <MapButton icon="remove" />
            <MapButton icon="navigate" />
          </View>
        </View>

        <SolidCard style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="desktop-outline" size={16} color={colors.textSecondary} />
              <AppText weight="bold" variant="bodySmall">
                {event.location}
              </AppText>
            </View>
            <Badge label="Offline GPS" tone="neutral" />
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            Head North through the main academic plaza, turn left around Computing Annex B.
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton
              label="Launch Maps 🚀"
              onPress={() => Alert.alert('Launch Maps', 'Would open turn-by-turn navigation to this venue.')}
            />
            <AppButton
              label="Voice Guide 📢"
              variant="secondary"
              onPress={() => Alert.alert('Voice Guide', 'Would read the directions aloud.')}
            />
          </View>
        </SolidCard>

        {event.attendeeNames && event.attendeeNames.length > 0 ? (
          <View style={{ marginBottom: spacing.lg }}>
            <AppText weight="bold" style={{ marginBottom: 4 }}>
              Attendees Going:
            </AppText>
            <AppText tone="secondary">{event.attendeeNames.join(', ')}</AppText>
          </View>
        ) : null}

        <AppText weight="bold" style={{ marginBottom: spacing.sm }}>
          Integrated Actions:
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
          <AppButton
            label="G-Cal Link"
            variant="secondary"
            onPress={() => Alert.alert('Google Calendar', 'Would add this event to your Google Calendar.')}
          />
          <AppButton
            label=".ICS Export"
            variant="secondary"
            onPress={() => Alert.alert('Exported', 'An .ics file would download here.')}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl }}>
          {isRsvpd ? (
            <AppButton label="Cancel Attendance" variant="secondary" onPress={handleCancelAttendance} loading={submitting} />
          ) : null}
          <AppButton label="Dismiss" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function MapButton({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.brandPrimary} />
    </View>
  );
}
