import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A soft, filter-free glow for Android. Android has no CSS `filter: blur`, and the native
 * `filter` style is not applied to views that live inside a BlurTargetView, so a plain rounded
 * view would render as a hard-edged shape. Stacking concentric translucent ellipses fades the
 * colour out smoothly and works on every Android version.
 */
export function AndroidSoftGlow({
  width,
  height,
  rgb,
  alpha,
  style,
  layers = 18,
}: {
  width: number;
  height: number;
  /** e.g. "26, 61, 255" */
  rgb: string;
  /** Peak opacity at the centre, 0..1. */
  alpha: number;
  style?: StyleProp<ViewStyle>;
  layers?: number;
}) {
  // Per-layer alpha chosen so the stacked centre lands on `alpha`.
  const perLayer = 1 - Math.pow(1 - alpha, 1 / layers);
  return (
    <View pointerEvents="none" style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: layers }, (_, i) => {
        const k = (i + 1) / layers;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (width - width * k) / 2,
              top: (height - height * k) / 2,
              width: width * k,
              height: height * k,
              borderRadius: Math.max(width, height),
              backgroundColor: `rgba(${rgb}, ${perLayer.toFixed(4)})`,
            }}
          />
        );
      })}
    </View>
  );
}
