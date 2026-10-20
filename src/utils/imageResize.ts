// Pure sizing rules for shrinking a picked photo before upload (no react-native imports, so node --test can run it).

export const MAX_UPLOAD_IMAGE_WIDTH = 1280;
export const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * The width to resize to, or null when the picture is already small enough (or its size is unknown and must be left
 * alone). Only ever shrinks; the aspect ratio is kept by resizing on width alone.
 */
export function computeResizeWidth(
  width: number | null | undefined,
  maxWidth: number = MAX_UPLOAD_IMAGE_WIDTH,
): number | null {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  if (width <= maxWidth) return null;
  return maxWidth;
}

/** Target pixel size for a canvas redraw: the same rule applied to both sides. */
export function computeResizeSize(
  width: number,
  height: number,
  maxWidth: number = MAX_UPLOAD_IMAGE_WIDTH,
): { width: number; height: number } | null {
  const target = computeResizeWidth(width, maxWidth);
  if (target === null || !Number.isFinite(height) || height <= 0) return null;
  return { width: target, height: Math.max(1, Math.round((height * target) / width)) };
}
