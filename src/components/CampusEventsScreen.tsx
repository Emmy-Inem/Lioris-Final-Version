import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
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
import { GlassCard } from './GlassCard';
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
import { getInstitutionByCode } from '@/api/institutions';
import { haptics } from '@/utils/haptics';

const STUDENT_EVENT_FILTERS = [
  { key: 'all', label: 'All Events', icon: 'calendar-outline' as const },
  { key: 'on-campus', label: 'On Campus', icon: 'business-outline' as const },
  { key: 'off-campus', label: 'Off Campus', icon: 'globe-outline' as const },
  { key: 'virtual', label: 'Virtual Event', icon: 'videocam-outline' as const },
] as const;

const ALUMNI_EVENT_FILTERS = [
  { key: 'all', label: 'All Alumni Events', icon: 'calendar-outline' as const },
  { key: 'reunions', label: 'Reunions & Homecomings', icon: 'people-outline' as const },
  { key: 'networking', label: 'Networking & Galas', icon: 'wine-outline' as const },
  { key: 'mentorship', label: 'Mentorship Mixers', icon: 'ribbon-outline' as const },
  { key: 'rsvp', label: 'My RSVPs', icon: 'checkmark-circle-outline' as const },
] as const;

export function CampusEventsScreen({ scope }: { scope: EventsQuery['scope'] }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const toast = useToast();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const { user } = useAuth();
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff' || user?.actualRole === 'admin';

  const isAlumniScope = scope === 'alumni' || roleGroup === '(alumni)';
  const activeFilters = isAlumniScope ? ALUMNI_EVENT_FILTERS : STUDENT_EVENT_FILTERS;

  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const { campusCode, homeInstitutionCode } = useCampusScope();

  // Strictly bind to the current workspace's university institution
  const currentCampus = (campusCode && campusCode !== 'GLOBAL') ? campusCode : (homeInstitutionCode || 'UI');
  const institution = getInstitutionByCode(currentCampus);
  const institutionName = institution?.name ?? 'University of Ibadan';

  // Automatic Horizontal Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const isInteracting = useRef(false);

  const queryScope: EventsQuery['scope'] = isAlumniScope ? 'alumni' : (scope ?? 'student');

  const { data: events, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['events', queryScope, 'full', currentCampus],
    queryFn: () => listEvents({ scope: queryScope, campusCode: currentCampus }),
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
    
    const locLower = (e.location || '').toLowerCase();
    const isVirtual = locLower.includes('online') || locLower.includes('virtual') || locLower.includes('zoom') || locLower.includes('meet');
    
    if (filter === 'on-campus') return e.venueType === 'physical' || !isVirtual;
    if (filter === 'off-campus') return e.venueType === 'external';
    if (filter === 'virtual') return e.venueType === 'virtual' || isVirtual;

    if (filter === 'reunions') {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return text.includes('reunion') || text.includes('homecoming') || text.includes('alumni');
    }
    if (filter === 'networking') {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return text.includes('network') || text.includes('dinner') || text.includes('gala') || text.includes('mixer');
    }
    if (filter === 'mentorship') {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return text.includes('mentor');
    }
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
        {/* Workspace Campus Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <Ionicons name={isAlumniScope ? 'ribbon' : 'school'} size={14} color={colors.textSecondary} />
          <AppText variant="caption" weight="bold" tone="secondary" numberOfLines={1}>
            {institutionName} • {isAlumniScope ? 'Alumni Network' : 'Campus Hub'}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
            {isAlumniScope ? 'Alumni Events & Reunions' : 'Campus Events'}
          </AppText>

          <Pressable
            onPress={() => {
              haptics.light();
              setPublishModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={isAlumniScope ? 'Host Alumni Event' : 'Host Event'}
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
              {isAlumniScope ? 'Host Alumni Event' : 'Host Event'}
            </AppText>
          </Pressable>
        </View>

        <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 3 }}>
          {isAlumniScope
            ? 'Exclusive homecomings, class reunions, networking galas & alumni chapters'
            : 'Workshops, career fairs, academic symposiums & student campus gatherings'}
        </AppText>
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
          placeholder={isAlumniScope ? 'Search alumni reunions, dinners, homecomings...' : 'Search campus events, hackathons, seminars...'}
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
        {activeFilters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                haptics.light();
                setFilter(f.key);
              }}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: active
                    ? colors.brandPrimary
                    : isDark
                    ? 'rgba(30, 41, 59, 0.60)'
                    : 'rgba(255, 255, 255, 0.70)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: active
                    ? colors.brandPrimary
                    : isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.08)',
                },
                Platform.OS === 'web' && !active &&
                  ({
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    boxShadow: isDark
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
                      : 'inset 0 1px 1px rgba(255, 255, 255, 0.80)',
                  } as any),
              ]}
            >
              <Ionicons
                name={f.icon}
                size={13}
                color={active ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
              />
              <AppText
                variant="caption"
                weight={active ? 'bold' : 'medium'}
                tone={active ? 'inverse' : 'secondary'}
                style={{ fontSize: 11.5 }}
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
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 150 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name={isAlumniScope ? 'ribbon' : 'school'} size={16} color={colors.textSecondary} />
                <AppText variant="caption" weight="bold" tone="secondary">
                  {institutionName} • {isAlumniScope ? 'Alumni Network' : 'Student Campus Hub'}
                </AppText>
              </View>
              <AppText variant="h1" weight="bold">
                {isAlumniScope ? 'Alumni Events & Reunions' : 'Campus Events'}
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                {isAlumniScope
                  ? 'Exclusive alumni homecomings, networking dinners, reunions & chapter meetings'
                  : 'Workshops, hackathons, academic seminars and university gatherings'}
              </AppText>
            </View>

            <Pressable
              onPress={() => {
                haptics.light();
                setPublishModalOpen(true);
              }}
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
                {isAlumniScope ? 'Host Alumni Event' : 'Host New Event'}
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
          <GlassCard radius={18} padded={false} contentStyle={{ padding: spacing.md }} style={{ marginBottom: spacing.lg }}>
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
                  placeholder={isAlumniScope ? 'Search alumni reunions, dinners, homecomings...' : 'Search campus events, webinars, workshops...'}
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8 }}>
                {activeFilters.map((f) => {
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
          </GlassCard>

          {/* Events Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              {isAlumniScope ? 'Alumni Calendar' : 'Upcoming Events'} ({filtered.length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {filtered.map((event) => (
              <View
                key={event.id}
                style={{
                  width: 320,
                  maxWidth: '100%',
                }}
              >
                <EventCard event={event} />
              </View>
            ))}
          </View>

          {filtered.length === 0 && !isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Ionicons name={isAlumniScope ? 'ribbon-outline' : 'calendar-outline'} size={48} color={colors.textSecondary} />
              <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                {isAlumniScope ? 'No Alumni Events Scheduled' : 'No Campus Events Found'}
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', maxWidth: 400 }}>
                {searchQuery
                  ? `No events matching "${searchQuery}" in the ${institutionName} directory.`
                  : isAlumniScope
                  ? `There are no upcoming alumni reunions or events scheduled for ${institutionName} at this time.`
                  : `There are no student campus events scheduled for ${institutionName} at this time.`}
              </AppText>
            </View>
          )}
        </ScrollView>
      ) : (
        /* Mobile Feed with Sticky Header and Horizontal Carousel */
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Animated.View entering={FadeInUp.duration(200)}>
              <View style={{ marginBottom: 12 }}>
                <EventCard event={item} />
              </View>
            </Animated.View>
          )}
          ListHeaderComponent={renderHeader}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingBottom: 150 }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <Ionicons name={isAlumniScope ? 'ribbon-outline' : 'calendar-outline'} size={48} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                  {isAlumniScope ? 'No Alumni Events Scheduled' : 'No events found'}
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.lg }}>
                  {searchQuery
                    ? `No events matching "${searchQuery}" in the ${institutionName} directory.`
                    : isAlumniScope
                    ? `There are no upcoming alumni reunions or events scheduled for ${institutionName} at this time.`
                    : `Try changing your search filter or host the first campus event for ${institutionName}!`}
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
        defaultScope={isAlumniScope ? 'alumni' : 'student'}
        defaultCategory={isAlumniScope ? 'Alumni' : 'Academic'}
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
