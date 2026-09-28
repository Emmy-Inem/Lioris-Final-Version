import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Ambient Liquid Glass Canvas Background with soft subtle radial lighting.
 * Gives background refraction depth while keeping text crystal clear.
 */
export function ScreenGlowBackground({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, minHeight: 0, height: '100%', backgroundColor: colors.background, position: 'relative' }}>
      <View style={{ flex: 1, minHeight: 0, height: '100%', position: 'relative' }}>
        {children}
      </View>
    </View>
  );
}
