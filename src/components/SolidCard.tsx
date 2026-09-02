import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';

interface SolidCardProps extends ViewProps {
  padded?: boolean;
  radius?: number;
  backgroundColor?: string;
  frosted?: boolean;
  intensity?: number;
}

/**
 * Modern Liquid Glass Card with optical background refraction,
 * specular edge reflections, and 100% crystal legible text contrast.
 */
export function SolidCard({
  padded = true,
  radius,
  backgroundColor,
  frosted = true,
  intensity = 35,
  style,
  children,
  ...rest
}: SolidCardProps) {
  const { colors, spacing, isDark } = useTheme();
  const cornerRadius = radius ?? 20;

  const defaultBg = backgroundColor
    ? backgroundColor
    : frosted
    ? isDark
      ? 'rgba(15, 23, 42, 0.70)'
      : 'rgba(255, 255, 255, 0.85)'
    : colors.surface;

  return (
    <View
      style={[
        styles.shadowWrapper,
        {
          borderRadius: cornerRadius,
          backgroundColor: defaultBg,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.border,
          borderWidth: 1,
          overflow: 'hidden',
        },
        frosted &&
          Platform.OS === 'web' &&
          ({
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: isDark
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
          } as any),
        padded && { padding: spacing.lg },
        style,
      ]}
      {...rest}
    >
      {frosted && Platform.OS !== 'web' ? (
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: Platform.select({
    ios: {
      shadowOpacity: 0,
      elevation: 0,
    },
    android: {
      elevation: 0,
    },
    web: {
      boxShadow: 'none',
    } as any,
    default: {},
  }),
});
