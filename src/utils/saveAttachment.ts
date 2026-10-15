import { Alert, Platform } from 'react-native';
import { downloadRemoteFile, shareLocalFile } from './downloadFile';
import { openExternalUrl } from './openExternalUrl';
import { attachmentFileName, mimeTypeForFileName } from './fileNames';

/**
 * Attachments on study-group posts and chat messages used to be handed to the system browser, which
 * just displays the file. On a phone this SAVES it (Android: chosen folder, iOS: Save to Files) and
 * tells the person where it went. On the web it keeps opening in a new tab.
 */
export async function saveAttachment(url: string, storedRef: string): Promise<void> {
  if (Platform.OS === 'web') {
    await openExternalUrl(url);
    return;
  }
  const fileName = attachmentFileName(storedRef);
  const mime = mimeTypeForFileName(fileName);
  try {
    const result = await downloadRemoteFile(url, fileName, mime);
    if (result.outcome === 'shared' && Platform.OS === 'ios') {
      // the share sheet is already open; "Save to Files" is the download
    } else if (result.outcome === 'saved') {
      const uri = result.localUri;
      Alert.alert(
        'Download complete',
        `${fileName} was saved to ${result.location ?? 'your device'}.`,
        uri
          ? [{ text: 'Done', style: 'cancel' }, { text: 'Share / open in…', onPress: () => void shareLocalFile(uri, fileName, mime).catch(() => {}) }]
          : [{ text: 'OK' }],
      );
    }
  } catch (err) {
    Alert.alert('Download failed', err instanceof Error && err.message ? err.message : 'Could not download this file. Please try again.');
  }
}
