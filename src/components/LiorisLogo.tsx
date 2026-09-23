import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';
import { BRAND_PALETTE, type BrandToneId } from '@/constants/brandPalette';
import { WORDMARK_ASSETS } from '@/constants/brandWordmarks';
import { pickBrandTone } from '@/utils/brandTone';

/** 'auto' matches the active theme; 'blue' / 'orange' are kept as aliases for older callers. */
export type LiorisWordmarkTone = BrandToneId | 'auto' | 'blue' | 'orange';

interface LiorisLogoProps {
  /** Emblem edge length in px. The wordmark is sized relative to it (see the ratios below). */
  size?: number;
  /**
   * Legacy colour hint kept for existing callers: a LIGHT value (e.g. '#FFFFFF') selects the white
   * wordmark for use on dark/photo backgrounds; any other value is ignored. Prefer `tone`.
   */
  tintColor?: string;
  variant?: 'symbol' | 'wordmark' | 'full';
  /**
   * Wordmark colour. Default 'auto' picks the emblem colour that best matches the active theme
   * (campus / accent, light / dark) and stays readable on it. Or force any emblem colour
   * ('sky' | 'azure' | 'cobalt' | 'orange' | 'tangerine' | 'salmon' | 'crimson' | 'magenta' | 'plum')
   * or 'white' (over photos and dark heroes).
   */
  tone?: LiorisWordmarkTone;
  /** Emblem artwork: the full-colour master (default) or the all-blue variant. */
  emblem?: 'color' | 'blue';
  showSubtitle?: boolean;
}

const EMBLEM_ASSETS = {
  color: require('../../assets/images/lioris_emblem.png'),
  blue: require('../../assets/images/lioris_emblem_blue.png'),
};

/** Width / height of the wordmark PNGs (393 x 110). */
const WORDMARK_ASPECT = 393 / 110;
/** Wordmark height as a fraction of `size`: standalone wordmark, and next to the emblem. */
const WORDMARK_HEIGHT_RATIO = 0.9;
const FULL_WORDMARK_HEIGHT_RATIO = 0.5;

const TONE_ALIASES: Record<string, BrandToneId> = { blue: 'sky', orange: 'orange' };

function isLightColor(hex?: string): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.75;
}

function Wordmark({ height, tone }: { height: number; tone: BrandToneId }) {
  return (
    <Image
      source={WORDMARK_ASSETS[tone]}
      alt="Lioris"
      accessibilityLabel="Lioris"
      style={{ width: Math.round(height * WORDMARK_ASPECT), height }}
      contentFit="contain"
      transition={Platform.OS === 'web' ? 0 : 200}
    />
  );
}

export function LiorisLogo({ size = 48, tintColor, variant = 'symbol', tone = 'auto', emblem = 'color' }: LiorisLogoProps) {
  const { colors } = useTheme();
  const emblemSource = EMBLEM_ASSETS[emblem];

  // The emblem colour closest to the active theme that is still readable on its background.
  const themeTone = useMemo(
    () => pickBrandTone(BRAND_PALETTE, { primary: colors.brandPrimary, backgrounds: [colors.background, colors.surface] }),
    [colors.brandPrimary, colors.background, colors.surface],
  );
  const resolvedTone: BrandToneId =
    tone !== 'auto' ? (TONE_ALIASES[tone] ?? (tone as BrandToneId)) : isLightColor(tintColor) ? 'white' : themeTone;

  if (variant === 'symbol') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={emblemSource}
          alt="Lioris logo"
          accessibilityLabel="Lioris logo"
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={Platform.OS === 'web' ? 0 : 200}
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
        accessible={false}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={Platform.OS === 'web' ? 0 : 200}
      />
      <Wordmark height={Math.round(size * FULL_WORDMARK_HEIGHT_RATIO)} tone={resolvedTone} />
    </View>
  );
}
