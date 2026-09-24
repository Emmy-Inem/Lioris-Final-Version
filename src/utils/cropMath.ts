/**
 * Pure geometry for the photo cropper (src/components/ImageCropperModal.tsx), kept free of any UI so
 * it can be unit-tested.
 *
 * Model: a fixed-size viewport (vw x vh) shows part of an image (iw x ih). The image is scaled so it
 * always covers the viewport (`baseScale`), multiplied by a user `zoom` (1 = just covers). `tx`/`ty`
 * are how far the image's centre is from the viewport's centre, in viewport pixels.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export interface CropState {
  zoom: number;
  tx: number;
  ty: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Scale at which the image exactly covers the viewport. */
export function baseScale(iw: number, ih: number, vw: number, vh: number): number {
  return Math.max(vw / iw, vh / ih);
}

/** Keeps zoom in range and the image covering the whole viewport (no empty edges). */
export function clampCrop(state: CropState, iw: number, ih: number, vw: number, vh: number): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
  const scale = baseScale(iw, ih, vw, vh) * zoom;
  const maxX = Math.max(0, (iw * scale - vw) / 2);
  const maxY = Math.max(0, (ih * scale - vh) / 2);
  return {
    zoom,
    tx: Math.min(maxX, Math.max(-maxX, state.tx)),
    ty: Math.min(maxY, Math.max(-maxY, state.ty)),
  };
}

/** The part of the source image (in its own pixels) that is currently inside the viewport. */
export function cropRect(state: CropState, iw: number, ih: number, vw: number, vh: number): CropRect {
  const { zoom, tx, ty } = clampCrop(state, iw, ih, vw, vh);
  const scale = baseScale(iw, ih, vw, vh) * zoom;
  const width = Math.min(iw, vw / scale);
  const height = Math.min(ih, vh / scale);
  const originX = iw / 2 - (vw / 2 + tx) / scale;
  const originY = ih / 2 - (vh / 2 + ty) / scale;
  return {
    originX: Math.round(Math.min(iw - width, Math.max(0, originX))),
    originY: Math.round(Math.min(ih - height, Math.max(0, originY))),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Zooms about the viewport centre while keeping the picture where it is relative to the crop. */
export function zoomTo(state: CropState, nextZoom: number, iw: number, ih: number, vw: number, vh: number): CropState {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const ratio = clamped / state.zoom;
  return clampCrop({ zoom: clamped, tx: state.tx * ratio, ty: state.ty * ratio }, iw, ih, vw, vh);
}
