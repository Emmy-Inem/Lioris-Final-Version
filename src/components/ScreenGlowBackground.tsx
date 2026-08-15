import React from'react';
import { View } from'react-native';
import { useTheme } from'@/theme/ThemeProvider';

/**
 * Ultra-clean, premium background surface container.
 * Replaces distracting neon AI glow blobs with clean, refined,
 * Apple/Linear-grade neutral surfaces for maximum legibility and elegance.
 */
export function ScreenGlowBackground({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
