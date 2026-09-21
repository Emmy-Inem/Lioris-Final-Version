import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView, type BlurViewProps } from 'expo-blur';

/**
 * Android can only blur what is inside an explicit BlurTargetView, and the BlurView must live
 * outside that target. Web and iOS blur whatever sits behind a surface on their own, so on those
 * platforms every export here is a passthrough (or renders nothing) and the tree is unchanged.
 *
 * Usage on a screen with a backdrop (cover image, hero, glow blobs):
 *   <AndroidBlurScope>
 *     <AndroidBlurBackdrop>{backdrop}</AndroidBlurBackdrop>
 *     ...glass surfaces that render <AndroidBlurFill /> (GlassCard / SolidCard already do)...
 *   </AndroidBlurScope>
 */
const TargetContext = createContext<React.RefObject<View | null> | null>(null);

export function AndroidBlurScope({ children }: { children: React.ReactNode }) {
  const target = useRef<View>(null);
  if (Platform.OS !== 'android') return <>{children}</>;
  return <TargetContext.Provider value={target}>{children}</TargetContext.Provider>;
}

export function AndroidBlurBackdrop({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const target = useContext(TargetContext);
  if (Platform.OS !== 'android' || !target) return <>{children}</>;
  return (
    <BlurTargetView ref={target} style={style}>
      {children}
    </BlurTargetView>
  );
}

/** The blur target of the nearest scope, or null (always null off Android / outside a scope). */
export function useAndroidBlurTarget(): React.RefObject<View | null> | null {
  const target = useContext(TargetContext);
  return Platform.OS === 'android' ? target : null;
}

/**
 * Fills its parent with a real blur of the nearest scope's backdrop. Renders nothing off Android
 * or when there is no scope, so callers can drop it in unconditionally.
 */
export function AndroidBlurFill({
  intensity = 60,
  tint = 'light',
  borderRadius,
  blurReductionFactor = 2,
}: {
  intensity?: number;
  tint?: BlurViewProps['tint'];
  borderRadius?: number;
  blurReductionFactor?: number;
}) {
  const target = useAndroidBlurTarget();
  // BlurView reads the target once when it mounts, so wait a tick: that way the backdrop's ref is
  // attached even when this surface comes earlier in the tree than the backdrop.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!target || !ready) return null;
  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      blurTarget={target}
      blurMethod="dimezisBlurViewSdk31Plus"
      blurReductionFactor={blurReductionFactor}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}
    />
  );
}
