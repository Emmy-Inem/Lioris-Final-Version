import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';

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
  const cornerRadius = radius ?? radiusTokens.glass ?? 20;

  return (
    <View
      style={[
        styles.shadowWrapper,
        {
          borderRadius: cornerRadius,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.28 : 0.08,
          shadowRadius: 18,
          elevation: 6,
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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.65)',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.52)' : 'rgba(255, 255, 255, 0.58)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(30px) saturate(210%) brightness(108%) contrast(102%)',
              WebkitBackdropFilter: 'blur(30px) saturate(210%) brightness(108%) contrast(102%)',
              boxShadow: isDark
                ? 'inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.40), 0 16px 36px -6px rgba(0, 0, 0, 0.45)'
                : 'inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.90), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.05), 0 16px 36px -6px rgba(15, 23, 42, 0.10)',
            } as any),
        ]}
      >
        {/* Native Liquid Blur Engine */}
        {Platform.OS !== 'web' && (
          <BlurView
            intensity={intensity}
            tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius, overflow: 'hidden' }]}
          />
        )}

        {/* Liquid Surface Meniscus Reflection Overlay */}
        {highlight && (
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.03)', 'transparent', 'rgba(255, 255, 255, 0.05)']
                : ['rgba(255, 255, 255, 0.65)', 'rgba(255, 255, 255, 0.16)', 'transparent', 'rgba(255, 255, 255, 0.18)']
            }
            locations={[0, 0.35, 0.7, 1]}
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
