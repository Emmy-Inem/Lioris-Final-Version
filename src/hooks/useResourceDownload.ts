import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Resource } from '@/api/types';
import { trackResourceDownload } from '@/api/resources';
import { prepareResourceDownload, ResourceFileError } from '@/api/resourceFiles';
import { downloadRemoteFile } from '@/utils/downloadFile';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

/**
 * One download implementation for the resource card AND the reader. It only claims success when a
 * download was actually handed to the browser / written to the device, counts the download only
 * then, and explains every failure (sign in, verify, removed, offline) instead of a generic alert.
 */
export function useResourceDownload(resource: Pick<Resource, 'id' | 'title' | 'fileUrl'> | null | undefined) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const busy = useRef(false);

  const download = useCallback(async () => {
    if (!resource || busy.current) return;
    busy.current = true;
    setDownloading(true);
    haptics.light();
    try {
      const prepared = await prepareResourceDownload(resource);
      const outcome = await downloadRemoteFile(prepared.url, prepared.fileName, prepared.mimeType);
      setDownloaded(true);
      trackResourceDownload(resource.id).catch(() => {});
      toast.success(
        outcome === 'shared'
          ? `Choose where to save ${resource.title}.`
          : outcome === 'opened'
          ? `Opening ${resource.title}.`
          : `Downloading ${resource.title}.`,
      );
    } catch (err) {
      haptics.error();
      if (err instanceof ResourceFileError) {
        if (err.code === 'sign_in_required') {
          Alert.alert('Sign in to download', err.message, [
            { text: 'Not now', style: 'cancel' },
            { text: 'Sign in', onPress: () => router.push('/(auth)/login' as any) },
          ]);
        } else if (err.code === 'locked') {
          Alert.alert('Verify to download', err.message, [{ text: 'OK', style: 'cancel' }]);
        } else {
          Alert.alert('Download unavailable', err.message);
        }
      } else {
        Alert.alert('Download failed', err instanceof Error && err.message ? err.message : 'Could not download this file. Please try again.');
      }
    } finally {
      busy.current = false;
      setDownloading(false);
    }
  }, [resource, toast]);

  return { download, downloading, downloaded };
}
