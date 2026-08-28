import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { FALL_BACK_TO_MOCKS } from './config';

/**
 * Runtime-controllable version of FALL_BACK_TO_MOCKS.
 *
 * FALL_BACK_TO_MOCKS (config.ts) only decides the *default* for a build
 * (on outside of production). This module is the live, toggleable switch
 * behind Settings -> Super Admin Config -> "Mock Data Visibility & Setup":
 * every src/api/*.ts module that mixes seed fixtures into real results
 * reads isMockDataVisible() at call time, so flipping the toggle takes
 * effect immediately, without restarting the app.
 *
 * When this is OFF, no module should show mockData.ts fixtures for any
 * reason - not as a permanent blend-in, and not as an error fallback.
 */

const STORAGE_KEY = 'lioris.mockDataVisible';
const isWeb = Platform.OS === 'web';

function webGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // best effort only
  }
}

let mockDataVisible = FALL_BACK_TO_MOCKS;
let hydrated = false;
const listeners = new Set<(visible: boolean) => void>();

/** Synchronous read used by every api module - safe to call before hydration finishes. */
export function isMockDataVisible(): boolean {
  return mockDataVisible;
}

/** Call once (e.g. app root) to restore the admin's saved preference. Safe to call more than once. */
export async function hydrateMockDataVisibility(): Promise<boolean> {
  if (hydrated) return mockDataVisible;
  hydrated = true;
  try {
    const stored = isWeb ? webGet(STORAGE_KEY) : await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') {
      mockDataVisible = stored === 'true';
      listeners.forEach((l) => l(mockDataVisible));
    }
  } catch {
    // keep the build default
  }
  return mockDataVisible;
}

export async function setMockDataVisible(value: boolean): Promise<void> {
  mockDataVisible = value;
  listeners.forEach((l) => l(value));
  try {
    if (isWeb) {
      webSet(STORAGE_KEY, value ? 'true' : 'false');
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, value ? 'true' : 'false');
    }
  } catch {
    // best effort - toggle still works for the rest of this session
  }
}

/** Lets React components (the admin toggle) stay in sync if the value changes elsewhere. */
export function subscribeMockDataVisible(callback: (visible: boolean) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * For components that render hardcoded/fixture-style content directly in JSX
 * (not behind a React Query fetch, so queryClient.invalidateQueries() alone
 * won't make them re-render). This subscribes to the toggle so flipping
 * Settings -> Super Admin Config -> "Mock Data Visibility" hides that content
 * immediately, the same way it does for API-backed screens.
 */
export function useMockDataVisible(): boolean {
  const [visible, setVisible] = useState(isMockDataVisible());
  useEffect(() => subscribeMockDataVisible(setVisible), []);
  return visible;
}
