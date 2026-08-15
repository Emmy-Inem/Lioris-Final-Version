import React from 'react';
import Svg, { Circle, Rect, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Original flat-vector illustration (not a copy of any reference
 * app's specific mascot artwork, which is that studio's own IP) —
 * built from basic SVG shapes to match the friendly, simple-flat-
 * illustration spirit UniHub uses, in Lioris's own brand color.
 * A rounded "empty tray" with a soft face, used as EmptyState's
 * default so every one of its ~15 call sites gets a real illustration
 * instead of bare text.
 */
export function EmptyTrayIllustration({ size = 120 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* soft circular backdrop */}
      <Circle cx="60" cy="60" r="56" fill={colors.pastelPrimaryBg} />
      {/* tray body */}
      <Path
        d="M28 68 L38 44 H82 L92 68 V84 A6 6 0 0 1 86 90 H34 A6 6 0 0 1 28 84 Z"
        fill={colors.surface}
        stroke={colors.brandPrimary}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* tray inner lip */}
      <Path d="M28 68 H92" stroke={colors.brandPrimary} strokeWidth="3" strokeLinejoin="round" />
      {/* friendly face on the tray front */}
      <Circle cx="52" cy="79" r="3" fill={colors.brandPrimary} />
      <Circle cx="68" cy="79" r="3" fill={colors.brandPrimary} />
      <Path d="M54 85 Q60 89 66 85" stroke={colors.brandPrimary} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* floating sparkle accents */}
      <Rect x="22" y="30" width="8" height="8" rx="2" fill={colors.brandAccent} opacity={0.6} transform="rotate(20 26 34)" />
      <Circle cx="94" cy="36" r="5" fill={colors.brandAccent} opacity={0.5} />
      <Circle cx="34" cy="94" r="4" fill={colors.brandPrimary} opacity={0.35} />
    </Svg>
  );
}
