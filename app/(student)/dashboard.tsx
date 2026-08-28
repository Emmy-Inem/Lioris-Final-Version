import React, { useState } from 'react';
import { ScrollView, View, Pressable, Alert, Modal, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, updateProfileImages } from '@/api/profile';
import { listEvents } from '@/api/events';
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
  { id: 'avatar_female_2', label: 'Honor Scholar', src: require('../../assets/images/avatar_female_2.jpg') },
  { id: 'avatar_alumni_2', label: 'Alumni Founder', src: require('../../assets/images/avatar_alumni_2.jpg') },
  { id: 'avatar_mentor', label: 'Faculty Advisor', src: require('../../assets/images/avatar_mentor.jpg') },
];

export default function StudentDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'student'],
    queryFn: () => listEvents({ scope: 'student' }),
  });

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Diana';
  const activeCover = COVER_PRESETS.find((c) => c.id === profile?.coverUrl)?.src ?? require('../../assets/images/campus_students_photo.jpg');

  async function handleSelectAvatar(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { avatarUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setPhotoPickerOpen(false);
  }

  async function handleSelectCover(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { coverUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setPhotoPickerOpen(false);
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0 }}
      >
        {/* Main 2-Column Responsive Layout on Desktop */}
        <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
          
          {/* Main Left/Center Column */}
          <View style={isDesktop ? { flex: 1, gap: spacing.lg } : { gap: spacing.md }}>
            
            {/* Elegant Hero Welcome Banner Card */}
            <SolidCard
              radius={24}
              style={{
                overflow: 'hidden',
                padding: 0,
                borderWidth: 1,
                borderColor: colors.border,
                position: 'relative',
              }}
            >
              {/* Cover Image Background */}
              <View style={{ height: isDesktop ? 160 : 130, position: 'relative', width: '100%' }}>
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

                {/* Institution Badge */}
                <View style={{ position: 'absolute', top: 12, left: 14 }}>
                  <View
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Ionicons name="school" size={13} color="#68D391" />
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11 }}>
                      {profile?.institutionName ?? 'University of Ibadan'}
                    </AppText>
                  </View>
                </View>

                {/* Customize Photo Pill */}
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setPhotoPickerOpen(true);
                  }}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    borderRadius: radius.pill,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Ionicons name="camera-outline" size={13} color="#FFFFFF" />
                  <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11 }}>
                    Customize
                  </AppText>
                </Pressable>
              </View>

              {/* Greeting & Quick Stats Bar */}
              <View style={{ padding: spacing.lg, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <AppText variant="h2" weight="bold">
                        Welcome back, {firstName}
                      </AppText>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginLeft: 2 }} />
                    </View>
                    <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                      {profile?.department ?? 'Computer Science & AI'} • Level {profile?.level ?? 400}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Badge label="Verified Student" tone="brand" />
                    <Badge label="Active Term" tone="success" />
                  </View>
                </View>
              </View>
            </SolidCard>

            {/* Official Campus Announcements & Broadcasts */}
            <AnnouncementsWidget scope="student" />

            {/* Core Campus Hubs (4 Clean Modular Cards) */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <AppText variant="h3" weight="bold">
                  Campus Hubs & Academic Portals
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                
                {/* 1. Academic Resources Hub */}
                {isFeatureEnabled('academic_resources') && (
                  <Pressable
                    onPress={() => router.push('/(student)/resources')}
                    style={isDesktop ? { flex: 1, minWidth: '47%' } : { width: '48%' }}
                  >
                    <SolidCard radius={20} style={{ padding: spacing.md, height: '100%' }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: colors.pastelPrimaryBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.brandPrimary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        <Ionicons name="folder-open" size={20} color={colors.brandPrimary} />
                      </View>
                      <AppText variant="bodySmall" weight="bold" style={{ marginBottom: 2 }}>
                        Resources Library
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={2}>
                        Lecture notes, solved past questions & handouts
                      </AppText>
                    </SolidCard>
                  </Pressable>
                )}

                {/* 2. Campus Forum */}
                <Pressable
                  onPress={() => router.push('/(student)/feed')}
                  style={isDesktop ? { flex: 1, minWidth: '47%' } : { width: '48%' }}
                >
                  <SolidCard radius={20} style={{ padding: spacing.md, height: '100%' }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#3B82F6',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Ionicons name="chatbubbles" size={20} color="#3B82F6" />
                    </View>
                    <AppText variant="bodySmall" weight="bold" style={{ marginBottom: 2 }}>
                      Campus Forum
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={2}>
                      Discussions, queries, student polls & peer answers
                    </AppText>
                  </SolidCard>
                </Pressable>

                {/* 3. Job Opportunities */}
                {isFeatureEnabled('career_page') && (
                  <Pressable
                    onPress={() => router.push('/(student)/jobs')}
                    style={isDesktop ? { flex: 1, minWidth: '47%' } : { width: '48%' }}
                  >
                    <SolidCard radius={20} style={{ padding: spacing.md, height: '100%' }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: '#10B981',
                          marginBottom: spacing.sm,
                        }}
                      >
                        <Ionicons name="briefcase" size={20} color="#10B981" />
                      </View>
                      <AppText variant="bodySmall" weight="bold" style={{ marginBottom: 2 }}>
                        Opportunities
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={2}>
                        Internships, graduate roles & company referrals
                      </AppText>
                    </SolidCard>
                  </Pressable>
                )}

                {/* 4. Student Marketplace */}
                {isFeatureEnabled('marketplace') && (
                  <Pressable
                    onPress={() => router.push('/(student)/marketplace')}
                    style={isDesktop ? { flex: 1, minWidth: '47%' } : { width: '48%' }}
                  >
                    <SolidCard radius={20} style={{ padding: spacing.md, height: '100%' }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: isDark ? '#2E1F30' : '#FDF2F8',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: '#EC4899',
                          marginBottom: spacing.sm,
                        }}
                      >
                        <Ionicons name="cart" size={20} color="#EC4899" />
                      </View>
                      <AppText variant="bodySmall" weight="bold" style={{ marginBottom: 2 }}>
                        Marketplace
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={2}>
                        Textbooks, dorm essentials, gadgets & lab coats
                      </AppText>
                    </SolidCard>
                  </Pressable>
                )}

              </View>
            </View>

            {/* Featured Campus Events Section */}
            {isFeatureEnabled('campus_events') && (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <AppText variant="h3" weight="bold">
                    Featured Campus Events
                  </AppText>
                  <Pressable onPress={() => router.push('/(student)/events-list')}>
                    <AppText tone="brand" variant="bodySmall" weight="bold">
                      See All ({events?.length ?? 0}) →
                    </AppText>
                  </Pressable>
                </View>

                <View style={{ gap: spacing.sm }}>
                  {events?.slice(0, 2).map((evt) => (
                    <SolidCard key={evt.id} radius={18} style={{ padding: spacing.md }}>
                      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: radius.md,
                            backgroundColor: colors.pastelPrimaryBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: colors.brandPrimary,
                          }}
                        >
                          <Ionicons name="calendar" size={20} color={colors.brandPrimary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText weight="bold" variant="bodySmall">
                            {evt.title}
                          </AppText>
                          <AppText tone="secondary" variant="caption">
                            {evt.location} • {evt.rsvpCount} RSVPs
                          </AppText>
                        </View>
                        <Pressable
                          onPress={() => router.push('/(student)/events-list')}
                          style={{
                            backgroundColor: colors.brandPrimary,
                            borderRadius: radius.pill,
                            paddingHorizontal: spacing.md,
                            paddingVertical: 7,
                          }}
                        >
                          <AppText variant="caption" weight="bold" tone="inverse">
                            RSVP
                          </AppText>
                        </Pressable>
                      </View>
                    </SolidCard>
                  ))}
                </View>
              </View>
            )}

          </View>

          {/* Right Column on Desktop / Bottom Module on Mobile */}
          <View style={isDesktop ? { width: 340, gap: spacing.md } : { marginTop: spacing.md, gap: spacing.md }}>
            
            {/* Semester Academic Overview Card */}
            <SolidCard radius={20} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <AppText variant="h3" weight="bold">
                  Semester Overview
                </AppText>
                <Badge label="2025/2026" tone="brand" />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <View style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: radius.md, alignItems: 'center' }}>
                  <AppText variant="caption" tone="secondary">Courses</AppText>
                  <AppText variant="h2" weight="bold" tone="brand">6 Units</AppText>
                  <AppText variant="caption" style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>Active</AppText>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: radius.md, alignItems: 'center' }}>
                  <AppText variant="caption" tone="secondary">Attendance</AppText>
                  <AppText variant="h2" weight="bold" tone="brand">94%</AppText>
                  <AppText variant="caption" style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>Eligible</AppText>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" tone="secondary">Semester Progress</AppText>
                  <AppText variant="caption" weight="bold">Week 8 of 14</AppText>
                </View>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: '57%', height: '100%', backgroundColor: colors.brandPrimary, borderRadius: 3 }} />
                </View>
              </View>
            </SolidCard>

            {/* Department Representatives & Support Card */}
            <SolidCard radius={20} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <AppText variant="h3" weight="bold">
                  Department Support
                </AppText>
                <Ionicons name="shield-checkmark" size={16} color={colors.brandPrimary} />
              </View>

              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name="Tobi Alabi" size={36} />
                    <View>
                      <AppText variant="bodySmall" weight="bold">Tobi Alabi</AppText>
                      <AppText variant="caption" tone="secondary">Class Representative</AppText>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(student)/messages')}
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: colors.brandPrimary,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone="brand">Chat</AppText>
                  </Pressable>
                </View>
              </View>
            </SolidCard>

          </View>

        </View>
      </ScrollView>

      {/* Photo Picker Modal */}
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
                <Ionicons name="images" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Customize App Photos
                </AppText>
              </View>
              <Pressable onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={true}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
                CHOOSE AVATAR PHOTO
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = profile?.avatarUrl === preset.id;
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

              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
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
    </ScreenContainer>
  );
}
