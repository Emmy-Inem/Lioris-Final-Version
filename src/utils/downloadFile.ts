import { Linking, Platform } from 'react-native';
import { isSafeHttpUrl } from './safeUrl';
import { mimeTypeForFileName } from './fileNames';

export { safeFileName, mimeTypeForFileName } from './fileNames';

export type DownloadOutcome =
  /** Web: the browser was handed a "save as" download. */
  | 'downloaded'
  /** Native: the file was saved on the device (Android: the folder the person chose). */
  | 'saved'
  /** Native: the file was written to the device and the share / save sheet was shown. */
  | 'shared'
  /** Native fallback: no share sheet available, the file was handed to the system browser. */
  | 'opened';

export interface DownloadResult {
  outcome: DownloadOutcome;
  /** Native, `saved` / `shared`: the local file, so a caller can offer "Share" afterwards. */
  localUri?: string;
  /** Human-readable place the file now lives. */
  location?: string;
}

const ANDROID_DIR_KEY = 'lioris_download_dir_v1';

async function readSetting(key: string): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store');
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // remembering the folder is a convenience only
  }
}

/** Opens the system share / "save to Files" sheet for a file that is already on the device. */
export async function shareLocalFile(uri: string, fileName: string, mimeType?: string): Promise<boolean> {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: mimeType ?? mimeTypeForFileName(fileName), dialogTitle: fileName });
  return true;
}

/**
 * Really downloads a file.
 *
 * Web: a hidden <a download> click. The URL is expected to be a signed storage URL minted with
 * `{ download: <filename> }`, so the response carries `Content-Disposition: attachment` and the
 * browser saves it WITHOUT navigating away. This replaces `window.open(url, '_blank')` which (a)
 * is blocked by popup blockers on iOS Safari and Android Chrome once an `await` has separated it
 * from the tap, and (b) reported success whether or not anything happened.
 *
 * Native: the bytes are downloaded into the app's cache and then SAVED, not opened:
 *   - Android: into a folder the person picks once (e.g. Downloads) with the system folder picker; it is
 *     remembered. If they dismiss the picker, the share sheet is shown instead.
 *   - iOS: the system sheet with "Save to Files" (iOS apps cannot write to a shared Downloads folder).
 * Falls back to the share sheet, then to the browser, only when saving is not possible.
 *
 * Throws when the transfer itself fails, so callers never claim a download that did not happen.
 */
export async function downloadRemoteFile(url: string, fileName: string, mimeType?: string): Promise<DownloadResult> {
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
    return { outcome: 'downloaded' };
  }

  const type = mimeType ?? mimeTypeForFileName(fileName);
  try {
    const { File, Directory, Paths } = await import('expo-file-system');
    const cached = new File(Paths.cache, fileName);
    if (cached.exists) cached.delete();
    const saved = await File.downloadFileAsync(url, cached);

    if (Platform.OS === 'android') {
      const bytes = await saved.bytes();
      const writeInto = (dir: InstanceType<typeof Directory>) => {
        const out = dir.createFile(fileName, type ?? null);
        out.write(bytes);
      };
      let done = false;
      const remembered = await readSetting(ANDROID_DIR_KEY);
      if (remembered) {
        try {
          writeInto(new Directory(remembered));
          done = true;
        } catch {
          await writeSetting(ANDROID_DIR_KEY, null); // permission revoked or folder deleted: ask again
        }
      }
      if (!done) {
        try {
          const dir = await Directory.pickDirectoryAsync();
          writeInto(dir);
          await writeSetting(ANDROID_DIR_KEY, dir.uri);
          done = true;
        } catch {
          // picker dismissed or the folder is not writable: fall through to the share sheet
        }
      }
      if (done) return { outcome: 'saved', localUri: saved.uri, location: 'the folder you chose' };
    }
    // iOS has no public "Downloads" folder an app may write to without a native config change (a store
    // release). The share sheet's "Save to Files" is the platform's real download. To save straight into
    // Files > On My iPhone > Lioris instead, add UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace
    // to ios.infoPlist in the next native release and write the file into Paths.document.

    if (await shareLocalFile(saved.uri, fileName, type)) return { outcome: 'shared', localUri: saved.uri };
  } catch (err) {
    // A real transfer / storage failure is reported; only "cannot save / share" falls through to the browser.
    if (err instanceof Error && /network|timeout|offline|ENOTFOUND|connect/i.test(err.message)) {
      throw new Error('The download was interrupted. Check your connection and try again.');
    }
    throw new Error('We could not save this file to your device. Free up some space and try again.');
  }

  await Linking.openURL(url);
  return { outcome: 'opened' };
}
