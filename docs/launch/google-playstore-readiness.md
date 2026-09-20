# Google Play Store Launch Readiness & Audit Runbook

Comprehensive audit, security verification, and release checklist for launching **Lioris** (`lioris.app`) on the Google Play Store.

---

## 1. App Identity & Configuration Summary

| Field | Configured Value | Status / Notes |
|---|---|---|
| **App Name** | `Lioris` | Configured in `app.config.ts` |
| **Package Name** | `lioris.app` | Configured in `app.config.ts` (`android.package`) |
| **Version Name** | `1.0.0` | Semver in `app.config.ts` |
| **Version Code** | `1` | Integer in `app.config.ts` (`android.versionCode`) |
| **Target SDK** | Android 15 (API level 35) | Expo SDK 52 default; complies with Google Play requirement (target API >= 34/35) |
| **Min SDK** | Android 6.0 (API level 23) | Expo SDK default |
| **App Category** | Education / Campus & Social | Primary: Education |
| **Orientation** | Portrait | Default portrait, responsive layout on tablets |
| **Build Format** | `.aab` (Android App Bundle) | Required by Google Play |

---

## 2. Permissions Audit & Policy Compliance

Google Play strictly regulates sensitive permissions. The Lioris Android manifest has been audited and pruned to adhere to the **Principle of Least Privilege**:

### Declared Permissions
```json
"permissions": ["CAMERA", "POST_NOTIFICATIONS", "VIBRATE"]
```

1. **`CAMERA`**:
   - **Purpose**: Allows students and staff to capture profile photos, upload study documents/notes, and scan QR codes for campus event check-in passes.
   - **Justification**: Core feature functionality (`expo-image-picker` camera mode).
2. **`POST_NOTIFICATIONS`**:
   - **Purpose**: Real-time delivery of campus announcements, emergency alerts, direct message notices, and connection/mentorship requests.
   - **Android 13+ Compliance**: The app prompts users via `Notifications.requestPermissionsAsync()` in context (after onboarding/login), not abruptly on cold start.
   - **Channels**: Configured with `'default'` (General) and `'critical'` (Emergency Alerts) Android notification channels.
3. **`VIBRATE`**:
   - **Purpose**: Tactile haptic feedback on interactions (submitting forms, error/success notifications, emergency alerts).

### Explicitly Blocked Permissions
```json
"blockedPermissions": ["android.permission.SYSTEM_ALERT_WINDOW"]
```
- **Policy Compliance**: Overlays and drawing over other apps are forbidden to prevent clickjacking and Google Play policy violations.

### Photo & Video Permissions (Google Play Photo/Video Policy)
- The app uses the **system photo picker** via `expo-image-picker`.
- It does **NOT** request broad `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, or `READ_EXTERNAL_STORAGE` on Android 13+.
- Legacy storage permissions are restricted to `maxSdkVersion=32` by Expo, keeping the app 100% compliant with Google Play's photo/video access policy.

---

## 3. Google Play Data Safety Questionnaire Guide

Google Play requires developers to disclose how user data is collected, shared, and protected. Use the following answers when completing the Data Safety form in Google Play Console:

### 1. Data Collection & Sharing Overview
- **Does your app collect or share any user data?** Yes.
- **Is all data collected by your app encrypted in transit?** Yes (all traffic is encrypted over HTTPS / TLS 1.3 and WSS).
- **Do you provide a way for users to request that their data be deleted?** Yes (in-app deletion under Settings > Privacy & Data > Delete Account, plus web deletion).

### 2. Data Types Collected
| Data Type | Collected | Shared with 3rd Parties | Purpose | Linked to User? |
|---|---|---|---|---|
| **Name** | Yes | No | App functionality, account management | Yes |
| **Email Address** | Yes | No | Account management, authentication, security alerts | Yes |
| **User IDs** | Yes | No | Account identification, database relations | Yes |
| **Photos / Videos** | Yes (Optional) | No | Profile avatars, study document uploads | Yes |
| **Messages / Posts** | Yes | No | In-app messaging, campus forum, study groups | Yes |
| **Crash Logs / Diagnostics** | Yes | No | App stability and error debugging | No (anonymized) |

### 3. Account Deletion Policy Compliance
Google Play mandates that any app that allows account creation must allow users to request account deletion both within the app and via a web URL.
- **In-App Deletion**:
  - Available at **Settings > Privacy & Data > Delete my account**.
  - Requires explicit confirmation (`DELETE`) and triggers `deleteMyAccount()` (`/functions/v1/delete-my-account`), purging personal profile, tokens, and credentials.
- **Web Deletion URL**:
  - Provide: `https://lioris-final-version.vercel.app/privacy` (or final domain `https://lioris.app/privacy`).
  - Contains instructions and contact link (`privacy@lioris.app` / Data Protection Officer).

