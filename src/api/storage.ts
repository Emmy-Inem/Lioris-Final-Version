import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';

export async function uploadMediaFile(
  bucket: 'resources' | 'avatars' | 'verifications' | 'campus-media',
  fileUriOrBlob: string | Blob,
  folder = 'media',
  customFileName?: string
): Promise<string> {
  // If it's already a full remote public URL, return as-is
  if (typeof fileUriOrBlob === 'string' && (fileUriOrBlob.startsWith('http://') || fileUriOrBlob.startsWith('https://'))) {
    return fileUriOrBlob;
  }

  const { data: authData } = await supabase.auth.getUser();
  let userId = authData?.user?.id;
  if (!userId) {
    const sessionUser = await getSessionUser();
    userId = sessionUser?.id || 'community';
  }

  let blob: Blob;
  let ext = 'jpg';
  let mimeType = 'image/jpeg';

  if (typeof fileUriOrBlob === 'string') {
    const response = await fetch(fileUriOrBlob);
    blob = await response.blob();
  } else {
    blob = fileUriOrBlob;
  }

  if (blob.type) {
    mimeType = blob.type;
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('mp4') || mimeType.includes('video')) ext = 'mp4';
    else if (mimeType.includes('pdf')) ext = 'pdf';
    else if (mimeType.includes('zip') || mimeType.includes('compressed')) ext = 'zip';
    else if (mimeType.includes('word') || mimeType.includes('document')) ext = 'docx';
    else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) ext = 'pptx';
  }

  const fileName = customFileName || `${folder}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const filePath = `${userId}/${fileName}`;

  try {
    const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      console.warn(`[Storage] Upload to "${bucket}" bucket warning:`, error.message);
    }
  } catch (err: any) {
    console.warn(`[Storage] Upload exception to "${bucket}":`, err?.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data?.publicUrl || `https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/${bucket}/${filePath}`;
}
