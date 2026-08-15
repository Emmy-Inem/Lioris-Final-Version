import React from'react';
import { View, ViewStyle } from'react-native';
import Svg, { Path } from'react-native-svg';
import { useTheme } from'@/theme/ThemeProvider';

interface WaveCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * UniHub-style auth card: a solid sheet with a soft wave cut into its
 * top edge, meant to sit right below a hero image/gradient
 * (AuthHeroBackground). The wave is a real SVG path
 * (react-native-svg), not an approximated border-radius — this is the
 * single most recognizable visual signature of that reference design.
 */
export function WaveCard({ children, style }: WaveCardProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={style}>
      <Svg width="100%"height={32} viewBox="0 0 100 20"preserveAspectRatio="none">
        <Path d="M0,16 C25,0 75,32 100,16 L100,20 L0,20 Z"fill={colors.surface} />
      </Svg>
      <View
        style={{
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          marginTop: -1, // seam-hide between the SVG wave and the solid sheet below it
        }}
      >
        {children}
      </View>
    </View>
  );
}
