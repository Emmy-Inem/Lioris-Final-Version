import type { ExpoConfig, ConfigContext } from'expo/config';

// Values are pulled from the shell / EAS build profile environment.
// See eas.json for the per-environment variable sets and .env.example
// for local development.
const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.lioris.app';
const WS_BASE_URL = process.env.WS_BASE_URL ?? 'wss://api.lioris.app/realtime';
const APP_ENV = process.env.APP_ENV ?? 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Lioris',
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
    // Apple privacy manifest (PrivacyInfo.xcprivacy). Keep in sync with
    // docs/compliance/records-of-processing.md and the Privacy Policy.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
      NSPrivacyCollectedDataTypes: [
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypeName',
        'NSPrivacyCollectedDataTypePhotosorVideos',
        'NSPrivacyCollectedDataTypeOtherUserContent',
      ].map((type) => ({
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      })),
    },
  },
  android: {
    package: 'app.lioris.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      // Android 13+ themed icons: single-colour silhouette of the emblem, tinted by the system.
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#FFFFFF',
    },
    // Gallery access goes through the system photo picker (expo-image-picker),
    // so no broad storage/media permissions are declared here. expo-image-picker
    // itself declares READ/WRITE_EXTERNAL_STORAGE with maxSdkVersion=32, which
    // Android 13+ (and Google Play's photo/video policy) never sees. We do NOT
    // block those two globally: on Android 12 and below the app still calls
    // ImagePicker.requestMediaLibraryPermissionsAsync(), which needs them.
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE'],
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: {
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-sharing',
    'expo-image',
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
        // Transparent emblem: light splash on white (the master artwork), dark splash on brand navy.
        image: './assets/images/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
        dark: {
          image: './assets/images/splash.png',
          backgroundColor: '#0B1220',
        },
      },
    ],
  ],
  extra: {
    apiBaseUrl: API_BASE_URL,
    wsBaseUrl: WS_BASE_URL,
    appEnv: APP_ENV,
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? 'a30e59bc-4050-4706-8844-e4cb9d879c37',
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
