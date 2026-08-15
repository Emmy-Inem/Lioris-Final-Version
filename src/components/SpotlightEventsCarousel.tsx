import React, { useEffect, useRef, useState } from'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from'expo-image';
import { router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { useTheme } from'@/theme/ThemeProvider';
import { CampusEvent } from'@/api/types';
import { haptics } from'@/utils/haptics';

const EVENT_TECH_IMG = require('../../assets/images/event_tech_hackathon.jpg');
const EVENT_ACADEMIC_IMG = require('../../assets/images/event_academic_symposium.jpg');

interface SpotlightEventsCarouselProps {
  events: CampusEvent[];
  roleGroup: string;
}

export function SpotlightEventsCarousel({ events, roleGroup }: SpotlightEventsCarouselProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isInteracting = useRef(false);
  const resumeTimeout = useRef<any>(null);

  const displayEvents = events.length > 0 ? events : [];
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth > 500 ? 440 : Math.max(280, screenWidth - 32);
  const cardGap = 14;
  const itemStride = cardWidth + cardGap;

  // Auto-scroll loop
  useEffect(() => {
    if (displayEvents.length <= 1) return;

    const interval = setInterval(() => {
      if (isInteracting.current) return;
      setActiveIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % displayEvents.length;
        scrollRef.current?.scrollTo({ x: nextIndex * itemStride, animated: true });
        return nextIndex;
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [displayEvents.length, itemStride]);

  if (displayEvents.length === 0) return null;

  function scrollToSlide(index: number) {
    haptics.light();
    isInteracting.current = true;
    clearTimeout(resumeTimeout.current);
    setActiveIndex(index);
    scrollRef.current?.scrollTo({ x: index * itemStride, animated: true });
    resumeTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 4500);
  }

  function handleOpenEvent(eventId: string) {
    haptics.light();
    if (['(student)', '(alumni)', '(staff)', '(admin)'].includes(roleGroup)) {
      router.push(`/${roleGroup}/events/${eventId}` as any);
    }
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / itemStride);
    if (index >= 0 && index < displayEvents.length) {
      setActiveIndex(index);
    }
    clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 3000);
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {/* Header Row: Clean Title & Pagination Controls */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="flash-outline"size={15} color={colors.brandPrimary} />
          <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.6 }}>
            FEATURED EVENTS
          </AppText>
        </View>

        {/* Navigation Indicators & Prev / Next Controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Pagination Indicators */}
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {displayEvents.map((_, idx) => (
              <Pressable
                key={idx}
                onPress={() => scrollToSlide(idx)}
                hitSlop={8}
                style={{
                  width: activeIndex === idx ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: activeIndex === idx ? colors.brandPrimary : colors.border,
                }}
              />
            ))}
          </View>

          {/* Prev / Next Arrows */}
          <View style={{ flexDirection: 'row', gap: 4, marginLeft: 4 }}>
            <Pressable
              onPress={() => scrollToSlide((activeIndex - 1 + displayEvents.length) % displayEvents.length)}
              hitSlop={8}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-back"size={14} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => scrollToSlide((activeIndex + 1) % displayEvents.length)}
              hitSlop={8}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-forward"size={14} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Horizontal Physical Auto-Scrolling Cards Container */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"snapToInterval={itemStride}
        snapToAlignment="start"onScrollBeginDrag={() => {
          isInteracting.current = true;
        }}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {displayEvents.map((item, index) => {
          const imageSource = item.coverImageUrl
            ? { uri: item.coverImageUrl }
            : item.category.toLowerCase().includes('career') || item.category.toLowerCase().includes('tech')
            ? EVENT_TECH_IMG
            : EVENT_ACADEMIC_IMG;

          return (
            <Pressable
              key={item.id}
              onPress={() => handleOpenEvent(item.id)}
              style={{
                width: cardWidth,
                marginRight: cardGap,
                borderRadius: 24,
                overflow: 'hidden',
                height: 185,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                position: 'relative',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.12,
                shadowRadius: 14,
                elevation: 3,
              }}
            >
              {/* Cover Image */}
              <Image source={imageSource} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="cover" />

              {/* Dark Overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: isDark ? 'rgba(11, 17, 32, 0.85)' : 'rgba(15, 23, 42, 0.80)',
                  padding: spacing.md,
                  justifyContent: 'space-between',
                }}
              >
                {/* Header Tag Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.18)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.25)',
                    }}
                  >
                    <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10, letterSpacing: 0.5 }}>
                      SPOTLIGHT
                    </AppText>
                  </View>

                  <Badge label={item.category} tone="accent" />
                </View>

                {/* Event Details */}
                <View>
                  <AppText variant="h2"weight="bold"tone="inverse"numberOfLines={1} style={{ fontSize: 18, lineHeight: 23, marginBottom: 4 }}>
                    {item.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="location-outline"size={13} color="#FFFFFF" />
                    <AppText tone="inverse"variant="caption"style={{ opacity: 0.9 }}>
                      {item.location} | {new Date(item.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </AppText>
                  </View>
                </View>

                {/* Footer RSVP Info & Action */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="people"size={14} color="#FFFFFF" />
                    <AppText tone="inverse"variant="caption"weight="semiBold">
                      {item.rsvpCount} attending
                    </AppText>
                  </View>

                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: radius.pill,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <AppText weight="bold"variant="caption"style={{ color: '#0F172A' }}>
                      View Details
                    </AppText>
                    <Ionicons name="arrow-forward"size={12} color="#0F172A" />
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
