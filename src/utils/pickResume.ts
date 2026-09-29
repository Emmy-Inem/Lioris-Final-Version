import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface PickedResume {
  name: string;
  /** Web: the picked Blob directly. Native: a local file:// URI, uploaded via uploadMediaFile's fetch(uri) path. */
  source: string | Blob;
}

/**
 * Opens the platform document picker restricted to résumé-shaped files
 * (PDF/DOC/DOCX, matching the `resumes` storage bucket's allowed_mime_types).
 * Returns null if the user cancelled.
 */
export async function pickResume(): Promise<PickedResume | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        resolve(file ? { name: file.name, source: file } : null);
      };
      // No native "cancel" event on <input type=file>; the caller's modal stays open, which is fine.
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: RESUME_MIME_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { name: asset.name, source: asset.uri };
}
