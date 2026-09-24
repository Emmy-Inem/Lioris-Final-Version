import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Defs, Line, Mask, Rect, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import { CropState, MAX_ZOOM, MIN_ZOOM, baseScale, clampCrop, cropRect, zoomTo } from '@/utils/cropMath';
import { CroppedImage, renderCrop } from '@/utils/cropImage';

export type CropKind = 'avatar' | 'cover';

const KIND_CONFIG: Record<CropKind, { aspect: number; outWidth: number; outHeight: number; title: string; hint: string }> = {
  avatar: {
    aspect: 1,
    outWidth: 640,
    outHeight: 640,
    title: 'Crop profile photo',
    hint: 'Drag to position your face inside the circle, then zoom.',
  },
  cover: {
    aspect: 16 / 9,
    outWidth: 1600,
    outHeight: 900,
    title: 'Crop cover photo',
    hint: 'Drag to choose the part of the picture that becomes your banner.',
  },
};

interface ImageCropperModalProps {
  visible: boolean;
  /** Picture to crop: a file/data/blob URI or an https URL. */
  uri: string | null;
  kind: CropKind;
  onCancel: () => void;
  /** Called with the cropped JPEG once the user taps Save. The caller uploads it. */
  onDone: (result: CroppedImage) => void | Promise<void>;
}

/**
 * Crop / reposition a profile or cover photo. Works the same on phones and the web app: drag to move,
 * slider, +/- buttons, mouse wheel or a two-finger pinch to zoom. The frame is fixed (square with a
 * circular guide for avatars, 16:9 with thirds for covers) so what you see is exactly what is saved.
 */
