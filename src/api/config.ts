import Constants from 'expo-constants';

const { appEnv } = (Constants.expoConfig?.extra ?? {}) as { appEnv?: string };

/**
 * Ensures all screens render populated data and interactive fixtures immediately
 * on Vercel and local web builds until dedicated backend microservices are connected.
 */
export const FALL_BACK_TO_MOCKS = true;

/**
 * Enables role switcher, demo accounts, and preview controls across all builds.
 */
export const IS_DEV_BUILD = true;
