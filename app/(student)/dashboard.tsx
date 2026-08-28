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
import { listFeedPosts } from '@/api/posts';
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

  const { data: recentPosts } = useQuery({
    queryKey: ['posts', 'dashboard-feed'],
    queryFn: () => listFeedPosts({ scope: 'student' }),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'student'],
    queryFn: () => listEvents({ scope: 'student' }),
    enabled: isFeatureEnabled('campus_events'),
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
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          maxWidth: 1120,
          alignSelf: 'center',
          width: '100%',
          paddingHorizontal: isDesktop ? spacing.lg : 14,
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 120,
          gap: spacing.lg,
        }}
      >
        {/* 1. Sleek Hero Profile Card */}
        <SolidCard
          radius={22}
          style={{
            overflow: 'hidden',
            padding: 0,
            borderWidth: 1,
            borderColor: colors.border,
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

            <View style={{ position: 'absolute', top: 14, left: 16 }}>
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ionicons name="school" size={14} color="#68D391" />
                <AppText variant="caption" weight="bold" tone="inverse">
                  {profile?.institutionName ?? 'University of Ibadan'}
                </AppText>
              </View>
            </View>

            <Pressable
              onPress={() => {
                haptics.light();
                setPhotoPickerOpen(true);
              }}
              style={{
                position: 'absolute',
                top: 14,
                right: 16,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="camera-outline" size={14} color="#FFFFFF" />
              <AppText variant="caption" weight="bold" tone="inverse">
                Customize Banner
              </AppText>
            </Pressable>
          </View>

                    <View style={{ padding: isDesktop ? spacing.lg : 14, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={profile?.fullName ?? user?.fullName ?? 'Diana Prince'} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="h2" weight="bold" numberOfLines={1} style={{ fontSize: 18 }}>
                      Welcome back, {firstName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ marginTop: 2, fontSize: 12 }}>
                    {profile?.department ?? 'Computer Science & AI'} • Level {profile?.level ?? 400}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Badge label="Verified Student" tone="brand" />
                <Badge label="Active Term" tone="success" />
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Official Campus Announcements */}
        <AnnouncementsWidget scope="student" />

        {/* 3. Balanced 4-KPI Academic Overview Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          <View style={{ width: isDesktop ? ('calc(25% - 8px)' as any) : ('calc(50% - 5px)' as any) }}>
            <SolidCard radius={18} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold" style={{ fontSize: 10, letterSpacing: 0.5 }}>
                  COURSES
                </AppText>
                <Ionicons name="book-outline" size={15} color={colors.brandPrimary} />
              </View>
              <AppText variant="h2" weight="bold" tone="brand" style={{ fontSize: 20 }}>
                6 Units
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 3, fontSize: 11 }} numberOfLines={1}>
                ✓ Cleared for Term
              </AppText>
            </SolidCard>
          </View>

          <View style={{ width: isDesktop ? ('calc(25% - 8px)' as any) : ('calc(50% - 5px)' as any) }}>
            <SolidCard radius={18} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold" style={{ fontSize: 10, letterSpacing: 0.5 }}>
                  ATTENDANCE
                </AppText>
                <Ionicons name="checkmark-done-circle-outline" size={15} color="#10B981" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand" style={{ fontSize: 20 }}>
                94%
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 3, fontSize: 11 }} numberOfLines={1}>
                ✓ Exam Eligible
              </AppText>
            </SolidCard>
          </View>

          <View style={{ width: isDesktop ? ('calc(25% - 8px)' as any) : ('calc(50% - 5px)' as any) }}>
            <SolidCard radius={18} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold" style={{ fontSize: 10, letterSpacing: 0.5 }}>
                  TIMELINE
                </AppText>
                <Ionicons name="time-outline" size={15} color="#3B82F6" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand" style={{ fontSize: 20 }}>
                Week 8
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 3, fontSize: 11 }} numberOfLines={1}>
                of 14 (Midterm)
              </AppText>
            </SolidCard>
          </View>

          <View style={{ width: isDesktop ? ('calc(25% - 8px)' as any) : ('calc(50% - 5px)' as any) }}>
            <SolidCard radius={18} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold" style={{ fontSize: 10, letterSpacing: 0.5 }}>
                  STATUS
                </AppText>
                <Ionicons name="shield-checkmark-outline" size={15} color="#8B5CF6" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand" style={{ fontSize: 20 }} numberOfLines={1}>
                Good Standing
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 3, fontSize: 11 }} numberOfLines={1}>
                ✓ Verified Matric
              </AppText>
            </SolidCard>
          </View>
        </View>

        {/* 4. Optional Enabled Modules Grid (Only if toggled ON in Admin) */}
        {(isFeatureEnabled('academic_resources') || isFeatureEnabled('career_page') || isFeatureEnabled('marketplace') || isFeatureEnabled('campus_events')) && (
          <View>
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
              Campus Portals & Hubs
            </AppText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {isFeatureEnabled('academic_resources') && (
                <Pressable
                  onPress={() => router.push('/(student)/resources')}
                  style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}
                >
                  <SolidCard radius={18} style={{ padding: spacing.md, height: '100%' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary }}>
                      <Ionicons name="folder-open" size={18} color={colors.brandPrimary} />
                    </View>
                    <AppText variant="bodySmall" weight="bold">Resources Library</AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={2}>
                      Lecture notes & solved past questions
                    </AppText>
                  </SolidCard>
                </Pressable>
              )}

              {isFeatureEnabled('career_page') && (
                <Pressable
                  onPress={() => router.push('/(student)/jobs')}
                  style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}
                >
                  <SolidCard radius={18} style={{ padding: spacing.md, height: '100%' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderWidth: 1, borderColor: '#10B981' }}>
                      <Ionicons name="briefcase" size={18} color="#10B981" />
                    </View>
                    <AppText variant="bodySmall" weight="bold">Opportunities</AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={2}>
                      Student internships & company roles
                    </AppText>
                  </SolidCard>
                </Pressable>
              )}

              {isFeatureEnabled('marketplace') && (
                <Pressable
                  onPress={() => router.push('/(student)/marketplace')}
                  style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}
                >
                  <SolidCard radius={18} style={{ padding: spacing.md, height: '100%' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#2E1F30' : '#FDF2F8', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderWidth: 1, borderColor: '#EC4899' }}>
                      <Ionicons name="cart" size={18} color="#EC4899" />
                    </View>
                    <AppText variant="bodySmall" weight="bold">Marketplace</AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={2}>
                      Buy/sell textbooks & dorm kits
                    </AppText>
                  </SolidCard>
                </Pressable>
              )}

              {isFeatureEnabled('campus_events') && (
                <Pressable
                  onPress={() => router.push('/(student)/events-list')}
                  style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}
                >
                  <SolidCard radius={18} style={{ padding: spacing.md, height: '100%' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderWidth: 1, borderColor: '#3B82F6' }}>
                      <Ionicons name="calendar" size={18} color="#3B82F6" />
                    </View>
                    <AppText variant="bodySmall" weight="bold">Events Hub</AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={2}>
                      Campus workshops & hackathons
                    </AppText>
                  </SolidCard>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* 5. Live Campus Feed Preview */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <AppText variant="h3" weight="bold">
              Trending Campus Discussions
            </AppText>
            <Pressable onPress={() => router.push('/(student)/feed')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                View Full Forum →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {(recentPosts ?? []).slice(0, 3).map((post: any) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/(student)/post/${post.id}` as any)}
              >
                <SolidCard radius={18} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Avatar name={post.authorName ?? 'Student'} size={28} />
                      <View>
                        <AppText variant="caption" weight="bold">
                          {post.authorName}
                        </AppText>
                        <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                          {post.department ?? 'Computer Science'}
                        </AppText>
                      </View>
                    </View>
                    <Badge label={post.category ?? 'Discussion'} tone="brand" />
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 4, marginBottom: 2 }}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2}>
                    {post.content}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.upvotesCount ?? 12}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.commentsCount ?? 4} replies
                      </AppText>
                    </View>
                  </View>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 6. Department Representative Support Card */}
        <SolidCard radius={18} style={{ padding: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name="Tobi Alabi" size={40} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppText variant="bodySmall" weight="bold">
                    Tobi Alabi
                  </AppText>
                  <Badge label="Class Rep" tone="brand" />
                </View>
                <AppText tone="secondary" variant="caption">
                  300L Computer Science • Academic & Cohort Inquiries
                </AppText>
              </View>
            </View>
            {isFeatureEnabled('e2ee_messaging') ? (
              <Pressable
                onPress={() => router.push('/(student)/messages')}
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                }}
              >
                <AppText variant="caption" weight="bold" tone="inverse">
                  Message Rep
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </SolidCard>

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
                <Ionicons name="images" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Customize App Photos
                </AppText>
              </View>
              <Pressable onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
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
