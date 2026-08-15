import React from'react';
import { View } from'react-native';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'critical';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { colors, radius, spacing } = useTheme();

  const bg: Record<BadgeTone, string> = {
    neutral: colors.divider,
    brand: `${colors.brandPrimary}22`,
    accent: `${colors.brandAccent}22`,
    success: `${colors.success}22`,
    warning: `${colors.warning}22`,
    critical: `${colors.critical}22`,
  };
  const fg: Record<BadgeTone, string> = {
    neutral: colors.textSecondary,
    brand: colors.brandPrimary,
    accent: colors.brandAccent,
    success: colors.success,
    warning: colors.warning,
    critical: colors.critical,
  };

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg[tone],
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      <AppText variant="caption"weight="semiBold"style={{ color: fg[tone] }}>
        {label}
      </AppText>
    </View>
  );
}
