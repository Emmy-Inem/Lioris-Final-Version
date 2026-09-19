import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

interface LiorisLogoProps {
  /** Emblem edge length in px. The wordmark is sized relative to it (see WORDMARK_HEIGHT_RATIO). */
  size?: number;
  /**
   * Legacy colour hint kept for existing callers: a LIGHT value (e.g. '#FFFFFF') selects the white
   * wordmark for use on dark/photo backgrounds; any other value is ignored. Prefer `tone`.
   */
  tintColor?: string;
  variant?: 'symbol' | 'wordmark' | 'full';
  /** Wordmark colour. 'auto' = brand blue. Use 'white' over photos/dark heroes, 'orange' for accents. */
  tone?: 'auto' | 'blue' | 'orange' | 'white';
  /** Emblem artwork: the full-colour master (default) or the all-blue variant. */
  emblem?: 'color' | 'blue';
  showSubtitle?: boolean;
}

// Real brand artwork (background-removed cut-outs built by tools/brand/build-brand-assets.cjs).
const EMBLEM_ASSETS = {
  color: require('../../assets/images/lioris_emblem.png'),
  blue: require('../../assets/images/lioris_emblem_blue.png'),
};
const WORDMARK_ASSETS = {
  blue: require('../../assets/images/lioris_wordmark_blue.png'),
  orange: require('../../assets/images/lioris_wordmark_orange.png'),
  white: require('../../assets/images/lioris_wordmark_white.png'),
};

/** Width / height of the wordmark PNGs (393 x 110). */
const WORDMARK_ASPECT = 393 / 110;
/** Wordmark height as a fraction of `size`: standalone wordmark, and next to the emblem. */
const WORDMARK_HEIGHT_RATIO = 0.9;
const FULL_WORDMARK_HEIGHT_RATIO = 0.5;

function isLightColor(hex?: string): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.75;
}

function resolveTone(tone: LiorisLogoProps['tone'], tintColor?: string): 'blue' | 'orange' | 'white' {
  if (tone && tone !== 'auto') return tone;
  return isLightColor(tintColor) ? 'white' : 'blue';
}

function Wordmark({ height, tone }: { height: number; tone: 'blue' | 'orange' | 'white' }) {
  return (
    <Image
      source={WORDMARK_ASSETS[tone]}
      alt="Lioris"
      style={{ width: Math.round(height * WORDMARK_ASPECT), height }}
      contentFit="contain"
      transition={200}
    />
  );
}

export function LiorisLogo({ size = 48, tintColor, variant = 'symbol', tone = 'auto', emblem = 'color' }: LiorisLogoProps) {
  const resolvedTone = resolveTone(tone, tintColor);
  const emblemSource = EMBLEM_ASSETS[emblem];

  if (variant === 'symbol') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={emblemSource}
          alt="Lioris logo"
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  if (variant === 'wordmark') {
    return (
      <View style={{ justifyContent: 'center' }}>
        <Wordmark height={Math.round(size * WORDMARK_HEIGHT_RATIO)} tone={resolvedTone} />
      </View>
    );
  }

  // Full variant: emblem + wordmark side by side.
  const gap = Math.max(8, Math.round(size * 0.2));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <Image
        source={emblemSource}
        alt=""
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={200}
      />
      <Wordmark height={Math.round(size * FULL_WORDMARK_HEIGHT_RATIO)} tone={resolvedTone} />
    </View>
  );
}
