import { Platform } from 'react-native';
import { Resource } from '@/api/types';
import { getCourseLectureNotes, generatePrintableNoteHtml } from '@/data/courseNotesRepository';
import { isSafeHttpUrl } from '@/utils/safeUrl';

export interface DownloadResourceResult {
  success: boolean;
  filename: string;
  isNoteHtml: boolean;
  error?: string;
}

/**
 * Downloads either an external PDF resource or compiles and downloads
 * the complete, verified multi-module lecture notes as a standalone printable HTML/PDF document.
 */
export async function downloadResourceFile(resource: Resource): Promise<DownloadResourceResult> {
  const isDirectPdf =
    !!resource.fileUrl &&
    isSafeHttpUrl(resource.fileUrl) &&
    resource.fileUrl.toLowerCase().includes('.pdf');

  const sanitizedCode = (resource.courseCode || resource.title || 'Course')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    // 1. Direct PDF Resource
    if (isDirectPdf && resource.fileUrl) {
      const filename = `${sanitizedCode}.pdf`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = resource.fileUrl;
        link.target = '_blank';
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { success: true, filename, isNoteHtml: false };
      } else {
        const { File, Paths } = await import('expo-file-system');
        const Sharing = await import('expo-sharing');
        const file = new File(Paths.cache, filename);

        await File.downloadFileAsync(resource.fileUrl, file, { idempotent: true });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Download ${resource.courseCode || resource.title}`,
            UTI: 'com.adobe.pdf',
          });
        }
        return { success: true, filename, isNoteHtml: false };
      }
    }

    // 2. Verified In-App Lecture Notes / Study Pack
    const notes = getCourseLectureNotes(resource);
    const html = generatePrintableNoteHtml(resource, notes);
    const filename = `${sanitizedCode}_Lecture_Notes.html`;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return { success: true, filename, isNoteHtml: true };
    } else {
      const { File, Paths } = await import('expo-file-system');
      const Sharing = await import('expo-sharing');

      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(html);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/html',
          dialogTitle: `Download ${notes.courseCode} Lecture Notes`,
          UTI: 'public.html',
        });
      } else {
        const { Share } = await import('react-native');
        await Share.share({
          title: `${notes.courseCode} Lecture Notes`,
          message: html,
        });
      }
      return { success: true, filename, isNoteHtml: true };
    }
  } catch (error: any) {
    return {
      success: false,
      filename: '',
      isNoteHtml: false,
      error: error?.message || 'Download failed',
    };
  }
}
