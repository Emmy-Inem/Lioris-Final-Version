import { supabase } from './supabase';
import { isLocalMediaUri, isSafeHttpUrl } from '../utils/safeUrl';
import { getFriendlyErrorMessage } from '../utils/errors';

type Bucket = 'resources' | 'avatars' | 'verifications' | 'campus-media';

/**
 * Buckets whose objects are NOT world-readable. Uploads to these return the
 * storage PATH; a URL is minted per read via ./signedUrls. `avatars` is
 * deliberately absent - it stays public.
 */
const PRIVATE_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>(['resources', 'campus-media', 'verifications']);

const BUCKET_LIMITS: Record<string, { maxSize: number; label: string }> = {
 resources: { maxSize: 50 * 1024 * 1024, label: '50MB' },
 avatars: { maxSize: 5 * 1024 * 1024, label: '5MB' },
 'campus-media': { maxSize: 25 * 1024 * 1024, label: '25MB' },
 verifications: { maxSize: 10 * 1024 * 1024, label: '10MB' },
};

// mime type -> file extension. The extension (and the stored contentType) is
// always derived from this table, never from the file name / URI the user gave.
const MIME_EXTENSIONS: Record<string, string> = {
 'image/jpeg': 'jpg',
 'image/jpg': 'jpg',
 'image/png': 'png',
 'image/webp': 'webp',
 'image/gif': 'gif',
 'video/mp4': 'mp4',
 'video/quicktime': 'mov',
 'application/pdf': 'pdf',
 'application/zip': 'zip',
 'application/x-zip-compressed': 'zip',
 'application/msword': 'doc',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
 'application/vnd.ms-powerpoint': 'ppt',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
 'text/plain': 'txt',
};

const EXTENSION_MIMES: Record<string, string> = {
 jpg: 'image/jpeg',
 jpeg: 'image/jpeg',
 png: 'image/png',
 webp: 'image/webp',
 gif: 'image/gif',
 mp4: 'video/mp4',
 mov: 'video/quicktime',
 pdf: 'application/pdf',
 zip: 'application/zip',
 doc: 'application/msword',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 ppt: 'application/vnd.ms-powerpoint',
 pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 txt: 'text/plain',
};

const IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

const BUCKET_ALLOWED_MIMES: Record<Bucket, string[]> = {
 avatars: IMAGE_MIMES,
 'campus-media': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
 resources: [
 ...IMAGE_MIMES,
 'application/pdf',
 'application/zip',
 'application/x-zip-compressed',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-powerpoint',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain',
 ],
 verifications: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
};

