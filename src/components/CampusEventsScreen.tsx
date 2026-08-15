import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { EventCard } from './EventCard';
import { PublishEventModal } from './PublishEventModal';
import { AuthHeroBackground } from './AuthHeroBackground';
import { useTheme } from '@/theme/ThemeProvider';
import { listEvents, EventsQuery } from '@/api/events';

const FILTERS = [
  { key: 'all', label: 'All Events 🌐' },
  { key: 'rsvp', label: 'My RSVPs 🎫' },
  { key: 'on-campus', label: 'On Campus 🏫' },
  { key: 'off-campus', label: 'Off Campus 🚌' },
] as const;

function formatEventDate(startAt: string) {
  return new Date(startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * "Events" — shared across the three roles that have it as a real
 * screen (Student has it as a bottom tab; Alumni/Staff reach it via
 * links). Consolidated into one component after Student's version
 * drifted ahead with AppHeader/filters/Publish Event while Alumni and
 * Staff were left on an older copy with none of that.
 */
export function CampusEventsScreen({ scope }: { scope: EventsQuery['scope'] }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const { data: events, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['events', scope ?? 'all', 'full'],
    queryFn: () => listEvents(scope ? { scope } : {}),
  });

  // Derived client-side from the same fetch rather than a second
  // network round-trip — "sponsored" is just a filter over events
  // already in hand.
  const sponsoredEvents = (events ?? []).filter((e) => e.sponsored);

  const filtered = (events ?? []).filter((e) => {
    if (filter === 'rsvp') return e.isRsvpd;
    if (filter === 'on-campus') return !e.location.toLowerCase().includes('online');
    if (filter === 'off-campus') return e.location.toLowerCase().includes('online');
    return true;
  });

  return (
    <ScreenContainer noPadding glow={false}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader />
      </View>

      <AuthHeroBackground height={84}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg }}>
          <AppText variant="h2" weight="bold" tone="inverse">
            Campus Events 📅
          </AppText>
          <Pressable
            onPress={() => setPublishModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Post event"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons name="add-circle" size={16} color="#FFFFFF" />
            <AppText weight="bold" tone="inverse" variant="bodySmall">
              Post Event
            </AppText>
          </Pressable>
        </View>
      </AuthHeroBackground>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        {sponsoredEvents.length > 0 ? (
          <>
            <AppText tone="secondary" variant="caption" weight="semiBold" style={{ marginBottom: spacing.sm }}>
              🌟 Sponsored & Featured
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {sponsoredEvents.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/${roleGroup}/events/${event.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sponsored event: ${event.title}`}
                  style={{
                    width: 220,
                    marginRight: spacing.sm,
                    backgroundColor: colors.brandPrimary,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      alignSelf: 'flex-start',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Ionicons name="star" size={10} color="#FFFFFF" />
                    <AppText variant="caption" weight="bold" tone="inverse">
                      Sponsored
                    </AppText>
                  </View>
                  <AppText weight="bold" tone="inverse" numberOfLines={2} style={{ marginBottom: 4 }}>
                    {event.title}
                  </AppText>
                  <AppText variant="caption" tone="inverse" style={{ opacity: 0.85 }}>
                    {formatEventDate(event.startAt)} · {event.location}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <AppText tone="secondary" variant="caption" weight="semiBold" style={{ marginBottom: spacing.md }}>
            🌟 No sponsored or featured events on the horizon.
          </AppText>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const selected = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={f.label}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderWidth: selected ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'inverse' : 'primary'}>
                  {f.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(220)}>
              <EventCard event={item} />
            </Animated.View>
          )}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: colors.mintBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: spacing.lg,
                  }}
                >
                  <Ionicons name="calendar" size={28} color={colors.brandPrimary} />
                </View>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                  No occurrences listed
                </AppText>
                <AppText tone="secondary" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                  Be the active leader by hosting code summits, practice test sessions, or standard
                  group debates.
                </AppText>
              </View>
            ) : null
          }
        />
      </View>

      <Pressable
        onPress={() => setPublishModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Post event"
        style={{
          position: 'absolute',
          bottom: spacing.xl,
          right: spacing.lg,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.brandPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </Pressable>

      <PublishEventModal
        visible={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        onPublish={() => queryClient.invalidateQueries({ queryKey: ['events'] })}
      />
    </ScreenContainer>
  );
}
