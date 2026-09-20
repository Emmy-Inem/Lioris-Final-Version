import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Lets the user choose one photo. Returns a URI (a data URL on web), or null when they cancel or
 * decline the permission prompt.
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
        reader.onload = (ev) => resolve((ev.target?.result as string) || null);
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
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
}
