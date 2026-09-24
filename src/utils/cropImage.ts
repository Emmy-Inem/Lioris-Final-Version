import { Platform } from 'react-native';
import type { CropRect } from './cropMath';

export interface CroppedImage {
  /** JPEG bytes ready to upload. */
  bytes: ArrayBuffer;
  /** A URI the app can show straight away (blob/data URL on web, file URI on native). */
  previewUri: string;
}

const JPEG_QUALITY = 0.86;

function loadWebImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new (globalThis as any).Image() as HTMLImageElement;
    // Remote pictures (a signed cover URL) need CORS to be drawn onto a canvas and read back.
    if (!uri.startsWith('data:') && !uri.startsWith('blob:')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not open this picture. Try choosing it again.'));
    image.src = uri;
  });
}

/**
 * Cuts `rect` (in the source picture's own pixels) out of `uri` and scales it to
 * `outWidth` x `outHeight`, as a JPEG. Web draws it on a canvas; phones use expo-image-manipulator.
 */
export async function renderCrop(
  uri: string,
  rect: CropRect,
  outWidth: number,
  outHeight: number,
): Promise<CroppedImage> {
  if (Platform.OS === 'web') {
    const image = await loadWebImage(uri);
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the picture.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, rect.originX, rect.originY, rect.width, rect.height, 0, 0, outWidth, outHeight);
    const blob: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
      } catch {
        resolve(null);
      }
    });
    if (!blob) {
      throw new Error('This picture could not be read for cropping (its host does not allow it). Upload it from your device instead.');
    }
    return { bytes: await blob.arrayBuffer(), previewUri: URL.createObjectURL(blob) };
  }

  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(uri);
  context.crop({ originX: rect.originX, originY: rect.originY, width: rect.width, height: rect.height });
  context.resize({ width: outWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  const response = await fetch(saved.uri);
  return { bytes: await response.arrayBuffer(), previewUri: saved.uri };
}
