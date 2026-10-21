// Pure sizing rules for shrinking a picked photo before upload (no react-native imports, so node --test can run it).

export const MAX_UPLOAD_IMAGE_WIDTH = 1280;
export const UPLOAD_JPEG_QUALITY = 0.8;
/** ID cards, admission letters and certificates: text must stay readable for the moderator, so keep more pixels. */
export const MAX_DOCUMENT_IMAGE_WIDTH = 2000;

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

/**
 * Whether a picked file may be re-encoded as a JPEG. GIFs (animation), SVGs and PDFs are left exactly as picked, and so is
 * anything that is not an image. The mime type wins when the picker reports one; otherwise the file name / URI
 * extension (or a data: URL's own mime type) decides, and an unknown type is treated as a photo.
 */
export function shouldResizeImage(
  mimeType?: string | null,
  fileName?: string | null,
  uri?: string | null,
): boolean {
  const dataMime = typeof uri === 'string' ? /^data:([^;,]+)/i.exec(uri)?.[1] : undefined;
  const mime = (mimeType || dataMime || '').toLowerCase().trim();
  if (mime) {
    if (!mime.startsWith('image/')) return false;
    return !/^image\/(gif|svg\+xml|apng)$/.test(mime);
  }
  const name = (fileName || (typeof uri === 'string' && !uri.startsWith('data:') ? uri : '') || '').split(/[?#]/)[0];
  return !/\.(gif|svg|apng|pdf)$/i.test(name);
}

/** The name a re-encoded photo should carry: the original name with its extension swapped for .jpg. */
export function resizedFileName(fileName?: string | null): string | undefined {
  const name = (fileName ?? '').trim();
  if (!name) return undefined;
  return `${name.replace(/\.[^./\\]+$/, '')}.jpg`;
}
