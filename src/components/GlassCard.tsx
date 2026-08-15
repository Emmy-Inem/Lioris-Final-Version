import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';

interface GlassCardProps extends ViewProps {
  padded?: boolean;
  radius?: number;
}

/**
 * Ported from the reference app's `Modifier.frostedCard()` (Common.kt):
 * a vertical gradient surface (not flat translucent + blur) with a
 * gradient border and a brand-tinted elevation shadow — not the plain
 * BlurView overlay this component used before. 25dp default corner
 * radius matches `GlassCard`/`frostedCard`'s Compose default.
 */
export function GlassCard({ padded = true, radius, style, children, ...rest }: GlassCardProps) {
  const { colors, spacing, radius: radiusTokens } = useTheme();
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
      <View style={{ borderRadius: cornerRadius, overflow: 'hidden' }}>
        {/* Gradient border: a slightly larger gradient box behind an inset gradient fill */}
        <LinearGradient
          colors={[colors.glassBorderStart, colors.glassBorderEnd]}
          style={{ padding: StyleSheet.hairlineWidth + 0.6, borderRadius: cornerRadius }}
        >
          <LinearGradient
            colors={[colors.glassSurfaceTop, colors.glassSurfaceBottom]}
            style={{ borderRadius: cornerRadius - 1 }}
          >
            <View style={padded && { padding: spacing.lg }}>{children}</View>
          </LinearGradient>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: Platform.select({
    ios: {
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 1,
      shadowRadius: 16,
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
});
