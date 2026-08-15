import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';

interface LiorisLogoProps {
  size?: number;
  tintColor?: string;
  variant?: 'symbol' | 'wordmark';
}

const EMBLEM_ASSET = require('../../assets/images/lioris_emblem.png');
const EMBLEM_BLUE_ASSET = require('../../assets/images/lioris_emblem_blue.png');
const WORDMARK_CYAN_ASSET = require('../../assets/images/lioris_logo_cyan.png');
const WORDMARK_ORANGE_ASSET = require('../../assets/images/lioris_logo_orange.png');

/**
 * Official LIORIS Brand Emblem Crest & Wordmark.
 */
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

  // Wordmark variant
  const width = size * 2.8;
  const height = size;
  const isWarmAccent = colors.brandPrimary.toLowerCase().includes('ea580c') || colors.brandPrimary.toLowerCase().includes('f97316') || colors.brandPrimary.toLowerCase().includes('fb923c');
  const wordmarkSource = isWarmAccent ? WORDMARK_ORANGE_ASSET : WORDMARK_CYAN_ASSET;

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={wordmarkSource}
        style={{ width, height }}
        contentFit="contain"
        transition={200}
      />
    </View>
  );
}
