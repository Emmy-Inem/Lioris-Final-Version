import React from 'react';
import { Platform, ScrollView, StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { ScreenGlowBackground } from './ScreenGlowBackground';

interface ScreenContainerProps extends ViewProps {
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  noPadding?: boolean;
  glow?: boolean;
  scrollable?: boolean;
  contentContainerStyle?: any;
  fluidWidth?: boolean;
}

export function ScreenContainer({
  edges = ['top'],
  noPadding,
  glow = true,
  scrollable = false,
  fluidWidth = false,
  contentContainerStyle,
  style,
  children,
  ...rest
}: ScreenContainerProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop, containerPadding, contentMaxWidth } = useResponsive();

  const content = (
    <View
      style={[
        styles.flex,
        !noPadding && { paddingHorizontal: isDesktop ? containerPadding : spacing.lg },
        isDesktop && !fluidWidth && {
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
        },
        Platform.OS === 'web' && { minHeight: '100%' },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  const inner = scrollable ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      contentContainerStyle={[
        { flexGrow: 1, paddingBottom: isDesktop ? 40 : 130 },
        contentContainerStyle,
      ]}
      style={styles.flex}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  return (
    <SafeAreaView
      edges={isDesktop ? [] : edges}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      {glow ? <ScreenGlowBackground>{inner}</ScreenGlowBackground> : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { height: '100%' } : {}),
  },
});