---

## 4. Visual Assets & Store Listing Specifications

All icon and splash assets have been verified in `assets/images/`:

| Asset | File Path | Resolution / Spec |
|---|---|---|
| **App Icon (Master)** | `assets/images/icon.png` | 1024x1024 PNG (No transparency) |
| **Android Adaptive Foreground** | `assets/images/android-icon-foreground.png` | 432x432 PNG (Emblem on transparent) |
| **Android Themed Monochrome** | `assets/images/android-icon-monochrome.png` | 432x432 PNG (Single-color silhouette) |
| **Notification Status Bar Icon** | `assets/images/notification-icon.png` | 96x96 PNG (White on transparent) |
| **Splash Screen** | `assets/images/splash.png` | Centered vector emblem (Dark/Light aware) |
| **Google Play Icon** | Store Listing upload | 512x512 PNG, 32-bit color, max 1024KB |
| **Feature Graphic** | Store Listing upload | 1024x500 JPEG or PNG, 24-bit color (no alpha) |
| **Phone Screenshots** | Store Listing upload | Minimum 4 screenshots, 16:9 or 9:16 (e.g., 1080x1920 or 1080x2400) |
| **Tablet Screenshots** | Store Listing upload | Optional but recommended for 7-inch & 10-inch devices |

---

## 5. Security & Code Integrity Verification

Prior to release, the codebase has been audited for common security pitfalls:

1. **No Leaked Secrets in Bundle**:
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Safe for client distribution (protected by Postgres Row Level Security).
   - `SUPABASE_SERVICE_ROLE_KEY`: Strictly absent from mobile code; only resides in Supabase Edge Functions environment.
2. **Biometric & Password Shield**:
   - Implemented in `src/components/AppLockOverlay.tsx` and `src/utils/biometrics.ts`.
   - Protects sensitive areas and enforces re-authentication when returning to foreground if enabled.
3. **Deep Link & Notification Routing**:
   - `resolveNotificationRoute` in `src/utils/notificationRouter.ts` sanitizes all incoming push notification links.
   - Prevents cross-role navigation crashes (e.g. non-alumni tapping alumni routes).
   - Safely falls back to role-appropriate home screens (`/(student)/dashboard`, `/(staff)/dashboard`, `/(alumni)/dashboard`, `/(admin)/dashboard`).
4. **Network & SSL**:
   - Plaintext HTTP traffic is disabled. All API and WebSocket connections require TLS.

---

## 6. Release & Submission Step-by-Step

### Step 1: Install EAS CLI and Authenticate
```bash
npm install -g eas-cli
eas login
```

### Step 2: Configure Project & Credentials
```bash
# Verify eas.json build profiles
eas build:configure
```
Ensure `eas.json` contains:
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "APP_ENV": "production"
      }
    }
  }
}
```

### Step 3: Build the Android App Bundle (.aab)
```bash
eas build --platform android --profile production
```
EAS will generate a cryptographically signed `.aab` file ready for the Play Console.

### Step 4: Play Console Setup & Tracks
1. **Create App in Google Play Console**:
   - Name: `Lioris`
   - Default language: English (United States or United Kingdom)
   - App or game: App
   - Free or paid: Free
2. **Complete Declarations**:
   - Privacy Policy URL: `https://lioris-final-version.vercel.app/privacy`
   - App Access: Provide demo login credentials (e.g. test student account) for Google Play reviewers.
   - Content Rating: Complete IARC questionnaire (Social/Communication, moderate user interactions, moderation in place).
   - Target Audience: 18+ (University/Tertiary students & alumni).
   - Data Safety: Fill using the guide in Section 3 above.
3. **Internal / Closed Testing**:
   - Upload the `.aab` file to **Internal testing** first.
   - Test on at least 3 physical Android devices running Android 11, 13, and 14/15.
   - Verify push notification delivery, camera uploads, biometric prompt, and account deletion.
4. **Promote to Production**:
   - Submit for Google Play Store review.
