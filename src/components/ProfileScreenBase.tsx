import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { DepartmentPicker } from './DepartmentPicker';
import { Avatar } from './Avatar';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { PostCard } from './PostCard';
import { Badge } from './Badge';
import { VerifiedBadge } from './VerifiedBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, markVerificationPending, updateMyProfile, updateProfileImages, uploadAvatarImage, uploadCoverImage } from '@/api/profile';
import { listMyPosts } from '@/api/posts';
import { submitVerificationRequest } from '@/api/verification';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';

const PROFILE_TABS = ['Posts & Activity', 'Academic & Credentials'] as const;

export function ProfileScreen({ extraRows }: { extraRows?: React.ReactNode }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<(typeof PROFILE_TABS)[number]>('Posts & Activity');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  // Edit profile state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editGradYear, setEditGradYear] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editInterests, setEditInterests] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const { data: myPosts, isLoading: postsLoading } = useQuery({
    queryKey: ['my-posts', user?.id],
    queryFn: () => listMyPosts(user?.id),
    enabled: !!user,
  });

  function handleOpenEdit() {
    if (!profile) return;
    setEditName(profile.fullName);
    setEditUsername(profile.username || '');
    setEditDepartment(profile.department ?? 'Computer Science');
    setEditGradYear(profile.graduationYear ? String(profile.graduationYear) : '2026');
    setEditBio(profile.bio ?? '');
    setEditInterests((profile.interests ?? []).join(', '));
    setEditModalOpen(true);
  }

  async function handleSaveProfile() {
    if (!user) return;
    const cleanUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (cleanUsername.length < 3) {
      Alert.alert('Invalid Username', 'Username must be at least 3 characters long and contain only lowercase letters, numbers, dots, or underscores.');
      return;
    }
    setSavingProfile(true);
    try {
      const interestsArray = editInterests
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);

      await updateMyProfile(user.id, {
        fullName: editName.trim(),
        username: cleanUsername,
        department: editDepartment.trim(),
        graduationYear: parseInt(editGradYear, 10) || null,
        bio: editBio.trim(),
        interests: interestsArray,
      });

      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditModalOpen(false);
      Alert.alert('Profile Saved', 'Your public academic profile details have been updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update profile details.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!user) return;
    try {
      await updateProfileImages(user.id, { avatarUrl: null });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setPhotoPickerOpen(false);
      Alert.alert('Avatar Removed', 'Your profile now uses the generic initial badge.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not remove avatar.');
    }
  }

  async function handleRemoveCover() {
    if (!user) return;
    try {
      await updateProfileImages(user.id, { coverUrl: null });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setPhotoPickerOpen(false);
      Alert.alert('Cover Removed', 'Your profile now uses the generic cover placeholder.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not remove cover image.');
    }
  }

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  async function handlePickCustomAvatar() {
    if (!user) return;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Web: use hidden file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        setUploadingAvatar(true);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ext = file.name.split('.').pop() || 'jpg';
          const publicUrl = await uploadAvatarImage(user.id, arrayBuffer, ext);
          await updateProfileImages(user.id, { avatarUrl: publicUrl });
          await queryClient.invalidateQueries({ queryKey: ['profile'] });
          setPhotoPickerOpen(false);
          Alert.alert('Photo Uploaded', 'Your custom avatar is now live.');
        } catch (err: any) {
          Alert.alert('Upload Failed', err?.message || 'Could not upload photo.');
        } finally {
          setUploadingAvatar(false);
        }
      };
      input.click();
      return;
    }

    // Native
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please grant photo library access to upload a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setUploadingAvatar(true);
      try {
        const res = await fetch(result.assets[0].uri);
        const blob = await res.blob();
        const publicUrl = await uploadAvatarImage(user.id, blob, 'jpg');
        await updateProfileImages(user.id, { avatarUrl: publicUrl });
        await queryClient.invalidateQueries({ queryKey: ['profile'] });
        setPhotoPickerOpen(false);
        Alert.alert('Photo Uploaded', 'Your custom avatar is now live.');
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || 'Could not upload photo.');
      } finally {
        setUploadingAvatar(false);
      }
    }
  }

  async function handlePickCustomCover() {
    if (!user) return;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Web: use hidden file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        setUploadingCover(true);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ext = file.name.split('.').pop() || 'jpg';
          const publicUrl = await uploadCoverImage(user.id, arrayBuffer, ext);
          await updateProfileImages(user.id, { coverUrl: publicUrl });
          await queryClient.invalidateQueries({ queryKey: ['profile'] });
          setPhotoPickerOpen(false);
          Alert.alert('Cover Updated', 'Your custom campus banner is now live.');
        } catch (err: any) {
          Alert.alert('Upload Failed', err?.message || 'Could not upload cover image.');
        } finally {
          setUploadingCover(false);
        }
      };
      input.click();
      return;
    }

    // Native
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please grant photo library access to upload a cover image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setUploadingCover(true);
      try {
        const res = await fetch(result.assets[0].uri);
        const blob = await res.blob();
        const publicUrl = await uploadCoverImage(user.id, blob, 'jpg');
        await updateProfileImages(user.id, { coverUrl: publicUrl });
        await queryClient.invalidateQueries({ queryKey: ['profile'] });
        setPhotoPickerOpen(false);
        Alert.alert('Cover Updated', 'Your custom campus banner is now live.');
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || 'Could not upload cover image.');
      } finally {
        setUploadingCover(false);
      }
    }
  }

 async function handleSubmitVerification(data: {
 institutionClaimed: string;
 documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
 documentReference?: string;
 documentPhotoUri?: string | null;
 photoBlob?: Blob;
 }) {
 if (!user) return;
 try {
 await submitVerificationRequest({
 userId: user.id,
 applicantName: profile?.fullName ?? user.fullName,
 documentType: data.documentType,
 documentReference: data.documentReference,
 institutionClaimed: data.institutionClaimed,
 documentPhotoUri: data.documentPhotoUri,
 photoBlob: data.photoBlob,
 });
 markVerificationPending(user.id);
 await queryClient.invalidateQueries({ queryKey: ['profile'] });
 setVerificationModalOpen(false);
 Alert.alert('Application Submitted', 'Your verification request is now pending review by campus moderators.');
 } catch (err: any) {
 Alert.alert('Application Failed', err?.message ?? 'Please try again later.');
 }
 }

 if (!profile) {
 return (
 <ScreenContainer noPadding glow={false}>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
 <AppText tone="secondary">Loading profile...</AppText>
 </View>
 </ScreenContainer>
 );
 }

  const activeCover = profile.coverUrl && (profile.coverUrl.startsWith('http') || profile.coverUrl.startsWith('file') || profile.coverUrl.startsWith('data:'))
    ? { uri: profile.coverUrl }
    : null;

  return (
    <ScreenContainer noPadding glow={true}>
      {!isDesktop && (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <AppHeader />
        </View>
      )}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 140 }}
      >
        {/* Cover Photo Header */}
        <View style={{ height: isDesktop ? 220 : 180, position: 'relative', width: '100%', overflow: 'hidden' }}>
          {activeCover ? (
            <Image source={activeCover} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: isDark ? '#0F1A30' : '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: colors.brandPrimary,
                  opacity: isDark ? 0.2 : 0.08,
                }}
              />
              <Ionicons
                name="image-outline"
                size={36}
                color={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
              />
            </View>
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />

 {/* Change Photo Trigger */}
 <Pressable
 onPress={() => setPhotoPickerOpen(true)}
 style={{
 position: 'absolute',
 top: 14,
 right: 14,
 backgroundColor: 'rgba(0,0,0,0.7)',
 borderRadius: radius.pill,
 paddingHorizontal: spacing.md,
 paddingVertical: 6,
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 }}
 >
 <Ionicons name="camera" size={14} color="#FFFFFF" />
 <AppText variant="caption" weight="bold" tone="inverse">
 Change Photos
 </AppText>
 </Pressable>
 </View>

        {/* Responsive Content Container */}
        <View
          style={
            isDesktop
              ? { flexDirection: 'row', gap: 28, paddingHorizontal: 32, alignItems: 'flex-start' }
              : { paddingHorizontal: spacing.lg, marginTop: -45 }
          }
        >
          {/* Left Column: Identity & Bio Card */}
          <View style={isDesktop ? { width: 360, gap: spacing.md, marginTop: -60 } : undefined}>
 <SolidCard radius={22} style={{ padding: spacing.lg, position: 'relative' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.sm }}>
 <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => setPhotoPickerOpen(true)} style={{ position: 'relative' }}>
 <Avatar name={profile.fullName} uri={profile.avatarUrl ?? undefined} size={isDesktop ? 96 : 76} />
 <View
 style={{
 position: 'absolute',
 bottom: 2,
 right: 2,
 backgroundColor: colors.brandPrimary,
 borderRadius: 12,
 width: 24,
 height: 24,
 alignItems: 'center',
 justifyContent: 'center',
 borderWidth: 2,
 borderColor: '#FFFFFF',
 }}
 >
 <Ionicons name="pencil" size={12} color="#FFFFFF" />
 </View>
 </Pressable>

 <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
 <Pressable
 onPress={() => router.push('./settings' as any)}
 hitSlop={8}
 accessibilityRole="button"
 accessibilityLabel="Open settings"
 style={{
 width: 40,
 height: 40,
 borderRadius: 20,
 borderWidth: 1,
 borderColor: colors.border,
 backgroundColor: colors.surface,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="settings-outline" size={18} color={colors.textPrimary} />
 </Pressable>
            <AppButton
              label="Edit Profile"
              variant="secondary"
              size={isDesktop ? 'md' : 'sm'}
              onPress={handleOpenEdit}
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 22 }}>
              {profile.fullName}
            </AppText>
            {profile.verificationStatus === 'verified' || user?.role === 'admin' ? (
              <VerifiedBadge size={18} role={user?.role} name={profile.fullName} />
            ) : null}
          </View>
          <AppText tone="brand" weight="semiBold" variant="bodySmall">
            @{profile.username}
            {profile.department ? ` • ${profile.department}` : ''}
          </AppText>
        </View>

        {/* Only rendered when we actually know the institution. This used to
            fall back to "University of Ibadan (Class of 2026)", which stated
            a specific school and graduation year for people who had set
            neither - including alumni of other universities. */}
        {profile.institutionName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name="school-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="bodySmall">
              {profile.institutionName}
              {profile.graduationYear ? ` (Class of ${profile.graduationYear})` : ''}
            </AppText>
          </View>
        ) : null}

        {profile.bio ? (
          <AppText style={{ marginTop: spacing.sm, lineHeight: 20 }}>
            {profile.bio}
          </AppText>
        ) : null}

        {/* Quick Metrics Bar */}
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.md }}>
          <StatChip label="Authored" value={myPosts?.length ?? profile.postsCount ?? 0} />
          <StatChip label="Connections" value={profile.connectionsCount ?? 0} />
        </View>

        {/* Verification Callout if not verified */}
        {profile.verificationStatus === 'pending' ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.divider, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" variant="bodySmall">
                  Verification Pending Review
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Your student ID is being verified by campus moderators.
                </AppText>
              </View>
            </View>
          </View>
        ) : profile.verificationStatus !== 'verified' ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.divider, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppText weight="bold" variant="bodySmall">
                  Verify Student Identity
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Unlock verified badge & voting in student polls.
                </AppText>
              </View>
              <AppButton label="Verify" onPress={() => setVerificationModalOpen(true)} />
            </View>
          </View>
        ) : null}

 {profile.interests && profile.interests.length > 0 ? (
 <View style={{ marginTop: spacing.sm }}>
 <AppText weight="bold" variant="caption" tone="secondary" style={{ marginBottom: 6, textTransform: 'uppercase' }}>
 Interests & Skills
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
 {profile.interests.map((interest) => (
 <View
 key={interest}
 style={{
 paddingHorizontal: 8,
 paddingVertical: 4,
 backgroundColor: colors.divider,
 borderRadius: radius.pill,
 }}
 >
 <AppText variant="caption" weight="semiBold" style={{ color: colors.textSecondary, fontSize: 11 }}>
 {interest}
 </AppText>
 </View>
 ))}
 </View>
 </View>
 ) : null}
 </SolidCard>
 </View>

 {/* Right Column: Tabbed Activity Stream */}
 <View style={isDesktop ? { flex: 1, paddingTop: spacing.md } : { marginTop: spacing.md }}>
 {/* Interactive Profile Tabs */}
 <View
 style={{
 flexDirection: 'row',
 gap: spacing.xs,
 marginBottom: spacing.md,
 backgroundColor: colors.surface,
 padding: 4,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 {PROFILE_TABS.map((tab) => {
 const selected = activeTab === tab;
 return (
 <Pressable
 key={tab}
 onPress={() => setActiveTab(tab)}
 style={{
 flex: 1,
 paddingVertical: 8,
 borderRadius: radius.pill,
 alignItems: 'center',
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 }}
 >
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
 {tab}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 {/* Tab Content 1: Posts & Activity */}
 {activeTab === 'Posts & Activity' ? (
 <View style={{ gap: spacing.sm }}>
 {postsLoading ? (
 <AppText tone="secondary" style={{ textAlign: 'center', padding: spacing.lg }}>Loading your posts...</AppText>
 ) : myPosts && myPosts.length > 0 ? (
 myPosts.map((p) => <PostCard key={p.id} post={p} />)
 ) : (
 <SolidCard radius={20} style={{ alignItems: 'center', padding: spacing.xxl }}>
 <Ionicons name="chatbubbles-outline" size={36} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
 <AppText variant="h3" weight="bold" style={{ marginBottom: 4 }}>No Threads Published Yet</AppText>
 <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', marginBottom: spacing.md, maxWidth: 360 }}>
 Share study questions, poll your cohort, or showcase projects on the Forum!
 </AppText>
 <AppButton label="Publish First Thread" onPress={() => router.push('./feed' as any)} />
 </SolidCard>
 )}
 </View>
 ) : null}

 {/* Tab Content 2: Academic & Credentials */}
 {activeTab === 'Academic & Credentials' ? (
 <View style={{ gap: spacing.md }}>
 <SolidCard radius={20}>
 <AppText weight="bold" variant="h3" tone="brand" style={{ marginBottom: spacing.md }}>
 Academic Identity & Cohort
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
          <DetailColumn label="Department" value={profile.department || 'Not specified'} icon="book-outline" />
          <DetailColumn label="Grad Class" value={profile.graduationYear ? String(profile.graduationYear) : 'Not specified'} icon="school-outline" />
          <DetailColumn label="Campus Node" value={profile.institutionName || 'Campus Node'} icon="business-outline" />
 </View>
 </SolidCard>
 </View>
 ) : null}

 {extraRows}
 </View>
 </View>
 </ScrollView>

    {/* Photo & Cover Customizer Modal */}
    <Modal visible={photoPickerOpen} transparent animationType="slide" onRequestClose={() => setPhotoPickerOpen(false)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoPickerOpen(false)} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: isDesktop ? spacing.xl : spacing.lg,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            width: '100%',
            maxWidth: 540,
            alignSelf: 'center',
          }}
        >
          {!isDesktop && (
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: 'center',
                marginBottom: spacing.sm,
              }}
            />
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="images-outline" size={20} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                Update Profile Photos
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
            {/* Profile Avatar Card */}
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.divider,
                borderWidth: 1,
                borderColor: colors.border,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={profile.fullName} uri={profile.avatarUrl ?? undefined} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" variant="bodySmall">
                    Profile Photo
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {profile.avatarUrl ? 'Custom photo active' : 'Default initials avatar'}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={uploadingAvatar ? 'Uploading…' : 'Upload Photo'}
                    variant="primary"
                    size="sm"
                    onPress={handlePickCustomAvatar}
                    loading={uploadingAvatar}
                    fullWidth
                  />
                </View>
                {profile.avatarUrl ? (
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Remove Photo"
                      variant="ghost"
                      size="sm"
                      onPress={handleRemoveAvatar}
                      fullWidth
                    />
                  </View>
                ) : null}
              </View>
            </View>

            {/* Cover Banner Card */}
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.divider,
                borderWidth: 1,
                borderColor: colors.border,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 48,
                    height: 32,
                    borderRadius: radius.sm,
                    backgroundColor: colors.brandPrimary,
                    opacity: 0.8,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="image" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" variant="bodySmall">
                    Campus Cover Banner
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {activeCover ? 'Custom banner active' : 'Default banner placeholder'}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={uploadingCover ? 'Uploading…' : 'Upload Banner'}
                    variant="primary"
                    size="sm"
                    onPress={handlePickCustomCover}
                    loading={uploadingCover}
                    fullWidth
                  />
                </View>
                {profile.coverUrl ? (
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Remove Banner"
                      variant="ghost"
                      size="sm"
                      onPress={handleRemoveCover}
                      fullWidth
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <AppButton label="Done" variant="secondary" onPress={() => setPhotoPickerOpen(false)} />
        </View>
      </View>
    </Modal>

    {/* Edit Profile Details Modal */}
    <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditModalOpen(false)} />
        <SolidCard style={{ width: '100%', maxWidth: 460, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Edit Profile
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setEditModalOpen(false)} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, width: '100%', maxHeight: 420 }}>
            <AppTextField label="Full Name" value={editName} onChangeText={setEditName} placeholder="e.g. Adeyemi John" />
            <AppTextField
              label="Username"
              value={editUsername}
              onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. adeyemi.dev"
              helperText="Only lowercase letters, numbers, dots, and underscores."
            />
            <DepartmentPicker value={editDepartment || null} onChange={setEditDepartment} />
            <AppTextField label="Graduation Year" value={editGradYear} onChangeText={setEditGradYear} keyboardType="numeric" />
            <AppTextField label="Skills & Interests (comma-separated)" value={editInterests} onChangeText={setEditInterests} />
            <AppTextField label="Academic Bio" value={editBio} onChangeText={setEditBio} multiline numberOfLines={3} />
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
            <AppButton label="Cancel" variant="ghost" onPress={() => setEditModalOpen(false)} />
            <AppButton
              label="Save Changes"
              loading={savingProfile}
              disabled={!editName.trim() || editUsername.trim().length < 3}
              onPress={handleSaveProfile}
            />
          </View>
        </SolidCard>
      </KeyboardAvoidingView>
    </Modal>

 <ApplyForVerificationModal
 visible={verificationModalOpen}
 onClose={() => setVerificationModalOpen(false)}
 onSubmit={handleSubmitVerification}
 />
 </ScreenContainer>
 );
}

function StatChip({ label, value }: { label: string; value: number }) {
 const { colors, spacing, radius } = useTheme();
 return (
 <View
 style={{
 flex: 1,
 alignItems: 'center',
 backgroundColor: colors.divider,
 borderWidth: 1,
 borderColor: colors.border,
 borderRadius: radius.md,
 paddingVertical: spacing.sm,
 }}
 >
 <AppText weight="bold"variant="h3">
 {value}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {label}
 </AppText>
 </View>
 );
}

function DetailColumn({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
 const { colors, spacing } = useTheme();
 return (
 <View style={{ flex: 1 }}>
 <AppText variant="caption"weight="bold"tone="secondary"style={{ letterSpacing: 1 }}>
 {label.toUpperCase()}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
 {icon ? <Ionicons name={icon} size={12} color={colors.textSecondary} /> : null}
 <AppText variant="bodySmall"weight="semiBold">
 {value}
 </AppText>
 </View>
 </View>
 );
}
