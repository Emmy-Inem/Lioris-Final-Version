import React, { useState } from 'react';
import { ScrollView, View, Pressable, Alert, Modal, Linking, Platform } from 'react-native';
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
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, updateProfileImages } from '@/api/profile';
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

  const { data: resources } = useQuery({
    queryKey: ['resources', 'dashboard'],
    queryFn: () => listResources({ approvalStatus: 'approved' }),
    enabled: isFeatureEnabled('academic_resources'),
  });

  const { data: studyGroups } = useQuery({
    queryKey: ['study-groups', 'dashboard', profile?.institutionCode],
    queryFn: () => listStudyGroups(profile?.institutionCode),
    enabled: isFeatureEnabled('study_groups'),
  });

  const { data: portalLinks } = useQuery({
    queryKey: ['portal-links', 'dashboard', profile?.institutionCode],
    queryFn: () => listPortalLinks(profile?.institutionCode),
  });

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Student';
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
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 120,
          gap: spacing.lg,
        }}
      >
        {/* 1. Student Identity & Hero Banner Card */}
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
                <Avatar name={profile?.fullName ?? user?.fullName ?? 'Student'} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="h2" weight="bold" numberOfLines={1} style={{ fontSize: 18 }}>
                      Welcome back, {firstName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ marginTop: 2, fontSize: 12 }}>
                    {profile?.department || 'Undergraduate Member'} • {profile?.institutionCode || 'UI Node'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {profile?.verificationStatus === 'verified' ? (
                  <Badge label="✓ Verified Student" tone="success" />
                ) : profile?.verificationStatus === 'pending' ? (
                  <Badge label="⏳ Verification In Review" tone="brand" />
                ) : (
                  <Pressable
                    onPress={() => router.push('/(student)/profile')}
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: colors.brandPrimary,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone="brand">
                      Verify Student ID →
                    </AppText>
                  </Pressable>
                )}
                <Badge label="Active Term" tone="brand" />
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Quick Student Everyday Productivity Actions */}
        <View>
          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
            Quick Actions
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('academic_resources') && (
              <Pressable
                onPress={() => router.push('/(student)/resources')}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
              >
                <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="folder-open" size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" weight="bold">Resources</AppText>
                    <AppText variant="caption" tone="secondary">Past questions & notes</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            {isFeatureEnabled('study_groups') && (
              <Pressable
                onPress={() => router.push('/(student)/study-groups')}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
              >
                <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={18} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" weight="bold">Study Pods</AppText>
                    <AppText variant="caption" tone="secondary">Course circles</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push('/(student)/feed')}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
            >
              <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#2E1F30' : '#FDF2F8', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubbles" size={18} color="#EC4899" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Ask / Discuss</AppText>
                  <AppText variant="caption" tone="secondary">Campus forum</AppText>
                </View>
              </SolidCard>
            </Pressable>

            {isFeatureEnabled('campus_events') && (
              <Pressable
                onPress={() => router.push('/(student)/events-list')}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
              >
                <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="calendar" size={18} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" weight="bold">Events & RSVPs</AppText>
                    <AppText variant="caption" tone="secondary">Workshops & talks</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}
          </View>
        </View>

        {/* 3. Official Campus Bulletins */}
        <AnnouncementsWidget scope="student" />

        {/* 4. Real Upcoming Campus Events */}
        {isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Upcoming Campus Events
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/events-list')}>
                <AppText tone="brand" variant="bodySmall" weight="bold">
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="document-text-outline" size={18} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Course Materials & Past Questions
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/resources')}>
                <AppText tone="brand" variant="bodySmall" weight="bold">
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Badge label={res.courseCode || 'GEN'} tone="brand" />
                          <AppText variant="caption" tone="secondary">
                            {res.department || 'Academic'}
                          </AppText>
                        </View>
                        <Badge label={res.category || 'Notes'} tone="neutral" />
                      </View>
                      <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                        {res.title}
                      </AppText>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <AppText variant="caption" tone="secondary">
                          By {res.authorName || 'Student'} • {res.downloadsCount ?? 0} downloads
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="cloud-download-outline" size={14} color={colors.brandPrimary} />
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="people-outline" size={18} color="#10B981" />
                <AppText variant="h3" weight="bold">
                  Active Study Pods
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(student)/study-groups')}>
                <AppText tone="brand" variant="bodySmall" weight="bold">
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Badge label={group.courseCode || 'Study Pod'} tone="success" />
                          <AppText variant="bodySmall" weight="bold">
                            {group.name}
                          </AppText>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" />
              <AppText variant="h3" weight="bold">
                Campus Discussions
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(student)/feed')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                View Full Forum →
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Avatar name={post.authorName ?? 'Student'} size={28} />
                      <View>
                        <AppText variant="caption" weight="bold">
                          {post.authorName ?? 'Student'}
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
                        {post.upvotesCount ?? 0}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
              <Ionicons name="link-outline" size={18} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                Official University Services
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(portalLinks ?? []).slice(0, 4).map((portal: any) => (
                <Pressable
                  key={portal.id}
                  onPress={() => handleOpenPortal(portal.url)}
                  style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 220 : 150 }}
                >
                  <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={portal.icon || 'globe-outline'} size={18} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                        {portal.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {portal.category} • Official
                      </AppText>
                    </View>
                    <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
                  </SolidCard>
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

