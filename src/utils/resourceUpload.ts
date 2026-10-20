// Pure helpers for choosing the content type / label of a resource upload. No React Native imports,
// so they are unit-testable. The allow-list mirrors ALLOWED_RESOURCE_MIME_TYPES in src/api/resources.ts.

export type ResourceUploadKind = 'PDF' | 'ZIP' | 'DOC' | 'PPT' | 'XLS' | 'TXT' | 'IMG';

export const RESOURCE_PICKER_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
];

/** Value for an <input type="file" accept>. */
export const RESOURCE_WEB_ACCEPT = '.pdf,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg';

const KIND_BY_EXTENSION: Record<string, { kind: ResourceUploadKind; mime: string }> = {
  pdf: { kind: 'PDF', mime: 'application/pdf' },
  zip: { kind: 'ZIP', mime: 'application/zip' },
  doc: { kind: 'DOC', mime: 'application/msword' },
  docx: { kind: 'DOC', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ppt: { kind: 'PPT', mime: 'application/vnd.ms-powerpoint' },
  pptx: { kind: 'PPT', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  xls: { kind: 'XLS', mime: 'application/vnd.ms-excel' },
  xlsx: { kind: 'XLS', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  txt: { kind: 'TXT', mime: 'text/plain' },
  png: { kind: 'IMG', mime: 'image/png' },
  jpg: { kind: 'IMG', mime: 'image/jpeg' },
  jpeg: { kind: 'IMG', mime: 'image/jpeg' },
};

function kindOfMime(mime: string): ResourceUploadKind | null {
  if (mime.includes('zip')) return 'ZIP';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'DOC';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'PPT';
  if (mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'XLS';
  if (mime.startsWith('image/')) return 'IMG';
  if (mime === 'text/plain') return 'TXT';
  if (mime === 'application/pdf') return 'PDF';
  return null;
}

/**
 * Works out the stored content type and the label for a picked file from its extension (the extension
 * is authoritative: pickers often report application/octet-stream). Returns null when the file is not
 * one of the supported types, so the caller can refuse it instead of storing it under a wrong type.
 */
export function resolveResourceUpload(
  name: string,
  mimeType?: string | null,
): { fileType: ResourceUploadKind; mimeType: string } | null {
  const ext = (name || '').toLowerCase().split('.').pop() ?? '';
  const hit = KIND_BY_EXTENSION[ext];
  if (!hit) return null;
  const reported = (mimeType || '').toLowerCase();
  // Keep the reported type only when it is allow-listed and agrees with the extension's kind.
  const agrees = RESOURCE_PICKER_MIME_TYPES.includes(reported) && hit.kind === kindOfMime(reported);
  return { fileType: hit.kind, mimeType: agrees ? reported : hit.mime };
}
