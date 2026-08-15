import React, { useState } from'react';
import { Pressable, View } from'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import { OnboardingShell } from'@/components/OnboardingShell';
import { AppButton } from'@/components/AppButton';
import { AppText } from'@/components/AppText';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { useAdvanceOnboarding } from'@/auth/useAdvanceOnboarding';

export default function UploadPhotoScreen() {
  const { colors, spacing } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/upload-photo');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      // Real backend integration would upload photoUri to a private,
      // signed-URL bucket here per the Secure File Uploads requirement
      // in PRD's Security Requirements — restricted file types/size and
      // malware scanning happen server-side, not in this client.
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  const initials = (user?.fullName ?? 'You')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/upload-photo"title="Add a profile photo"subtitle="Helps classmates and alumni recognize you. You can skip this and add one later."footer={
        <AppButton label={photoUri ? 'Continue' : 'Skip for now'} onPress={handleContinue} loading={submitting} fullWidth />
      }
    >
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <View
          style={{
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: spacing.lg,
          }}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: 140, height: 140 }} contentFit="cover"transition={200} />
          ) : (
            <AppText tone="inverse"variant="h1"weight="bold">
              {initials}
            </AppText>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={pickFromLibrary}
            accessibilityRole="button"accessibilityLabel="Choose photo from library"style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm }}
          >
            <Ionicons name="images-outline"size={18} color={colors.brandPrimary} />
            <AppText tone="brand"weight="semiBold"variant="bodySmall">
              Choose photo
            </AppText>
          </Pressable>
          <Pressable
            onPress={takePhoto}
            accessibilityRole="button"accessibilityLabel="Take photo"style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm }}
          >
            <Ionicons name="camera-outline"size={18} color={colors.brandPrimary} />
            <AppText tone="brand"weight="semiBold"variant="bodySmall">
              Take photo
            </AppText>
          </Pressable>
        </View>
      </View>
    </OnboardingShell>
  );
}
