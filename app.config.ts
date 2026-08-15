import type { ExpoConfig, ConfigContext } from'expo/config';

// Values are pulled from the shell / EAS build profile environment.
// See eas.json for the per-environment variable sets and .env.example
// for local development.
const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.dev.lioris.app';
const WS_BASE_URL = process.env.WS_BASE_URL ?? 'wss://api.dev.lioris.app/realtime';
const APP_ENV = process.env.APP_ENV ?? 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_ENV === 'production' ? 'Lioris' : `Lioris (${APP_ENV})`,
  slug: 'lioris',
  scheme: 'lioris',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic', // supports Light + Dark mode, per PRD section 8 (Themes)
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.lioris.mobile',
    buildNumber: '1',
    infoPlist: {
      NSCameraUsageDescription:
        'Lioris uses your camera to take a profile photo and scan event check-in passes.',
      NSPhotoLibraryUsageDescription:
        'Lioris uses your photo library so you can choose a profile photo and upload study documents.',
      NSPhotoLibraryAddUsageDescription:
        'Lioris saves downloaded study guides, past questions, and event passes to your photo library.',
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'app.lioris.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#0B1220',
    },
    permissions: [
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
  },
  web: {
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-image-picker',
      {
        photosPermission: 'The app accesses your photos so you can share course materials and avatar pictures.',
        cameraPermission: 'The app accesses your camera so you can take a profile photo.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#6D28D9',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0B1220',
      },
    ],
  ],
  extra: {
    apiBaseUrl: API_BASE_URL,
    wsBaseUrl: WS_BASE_URL,
    appEnv: APP_ENV,
    eas: {
      projectId: 'REPLACE_WITH_EAS_PROJECT_ID',
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
