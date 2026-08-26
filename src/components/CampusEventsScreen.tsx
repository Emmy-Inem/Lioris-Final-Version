import React, { useEffect, useRef, useState } from'react';
import { Dimensions, FlatList, Pressable, ScrollView, TextInput, View } from'react-native';
import { Image } from'expo-image';
import Animated, { FadeInUp } from'react-native-reanimated';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { router, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { EventCard } from'./EventCard';
import { SpotlightEventsCarousel } from'./SpotlightEventsCarousel';
import { PublishEventModal } from'./PublishEventModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listEvents, EventsQuery } from '@/api/events';
import { CampusEvent } from '@/api/types';
import { haptics } from '@/utils/haptics';

const EVENT_TECH_IMG = require('../../assets/images/event_tech_hackathon.jpg');
const EVENT_ACADEMIC_IMG = require('../../assets/images/event_academic_symposium.jpg');

const EVENT_FILTERS = [
  { key: 'all', label: 'All Events', icon: 'calendar-outline' as const },
  { key: 'rsvp', label: 'My RSVPs', icon: 'checkmark-circle-outline' as const },
  { key: 'on-campus', label: 'On Campus', icon: 'location-outline' as const },
  { key: 'academic', label: 'Academic', icon: 'school-outline' as const },
  { key: 'workshop', label: 'Workshops', icon: 'code-slash-outline' as const },
] as const;

export function CampusEventsScreen({ scope }: { scope: EventsQuery['scope'] }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const [filter, setFilter] = useState<(typeof EVENT_FILTERS)[number]['key']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  // Automatic Horizontal Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const isInteracting = useRef(false);

  const { data: events, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['events', scope ?? 'all', 'full'],
    queryFn: () => listEvents(scope ? { scope } : {}),
  });

  const featuredEvents: CampusEvent[] = (events ?? []).filter((e) => e.sponsored || e.rsvpCount >= 15);
  const carouselData = featuredEvents.length > 0 ? featuredEvents : (events ?? []).slice(0, 3);

  // Auto-scroll carousel timer (pauses when user is dragging)
  useEffect(() => {
    if (carouselData.length <= 1) return;
    const interval = setInterval(() => {
      if (isInteracting.current) return;
      setActiveSlide((prev) => {
        const nextIndex = (prev + 1) % carouselData.length;
        carouselRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        return nextIndex;
      });
    }, 3800);
    return () => clearInterval(interval);
  }, [carouselData.length]);

  const filtered = (events ?? []).filter((e) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q) && !e.location.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filter === 'rsvp') return e.isRsvpd;
    if (filter === 'on-campus') return !e.location.toLowerCase().includes('online');
    if (filter === 'academic') return e.category.toLowerCase().includes('academic') || e.category.toLowerCase().includes('seminar');
    if (filter === 'workshop') return e.category.toLowerCase().includes('workshop') || e.category.toLowerCase().includes('tech');
    return true;
  });

  function handleOpenEvent(eventId: string) {
    haptics.light();
    router.push(`/${roleGroup}/events/${eventId}` as any);
  }

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.sm }}>
      <AppHeader />

      {/* Screen Title & Post Event Button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
          <AppText variant="h1" weight="bold">
            Events
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1}>
            Workshops, career fairs & campus gatherings
          </AppText>
        </View>

        <Pressable
          onPress={() => {
            haptics.light();
            setPublishModalOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Post event"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.brandPrimary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 8,
            flexShrink: 0,
          }}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <AppText weight="bold" tone="inverse" variant="caption">
            Post Event
          </AppText>
        </Pressable>
      </View>

      {/* Section: Automatic & Manual Stackable Spotlight Events Carousel */}
      {filter === 'all' && !searchQuery && carouselData.length > 0 ? (
        <SpotlightEventsCarousel events={carouselData} roleGroup={roleGroup} />
      ) : null}

      {/* Search Input */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          height: 46,
        }}
      >
        <Ionicons name="search-outline"size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <TextInput
          placeholder="Search campus events, hackathons, seminars..."placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 14,
          }}
        />
        {searchQuery.trim() ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle"size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Chips Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.sm }}
      >
        {EVENT_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                haptics.light();
                setFilter(f.key);
              }}
              style={{
                backgroundColor: active ? colors.brandPrimary : colors.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: 7,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText
                variant="caption"weight={active ? 'bold' : 'medium'}
                tone={active ? 'inverse' : 'secondary'}
              >
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <ScreenContainer>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30 }}>
          {/* Left Column: Event Filters & Search */}
          <View style={{ width: 260, gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                gap: spacing.sm,
              }}
            >
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                placeholder="Search campus events..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
              />
            </View>

            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                Filter By 🗓️
              </AppText>
              <View style={{ gap: 4 }}>
                {EVENT_FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => {
                        haptics.light();
                        setFilter(f.key);
                      }}
                      style={({ hovered }: any) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: radius.md,
                          backgroundColor: active
                            ? colors.brandPrimary
                            : hovered
                              ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
                              : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons
                        name={f.icon}
                        size={16}
                        color={active ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={active ? 'bold' : 'medium'}
                        style={{ color: active ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B', flex: 1 }}
                      >
                        {f.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => setPublishModalOpen(true)}
              style={{
                backgroundColor: colors.brandPrimary,
                borderRadius: radius.md,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <AppText variant="bodySmall" weight="bold" tone="inverse">
                Host New Event
              </AppText>
            </Pressable>
          </View>

          {/* Right Column: Events Grid */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <AppText variant="h2" weight="bold">
                Upcoming Events ({filtered.length})
              </AppText>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md }}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInUp.delay(index * 40).duration(200)} style={{ flex: 1, minWidth: 0, marginBottom: spacing.md }}>
                  <EventCard event={item} />
                </Animated.View>
              )}
              refreshing={isRefetching}
              onRefresh={refetch}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListEmptyComponent={
                !isLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
                    <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                      No events found
                    </AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center' }}>
                      Try changing your search filter or post the first campus event!
                    </AppText>
                  </View>
                ) : null
              }
            />
          </View>
        </View>
      ) : (
        /* Mobile Single Column FlatList */
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 40).duration(200)}>
              <EventCard event={item} />
            </Animated.View>
          )}
          ListHeaderComponent={renderHeader}
          refreshing={isRefetching}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                  No events found
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center' }}>
                  Try changing your search filter or post the first campus event!
                </AppText>
              </View>
            ) : null
          }
        />
      )}

      <PublishEventModal
        visible={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        onPublish={() => {
          queryClient.invalidateQueries({ queryKey: ['events'] });
        }}
      />
    </ScreenContainer>
  );
}
