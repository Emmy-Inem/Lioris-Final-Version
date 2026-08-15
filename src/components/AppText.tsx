import React from'react';
import { Text as RNText, TextProps, TextStyle } from'react-native';
import { useTheme } from'@/theme/ThemeProvider';
import {
  fontFamily,
  fontFamilyMedium,
  fontFamilySemiBold,
  fontFamilyBold,
  weightForPlatform,
  typeScale,
} from'@/theme/typography';

type Variant = keyof typeof typeScale;
type Weight = 'regular' | 'medium' | 'semiBold' | 'bold';
type Tone = 'primary' | 'secondary' | 'inverse' | 'brand' | 'accent' | 'critical';

interface AppTextProps extends TextProps {
  variant?: Variant;
  weight?: Weight;
  tone?: Tone;
}

const familyForWeight: Record<Weight, string | undefined> = {
  regular: fontFamily,
  medium: fontFamilyMedium,
  semiBold: fontFamilySemiBold,
  bold: fontFamilyBold,
};

export function AppText({
  variant = 'body',
  weight = 'regular',
  tone = 'primary',
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();

  const toneColor: Record<Tone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    inverse: colors.textInverse,
    brand: colors.brandPrimary,
    accent: colors.brandAccent,
    critical: colors.critical,
  };

  const computedStyle: TextStyle = {
    ...typeScale[variant],
    fontFamily: familyForWeight[weight],
    fontWeight: weightForPlatform[weight],
    color: toneColor[tone],
  };

  // AppText is frequently used as a tappable text link (e.g. "Sign Up",
  // "Resend code", "Sign out") rather than through AppButton — plain
  // RN Text with an onPress handler isn't announced as interactive to
  // a screen reader on its own. Default to accessibilityRole="button"
  // whenever onPress is present; an explicit accessibilityRole passed
  // in still wins since rest is spread after this default.
  const isPressable = typeof rest.onPress === 'function';

  return (
    <RNText
      accessibilityRole={isPressable ? 'button' : undefined}
      style={[computedStyle, style]}
      {...rest}
    />
  );
}
