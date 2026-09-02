import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';

interface GlassCardProps extends ViewProps {
 padded?: boolean;
 radius?: number;
 intensity?: number;
}

/**
 * Ultra-Modern Frosted Glass Card with dynamic backdrop blur,
 * multi-stop specular highlights, gradient borders, and soft elevation.
 */
export function GlassCard({ padded = true, radius, intensity = 40, style, children, ...rest }: GlassCardProps) {
 const { colors, spacing, radius: radiusTokens, isDark } = useTheme();
 const cornerRadius = radius ?? radiusTokens.glass;

  return (
    <View
      style={[
        styles.shadowWrapper,
        {
          borderRadius: cornerRadius,
        },
        style,
      ]}
      {...rest}
    >
      <View
        style={[
          styles.container,
          {
            borderRadius: cornerRadius,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.80)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: isDark
                ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                : 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            } as any),
        ]}
      >
        {Platform.OS !== 'web' ? (
          <BlurView
            intensity={intensity}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View style={padded && { padding: spacing.lg }}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
  },
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
