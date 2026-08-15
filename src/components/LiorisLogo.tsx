import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/colors';

interface LiorisLogoProps {
  size?: number;
  slitColor?: string;
}

/**
 * Ported 1:1 from `LiorisLogo` (Common.kt), which draws the shield mark
 * with Canvas path/arc calls. Arc endpoints below were computed with
 * real trigonometry against the same bounding boxes/angles as the
 * Kotlin source (see the conversion script used to generate them),
 * not eyeballed — this should render as the same shield, not a
 * lookalike.
 */
export function LiorisLogo({ size = 48, slitColor }: LiorisLogoProps) {
  const { colors, isDark } = useTheme();
  const finalSlitColor = slitColor ?? (isDark ? '#0F172A' : '#F0F7FF');

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* 1. Top signal arc (sky blue) */}
      <Path
        d="M 27.064 16.94 A 28 28 0 0 1 72.936 16.94"
        stroke={palette.liorisSky}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
      />

      {/* 2. Left & right coral ear wings */}
      <Path d="M 12,22 Q 28,22 38,36 L 38,49 L 12,49 Z" fill={palette.liorisCoral} />
      <Path d="M 88,22 Q 72,22 62,36 L 62,49 L 88,49 Z" fill={palette.liorisCoral} />

      {/* Inner concentric coral wing arcs */}
      <Path
        d="M 18,41 A 17 17 0 0 1 35,24"
        stroke={palette.liorisCoral}
        strokeOpacity={0.6}
        strokeWidth={6}
        fill="none"
      />
      <Path
        d="M 65,24 A 17 17 0 0 1 82,41"
        stroke={palette.liorisCoral}
        strokeOpacity={0.6}
        strokeWidth={6}
        fill="none"
      />

      {/* 3. Bottom curved wing lobes (blue left, sky right) */}
      <Path d="M 12,49 L 46,49 L 46,91 Q 24,80 12,49 Z" fill={palette.liorisBlue} />
      <Path d="M 88,49 L 54,49 L 54,91 Q 76,80 88,49 Z" fill={palette.liorisSky} />

      {/* 4. Magenta swoosh petals */}
      <Path d="M 14,70 Q 26,66 46,88 Q 30,91 14,70 Z" fill={palette.liorisMagenta} />
      <Path d="M 86,70 Q 74,66 54,88 Q 70,91 86,70 Z" fill={palette.liorisMagenta} />

      {/* 5. Central concentric radiating rings + core */}
      <Circle cx={50} cy={47} r={24} stroke={palette.liorisSky} strokeWidth={5} fill="none" />
      <Circle cx={50} cy={47} r={16} stroke={palette.liorisBlue} strokeWidth={5} fill="none" />
      <Circle cx={50} cy={47} r={12} fill={palette.liorisBlue} />
      <Circle cx={50} cy={47} r={4} fill={palette.liorisSky} />

      {/* 6. Vertical clear slot cut down the shield center */}
      <Rect x={46.5} y={58} width={7} height={33} fill={finalSlitColor} />
    </Svg>
  );
}
