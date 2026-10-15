import { supabase } from './supabase';
import { storagePathFor } from './signedUrls';
import { getOwnProfileRow } from './profile';
import { isSafeHttpUrl } from '../utils/safeUrl';
import { mimeTypeForFileName, safeFileName } from '../utils/fileNames';

export type ResourceFileErrorCode = 'sign_in_required' | 'no_file' | 'unavailable' | 'locked' | 'permission_off' | 'network';

/** A reason the person can act on - never "something went wrong". */
export class ResourceFileError extends Error {
  readonly code: ResourceFileErrorCode;
  constructor(code: ResourceFileErrorCode, message: string) {
    super(message);
    this.name = 'ResourceFileError';
    this.code = code;
  }
}

export interface PreparedDownload {
  /** Short-lived signed URL carrying Content-Disposition: attachment (or an external link). */
  url: string;
  fileName: string;
  mimeType?: string;
  /** True when `url` is an external https link that was not signed (e.g. a university-hosted file). */
  external: boolean;
}

/** Signed download links live 5 minutes: they are handed straight to the browser / downloader. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

function extensionOf(pathOrUrl: string): string {
  const clean = pathOrUrl.split('?')[0].split('#')[0];
  const match = /\.([A-Za-z0-9]{2,5})$/.exec(clean);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Turns a resource into something a downloader can fetch RIGHT NOW.
 *
 * Files in the private `resources` bucket get a signed URL minted with `download: <title>.<ext>`, so
 * the saved file is named after the material instead of `uid/resources_Intro_1730...pdf`. Storage
 * answers "Object not found" for both a missing file AND one the caller's role may not read (row
 * level security hides it), so the failure is classified with what we know about the account.
 */
export async function prepareResourceDownload(resource: { title: string; fileUrl?: string | null }): Promise<PreparedDownload> {
  const stored = resource.fileUrl?.trim();
  if (!stored) {
    throw new ResourceFileError('no_file', 'The person who shared this did not attach a file, so there is nothing to download.');
  }

  const path = storagePathFor('resources', stored);
  const ext = extensionOf(path ?? stored);
  const fileName = safeFileName(resource.title, ext);

  if (!path) {
    // Not one of our storage objects: an external link the uploader pasted.
    if (!isSafeHttpUrl(stored)) {
      throw new ResourceFileError('unavailable', 'This resource has an invalid file link.');
    }
    return { url: stored, fileName, mimeType: mimeTypeForFileName(fileName), external: true };
  }

  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } as any }));
  if (!sessionData?.session) {
    throw new ResourceFileError('sign_in_required', 'Sign in to download course materials.');
  }

  let signed: { signedUrl?: string } | null = null;
  let signError: { message?: string; statusCode?: string | number } | null = null;
  try {
    const res = await supabase.storage.from('resources').createSignedUrl(path, DOWNLOAD_URL_TTL_SECONDS, { download: fileName });
    signed = res.data;
    signError = res.error as any;
  } catch (err: any) {
    throw new ResourceFileError('network', 'Could not reach the server. Check your connection and try again.');
  }

  if (signed?.signedUrl) {
    return { url: signed.signedUrl, fileName, mimeType: mimeTypeForFileName(fileName), external: false };
  }

  const message = (signError?.message ?? '').toLowerCase();
  if (/fetch|network|timeout|offline/.test(message)) {
    throw new ResourceFileError('network', 'Could not reach the server. Check your connection and try again.');
  }

  // "Object not found" = missing OR hidden by RLS. Work out which explanation fits this account.
  const me = await getOwnProfileRow().catch(() => null);
  const role = String(me?.role ?? '');
  const privileged = role === 'admin' || role === 'staff';
  if (me && !privileged && me.verification_status !== 'verified') {
    throw new ResourceFileError(
      'locked',
      'Campus course materials unlock once your student status is verified. Verify from your profile to download this file.',
    );
  }
  throw new ResourceFileError(
    'unavailable',
    'This file could not be opened. It may have been removed by the uploader or a moderator, or downloads may be switched off for your account.',
  );
}
