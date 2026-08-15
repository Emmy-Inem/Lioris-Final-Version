import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface SolidCardProps extends ViewProps {
  padded?: boolean;
  radius?: number;
  backgroundColor?: string;
}

/**
 * Matches the flat, clean white/pastel cards in the student-screen
 * screenshots — soft shadow, no blur or gradient border. Distinct from
 * `GlassCard` (the heavier frosted style ported from the Kotlin
 * reference), which doesn't match these screens' actual look.
 */
export function SolidCard({ padded = true, radius, backgroundColor, style, children, ...rest }: SolidCardProps) {
  const { colors, spacing } = useTheme();
  const cornerRadius = radius ?? 20;

  return (
    <View
      style={[
        styles.shadowWrapper,
        {
          borderRadius: cornerRadius,
          backgroundColor: backgroundColor ?? colors.surface,
        },
        padded && { padding: spacing.lg },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: Platform.select({
    ios: {
      shadowColor: '#0A1326',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
});
