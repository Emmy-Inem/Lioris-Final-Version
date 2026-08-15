import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenGlowBackground } from './ScreenGlowBackground';

interface ScreenContainerProps extends ViewProps {
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  noPadding?: boolean;
  /** Set false to opt out of the glow-blob background (e.g. chat threads, where it competes with message bubbles). */
  glow?: boolean;
}

export function ScreenContainer({
  edges = ['top'],
  noPadding,
  glow = true,
  style,
  children,
  ...rest
}: ScreenContainerProps) {
  const { colors, spacing } = useTheme();

  const inner = (
    <View style={[styles.flex, !noPadding && { paddingHorizontal: spacing.lg }, style]} {...rest}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      {glow ? <ScreenGlowBackground>{inner}</ScreenGlowBackground> : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
