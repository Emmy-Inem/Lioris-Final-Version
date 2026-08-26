import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface LiorisLogoProps {
  size?: number;
  tintColor?: string;
  variant?: 'symbol' | 'wordmark' | 'full';
  showSubtitle?: boolean;
}

const EMBLEM_ASSET = require('../../assets/images/lioris_emblem.png');

/**
 * Official LIORIS Brand Emblem Crest & Wordmark.
 * Completely free of black drop-shadows or dark background artifacts.
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

  const activeColor = tintColor || (isDark ? '#38BDF8' : colors.brandPrimary);
  const accentColor = tintColor || (isDark ? '#60A5FA' : colors.brandAccent || '#0284C7');

  if (variant === 'wordmark') {
    const height = size;
    const width = Math.round(size * 3.6);
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={width} height={height} viewBox="0 0 180 50">
          <Defs>
            <LinearGradient id="liorisGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={activeColor} />
              <Stop offset="100%" stopColor={accentColor} />
            </LinearGradient>
          </Defs>
          <SvgText
            fill={tintColor ? tintColor : 'url(#liorisGrad)'}
            fontSize="40"
            fontWeight="900"
            letterSpacing="3.5"
            x="0"
            y="38"
          >
            LIORIS
          </SvgText>
        </Svg>
      </View>
    );
  }

  // Full variant: Crest symbol + Clean Wordmark
  const gap = Math.max(8, Math.round(size * 0.2));
  const wmHeight = Math.round(size * 0.7);
  const wmWidth = Math.round(wmHeight * 3.6);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <Image
        source={EMBLEM_ASSET}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={200}
      />
      <View style={{ width: wmWidth, height: wmHeight, justifyContent: 'center' }}>
        <Svg width={wmWidth} height={wmHeight} viewBox="0 0 180 50">
          <Defs>
            <LinearGradient id="liorisFullGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={activeColor} />
              <Stop offset="100%" stopColor={accentColor} />
            </LinearGradient>
          </Defs>
          <SvgText
            fill={tintColor ? tintColor : 'url(#liorisFullGrad)'}
            fontSize="40"
            fontWeight="900"
            letterSpacing="3.5"
            x="0"
            y="38"
          >
            LIORIS
          </SvgText>
        </Svg>
      </View>
    </View>
  );
}
