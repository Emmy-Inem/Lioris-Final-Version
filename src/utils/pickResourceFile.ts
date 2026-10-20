import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getStorageQuotas } from '@/api/platformSettings';
import { RESOURCE_PICKER_MIME_TYPES, RESOURCE_WEB_ACCEPT, resolveResourceUpload, ResourceUploadKind } from './resourceUpload';

export interface PickedResourceFile {
  name: string;
  size?: number;
  mimeType: string;
  fileType: ResourceUploadKind;
  blob: Blob;
}

/** Throws a user-facing Error when the file is unsupported, unreadable or over the admin-configured quota. */
async function validate(name: string, size: number | undefined, mime: string | undefined, blob: Blob | undefined): Promise<PickedResourceFile> {
  const resolved = resolveResourceUpload(name, mime);
  if (!resolved) {
    throw new Error('That file type is not supported. Choose a PDF, Word, PowerPoint, Excel, ZIP, text file or a JPG/PNG image.');
  }
  if (!blob) throw new Error('We could not read the selected file. Please choose it again.');
  const bytes = size || blob.size;
  if (bytes) {
    const quotas = await getStorageQuotas();
    const isImage = resolved.fileType === 'IMG';
    const limitMb = isImage ? quotas.maxImageMb : quotas.maxPdfMb;
    if (bytes > limitMb * 1024 * 1024) {
      throw new Error(`This file is too large. Maximum allowed ${isImage ? 'image' : 'document'} size is ${limitMb} MB.`);
    }
  }
  return { name, size: bytes || undefined, mimeType: resolved.mimeType, fileType: resolved.fileType, blob };
}

/**
 * Opens the platform document picker for a resource file and returns it ready for createResource()'s
 * blob argument. Resolves null when the user cancels; throws an Error with a user-facing message otherwise.
 */
export async function pickResourceFile(): Promise<PickedResourceFile | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = RESOURCE_WEB_ACCEPT;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const picked = (e.target as HTMLInputElement).files?.[0] ?? null;
        document.body.removeChild(input);
        resolve(picked);
      };
      input.click();
    });
    if (!file) return null;
    return validate(file.name, file.size, file.type, file);
  }

  const result = await DocumentPicker.getDocumentAsync({ type: RESOURCE_PICKER_MIME_TYPES, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  let blob: Blob | undefined = asset.file;
  if (!blob && asset.uri) {
    try {
      blob = await (await fetch(asset.uri)).blob();
    } catch {
      blob = undefined;
    }
  }
  return validate(asset.name, asset.size ?? blob?.size, asset.mimeType ?? blob?.type, blob);
}
