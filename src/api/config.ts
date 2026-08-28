import Constants from'expo-constants';

const { appEnv } = (Constants.expoConfig?.extra ?? {}) as { appEnv?: string };

/**
 * Until the backend services in PRD Section 12.3 exist, every domain
 * module in src/api/ falls back to the fixtures in mockData.ts on
 * request failure - so screens render real content immediately.
 *
 * Flip this to false once API_BASE_URL points at a live backend and
 * you want failures to surface instead of silently falling back.
 */
export const FALL_BACK_TO_MOCKS = appEnv !== 'production';

/**
 * True for any non-production build. Used to hard-gate dev/demo-only
 * affordances - most importantly the Settings "Role Switcher" and the
 * desktop top-bar "View: <ROLE>" dropdown, which let anyone impersonate
 * Root Admin/Staff/Alumni without real authentication. Both the UI that
 * renders those controls and AuthContext.switchRole itself check this,
 * so the feature is gone (not just hidden) once appEnv is 'production'.
 */
export const IS_DEV_BUILD = appEnv !== 'production';