function randomToken(bytes = 8): string {
 const c = (globalThis as any).crypto as Crypto | undefined;
 if (c && typeof c.getRandomValues === 'function') {
 return Array.from(c.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
 }
 // Only reached on runtimes without Web Crypto; the name is not a secret, it only needs to be unique.
 return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeSegment(value: string, fallback: string): string {
 const cleaned = value
 .replace(/\.[^./\\]*$/, '') // drop any user-supplied extension
 .replace(/[^A-Za-z0-9_-]+/g, '_')
 .replace(/^_+|_+$/g, '')
 .slice(0, 40);
 return cleaned || fallback;
}

function mimeFromUri(uri: string): string | undefined {
 const match = /\.([A-Za-z0-9]{2,5})(?:[?#].*)?$/.exec(uri);
 return match ? EXTENSION_MIMES[match[1].toLowerCase()] : undefined;
}

/**
 * Uploads a file to Supabase Storage under `${auth.uid}/...`.
 *
 * What comes back depends on whether the bucket is public:
 *  - `avatars` is PUBLIC - returns a public URL, as before. A profile picture
 *    is not campus-private, and signing one per row in every list would be a
 *    real performance cost for no security gain.
 *  - `resources`, `campus-media` and `verifications` are PRIVATE - returns the
 *    storage PATH. Callers must store the PATH (never a signed URL: it
 *    expires) and mint a URL on demand with `resolveMediaUrl` / `useSignedUrl`
 *    from ./signedUrls.
 *
 * `resources` and `campus-media` were public buckets behind a storage policy
 * of `USING (bucket_id IN (...))` - i.e. readable with no credentials at all.
 * See src/api/signedUrls.ts for what that exposed and why this changed.
 *
 * Throws when the user is not signed in, the file type/size is not allowed for
 * the bucket, or the upload fails.
 */
export async function uploadMediaFile(
 bucket: Bucket,
 fileUriOrBlob: string | Blob,
 folder = 'media',
 customFileName?: string
): Promise<string> {
 // An already-hosted remote URL is returned as-is (never for the private bucket).
 if (typeof fileUriOrBlob === 'string' && /^https?:\/\//i.test(fileUriOrBlob)) {
 if (bucket === 'verifications') {
 throw new Error('Verification documents must be uploaded as files.');
 }
 if (!isSafeHttpUrl(fileUriOrBlob)) {
 throw new Error('That link is not a valid http(s) URL.');
 }
 return fileUriOrBlob.trim();
 }

 const { data: authData } = await supabase.auth.getUser();
 const userId = authData?.user?.id;
 if (!userId) {
 throw new Error('You must be signed in to upload files.');
 }

 let blob: Blob;
 if (typeof fileUriOrBlob === 'string') {
 const response = await fetch(fileUriOrBlob);
 if (!response.ok) throw new Error('Could not read the selected file.');
 blob = await response.blob();
 } else {
 blob = fileUriOrBlob;
 }

 // Enforce client-side file size limits before uploading
 const limit = BUCKET_LIMITS[bucket];
 if (limit && blob.size > limit.maxSize) {
 throw new Error(`File size (${(blob.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of ${limit.label} for ${bucket}.`);
 }

 // Resolve and validate the mime type against this bucket's allow-list.
 let mimeType = (blob.type || '').toLowerCase().split(';')[0].trim();
 if (!mimeType && typeof fileUriOrBlob === 'string') {
 mimeType = mimeFromUri(fileUriOrBlob) ?? '';
 }
 if (!mimeType || !BUCKET_ALLOWED_MIMES[bucket].includes(mimeType)) {
 throw new Error(`This file type is not allowed for ${bucket} uploads.`);
 }
 const ext = MIME_EXTENSIONS[mimeType];
 if (!ext) {
 throw new Error(`This file type is not allowed for ${bucket} uploads.`);
 }

 const folderSegment = sanitizeSegment(folder, 'media');
 const namePart = customFileName ? `${folderSegment}_${sanitizeSegment(customFileName, 'file')}` : folderSegment;
 const fileName = `${namePart}_${Date.now()}_${randomToken()}.${ext}`;
 // Always under the caller's own uid folder (storage RLS is scoped to it).
 const filePath = `${userId}/${fileName}`;

 const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
 contentType: mimeType,
 upsert: false,
 });
 if (error) {
 console.warn(`[Storage] Upload to "${bucket}" bucket failed:`, error.message);
 throw new Error(getFriendlyErrorMessage(error, 'File upload failed. Please try again.'));
 }

 // Private buckets: hand back the path, never a URL. Only `avatars` is public.
 if (PRIVATE_BUCKETS.has(bucket)) {
 return filePath;
 }

 const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
 if (!data?.publicUrl) {
 throw new Error('Upload succeeded but the file address could not be resolved.');
 }
 return data.publicUrl;
}

/**
 * Normalises a user-supplied media reference into a value that is safe to
 * STORE in a row:
 * - safe http(s) URLs (an externally hosted image someone pasted) are kept as-is;
 * - `asset:` references are kept only when `allowAsset` is set;
 * - on-device URIs (file://, content://, blob:, data:image...) are uploaded to
 *   storage and the storage PATH is returned for the private buckets;
 * - anything else (javascript:, data:text/html, ...) throws.
 * Upload failures throw - callers must not fall back to the raw local URI.
 *
 * Named `persistMediaReference`, not `resolveMediaUrl`, because the value it
 * returns is what goes INTO the database. Turning that stored value back into
 * something renderable is `resolveMediaUrl` in ./signedUrls.
 */
export async function persistMediaReference(
 value: string,
 folder: string,
 options: { bucket?: Bucket; allowAsset?: boolean } = {}
): Promise<string> {
 const trimmed = value.trim();
 if (/^https?:\/\//i.test(trimmed)) {
 if (!isSafeHttpUrl(trimmed)) throw new Error('That media link is not a valid http(s) URL.');
 return trimmed;
 }
 if (options.allowAsset && /^asset:/i.test(trimmed)) return trimmed;
 if (isLocalMediaUri(trimmed)) {
 return uploadMediaFile(options.bucket ?? 'campus-media', trimmed, folder);
 }
 throw new Error('Unsupported media link. Please choose a photo or video from your device.');
}

/**
 * Backwards-compatibility alias for `persistMediaReference`.
 * @deprecated Use `persistMediaReference` from `./storage` when saving, or `resolveMediaUrl` from `./signedUrls` when reading.
 */
export const resolveMediaUrl = persistMediaReference;
