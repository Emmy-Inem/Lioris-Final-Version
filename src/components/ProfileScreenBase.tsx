import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { Avatar } from './Avatar';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { PostCard } from './PostCard';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, markVerificationPending, updateMyProfile, updateProfileImages, uploadAvatarImage } from '@/api/profile';
import { listMyPosts } from '@/api/posts';
import { submitVerificationRequest } from '@/api/verification';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';

const AVATAR_PRESETS = [
  { id: 'avatar_male', label: 'Male Student', src: require('../../assets/images/avatar_male.jpg') },
  { id: 'avatar_female', label: 'Female Student', src: require('../../assets/images/avatar_female.jpg') },
  { id: 'avatar_male_2', label: 'Engineering Student', src: require('../../assets/images/avatar_male_2.jpg') },
  { id: 'avatar_female_2', label: 'Honor Scholar', src: require('../../assets/images/avatar_female_2.jpg') },
  { id: 'avatar_alumni_2', label: 'Alumni Founder', src: require('../../assets/images/avatar_alumni_2.jpg') },
  { id: 'avatar_mentor', label: 'Faculty & Mentor', src: require('../../assets/images/avatar_mentor.jpg') },
];

const COVER_PRESETS = [
  { id: 'campus_students_photo', label: 'Campus Quad', src: require('../../assets/images/campus_students_photo.jpg') },
  { id: 'campus_library_study', label: 'University Library', src: require('../../assets/images/campus_library_study.jpg') },
  { id: 'student_rep_group', label: 'Student Senate', src: require('../../assets/images/student_rep_group.jpg') },
  { id: 'event_tech_hackathon', label: 'Hackfest Arena', src: require('../../assets/images/event_tech_hackathon.jpg') },
  { id: 'hero_student_3d', label: 'Futuristic Studio', src: require('../../assets/images/hero_student_3d.jpg') },
];

const PROFILE_TABS = ['Posts & Activity', 'Academic & Credentials'] as const;

