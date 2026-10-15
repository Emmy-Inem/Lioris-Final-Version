import { Linking, Platform } from 'react-native';
import { isSafeHttpUrl } from './safeUrl';
import { mimeTypeForFileName } from './fileNames';

export { safeFileName, mimeTypeForFileName } from './fileNames';

export type DownloadOutcome =
  /** Web: the browser was handed a "save as" download. */
  | 'downloaded'
  /** Native: the file was written to the device and the share / save sheet was shown. */
  | 'shared'
  /** Native fallback: no share sheet available, the file was handed to the system browser. */
  | 'opened';

/**
 * Really downloads a file.
 *
 * Web: a hidden <a download> click. The URL is expected to be a signed storage URL minted with
 * `{ download: <filename> }`, so the response carries `Content-Disposition: attachment` and the
 * browser saves it WITHOUT navigating away. This replaces `window.open(url, '_blank')` which (a)
 * is blocked by popup blockers on iOS Safari and Android Chrome once an `await` has separated it
 * from the tap, and (b) reported success whether or not anything happened.
 *
 * Native: the bytes are downloaded into the app's cache, then the system share sheet is opened so
 * the person can save to Files / Downloads / Drive or open the file in a reader. Falls back to
 * opening the URL in the browser only when the share sheet is unavailable.
 *
 * Throws when the transfer itself fails, so callers never claim a download that did not happen.
 */
export async function downloadRemoteFile(url: string, fileName: string, mimeType?: string): Promise<DownloadOutcome> {
  if (!isSafeHttpUrl(url)) throw new Error('That file link is not valid.');

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }
    return 'downloaded';
  }

  const type = mimeType ?? mimeTypeForFileName(fileName);
  try {
    const { File, Paths } = await import('expo-file-system');
    const target = new File(Paths.cache, fileName);
    if (target.exists) target.delete();
    const saved = await File.downloadFileAsync(url, target);

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(saved.uri, { mimeType: type, dialogTitle: fileName });
      return 'shared';
    }
  } catch (err) {
    // A real transfer / storage failure is reported; only "cannot share" falls through to the browser.
    if (err instanceof Error && /network|timeout|offline|ENOTFOUND|connect/i.test(err.message)) {
      throw new Error('The download was interrupted. Check your connection and try again.');
    }
    throw new Error('We could not save this file to your device. Free up some space and try again.');
  }

  await Linking.openURL(url);
  return 'opened';
}
