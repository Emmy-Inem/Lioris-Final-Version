import { useEffect, useState } from 'react';
import { Resource } from '@/api/types';
import { resolveMediaUrl } from '@/api/signedUrls';

/** 1536 -> "1.5 KB", 2_400_000 -> "2.3 MB". Uses KB below 1 MB so small files aren't shown as "0.0 MB". */
export function formatFileSize(bytes?: number | null): string | undefined {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return undefined;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const remoteSizeCache = new Map<string, string | null>();

/**
 * Size of a resource's file. Uses the size recorded at upload time when there is one; otherwise asks
 * the file host for its Content-Length (a HEAD request). Some hosts block that from a browser, in
 * which case this stays undefined and nothing is shown rather than a made-up number.
 */
export function useResourceFileSize(resource: Resource | null | undefined): string | undefined {
  const [size, setSize] = useState<string | undefined>(resource?.fileSize);

  useEffect(() => {
    setSize(resource?.fileSize);
    if (!resource?.fileUrl || resource.fileSize) return;
    const key = resource.fileUrl;
    if (remoteSizeCache.has(key)) {
      setSize(remoteSizeCache.get(key) ?? undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = (await resolveMediaUrl('resources', resource.fileUrl!)) || resource.fileUrl!;
        const res = await fetch(url, { method: 'HEAD' });
        const len = Number(res.headers.get('content-length'));
        const formatted = res.ok ? formatFileSize(len) : undefined;
        remoteSizeCache.set(key, formatted ?? null);
        if (!cancelled && formatted) setSize(formatted);
      } catch {
        remoteSizeCache.set(key, null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resource?.id, resource?.fileUrl, resource?.fileSize]);

  return size;
}