export function ProfileScreen({ extraRows }: { extraRows?: React.ReactNode }) {
 const { colors, spacing, radius } = useTheme();
 const { user } = useAuth();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();

 const [activeTab, setActiveTab] = useState<(typeof PROFILE_TABS)[number]>('Posts & Activity');
 const [verificationModalOpen, setVerificationModalOpen] = useState(false);
 const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

 // Edit profile state
 const [editModalOpen, setEditModalOpen] = useState(false);
 const [editName, setEditName] = useState('');
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
 setEditDepartment(profile.department ?? 'Computer Science');
 setEditGradYear(profile.graduationYear ? String(profile.graduationYear) : '2026');
 setEditBio(profile.bio ?? '');
 setEditInterests((profile.interests ?? []).join(', '));
 setEditModalOpen(true);
 }

 async function handleSaveProfile() {
 if (!user) return;
 setSavingProfile(true);
 try {
 const interestsArray = editInterests
 .split(',')
 .map((i) => i.trim())
 .filter(Boolean);

 await updateMyProfile(user.id, {
 fullName: editName.trim(),
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

 async function handleSelectPresetAvatar(presetId: string) {
 if (!user) return;
 try {
 await updateProfileImages(user.id, { avatarUrl: presetId });
 await queryClient.invalidateQueries({ queryKey: ['profile'] });
 setPhotoPickerOpen(false);
 Alert.alert('Avatar Updated', 'New profile avatar applied.');
 } catch (err: any) {
 Alert.alert('Error', err?.message || 'Could not apply avatar.');
 }
 }

 async function handleSelectPresetCover(presetId: string) {
 if (!user) return;
 try {
 await updateProfileImages(user.id, { coverUrl: presetId });
 await queryClient.invalidateQueries({ queryKey: ['profile'] });
 setPhotoPickerOpen(false);
 Alert.alert('Campus Banner Updated', 'New cover banner applied.');
 } catch (err: any) {
 Alert.alert('Error', err?.message || 'Could not apply cover.');
 }
 }

 const [uploadingAvatar, setUploadingAvatar] = useState(false);

 async function handlePickCustomAvatar() {
 if (!user) return;
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

 const handleSelectAvatar = handleSelectPresetAvatar;
 const handleSelectCover = handleSelectPresetCover;

 async function handleSubmitVerification(data: {
 institutionClaimed: string;
 documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
 documentReference: string;
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
 queryClient.invalidateQueries({ queryKey: ['profile'] });
 setVerificationModalOpen(false);
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

 const activeCover = COVER_PRESETS.find((c) => c.id === profile.coverUrl)?.src ?? require('../../assets/images/campus_students_photo.jpg');

 return (
 <ScreenContainer noPadding glow={true}>
 {!isDesktop && (
 <View style={{ paddingHorizontal: spacing.lg }}>
 <AppHeader />
 </View>
 )}
 <ScrollView
 showsVerticalScrollIndicator={true}
 keyboardShouldPersistTaps="handled"
 nestedScrollEnabled
 contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 140 }}
 >
 {/* Cover Photo Header */}
 <View style={{ height: isDesktop ? 220 : 180, position: 'relative', width: '100%', overflow: 'hidden' }}>
 <Image source={activeCover} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
 <Pressable onPress={() => setPhotoPickerOpen(true)} style={{ position: 'relative' }}>
 <Avatar name={profile.fullName} uri={profile.avatarUrl ?? undefined} size={isDesktop ? 96 : 88} />
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
              onPress={handleOpenEdit}
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="h2" weight="bold">
              {profile.fullName}
            </AppText>
            {profile.verificationStatus === 'verified' ? (
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
            ) : null}
          </View>
          <AppText tone="brand" weight="semiBold" variant="bodySmall">
            @{profile.username} • {profile.department ?? 'Computer Science'}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Ionicons name="school-outline" size={14} color={colors.textSecondary} />
          <AppText tone="secondary" variant="bodySmall">
            {profile.institutionName ?? 'University of Ibadan'} (Class of {profile.graduationYear ?? 2026})
          </AppText>
        </View>

        {profile.bio ? (
          <AppText style={{ marginTop: spacing.sm, lineHeight: 20 }}>
            {profile.bio}
          </AppText>
        ) : null}

        {/* Quick Metrics Bar */}
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.md }}>
          <StatChip label="Authored" value={myPosts?.length ?? profile.postsCount} />
          <StatChip label="Connections" value={profile.connectionsCount} />
          <StatChip label="Reputation" value={profile.reputationScore} />
        </View>

        {/* Verification Callout if not verified */}
        {profile.verificationStatus === 'pending' ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.pastelPrimaryBg, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="time-outline" size={18} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" variant="bodySmall" style={{ color: colors.brandPrimary }}>
                  Verification Pending Review
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Your student ID is being verified by campus moderators.
                </AppText>
              </View>
            </View>
          </View>
        ) : profile.verificationStatus !== 'verified' ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.pastelPrimaryBg, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppText weight="bold" variant="bodySmall" style={{ color: colors.brandPrimary }}>
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
 backgroundColor: colors.pastelPrimaryBg,
 borderRadius: radius.pill,
 }}
 >
 <AppText variant="caption" weight="semiBold" style={{ color: colors.brandPrimary, fontSize: 11 }}>
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
 Share study questions, poll your cohort, or showcase projects on the Campus Forum!
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
 <DetailColumn label="Department" value={profile.department ?? 'Computer Science'} icon="book-outline" />
 <DetailColumn label="Grad Class" value={profile.graduationYear ? String(profile.graduationYear) : '2026'} icon="school-outline" />
 <DetailColumn label="Campus Node" value={profile.institutionName ?? 'University of Ibadan'} icon="business-outline" />
 </View>
 </SolidCard>
 </View>
 ) : null}

 {extraRows}
 </View>
 </View>
 </ScrollView>

 {/* Photo & Cover Customizer Modal */}
 <Modal visible={photoPickerOpen} transparent animationType="slide"onRequestClose={() => setPhotoPickerOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="images" size={20} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                Customize Photos
              </AppText>
            </View>
            <Pressable onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={true}>
            {/* Custom Photo Upload */}
            <View style={{ marginBottom: spacing.md }}>
              <AppButton
                label="Upload Custom Photo"
                variant="secondary"
                onPress={handlePickCustomAvatar}
                loading={uploadingAvatar}
                fullWidth
              />
            </View>

            {/* Avatar Selector */}
            <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
              OR CHOOSE AVATAR PRESET
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
              {AVATAR_PRESETS.map((preset) => {
                const isSelected = profile.avatarUrl === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => handleSelectAvatar(preset.id)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                      backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.background,
                    }}
                  >
                    <Image source={preset.src} style={{ width: 56, height: 56, borderRadius: 28, marginBottom: 4 }} />
                    <AppText variant="caption" weight="bold" numberOfLines={1}>
                      {preset.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Cover Banner Selector */}
            <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
              CHOOSE CAMPUS BANNER
            </AppText>
            <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              {COVER_PRESETS.map((preset) => {
                const isSelected = profile.coverUrl === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => handleSelectCover(preset.id)}
                    style={{
                      height: 75,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      position: 'relative',
                      borderWidth: 2,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <Image source={preset.src} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingLeft: spacing.md }}>
                      <AppText variant="bodySmall" weight="bold" tone="inverse">
                        {preset.label}
                      </AppText>
                      {isSelected ? (
                        <AppText variant="caption" weight="bold" tone="brand" style={{ color: '#68D391' }}>
                          Active Cover
                        </AppText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <AppButton label="Done" onPress={() => setPhotoPickerOpen(false)} />
        </View>
      </View>
    </Modal>

    {/* Edit Profile Details Modal */}
    <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <SolidCard style={{ width: '100%', maxWidth: 440, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Edit Profile
            </AppText>
 <Pressable onPress={() => setEditModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={20} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 380 }}>
 <AppTextField label="Full Name"value={editName} onChangeText={setEditName} />
 <AppTextField label="Department"value={editDepartment} onChangeText={setEditDepartment} />
 <AppTextField label="Graduation Year"value={editGradYear} onChangeText={setEditGradYear} keyboardType="numeric" />
 <AppTextField label="Skills & Interests (comma-separated)"value={editInterests} onChangeText={setEditInterests} />
 <AppTextField label="Academic Bio"value={editBio} onChangeText={setEditBio} multiline numberOfLines={3} />
 </ScrollView>

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setEditModalOpen(false)} />
 <AppButton
 label="Save Changes"loading={savingProfile}
 disabled={!editName.trim()}
 onPress={handleSaveProfile}
 />
 </View>
 </SolidCard>
 </View>
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
 backgroundColor: colors.pastelPrimaryBg,
 borderWidth: 1,
 borderColor: colors.brandPrimary,
 borderRadius: radius.md,
 paddingVertical: spacing.sm,
 }}
 >
 <AppText weight="bold"variant="h3"tone="brand">
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
