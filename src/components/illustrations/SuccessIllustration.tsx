import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Original flat-vector "success" illustration — a checkmark seal with
 * a few confetti accents, in Lioris's own brand color. Used for
 * confirmation moments (RSVP confirmed, payment successful,
 * verification approved) instead of a bare Ionicons checkmark, to
 * match UniHub's more illustrated celebration-screen style.
 */
export function SuccessIllustration({ size = 120 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="56" fill={colors.pastelPrimaryBg} />
      <Circle cx="60" cy="60" r="34" fill={colors.brandPrimary} />
      <Path d="M46 61 L56 71 L76 49" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* confetti */}
      <Circle cx="24" cy="40" r="4" fill={colors.brandAccent} />
      <Circle cx="98" cy="44" r="5" fill={colors.brandAccent} opacity={0.8} />
      <Circle cx="20" cy="82" r="3.5" fill={colors.brandPrimary} opacity={0.5} />
      <Circle cx="100" cy="86" r="4" fill={colors.brandPrimary} opacity={0.5} />
      <Path d="M32 96 l6 -6" stroke={colors.brandAccent} strokeWidth="4" strokeLinecap="round" />
      <Path d="M88 26 l6 -6" stroke={colors.brandAccent} strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}
