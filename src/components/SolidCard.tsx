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
          borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.80)',
          borderWidth: 1,
          overflow: 'hidden',
        },
        frosted &&
          Platform.OS === 'web' &&
          ({
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            boxShadow: isDark
              ? '0 12px 32px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.18)'
              : '0 10px 30px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04), inset 0 1px 1.5px rgba(255, 255, 255, 0.95)',
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
      shadowColor: '#0A1326',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
    },
    android: {
      // Android's elevation shadow renders much darker/harder than iOS's
      // shadowOpacity for the same nominal "level" - keep this low so cards
      // don't look like they have a heavy drop-shadow on phones.
      elevation: 1.5,
    },
    web: {
      boxShadow: '0 6px 20px -6px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',
    } as any,
    default: {},
  }),
});
