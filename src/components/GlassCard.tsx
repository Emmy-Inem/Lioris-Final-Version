import React from'react';
import { Platform, StyleSheet, View, ViewProps } from'react-native';
import { LinearGradient } from'expo-linear-gradient';
import { BlurView } from'expo-blur';
import { useTheme } from'@/theme/ThemeProvider';

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
          shadowColor: colors.glassShadowColor,
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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.65)',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.72)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
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

        <LinearGradient
          colors={
            isDark
              ? ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.01)']
              : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.15)']
          }
          style={StyleSheet.absoluteFill}
        />

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
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
    },
    android: {
      elevation: 6,
    },
    web: {
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.06)',
    } as any,
    default: {},
  }),
});
