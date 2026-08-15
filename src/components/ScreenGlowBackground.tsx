import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Ported from `Modifier.frostedBackground()` (Common.kt): a solid base
 * color with two soft radial glow blobs — brand blue top-left, coral/
 * orange bottom-right — sitting behind screen content. Wrap a screen's
 * content in this instead of a flat background color for the premium
 * "Academic Glass" look the reference app uses everywhere.
 */
export function ScreenGlowBackground({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowPrimary" cx="0%" cy="0%" r="75%">
            <Stop offset="0%" stopColor={colors.glowBlobPrimary} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.glowBlobPrimary} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowAccent" cx="100%" cy="100%" r="65%">
            <Stop offset="0%" stopColor={colors.glowBlobAccent} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.glowBlobAccent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowPrimary)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowAccent)" />
      </Svg>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
