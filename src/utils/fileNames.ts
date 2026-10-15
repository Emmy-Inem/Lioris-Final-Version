// Pure helpers for naming and typing downloaded files. No React Native imports, so they are unit-testable.

/** "Intro to CSC 301 (notes).pdf" -> "Intro_to_CSC_301_notes.pdf". Keeps the extension, never returns an empty name. */
export function safeFileName(title: string, extension: string, fallback = 'lioris-file'): string {
  const base = (title || '')
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[^A-Za-z0-9._ -]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 80);
  const ext = (extension || '').replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${base || fallback}${ext ? `.${ext}` : ''}`;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** MIME type for a file name, from its extension (undefined when unknown). */
export function mimeTypeForFileName(name: string): string | undefined {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXTENSION[ext];
}

export type ResourceFileKind = 'PDF' | 'ZIP' | 'DOC' | 'PPT' | 'XLS' | 'TXT' | 'IMG';

/** Label for a file chip. Everything used to read "PDF" unless it was a zip. */
export function resourceFileTypeFromMime(mime?: string | null, url?: string | null): ResourceFileKind {
  const m = (mime || '').toLowerCase();
  const u = (url || '').toLowerCase().split('?')[0];
  if (m.includes('zip') || u.endsWith('.zip')) return 'ZIP';
  if (m.includes('wordprocessingml') || m.includes('msword') || /\.docx?$/.test(u)) return 'DOC';
  if (m.includes('presentationml') || m.includes('powerpoint') || /\.pptx?$/.test(u)) return 'PPT';
  if (m.includes('spreadsheetml') || m.includes('ms-excel') || /\.xlsx?$/.test(u)) return 'XLS';
  if (m.startsWith('image/') || /\.(png|jpe?g)$/.test(u)) return 'IMG';
  if (m === 'text/plain' || u.endsWith('.txt')) return 'TXT';
  return 'PDF';
}
