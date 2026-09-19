import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
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
import { LAUNCH_INSTITUTIONS, getInstitutionForEmail } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

const ACADEMIC_LEVELS = ['100L', '200L', '300L', '400L', '500L', '600L', 'Postgraduate'];

export default function BuildProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/build-profile');
  const toast = useToast();

  const detectedCampus = user?.email ? getInstitutionForEmail(user.email)?.code : undefined;
  const [campusCode, setCampusCode] = useState<string>(detectedCampus || '');
  const [department, setDepartment] = useState<string | null>(null);
  const [faculty, setFaculty] = useState<string | null>(null);
  const [level, setLevel] = useState<string>('100L');
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch existing profile campus/department if previously saved
  useEffect(() => {
    let mounted = true;
    async function loadExisting() {
      if (!user?.id) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('campus_code, department, faculty, level, bio, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (mounted && data) {
          if (data.campus_code) setCampusCode(data.campus_code);
          if (data.department) setDepartment(data.department);
          if (data.faculty) setFaculty(data.faculty);
          if (data.level) setLevel(data.level);
          if (data.bio) setBio(data.bio);
          if (data.avatar_url) setPhotoUri(data.avatar_url);
        }
      } catch {
        // Non-blocking
      }
    }
    loadExisting();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

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
    setErrorMessage(null);
    if (!campusCode) {
      setErrorMessage('Please select your university from the list above.');
      haptics.error();
      return;
    }
    if (!department) {
      setErrorMessage('Please select your academic department to continue.');
      haptics.error();
      return;
    }

    haptics.medium();
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
            // non-blocking
          }
        }
      }

      await updateMyProfile({
        institutionCode: campusCode,
        department,
        faculty: faculty || undefined,
        academicLevel: user?.role === 'alumni' ? 'Alumni' : level,
        bio: bio.trim() || undefined,
      });

      await advance();
    } catch (err: any) {
      toast.warning('We could not save your profile details just now - you can update them in Settings.');
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

  const isFunaab = campusCode === 'FUNAAB';
  const isCU = campusCode === 'CU';
  const groupName = isFunaab || isCU ? 'College' : 'Faculty';

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/build-profile"
      title="Complete Academic Profile"
      subtitle="Select your university, college or faculty, and department to personalize your campus feed and study groups."
      footer={<AppButton label="Continue" onPress={handleContinue} loading={submitting} fullWidth />}
    >
      {/* Profile Photo (Optional) */}
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <View
          style={{
            width: 90,
            height: 90,
            borderRadius: 45,
            backgroundColor: colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: spacing.xs,
          }}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: 90, height: 90 }} contentFit="cover" transition={200} />
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
            {photoUri ? 'Change photo' : 'Add photo (optional)'}
          </AppText>
        </Pressable>
      </View>

      {/* University / Campus Selector */}
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
          University / Campus
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {LAUNCH_INSTITUTIONS.filter((i) => i.code !== 'GLOBAL').map((inst) => {
            const isSelected = campusCode === inst.code;
            return (
              <Pressable
                key={inst.code}
                onPress={() => {
                  haptics.light();
                  setCampusCode(inst.code);
                  setDepartment(null);
                  setFaculty(null);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.brandPrimary : colors.border,
                  backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                }}
              >
                <AppText
                  variant="bodySmall"
                  weight={isSelected ? 'bold' : 'medium'}
                  tone={isSelected ? 'brand' : 'primary'}
                >
                  {inst.shortName || inst.code}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Department Picker with College/Faculty Category Filters */}
      <DepartmentPicker
        value={department}
        onChange={(dept, fac) => {
          setDepartment(dept);
          if (fac) setFaculty(fac);
          if (errorMessage) setErrorMessage(null);
        }}
        campusCode={campusCode}
        label={`Department & ${groupName}`}
        placeholder={`Choose department (${campusCode})`}
      />

      {faculty ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.xs, marginBottom: spacing.md }}>
          <Ionicons name="school" size={14} color={colors.brandPrimary} />
          <AppText variant="caption" tone="brand" weight="semiBold">
            {groupName}: {faculty}
          </AppText>
        </View>
      ) : null}

      {/* Academic Level Selector (Student only) */}
      {user?.role !== 'alumni' ? (
        <View style={{ marginBottom: spacing.md }}>
          <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
            Current Academic Level
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {ACADEMIC_LEVELS.map((lvl) => {
              const isSelected = level === lvl;
              return (
                <Pressable
                  key={lvl}
                  onPress={() => {
                    haptics.light();
                    setLevel(lvl);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                    backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight={isSelected ? 'bold' : 'regular'}
                    tone={isSelected ? 'brand' : 'secondary'}
                  >
                    {lvl}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Bio (Optional) */}
      <AppTextField
        label="About Me (optional)"
        value={bio}
        onChangeText={setBio}
        placeholder={
          user?.role === 'alumni'
            ? 'e.g. Class of 2021, software engineer, available for mentorship.'
            : 'e.g. 300L student studying Computer Science, into AI and campus events.'
        }
        multiline
        numberOfLines={3}
      />

      {errorMessage ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#FEE2E2',
            borderColor: colors.critical,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginTop: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          <Ionicons name="alert-circle" size={18} color={colors.critical} />
          <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
            {errorMessage}
          </AppText>
        </View>
      ) : null}
    </OnboardingShell>
  );
}
