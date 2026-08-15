import Constants from'expo-constants';

const { appEnv } = (Constants.expoConfig?.extra ?? {}) as { appEnv?: string };

/**
 * Until the backend services in PRD Section 12.3 exist, every domain
 * module in src/api/ falls back to the fixtures in mockData.ts on
 * request failure — so screens render real content immediately.
 *
 * Flip this to false once API_BASE_URL points at a live backend and
 * you want failures to surface instead of silently falling back.
 */
export const FALL_BACK_TO_MOCKS = appEnv !== 'production';
