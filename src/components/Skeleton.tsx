import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/theme/useReducedMotion';
import { useResponsive } from '@/hooks/useResponsive';
import { SolidCard } from './SolidCard';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Base Shimmer / Pulse Skeleton placeholder block.
 * Uses Animated opacity pulse between 0.35 and 0.85 (or static 0.6 if reduced motion is requested).
 * Theme-aware (light/dark mode background color).
 */
export function Skeleton({
  width = '100%',
  height = 20,
  radius = 8,
  style,
}: SkeletonProps) {
  const { isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.6);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius: radius,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Backward compatibility alias */
export const ShimmerSkeleton = Skeleton;

/**
 * Specialized Skeleton for Community Feed Post Cards
 */
export function PostCardSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <SolidCard style={{ marginBottom: spacing.md, padding: spacing.md, width: '100%' }}>
      {/* Top author row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm }}>
        <Skeleton width={38} height={38} radius={19} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Skeleton width={120} height={14} radius={4} />
            <Skeleton width={50} height={14} radius={radius.pill} />
          </View>
          <Skeleton width={80} height={11} radius={4} />
        </View>
        <Skeleton width={24} height={16} radius={4} />
      </View>
      {/* Post title & snippet */}
      <Skeleton width="85%" height={17} radius={4} style={{ marginBottom: 8 }} />
      <Skeleton width="98%" height={13} radius={4} style={{ marginBottom: 6 }} />
      <Skeleton width="70%" height={13} radius={4} style={{ marginBottom: spacing.md }} />
      {/* Bottom action row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Skeleton width={64} height={26} radius={radius.pill} />
        <Skeleton width={64} height={26} radius={radius.pill} />
        <Skeleton width={50} height={26} radius={radius.pill} />
      </View>
    </SolidCard>
  );
}

export function PostCardSkeletonList({ count = 3 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Academic Resource & File Cards
 */
export function ResourceCardSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <SolidCard style={{ padding: spacing.md, gap: 10, width: '100%' }}>
      {/* Header tags */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Skeleton width={55} height={20} radius={radius.pill} />
          <Skeleton width={65} height={20} radius={radius.pill} />
          <Skeleton width={40} height={14} radius={4} />
        </View>
        <Skeleton width={24} height={24} radius={12} />
      </View>
      {/* Title & department */}
      <Skeleton width="90%" height={16} radius={4} />
      <Skeleton width="60%" height={12} radius={4} />
      <Skeleton width="80%" height={12} radius={4} />
      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Skeleton width="48%" height={32} radius={radius.pill} />
        <Skeleton width="48%" height={32} radius={radius.pill} />
      </View>
    </SolidCard>
  );
}

export function ResourceCardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: 0, minWidth: 280, maxWidth: 560 }}>
          <ResourceCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Campus Events Cards
 */
export function EventCardSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <SolidCard radius={22} padded={false} style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
      {/* Event banner placeholder */}
      <Skeleton width="100%" height={130} radius={0} />
      <View style={{ padding: spacing.md }}>
        {/* Date Box + Title & Info */}
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          {/* Calendar Date Box */}
          <Skeleton width={48} height={52} radius={radius.md} />
          {/* Title & Info */}
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Skeleton width="85%" height={18} radius={4} />
            <Skeleton width="55%" height={13} radius={4} />
          </View>
        </View>

        {/* Description line */}
        <Skeleton width="95%" height={14} radius={4} style={{ marginTop: spacing.sm }} />

        {/* Bottom Actions Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.md,
            paddingTop: spacing.xs,
          }}
        >
          <Skeleton width={110} height={14} radius={4} />
          <Skeleton width={80} height={32} radius={radius.pill} />
        </View>
      </View>
    </SolidCard>
  );
}

export function EventCardSkeletonGrid({ count = 3 }: { count?: number }) {
  const { isDesktop } = useResponsive();

  if (!isDesktop) {
    return (
      <View style={{ width: '100%' }}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={{ width: '100%', marginBottom: 12 }}>
            <EventCardSkeleton />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: 320, maxWidth: '100%' }}>
          <EventCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Marketplace Item Cards
 */
export function MarketplaceCardSkeleton() {
  const { spacing } = useTheme();
  return (
    <SolidCard style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
      <Skeleton width="100%" height={130} radius={0} />
      <View style={{ padding: spacing.sm, gap: 6 }}>
        <Skeleton width="50%" height={16} radius={4} />
        <Skeleton width="90%" height={14} radius={4} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Skeleton width={20} height={20} radius={10} />
          <Skeleton width={80} height={11} radius={4} />
        </View>
      </View>
    </SolidCard>
  );
}

export function MarketplaceCardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: 0, minWidth: 160, maxWidth: 360 }}>
          <MarketplaceCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Admin Analytics KPI & Charts
 */
