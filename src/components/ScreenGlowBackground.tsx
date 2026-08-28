import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Ambient Liquid Glass Canvas Background with soft subtle radial lighting.
 * Gives background refraction depth while keeping text crystal clear.
 */
export function ScreenGlowBackground({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ flex: 1, minHeight: 0, height: '100%', backgroundColor: colors.background, position: 'relative' }}>
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          {/* Top-Right Soft Ambient Glass Glow */}
          <div
            style={{
              position: 'absolute',
              top: '-120px',
              right: '-80px',
              width: '420px',
              height: '420px',
              borderRadius: '50%',
              background: isDark
                ? 'radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, rgba(15, 23, 42, 0) 70%)'
                : 'radial-gradient(circle, rgba(167, 139, 250, 0.16) 0%, rgba(255, 255, 255, 0) 70%)',
              filter: 'blur(50px)',
            }}
          />
          {/* Bottom-Left Soft Ambient Glass Glow */}
          <div
            style={{
              position: 'absolute',
              bottom: '100px',
              left: '-100px',
              width: '380px',
              height: '380px',
              borderRadius: '50%',
              background: isDark
                ? 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(15, 23, 42, 0) 70%)'
                : 'radial-gradient(circle, rgba(147, 197, 253, 0.18) 0%, rgba(255, 255, 255, 0) 70%)',
              filter: 'blur(50px)',
            }}
          />
        </div>
      )}
      <View style={{ flex: 1, minHeight: 0, height: '100%', position: 'relative', zIndex: 1 }}>
        {children}
      </View>
    </View>
  );
}
