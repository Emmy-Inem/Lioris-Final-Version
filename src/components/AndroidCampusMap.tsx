/**
 * Web and iOS never render this: CampusMapModal only uses it on Android, and the real
 * implementation lives in AndroidCampusMap.android.tsx so react-native-webview is only
 * bundled for Android.
 */
export function AndroidCampusMap(_props: { embedUrl: string }): null {
  return null;
}
