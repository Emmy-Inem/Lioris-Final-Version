import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  parsePendingMarkers,
  withPendingMarker,
  type PendingLinkKind,
  type PendingLinkMarkers,
} from '../utils/authLinkValidation';

/**
 * "This device asked for an e-mail link" markers, written by the sign-up, resend-code, password-reset
 * and e-mail-change request functions and checked by consumeAuthLink before it turns a deep link into a
 * session. Short lived (2 hours) and stored in secure storage on native, sessionStorage on web.
 */
const MARKER_KEY = 'lioris.authLinkExpected';
const isWeb = Platform.OS === 'web';
const memory: { value: string | null } = { value: null };

async function readRaw(): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(MARKER_KEY) : memory.value;
    } catch {
      return memory.value;
    }
  }
  try {
    return (await SecureStore.getItemAsync(MARKER_KEY)) ?? memory.value;
  } catch {
    return memory.value;
  }
}

async function writeRaw(value: string | null): Promise<void> {
  memory.value = value;
  if (isWeb) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (value === null) sessionStorage.removeItem(MARKER_KEY);
      else sessionStorage.setItem(MARKER_KEY, value);
    } catch {
      // memory copy is enough for this tab
    }
    return;
  }
  try {
    if (value === null) await SecureStore.deleteItemAsync(MARKER_KEY);
    else await SecureStore.setItemAsync(MARKER_KEY, value);
  } catch {
    // memory copy keeps the current launch working
  }
}

export async function readAuthLinkMarkers(): Promise<PendingLinkMarkers> {
  return parsePendingMarkers(await readRaw());
}

/** Records that a link of this kind is now expected on this device. Never throws. */
export async function markAuthLinkExpected(kind: PendingLinkKind, opts?: { allowAccountSwitch?: boolean }): Promise<void> {
  try {
    const current = await readAuthLinkMarkers();
    await writeRaw(JSON.stringify(withPendingMarker(current, kind, Date.now(), opts)));
  } catch {
    // best effort: without a marker the link is ignored and the 6-digit code still works
  }
}

/** One use: called after a link of this kind has been accepted. */
export async function clearAuthLinkMarker(kind: PendingLinkKind): Promise<void> {
  try {
    const current = await readAuthLinkMarkers();
    delete current[kind];
    await writeRaw(Object.keys(current).length ? JSON.stringify(current) : null);
  } catch {
    // ignore
  }
}

export async function clearAllAuthLinkMarkers(): Promise<void> {
  await writeRaw(null);
}
