import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { SolidCard } from './SolidCard';
import { EmptyState } from './EmptyState';
import { ShimmerCardList } from './ShimmerSkeleton';
import { useToast } from '@/context/ToastContext';
import { EventCard } from './EventCard';
import { SpotlightEventsCarousel } from './SpotlightEventsCarousel';
import { PublishEventModal } from './PublishEventModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listEvents, EventsQuery } from '@/api/events';
import { CampusEvent } from '@/api/types';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

const EVENT_FILTERS = [
  { key: 'all', label: 'All Events', icon: 'calendar-outline' as const },
  { key: 'rsvp', label: 'My RSVPs', icon: 'checkmark-circle-outline' as const },
  { key: 'pending', label: 'Under Review', icon: 'time-outline' as const },
  { key: 'on-campus', label: 'On Campus', icon: 'location-outline' as const },
  { key: 'academic', label: 'Academic', icon: 'school-outline' as const },
  { key: 'workshop', label: 'Workshops', icon: 'code-slash-outline' as const },
] as const;

const CAMPUS_FILTER_OPTIONS = [
  { code: 'ALL', label: 'All Campuses' },
  { code: 'UI', label: 'UI' },
  { code: 'UNILAG', label: 'UNILAG' },
  { code: 'OAU', label: 'OAU' },
  { code: 'FUNAAB', label: 'FUNAAB' },
  { code: 'CU', label: 'CU' },
  { code: 'GLOBAL', label: 'Global' },
];

export function CampusEventsScreen({ scope }: { scope: EventsQuery['scope'] }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const toast = useToast();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const { user } = useAuth();
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff' || user?.actualRole === 'admin';

  const [filter, setFilter] = useState<(typeof EVENT_FILTERS)[number]['key']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const { campusCode } = useCampusScope();

  // Admin/Staff can switch between "ALL" or specific campus
  const [selectedCampus, setSelectedCampus] = useState<string>(isStaffOrAdmin ? 'ALL' : (campusCode || 'ALL'));

  // Automatic Horizontal Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const isInteracting = useRef(false);

  const queryCampus = isStaffOrAdmin ? (selectedCampus === 'ALL' ? undefined : selectedCampus) : campusCode;

  const { data: events, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['events', scope ?? 'all', 'full', queryCampus ?? 'all'],
    queryFn: () => listEvents({ ...(scope ? { scope } : {}), campusCode: queryCampus }),
  });

  // Only events explicitly spotlighted or sponsored by administrators appear in the Featured Carousel
  const featuredEvents: CampusEvent[] = (events ?? []).filter(
    (e) => (e.isSpotlight || e.sponsored) && e.approvalStatus === 'approved'
  );
  const carouselData = featuredEvents;

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
    if (filter === 'pending') return e.approvalStatus === 'pending';
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
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Post Event Button */}
      <View style={{ marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
            Events Hub
          </AppText>

          <Pressable
            onPress={() => {
              haptics.light();
              setPublishModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Host Event"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.brandPrimary,
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              flexShrink: 0,
            }}
          >
            <Ionicons name="add" size={15} color="#FFFFFF" />
            <AppText weight="bold" tone="inverse" variant="caption" style={{ fontSize: 11 }}>
              Host Event
            </AppText>
          </Pressable>
        </View>

        <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 3 }}>
          Workshops, career fairs, academic symposiums & campus gatherings
        </AppText>
      </View>

      {/* Campus Selector for Staff & Admin Roles */}
      {isStaffOrAdmin && (
        <View style={{ marginBottom: spacing.sm }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 16 }}
            style={{ width: '100%', flexGrow: 0 }}
          >
            {CAMPUS_FILTER_OPTIONS.map((c) => {
              const active = selectedCampus === c.code;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    haptics.light();
                    setSelectedCampus(c.code);
                  }}
                  style={{
                    backgroundColor: active ? colors.brandPrimary : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight={active ? 'bold' : 'medium'}
                    tone={active ? 'inverse' : 'secondary'}
                    style={{ fontSize: 11 }}
                  >
                    {c.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

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
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
          borderWidth: 1,
          borderColor: colors.border,
          height: 40,
        }}
      >
        <Ionicons name="search-outline" size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
        <TextInput
          placeholder="Search campus events, hackathons, seminars..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 13,
          }}
        />
        {searchQuery.trim() ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Chips Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingRight: 16, paddingBottom: 4 }}
        style={{ width: '100%', flexGrow: 0 }}
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
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText
                variant="caption"
                weight={active ? 'bold' : 'medium'}
                tone={active ? 'inverse' : 'secondary'}
                style={{ fontSize: 11 }}
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
    <ScreenContainer glow={false}>
      {isDesktop ? (
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: 60 }}
        >
          {/* Top Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
                Campus Events & Gatherings
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Official workshops, academic symposiums, tech hackathons & alumni mixers
              </AppText>
            </View>

            <Pressable
              onPress={() => setPublishModalOpen(true)}
              style={{
                backgroundColor: colors.brandPrimary,
                borderRadius: radius.pill,
                paddingHorizontal: 18,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <AppText variant="bodySmall" weight="bold" tone="inverse">
                Host New Event
              </AppText>
            </Pressable>
          </View>

          {/* Section: Featured & Sponsored Events Spotlight Carousel */}
          {filter === 'all' && !searchQuery && carouselData.length > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <SpotlightEventsCarousel events={carouselData} roleGroup={roleGroup} />
            </View>
          ) : null}

          {/* Filter & Search Toolbar */}
          <SolidCard radius={18} style={{ padding: spacing.md, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
              {/* Search Field */}
              <View
                style={{
                  flex: 1,
                  minWidth: 260,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.background,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  height: 40,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: spacing.sm,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search campus events, webinars, workshops..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Campus Filters for Staff/Admin */}
              {isStaffOrAdmin && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {CAMPUS_FILTER_OPTIONS.map((c) => {
                    const active = selectedCampus === c.code;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => {
                          haptics.light();
                          setSelectedCampus(c.code);
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: radius.pill,
                          backgroundColor: active ? colors.brandPrimary : colors.background,
                          borderWidth: 1,
                          borderColor: active ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={active ? 'bold' : 'medium'}
                          style={{ color: active ? '#FFFFFF' : colors.textSecondary, fontSize: 11 }}
                        >
                          {c.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8 }}>
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
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: active ? colors.brandPrimary : colors.background,
                        borderWidth: 1,
                        borderColor: active ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Ionicons
                        name={f.icon}
                        size={14}
                        color={active ? '#FFFFFF' : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={active ? 'bold' : 'medium'}
                        style={{ color: active ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                      >
                        {f.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </SolidCard>

          {/* Events Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Upcoming Events ({filtered.length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {filtered.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInUp.delay(index * 30).duration(200)}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 560 }}
              >
                <EventCard event={item} />
              </Animated.View>
            ))}
          </View>

          {filtered.length === 0 && !isLoading ? (
            <EmptyState title="No events found" description="Try changing your search filter or post the first campus event!" />
          ) : null}
        </ScrollView>
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
          contentContainerStyle={{ paddingBottom: 150 }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                  No events found
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center' }}>
                  Try changing your search filter or host the first campus event!
                </AppText>
              </View>
            ) : (
              <ShimmerCardList count={4} />
            )
          }
        />
      )}

      <PublishEventModal
        visible={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        onPublish={() => {
          queryClient.invalidateQueries({ queryKey: ['events'] });
          refetch();
          toast.success('Event published successfully!');
        }}
      />
    </ScreenContainer>
  );
}
