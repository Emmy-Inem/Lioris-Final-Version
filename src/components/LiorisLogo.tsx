import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface LiorisLogoProps {
  size?: number;
  tintColor?: string;
  variant?: 'symbol' | 'wordmark';
}

/**
 * Official LIORIS Brand Logo & Mark.
 * Dynamically styled with the active profile accent theme color.
 */
export function LiorisLogo({ size = 48, tintColor, variant = 'symbol' }: LiorisLogoProps) {
  const { colors } = useTheme();
  const primaryColor = tintColor || colors.brandPrimary;

  if (variant === 'symbol') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Outer Circular Disk with Dynamic Theme Fill */}
        <Circle cx={50} cy={50} r={46} fill={primaryColor} />

        {/* Inner Distinctive Lioris Crescent Core */}
        <Path
          d="M 50 18 C 32.33 18 18 32.33 18 50 C 18 67.67 32.33 82 50 82 C 60.5 82 69.8 76.9 75.6 69 C 64.5 73.5 52 68 47.5 56.9 C 43.5 47 48.2 35.8 58 31.8 C 64.2 29.2 71.2 30.5 76 34.5 C 70 24.5 60.7 18 50 18 Z"
          fill="#FFFFFF"
        />

        {/* Center Radiant Focal Dot */}
        <Circle cx={62} cy={50} r={9} fill={primaryColor} />
      </Svg>
    );
  }

  // Full Wordmark variant: "LIORIS"
  const width = size * 2.8;
  const height = size;

  return (
    <Svg width={width} height={height} viewBox="0 0 280 100" fill="none">
      <G fill={primaryColor}>
        {/* L */}
        <Path d="M 12 20 L 32 20 L 32 64 L 56 64 L 56 80 L 12 80 Z" />

        {/* I */}
        <Path d="M 66 20 L 84 20 L 84 80 L 66 80 Z" />

        {/* O (Stylized Lioris Circular Core) */}
        <Path
          d="M 126 20 C 109.43 20 96 33.43 96 50 C 96 66.57 109.43 80 126 80 C 142.57 80 156 66.57 156 50 C 156 33.43 142.57 20 126 20 Z M 126 36 C 133.73 36 140 42.27 140 50 C 140 57.73 133.73 64 126 64 C 118.27 64 112 57.73 112 50 C 112 42.27 118.27 36 126 36 Z"
        />

        {/* R */}
        <Path
          d="M 168 20 L 198 20 C 209 20 216 26.5 216 36 C 216 43.5 211 48.5 204 51 L 218 80 L 198 80 L 186 54 L 186 80 L 168 80 Z M 186 35 L 186 44 L 196 44 C 200 44 203 41.5 203 39.5 C 203 37 200 35 196 35 Z"
        />

        {/* I */}
        <Path d="M 226 20 L 244 20 L 244 80 L 226 80 Z" />

        {/* S */}
        <Path
          d="M 254 70 C 257 76 263 80 270 80 C 277 80 282 76 282 71 C 282 66 277 63 268 60 C 256 56 250 50 250 40 C 250 28 260 20 272 20 C 282 20 290 25 293 33 L 278 39 C 276 35 273 33 270 33 C 266 33 263 35 263 38 C 263 42 267 44 274 47 C 286 51 294 57 294 68 C 294 80 284 88 270 88 C 259 88 250 82 246 72 Z"
        />
      </G>
    </Svg>
  );
}
