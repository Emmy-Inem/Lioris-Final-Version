import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { useLiquidGlass } from '@/context/LiquidGlassContext';

export interface GlassCardProps extends ViewProps {
  padded?: boolean;
  radius?: number;
  intensity?: number;
  highlight?: boolean;
  contentStyle?: any;
}

/**
 * Ultra-Modern iPhone-Grade Liquid Glass Card with multi-stop backdrop blur,
 * specular meniscus reflections, prismatic rim light refraction, and soft elevation.
 */
export function GlassCard({
  padded = true,
  radius,
  intensity = 85,
  highlight = true,
  style,
  contentStyle,
  children,
  ...rest
}: GlassCardProps) {
  const { colors, spacing, radius: radiusTokens, isDark } = useTheme();
  const { settings, getGlassBorderColor, getBackdropFilterString } = useLiquidGlass();
  const cornerRadius = radius ?? radiusTokens.glass ?? 20;

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          styles.shadowWrapper,
          {
            borderRadius: cornerRadius,
            backgroundColor: isDark ? '#131E32' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            borderWidth: 1,
            elevation: 1.5,
          },
          style,
        ]}
        {...rest}
      >
        <View style={[{ position: 'relative' }, padded && { padding: spacing.lg }, contentStyle]}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.shadowWrapper,
        {
          borderRadius: cornerRadius,
          shadowColor: 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
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
            borderColor: getGlassBorderColor(isDark),
            borderWidth: 1,
            backgroundColor: isDark
              ? `rgba(19, 30, 49, ${Math.min(0.88, settings.translucency * 1.5).toFixed(2)})`
              : `rgba(255, 255, 255, ${Math.min(0.92, settings.translucency * 1.6).toFixed(2)})`,
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: getBackdropFilterString(),
              WebkitBackdropFilter: getBackdropFilterString(),
              boxShadow: isDark
                ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.04)'
                : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.70)',
            } as any),
        ]}
      >
        {/* Native Liquid Blur Engine */}
        {Platform.OS !== 'web' && (
          <BlurView
            intensity={intensity}
            tint={isDark ? 'dark' : 'light'}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius, overflow: 'hidden' }]}
          />
        )}

        {/* Liquid Surface Meniscus Reflection Overlay - only in light mode for crisp physical glass depth without dark mode white glow */}
        {highlight && !isDark && (
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.05)', 'transparent']}
            locations={[0, 0.25, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius, overflow: 'hidden' }]}
            pointerEvents="none"
          />
        )}

        <View style={[{ position: 'relative', zIndex: 1 }, padded && { padding: spacing.lg }, contentStyle]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    position: 'relative',
  },
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
  },
});
