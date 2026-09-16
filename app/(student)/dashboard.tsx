import React, { useState } from 'react';
import { ScrollView, View, Pressable, Alert, Modal, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { CampusWeatherWidget } from '@/components/CampusWeatherWidget';
import { CampusRadioPlayer } from '@/components/CampusRadioPlayer';
import { AICopilotModal } from '@/components/AICopilotModal';
import { CurrencyConverterModal } from '@/components/CurrencyConverterModal';
import { CampusMapModal } from '@/components/CampusMapModal';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import * as ImagePicker from 'expo-image-picker';
import { getMyProfile, updateProfileImages, uploadAvatarImage, uploadCoverImage } from '@/api/profile';
import { listFeedPosts } from '@/api/posts';
import { listEvents } from '@/api/events';
import { listResources } from '@/api/resources';
import { listStudyGroups } from '@/api/studyGroups';
import { listPortalLinks } from '@/api/portalLinks';
import { haptics } from '@/utils/haptics';

const COVER_PRESETS = [
  { id: 'campus_students_photo', label: 'Campus Quad', src: require('../../assets/images/campus_students_photo.jpg') },
  { id: 'campus_library_study', label: 'University Library', src: require('../../assets/images/campus_library_study.jpg') },
  { id: 'student_rep_group', label: 'Student Senate', src: require('../../assets/images/student_rep_group.jpg') },
  { id: 'event_tech_hackathon', label: 'Hackfest Arena', src: require('../../assets/images/event_tech_hackathon.jpg') },
  { id: 'hero_student_3d', label: 'Futuristic Studio', src: require('../../assets/images/hero_student_3d.jpg') },
];

const AVATAR_PRESETS = [
  { id: 'avatar_male', label: 'Male Student', src: require('../../assets/images/avatar_male.jpg') },
  { id: 'avatar_female', label: 'Female Student', src: require('../../assets/images/avatar_female.jpg') },
  { id: 'avatar_male_2', label: 'Engineering Student', src: require('../../assets/images/avatar_male_2.jpg') },
  { id: 'avatar_female_2', label: 'Science Scholar', src: require('../../assets/images/avatar_female_2.jpg') },
  { id: 'avatar_mentor', label: 'Class Representative', src: require('../../assets/images/avatar_mentor.jpg') },
  { id: 'class_rep_portrait', label: 'Department Executive', src: require('../../assets/images/class_rep_portrait.jpg') },
];

export default function StudentDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { campusCode, homeInstitutionCode } = useCampusScope();
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [campusMapOpen, setCampusMapOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const effectiveCampus =
    homeInstitutionCode && homeInstitutionCode !== 'GLOBAL'
      ? homeInstitutionCode
      : campusCode && campusCode !== 'GLOBAL'
      ? campusCode
      : profile?.institutionCode && profile.institutionCode !== 'GLOBAL'
      ? profile.institutionCode
      : 'UI';

  const { data: recentPosts } = useQuery({
    queryKey: ['posts', 'dashboard-feed', effectiveCampus],
    queryFn: () => listFeedPosts({ scope: 'student', viewerInstitutionCode: effectiveCampus, viewScope: 'campus' }),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'student', effectiveCampus],
    queryFn: () => listEvents({ scope: 'student', campusCode: effectiveCampus }),
    enabled: isFeatureEnabled('campus_events'),
  });

  const { data: resources } = useQuery({
    queryKey: ['resources', 'dashboard', effectiveCampus],
    queryFn: () => listResources({ approvalStatus: 'approved', campusCode: effectiveCampus }),
    enabled: isFeatureEnabled('academic_resources'),
  });

  const { data: studyGroups } = useQuery({
    queryKey: ['study-groups', 'dashboard', effectiveCampus],
    queryFn: () => listStudyGroups(effectiveCampus),
    enabled: isFeatureEnabled('study_groups'),
  });

  const { data: portalLinks } = useQuery({
    queryKey: ['portal-links', 'dashboard', effectiveCampus],
    queryFn: () => listPortalLinks(effectiveCampus),
  });

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Student';
  const activeCover = profile?.coverUrl
    ? (COVER_PRESETS.find((c) => c.id === profile.coverUrl)?.src
       ?? (profile.coverUrl.startsWith('http') ? { uri: profile.coverUrl } : null)
       ?? require('../../assets/images/campus_students_photo.jpg'))
    : require('../../assets/images/campus_students_photo.jpg');

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  async function handleSelectAvatar(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { avatarUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    await queryClient.invalidateQueries({ queryKey: ['feed'] });
    setPhotoPickerOpen(false);
  }

  async function handleSelectCover(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { coverUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setPhotoPickerOpen(false);
  }

  async function handlePickCustomAvatar() {
    if (!user) return;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
          await queryClient.invalidateQueries({ queryKey: ['feed'] });
          setPhotoPickerOpen(false);
          Alert.alert('Photo Uploaded', 'Your profile avatar has been updated.');
        } catch (err: any) {
          Alert.alert('Upload Failed', err?.message || 'Could not upload photo.');
        } finally {
          setUploadingAvatar(false);
        }
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please grant photo library access.');
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
        await queryClient.invalidateQueries({ queryKey: ['feed'] });
        setPhotoPickerOpen(false);
        Alert.alert('Photo Uploaded', 'Your profile avatar has been updated.');
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
          Alert.alert('Cover Updated', 'Your campus banner has been updated.');
        } catch (err: any) {
          Alert.alert('Upload Failed', err?.message || 'Could not upload cover image.');
        } finally {
          setUploadingCover(false);
        }
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please grant photo library access.');
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
        Alert.alert('Cover Updated', 'Your campus banner has been updated.');
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || 'Could not upload cover image.');
      } finally {
        setUploadingCover(false);
      }
    }
  }

  function handleOpenPortal(url: string) {
    haptics.light();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }

  const upcomingEvents = (events ?? []).slice(0, 2);
  const featuredResources = (resources ?? []).slice(0, 3);
  const activePods = (studyGroups ?? []).slice(0, 3);

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={isDesktop ? true : false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 120,
          gap: spacing.lg,
        }}
      >
        {/* 1. Student Identity & Hero Banner Card */}
        <GlassCard
          radius={22}
          padded={false}
          style={{
            overflow: 'hidden',
          }}
        >
          <View style={{ height: isDesktop ? 160 : 120, position: 'relative', width: '100%' }}>
            <Image source={activeCover} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isDark ? 'rgba(10, 19, 38, 0.65)' : 'rgba(15, 23, 42, 0.45)',
              }}
            />

            <View
              style={{
                position: 'absolute',
                top: 12,
                left: 14,
                right: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 1,
                  marginRight: spacing.sm,
                }}
              >
                <Ionicons name="school" size={13} color="#68D391" style={heroTextShadowStyle} />
                <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11, flexShrink: 1 }, heroTextShadowStyle]}>
                  {profile?.institutionName ?? 'University of Ibadan'}
                </AppText>
              </View>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setPhotoPickerOpen(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 0,
                }}
              >
                <Ionicons name="camera-outline" size={13} color="#FFFFFF" style={heroTextShadowStyle} />
                <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11 }, heroTextShadowStyle]}>
                  Customize
                </AppText>
              </Pressable>
            </View>
          </View>

          <View style={{ padding: isDesktop ? spacing.lg : 14 }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={profile?.fullName ?? user?.fullName ?? 'Student'} uri={profile?.avatarUrl} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 18 : 16, lineHeight: isDesktop ? 22 : 20 }}>
                      Welcome back, {firstName}
                    </AppText>
                    {profile?.verificationStatus === 'verified' || user?.role === 'admin' ? (
                      <VerifiedBadge size={16} name={profile?.fullName || firstName} role={user?.role} />
                    ) : null}
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ marginTop: 2, fontSize: isDesktop ? 12 : 11 }}>
                    {/* "UI Node" as a fallback asserted University of Ibadan for
                        anyone whose campus wasn't resolved yet. */}
                    {[profile?.department, profile?.institutionCode].filter(Boolean).join(' • ') ||
                      'Complete your profile'}
                  </AppText>

                  {profile?.verificationStatus !== 'verified' && user?.role !== 'admin' ? (
                    <Pressable
                      onPress={() => router.push('/(student)/profile')}
                      style={{ alignSelf: 'flex-start', marginTop: 4 }}
                    >
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11, textDecorationLine: 'underline' }}>
                        Verify student ID →
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Live Campus Weather & Transit Widget */}
        <CampusWeatherWidget campusCode={effectiveCampus} />

        {/* Live Campus Radio Player */}
        <CampusRadioPlayer />

        {/* AI Campus Study Copilot Quick Launcher */}
        {isFeatureEnabled('ai_study_copilot') && (
          <GlassCard
            radius={18}
            padded={false}
            contentStyle={{
              padding: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Ionicons name="sparkles" size={22} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13.5 : 12.5, lineHeight: 16 }}>
                    AI Academic Study Copilot
                  </AppText>
                  <AppText tone="secondary" numberOfLines={2} style={{ fontSize: isDesktop ? 11 : 10.5, lineHeight: 14, marginTop: 2 }}>
                    Gemini concept breakdowns & past questions
                  </AppText>
                </View>
              </View>
              <Pressable
                onPress={() => setCopilotOpen(true)}
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11 }}>
                  Ask AI →
                </AppText>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* Gamification & Streaks (Feature Flagged) */}

        {/* AI Campus Study Copilot (Feature Flagged) */}

        {/* 2. Quick Student Everyday Productivity Actions */}
        <View>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, marginBottom: spacing.xs }}>
            Student Services
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('e2ee_messaging') && (
              <Pressable
                onPress={() => router.push('/(student)/messages')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="chatbubble-ellipses" size={isDesktop ? 22 : 20} color={colors.textSecondary} />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Direct Messages</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Chats & calls</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('currency_converter') && (
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCurrencyModalOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="cash-outline" size={isDesktop ? 22 : 20} color="#10B981" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>FX Converter</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Live rates & NGN</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}
            {isFeatureEnabled('academic_resources') && (
              <Pressable
                onPress={() => router.push('/(student)/resources')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="folder-open" size={isDesktop ? 22 : 20} color={colors.textSecondary} />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Resources</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Past Qs & notes</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('study_groups') && (
              <Pressable
                onPress={() => router.push('/(student)/study-groups')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="people" size={isDesktop ? 22 : 20} color="#10B981" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Study Pods</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Course revision</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push('/(student)/feed')}
              style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 12 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  justifyContent: isDesktop ? 'flex-start' : 'space-between',
                  gap: isDesktop ? 10 : 8,
                  minHeight: isDesktop ? 68 : 84,
                }}
              >
                <Ionicons name="chatbubbles" size={isDesktop ? 22 : 20} color="#EC4899" />
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Forum</AppText>
                  <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Ask questions</AppText>
                </View>
              </GlassCard>
            </Pressable>

            {isFeatureEnabled('campus_events') && (
              <Pressable
                onPress={() => router.push('/(student)/events-list')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="calendar" size={isDesktop ? 22 : 20} color="#3B82F6" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Events & RSVPs</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Talks & summits</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('marketplace') && (
              <Pressable
                onPress={() => router.push('/(student)/marketplace')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="cart" size={isDesktop ? 22 : 20} color="#F59E0B" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Marketplace</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Buy, sell & swap</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('career_page') && (
              <Pressable
                onPress={() => router.push('/(student)/jobs')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="briefcase" size={isDesktop ? 22 : 20} color="#6366F1" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Career & Jobs</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Internships & gigs</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('alumni_mentorship') && (
              <Pressable
                onPress={() => router.push('/(student)/mentorship')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="ribbon" size={isDesktop ? 22 : 20} color="#A855F7" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Mentorship</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Alumni advisors</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('utility_cards') && (
              <Pressable
                onPress={() => router.push('/(student)/calendar')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="time" size={isDesktop ? 22 : 20} color="#0D9488" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>My Schedule</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Timetable & tests</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('campus_map') && (
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCampusMapOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    justifyContent: isDesktop ? 'flex-start' : 'space-between',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? 68 : 84,
                  }}
                >
                  <Ionicons name="map" size={isDesktop ? 22 : 20} color={colors.textSecondary} />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Campus Map & POIs</AppText>
                    <AppText tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>ATMs, halls & food</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}
          </View>
        </View>

        {/* 3. Official Campus Bulletins */}
        <AnnouncementsWidget scope="student" />

        {/* 4. Real Upcoming Campus Events */}
        {isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                <AppText weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
                  Campus Events
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/events-list')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 11.5 }}>
                  View All ({events?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {upcomingEvents.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
                <AppText weight="bold" variant="bodySmall">No upcoming campus events</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Stay tuned for upcoming hackathons, career talks, and faculty seminars.
                </AppText>
                <AppButton label="Browse Calendar" variant="secondary" onPress={() => router.push('/(student)/events-list')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.md }}>
                {upcomingEvents.map((evt: any) => (
                  <EventCard key={evt.id} event={evt} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* 5. Verified Academic Resources & Past Questions */}
        {isFeatureEnabled('academic_resources') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                <AppText weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
                  Course Materials
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/resources')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 11.5 }}>
                  View All ({resources?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {featuredResources.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="folder-open-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
                <AppText weight="bold" variant="bodySmall">No study materials uploaded yet</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Help your department by sharing lecture slides, notes, or solved past papers.
                </AppText>
                <AppButton label="Upload Study Material" onPress={() => router.push('/(student)/resources')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {featuredResources.map((res: any) => (
                  <Pressable key={res.id} onPress={() => router.push('/(student)/resources')}>
                    <SolidCard radius={16} style={{ padding: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <Badge label={res.courseCode || 'GEN'} tone="neutral" />
                          <AppText variant="caption" tone="secondary" numberOfLines={1}>
                            {res.department || 'Academic'}
                          </AppText>
                        </View>
                        <View style={{ flexShrink: 0, paddingLeft: 8 }}>
                          <Badge label={res.category || 'Notes'} tone="neutral" />
                        </View>
                      </View>
                      <AppText variant="bodySmall" weight="bold" numberOfLines={2} style={{ lineHeight: 18 }}>
                        {res.title}
                      </AppText>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                          By {res.authorName || 'Student'} • {res.downloadsCount ?? 0} downloads
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, paddingLeft: 8 }}>
                          <Ionicons name="cloud-download-outline" size={14} color={colors.textSecondary} />
                          <AppText variant="caption" weight="bold" tone="brand">
                            Access File
                          </AppText>
                        </View>
                      </View>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 6. Active Study Groups / Pods */}
        {isFeatureEnabled('study_groups') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="people-outline" size={18} color="#10B981" style={{ flexShrink: 0 }} />
                <AppText weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
                  Study Pods
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/study-groups')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 11.5 }}>
                  View All ({studyGroups?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {activePods.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
                <AppText weight="bold" variant="bodySmall">No active study pods yet</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Start a study circle with classmates to collaborate on course revisions and projects.
                </AppText>
                <AppButton label="Create Study Pod" variant="secondary" onPress={() => router.push('/(student)/study-groups')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {activePods.map((group: any) => (
                  <Pressable key={group.id} onPress={() => router.push('/(student)/study-groups')}>
                    <SolidCard radius={16} style={{ padding: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <Badge label={group.courseCode || 'Study Pod'} tone="success" />
                          <AppText variant="bodySmall" weight="bold" numberOfLines={2} style={{ flex: 1, lineHeight: 18 }}>
                            {group.name}
                          </AppText>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, paddingLeft: 8 }}>
                          <Ionicons name="person" size={12} color={colors.textSecondary} />
                          <AppText variant="caption" tone="secondary">
                            {group.memberCount ?? 1}
                          </AppText>
                        </View>
                      </View>
                      <AppText tone="secondary" variant="caption" numberOfLines={2}>
                        {group.description || 'Collaborative study pod for shared review and academic discussion.'}
                      </AppText>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 7. Trending Campus Discussions */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" style={{ flexShrink: 0 }} />
              <AppText weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
                Campus Discussions
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(student)/feed')} style={{ flexShrink: 0 }} hitSlop={8}>
              <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 11.5 }}>
                View All →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {(recentPosts ?? []).length === 0 ? (
              <SolidCard radius={18} style={{ padding: 0 }}>
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No discussions yet"
                  description="Be the first to start a conversation on the campus feed."
                  actionLabel="Open Feed"
                  onAction={() => router.push('/(student)/feed')}
                />
              </SolidCard>
            ) : null}
            {(recentPosts ?? []).slice(0, 3).map((post: any) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/(student)/post/${post.id}` as any)}
              >
                <SolidCard radius={18} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Avatar name={post.authorName ?? 'Student'} size={28} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="caption" weight="bold" numberOfLines={1}>
                          {post.authorName ?? 'Student'}
                        </AppText>
                      </View>
                    </View>
                    <View style={{ flexShrink: 0 }}>
                      <Badge label={post.category ?? 'Discussion'} tone="neutral" />
                    </View>
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 4, marginBottom: 2 }} numberOfLines={2}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2}>
                    {post.content}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.likesCount ?? 0}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.commentsCount ?? 0} replies
                      </AppText>
                    </View>
                  </View>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 8. Institutional Direct Portal Shortcuts */}
        {(portalLinks ?? []).length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <Ionicons name="link-outline" size={18} color={colors.textSecondary} />
              <AppText weight="bold" style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
                Official University Services
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(portalLinks ?? []).slice(0, 4).map((portal: any) => (
                <Pressable
                  key={portal.id}
                  onPress={() => handleOpenPortal(portal.url)}
                  style={{ width: isDesktop ? '48%' : '100%', flexGrow: 1 }}
                >
                  <GlassCard radius={16} padded={false} contentStyle={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={portal.icon || 'globe-outline'} size={24} color={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                        {portal.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                        {portal.category} • Official University Portal
                      </AppText>
                    </View>
                    <Ionicons name="open-outline" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                  </GlassCard>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Photo Customizer Modal */}
      <Modal visible={photoPickerOpen} transparent animationType="fade" onRequestClose={() => setPhotoPickerOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: isDesktop ? 'center' : 'flex-end',
            alignItems: isDesktop ? 'center' : 'stretch',
            padding: isDesktop ? spacing.lg : 0,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: isDesktop ? 24 : undefined,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: spacing.lg,
              maxHeight: isDesktop ? '85%' : '80%',
              maxWidth: isDesktop ? 540 : undefined,
              width: isDesktop ? '100%' : undefined,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="images" size={20} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold">
                  Customize App Photos
                </AppText>
              </View>
              <Pressable onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
              {/* Custom Upload Buttons */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={uploadingAvatar ? 'Uploading...' : 'Upload DP'}
                    variant="secondary"
                    onPress={handlePickCustomAvatar}
                    loading={uploadingAvatar}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={uploadingCover ? 'Uploading...' : 'Upload Cover'}
                    variant="secondary"
                    onPress={handlePickCustomCover}
                    loading={uploadingCover}
                    fullWidth
                  />
                </View>
              </View>

              <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
                OR CHOOSE AVATAR PRESET
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = profile?.avatarUrl === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleSelectAvatar(preset.id)}
                      style={{
                        flexGrow: 1,
                        flexBasis: isDesktop ? '30%' : '47%',
                        alignItems: 'center',
                        padding: spacing.sm,
                        borderRadius: radius.md,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                        backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.background,
                      }}
                    >
                      <Image source={preset.src} style={{ width: 52, height: 52, borderRadius: 26, marginBottom: 4 }} />
                      <AppText variant="caption" weight="bold" numberOfLines={1}>
                        {preset.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
                CHOOSE CAMPUS BANNER
              </AppText>
              <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
                {COVER_PRESETS.map((preset) => {
                  const isSelected = profile?.coverUrl === preset.id;
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
                            Active Banner
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
      <AICopilotModal visible={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <CurrencyConverterModal visible={currencyModalOpen} onClose={() => setCurrencyModalOpen(false)} />
      <CampusMapModal visible={campusMapOpen} onClose={() => setCampusMapOpen(false)} campusFilter={effectiveCampus} />
    </ScreenContainer>
  );
}

