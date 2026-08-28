import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface ShimmerSkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: ViewStyle;
}

export function ShimmerSkeleton({
  width = '100%',
  height = 20,
  radius = 8,
  style,
}: ShimmerSkeletonProps) {
  const { colors, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
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
            <ShimmerSkeleton width={40} height={40} radius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerSkeleton width="50%" height={16} radius={4} />
              <ShimmerSkeleton width="30%" height={12} radius={4} />
            </View>
          </View>
          <ShimmerSkeleton width="90%" height={14} radius={4} />
          <ShimmerSkeleton width="75%" height={14} radius={4} />
        </View>
      ))}
    </View>
  );
}