export function ImageCropperModal({ visible, uri, kind, onCancel, onDone }: ImageCropperModalProps) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const config = KIND_CONFIG[kind];

  const viewportWidth = Math.min(windowWidth - spacing.lg * 2, 420);
  const viewportHeight = viewportWidth / config.aspect;

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, tx: 0, ty: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Latest values for the gesture handlers, which are created once.
  const live = useRef({ crop, natural, viewportWidth, viewportHeight });
  live.current = { crop, natural, viewportWidth, viewportHeight };

  useEffect(() => {
    if (!visible || !uri) return;
    setNatural(null);
    setLoadError(null);
    setSaveError(null);
    setCrop({ zoom: 1, tx: 0, ty: 0 });
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled) setNatural({ w, h });
      },
      () => {
        if (!cancelled) setLoadError('Could not open this picture. Please choose another one.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visible, uri]);

  const applyZoom = useCallback((nextZoom: number) => {
    const { crop: current, natural: n, viewportWidth: vw, viewportHeight: vh } = live.current;
    if (!n) return;
    setCrop(zoomTo(current, nextZoom, n.w, n.h, vw, vh));
  }, []);

  const panResponder = useMemo(() => {
    let start: CropState = { zoom: 1, tx: 0, ty: 0 };
    let startDistance = 0;
    const distance = (touches: any[]) => {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      return Math.hypot(dx, dy);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = live.current.crop;
        startDistance = 0;
      },
      onPanResponderMove: (event, gesture) => {
        const { natural: n, viewportWidth: vw, viewportHeight: vh } = live.current;
        if (!n) return;
        const touches = event.nativeEvent.touches as any[] | undefined;
        if (touches && touches.length >= 2) {
          const d = distance(touches);
          if (!startDistance) {
            startDistance = d;
            start = live.current.crop;
          }
          setCrop(zoomTo(start, start.zoom * (d / startDistance), n.w, n.h, vw, vh));
          return;
        }
        startDistance = 0;
        setCrop(clampCrop({ zoom: start.zoom, tx: start.tx + gesture.dx, ty: start.ty + gesture.dy }, n.w, n.h, vw, vh));
      },
    });
  }, []);

  // Mouse wheel zoom on the web app.
  const viewportRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      applyZoom(live.current.crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [visible, applyZoom, natural]);

  async function handleSave() {
    if (!uri || !natural || saving) return;
    setSaving(true);
    setSaveError(null);
    haptics.medium();
    try {
      const rect = cropRect(crop, natural.w, natural.h, viewportWidth, viewportHeight);
      const result = await renderCrop(uri, rect, config.outWidth, config.outHeight);
      await onDone(result);
    } catch (err: any) {
      haptics.error();
      setSaveError(err?.message || 'Could not save this crop. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const scale = natural ? baseScale(natural.w, natural.h, viewportWidth, viewportHeight) * crop.zoom : 1;
  const imageWidth = natural ? natural.w * scale : 0;
  const imageHeight = natural ? natural.h * scale : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onCancel} statusBarTranslucent>
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.88)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          paddingHorizontal: spacing.lg,
        }}
      >
        <View style={{ width: '100%', maxWidth: 460, alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: viewportWidth, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="h3" weight="bold" tone="inverse">
                {config.title}
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {config.hint}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel cropping"
              onPress={onCancel}
              disabled={saving}
              hitSlop={12}
              style={{ padding: 6 }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* The frame. Everything outside it is what gets cut off. */}
          <View
            ref={viewportRef}
            {...panResponder.panHandlers}
            accessibilityLabel="Crop area. Drag to move the picture."
            style={{
              width: viewportWidth,
              height: viewportHeight,
              overflow: 'hidden',
              borderRadius: kind === 'avatar' ? 6 : radius.md,
              backgroundColor: '#0B1220',
              ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as any) : null),
            }}
          >
            {natural && uri ? (
              <Image
                source={{ uri }}
                resizeMode="stretch"
                style={{
                  position: 'absolute',
                  width: imageWidth,
                  height: imageHeight,
                  left: viewportWidth / 2 + crop.tx - imageWidth / 2,
                  top: viewportHeight / 2 + crop.ty - imageHeight / 2,
                }}
                {...(Platform.OS === 'web' ? ({ draggable: false } as any) : null)}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md }}>
                {loadError ? (
                  <AppText variant="bodySmall" style={{ color: '#FCA5A5', textAlign: 'center' }}>
                    {loadError}
                  </AppText>
                ) : (
                  <ActivityIndicator color="#FFFFFF" />
                )}
              </View>
            )}

            {natural ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
                <Svg width={viewportWidth} height={viewportHeight}>
                  {kind === 'avatar' ? (
                    <>
                      <Defs>
                        <Mask id="hole">
                          <Rect width={viewportWidth} height={viewportHeight} fill="#FFFFFF" />
                          <Circle cx={viewportWidth / 2} cy={viewportHeight / 2} r={viewportWidth / 2 - 4} fill="#000000" />
                        </Mask>
                      </Defs>
                      <Rect width={viewportWidth} height={viewportHeight} fill="rgba(0,0,0,0.55)" mask="url(#hole)" />
                      <Circle
                        cx={viewportWidth / 2}
                        cy={viewportHeight / 2}
                        r={viewportWidth / 2 - 4}
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    </>
                  ) : (
                    <>
                      {[1, 2].map((i) => (
                        <React.Fragment key={i}>
                          <Line x1={(viewportWidth * i) / 3} y1={0} x2={(viewportWidth * i) / 3} y2={viewportHeight} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                          <Line x1={0} y1={(viewportHeight * i) / 3} x2={viewportWidth} y2={(viewportHeight * i) / 3} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                        </React.Fragment>
                      ))}
                      <Rect x={1} y={1} width={viewportWidth - 2} height={viewportHeight - 2} fill="none" stroke="#FFFFFF" strokeWidth={2} />
                    </>
                  )}
                </Svg>
              </View>
            ) : null}
          </View>

          {/* Zoom */}
          <View style={{ width: viewportWidth, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              onPress={() => applyZoom(crop.zoom / 1.25)}
              disabled={!natural || saving}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Ionicons name="remove-circle-outline" size={26} color="#FFFFFF" />
            </Pressable>
            <Slider
              style={{ flex: 1, height: 36 }}
              minimumValue={MIN_ZOOM}
              maximumValue={MAX_ZOOM}
              value={crop.zoom}
              onValueChange={applyZoom}
              disabled={!natural || saving}
              minimumTrackTintColor={colors.brandPrimary}
              maximumTrackTintColor="rgba(255,255,255,0.35)"
              thumbTintColor="#FFFFFF"
              accessibilityLabel="Zoom"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              onPress={() => applyZoom(crop.zoom * 1.25)}
              disabled={!natural || saving}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Ionicons name="add-circle-outline" size={26} color="#FFFFFF" />
            </Pressable>
          </View>

          {saveError ? (
            <AppText variant="caption" accessibilityRole="alert" style={{ color: '#FCA5A5', textAlign: 'center' }}>
              {saveError}
            </AppText>
          ) : null}

          <View style={{ width: viewportWidth, flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppButton
                label="Reset"
                variant="secondary"
                onPress={() => {
                  haptics.light();
                  setCrop({ zoom: 1, tx: 0, ty: 0 });
                }}
                disabled={!natural || saving}
                fullWidth
              />
            </View>
            <View style={{ flex: 1.3 }}>
              <AppButton label={saving ? 'Saving…' : 'Save'} onPress={handleSave} loading={saving} disabled={!natural || saving} fullWidth />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
