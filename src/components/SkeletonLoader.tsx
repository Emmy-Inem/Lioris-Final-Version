import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

interface SkeletonLoaderProps {
  height?: number;
  width?: number | `${number}%`;
  borderRadius?: number;
}

/**
 * The reference app's SkeletonLoader (Common.kt) is a static 3-stop
 * gradient box. PRD Section 8's Design Philosophy explicitly calls for
 * "loading skeletons" as part of the motion design, so this version
 * adds a real animated shimmer sweep rather than a static placeholder.
 */
export function SkeletonLoader({ height = 120, width = '100%', borderRadius }: SkeletonLoaderProps) {
  const { colors, radius } = useTheme();
  const translateX = useSharedValue(-1);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 250 }],
  }));

  return (
    <View
      style={[
        styles.base,
        {
          height,
          width,
          borderRadius: borderRadius ?? radius.lg,
          backgroundColor: colors.divider,
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={['transparent', colors.border, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
