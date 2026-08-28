import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';

interface LiorisLogoProps {
  size?: number;
  tintColor?: string;
  variant?: 'symbol' | 'wordmark' | 'full';
  showSubtitle?: boolean;
}

const EMBLEM_ASSET = require('../../assets/images/lioris_emblem.png');

export function LiorisLogo({ size = 48, tintColor, variant = 'symbol' }: LiorisLogoProps) {
  const { colors, isDark } = useTheme();

  if (variant === 'symbol') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={EMBLEM_ASSET}
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  const activeColor = tintColor || (isDark ? '#818CF8' : colors.brandPrimary);

  if (variant === 'wordmark') {
    return (
      <View style={{ justifyContent: 'center' }}>
        <Text
          style={{
            color: activeColor,
            fontSize: Math.round(size * 0.95),
            fontWeight: '900',
            letterSpacing: 2.2,
            fontFamily: Platform.select({
              web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              default: 'Inter_900Black',
            }),
          }}
        >
          LIORIS
        </Text>
      </View>
    );
  }

  // Full variant: Crest symbol + Clean Wordmark
  const gap = Math.max(8, Math.round(size * 0.2));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <Image
        source={EMBLEM_ASSET}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={200}
      />
      <Text
        style={{
          color: activeColor,
          fontSize: Math.round(size * 0.55),
          fontWeight: '900',
          letterSpacing: 2.2,
          fontFamily: Platform.select({
            web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            default: 'Inter_900Black',
          }),
        }}
      >
        LIORIS
      </Text>
    </View>
  );
}
