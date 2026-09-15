import { TextStyle } from 'react-native';

/**
 * Legibility for white text/icons sitting directly on a dashboard hero
 * photo, without falling back to a filled pill behind them - a pill
 * background is not wanted on any text anywhere in the app (see Badge.tsx),
 * including these hero overlays, which previously used one to keep the
 * institution name and "Customize" label readable over busy photos.
 */
export const heroTextShadowStyle: TextStyle = {
  textShadowColor: 'rgba(0, 0, 0, 0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};
