import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { computeResizeSize, computeResizeWidth, MAX_UPLOAD_IMAGE_WIDTH, UPLOAD_JPEG_QUALITY } from './imageResize';

/**
 * Shrinks a picked photo to at most `maxWidth` px wide (JPEG, quality 0.8) before it is uploaded: a phone photo is
 * 4000+ px and several MB, and every viewer then downloads that. Pictures that are already small are returned
 * untouched, and any failure returns the original URI (never blocks an upload). `width` is the picture's known
 * width when the picker reported one.
 */
export async function resizeImageForUpload(
  uri: string,
  width?: number | null,
  maxWidth: number = MAX_UPLOAD_IMAGE_WIDTH,
): Promise<string> {
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const image: HTMLImageElement = await new Promise((resolve, reject) => {
        const img = new (globalThis as any).Image() as HTMLImageElement;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = uri;
      });
      const size = computeResizeSize(image.naturalWidth, image.naturalHeight, maxWidth);
      if (!size) return uri;
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return uri;
      context.imageSmoothingQuality = 'high';
      // JPEG has no transparency: paint white first so a transparent PNG does not turn black.
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      return canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY);
    }

    const target = computeResizeWidth(width, maxWidth);
    if (target === null) return uri;
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: target });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD_JPEG_QUALITY });
    return saved.uri || uri;
  } catch {
    return uri;
  }
}

/**
 * Lets the user choose one photo. Returns a URI (a data URL on web), or null when they cancel or
 * decline the permission prompt. A denied permission also surfaces an Alert pointing the user at
 * device Settings, so declining doesn't look like a silent no-op to every caller of this util.
 */
export async function pickImageFromLibrary(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = (ev.target?.result as string) || null;
          if (!dataUrl) return resolve(null);
          void resizeImageForUpload(dataUrl).then(resolve);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      // The picker gives no event when it is dismissed; `cancel` covers modern browsers.
      input.oncancel = () => {
        document.body.removeChild(input);
        resolve(null);
      };
      input.click();
    });
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Photo Access Needed',
      'Lioris needs permission to access your photos to do this. Please enable photo access for this app in your device Settings.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
      ],
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  const asset = !result.canceled ? result.assets[0] : undefined;
  return asset ? resizeImageForUpload(asset.uri, asset.width) : null;
}