export function AnalyticsSummarySkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.md, width: '100%' }}>
      {/* 4 KPI metric cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SolidCard key={i} style={{ flex: 1, minWidth: 200, padding: spacing.md, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={110} height={12} radius={4} />
              <Skeleton width={16} height={16} radius={8} />
            </View>
            <Skeleton width={70} height={28} radius={6} />
            <Skeleton width={130} height={12} radius={4} />
          </SolidCard>
        ))}
      </View>
      {/* Chart skeleton card */}
      <SolidCard style={{ padding: spacing.md, gap: 14 }}>
        <Skeleton width={180} height={16} radius={4} />
        <View style={{ gap: 10 }}>
          <Skeleton width="95%" height={24} radius={radius.pill} />
          <Skeleton width="80%" height={24} radius={radius.pill} />
          <Skeleton width="65%" height={24} radius={radius.pill} />
          <Skeleton width="45%" height={24} radius={radius.pill} />
        </View>
      </SolidCard>
    </View>
  );
}

/**
 * Generic List Row Skeleton
 */
export function ListItemSkeleton() {
  const { spacing } = useTheme();
  return (
    <SolidCard style={{ padding: spacing.md, marginBottom: spacing.xs, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="55%" height={15} radius={4} />
          <Skeleton width="35%" height={12} radius={4} />
        </View>
        <Skeleton width={18} height={18} radius={9} />
      </View>
    </SolidCard>
  );
}

export function ListItemSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 8, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Backward compatibility alias for ShimmerCardList
 */
export function ShimmerCardList({ count = 3 }: { count?: number }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.md, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            padding: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={40} height={40} radius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="50%" height={16} radius={4} />
              <Skeleton width="30%" height={12} radius={4} />
            </View>
          </View>
          <Skeleton width="90%" height={14} radius={4} />
          <Skeleton width="75%" height={14} radius={4} />
        </View>
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Alumni Career & Job Board Cards
 */
export function JobCardSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md, padding: spacing.md, width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: spacing.sm }}>
        <Skeleton width={46} height={46} radius={14} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="65%" height={17} radius={4} />
          <Skeleton width="45%" height={13} radius={4} />
          <Skeleton width="35%" height={11} radius={4} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm }}>
        <Skeleton width={60} height={20} radius={radius.pill} />
        <Skeleton width={75} height={20} radius={radius.pill} />
        <Skeleton width={90} height={20} radius={radius.pill} />
      </View>
      <Skeleton width="95%" height={13} radius={4} style={{ marginBottom: 4 }} />
      <Skeleton width="80%" height={13} radius={4} style={{ marginBottom: spacing.md }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Skeleton width={80} height={12} radius={4} />
        <Skeleton width={90} height={32} radius={radius.pill} />
      </View>
    </SolidCard>
  );
}

export function JobCardSkeletonList({ count = 3 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Alumni Giving & Scholarship Campaigns
 */
export function CampaignCardSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md, padding: spacing.md, width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <Skeleton width="55%" height={18} radius={4} />
        <Skeleton width={70} height={22} radius={radius.pill} />
      </View>
      <Skeleton width="40%" height={12} radius={4} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="95%" height={13} radius={4} style={{ marginBottom: 4 }} />
      <Skeleton width="75%" height={13} radius={4} style={{ marginBottom: spacing.md }} />
      {/* Progress bar skeleton */}
      <Skeleton width="100%" height={8} radius={radius.pill} style={{ marginBottom: spacing.sm }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
        <Skeleton width={110} height={14} radius={4} />
        <Skeleton width={100} height={34} radius={radius.pill} />
      </View>
    </SolidCard>
  );
}

export function CampaignCardSkeletonList({ count = 3 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <CampaignCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Moderation & Admin Review Queues
 * (Verification requests, takedown desk, support queue, moderation)
 */
export function QueueItemSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md, padding: spacing.md, width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Skeleton width={20} height={20} radius={4} />
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width="50%" height={16} radius={4} />
            <Skeleton width="30%" height={12} radius={4} />
          </View>
        </View>
        <Skeleton width={80} height={22} radius={radius.pill} />
      </View>
      <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.sm, marginVertical: spacing.sm, gap: 6 }}>
        <Skeleton width="90%" height={13} radius={4} />
        <Skeleton width="60%" height={13} radius={4} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <Skeleton width="100%" height={36} radius={radius.md} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton width="100%" height={36} radius={radius.md} />
        </View>
      </View>
    </SolidCard>
  );
}

export function QueueItemSkeletonList({ count = 4 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <QueueItemSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Specialized Skeleton for Mentorship Sessions & Requests
 */
export function MentorshipCardSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md, padding: spacing.md, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm }}>
        <Skeleton width={42} height={42} radius={21} />
        <View style={{ flex: 1, gap: 4 }}>
          <Skeleton width="50%" height={16} radius={4} />
          <Skeleton width="35%" height={12} radius={4} />
        </View>
        <Skeleton width={70} height={20} radius={radius.pill} />
      </View>
      <Skeleton width="90%" height={13} radius={4} style={{ marginBottom: 4 }} />
      <Skeleton width="70%" height={13} radius={4} style={{ marginBottom: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <Skeleton width="100%" height={32} radius={radius.pill} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton width="100%" height={32} radius={radius.pill} />
        </View>
      </View>
    </SolidCard>
  );
}

export function MentorshipCardSkeletonList({ count = 3 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <MentorshipCardSkeleton key={i} />
      ))}
    </View>
  );
}

