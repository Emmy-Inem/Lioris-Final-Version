import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { DepartmentPicker } from '@/components/DepartmentPicker';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useToast } from '@/context/ToastContext';
import { updateMyProfile, uploadAvatarImage } from '@/api/profile';

/**
 * Replaces the old choose-department / complete-profile / upload-photo trio
 * (3 separate full-screen steps) with one screen that saves department, bio,
 * and photo together in a single Continue - all three were skippable
 * one-field screens that added friction without adding a real decision
 * point of their own.
 */
export default function BuildProfileScreen() {
  const { colors, spacing } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/build-profile');
  const toast = useToast();
  const [department, setDepartment] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickFromLibrary() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) setPhotoUri(dataUrl);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

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

  async function handleContinue() {
    setSubmitting(true);
    try {
      if (photoUri && user?.id) {
        try {
          const res = await fetch(photoUri);
          const blob = await res.blob();
          await uploadAvatarImage(user.id, blob);
        } catch {
          try {
            await updateMyProfile({ avatarUrl: photoUri });
          } catch {
            toast.warning('We couldn’t save your photo just now - you can add it later in Settings.');
          }
        }
      }
      if (department || bio.trim()) {
        await updateMyProfile({
          ...(department ? { department } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
        });
      }
      await advance();
    } catch {
      toast.warning('We couldn’t save that just now - you can add it later in Settings.');
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
      currentPath="/(auth)/onboarding/build-profile"
      title="Build your profile"
      subtitle="This is what other people on campus see - your department drives your feed and event recommendations."
      footer={<AppButton label="Continue" onPress={handleContinue} loading={submitting} fullWidth />}
    >
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: spacing.sm,
          }}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: 96, height: 96 }} contentFit="cover" transition={200} />
          ) : (
            <AppText tone="inverse" variant="h2" weight="bold">
              {initials}
            </AppText>
          )}
        </View>
        <Pressable
          onPress={pickFromLibrary}
          accessibilityRole="button"
          accessibilityLabel="Choose profile photo"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.xs }}
        >
          <Ionicons name="camera-outline" size={16} color={colors.brandPrimary} />
          <AppText tone="brand" weight="semiBold" variant="bodySmall">
            {photoUri ? 'Change photo' : 'Add a photo'}
          </AppText>
        </Pressable>
      </View>

      <DepartmentPicker value={department} onChange={setDepartment} />

      <AppTextField
        label="Bio (optional)"
        value={bio}
        onChangeText={setBio}
        placeholder={
          user?.role === 'alumni'
            ? 'e.g. Class of 2019, product engineer, happy to mentor.'
            : 'e.g. Junior studying CS, into robotics and hiking.'
        }
        multiline
        numberOfLines={4}
      />
    </OnboardingShell>
  );
}
