import React from 'react';
import { ScrollView, View, Pressable, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EmptyState } from '@/components/EmptyState';
import { JobCard } from '@/components/JobCard';
import { EventCard } from '@/components/EventCard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { listFeedPosts } from '@/api/posts';
import { getMyProfile } from '@/api/profile';
import { listJobs } from '@/api/jobs';
import { listMentorships } from '@/api/mentorship';
import { listEvents } from '@/api/events';
import { listPortalLinks } from '@/api/portalLinks';
import { haptics } from '@/utils/haptics';

export default function AlumniDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const { campusCode, homeInstitutionCode } = useCampusScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const effectiveCampus = homeInstitutionCode || campusCode || profile?.institutionCode || 'UI';

  const { data: posts } = useQuery({
    queryKey: ['feed', 'alumni-dash', effectiveCampus],
    queryFn: () => listFeedPosts({ scope: 'global', viewerInstitutionCode: effectiveCampus, viewScope: 'campus' }),
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs', 'alumni-dash', effectiveCampus],
    queryFn: () => listJobs({ campusCode: effectiveCampus }),
    enabled: isFeatureEnabled('career_page'),
  });

  const { data: mentorships } = useQuery({
    queryKey: ['mentorships', 'alumni-dash'],
    queryFn: () => listMentorships(),
    enabled: isFeatureEnabled('alumni_mentorship'),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'alumni-dash', effectiveCampus],
    queryFn: () => listEvents({ scope: 'alumni', campusCode: effectiveCampus }),
    enabled: isFeatureEnabled('campus_events'),
  });

  const { data: portalLinks } = useQuery({
    queryKey: ['portal-links', 'alumni-dash', effectiveCampus],
    queryFn: () => listPortalLinks(effectiveCampus),
  });

  const fullName = profile?.fullName ?? user?.fullName ?? 'Alumni Fellow';
  const subtitleParts = [
    profile?.graduationYear ? `Class of '${String(profile.graduationYear).slice(-2)}` : null,
    profile?.department || 'Alumni Network',
    profile?.institutionName || 'University Chapter',
  ].filter(Boolean);

  function handleOpenPortal(url: string) {
    haptics.light();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }

  const activeJobs = (jobs ?? []).slice(0, 2);
  const upcomingEvents = (events ?? []).slice(0, 2);
  const pendingMentees = (mentorships ?? []).filter((m: any) => m.status === 'pending');

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 130,
          gap: spacing.lg,
        }}
      >
        {/* 1. Hero Alumni Fellow Banner */}
        <SolidCard
          radius={22}
          style={{
            overflow: 'hidden',
            padding: 0,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ height: isDesktop ? 160 : 115, position: 'relative', width: '100%' }}>
            <Image
              source={require('../../assets/images/campus_library_study.jpg')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isDark ? 'rgba(10, 19, 38, 0.75)' : 'rgba(15, 23, 42, 0.65)',
              }}
            />

            <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row' }}>
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.70)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: '100%',
                }}
              >
                <Ionicons name="school" size={13} color="#FCD34D" style={{ flexShrink: 0 }} />
                <AppText variant="caption" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>
                  Alumni Fellowship • {profile?.institutionName ?? 'University Chapter'}
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ padding: isDesktop ? spacing.lg : 14, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0, width: '100%' }}>
                <Avatar name={fullName} size={isDesktop ? 52 : 44} role="alumni" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                      Welcome, {fullName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                    {subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Verified Alumni Fellow'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: isDesktop ? 0 : 4 }}>
                {profile?.verificationStatus === 'verified' ? (
                  <Badge label="✓ Verified Alumni" tone="success" />
                ) : profile?.verificationStatus === 'pending' ? (
                  <Badge label="⏳ Verification In Review" tone="brand" />
                ) : (
                  <Pressable
                    onPress={() => router.push('/(alumni)/profile')}
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: colors.brandPrimary,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                      Verify Alumni Credentials →
                    </AppText>
                  </Pressable>
                )}
                {profile?.graduationYear ? (
                  <Badge label={`Class of '${String(profile.graduationYear).slice(-2)}`} tone="brand" />
                ) : null}
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Quick Alumni Action Hub (Responsive Grid) */}
        <View>
          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
            Alumni Action Hub
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('career_page') && (
              <Pressable
                onPress={() => router.push('/(alumni)/jobs')}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="briefcase" size={17} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Careers</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>Post & find jobs</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            {isFeatureEnabled('alumni_mentorship') && (
              <Pressable
                onPress={() => router.push('/(alumni)/mentorship')}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="people" size={17} color="#10B981" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Mentorship</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>
                      {pendingMentees.length > 0 ? `${pendingMentees.length} requests` : 'Guide students'}
                    </AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            {isFeatureEnabled('campus_events') && (
              <Pressable
                onPress={() => router.push('/(alumni)/events-list' as any)}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="calendar" size={17} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Events</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>Reunions & talks</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            {isFeatureEnabled('marketplace') && (
              <Pressable
                onPress={() => router.push('/(alumni)/marketplace' as any)}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? '#2D2319' : '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="cart" size={17} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Campus Trade</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>Books & gear</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push('/(alumni)/forum')}
              style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
            >
              <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? '#2E1F30' : '#FDF2F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="chatbubbles" size={17} color="#EC4899" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Global Forum</AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>Fellowship feed</AppText>
                </View>
              </SolidCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(alumni)/connection-requests')}
              style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
            >
              <SolidCard radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? '#2A1F3D' : '#F5F3FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="people-circle" size={17} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodySmall" weight="bold" numberOfLines={1}>Alumni Network</AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5 }}>Fellow directory</AppText>
                </View>
              </SolidCard>
            </Pressable>
          </View>
        </View>

        {/* 3. Official Campus & Alumni Bulletins */}
        <AnnouncementsWidget scope="alumni" />

        {/* 4. Career & Talent Opportunities (Live Job Board) */}
        {isFeatureEnabled('career_page') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="briefcase-outline" size={18} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  Career & Hiring Board
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/jobs')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold">
                  All Openings ({jobs?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {activeJobs.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.md, alignItems: 'center' }}>
                <Ionicons name="briefcase-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">No active job openings yet</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.sm }}>
                  Post an internship, graduate role, or remote contract to hire university talent.
                </AppText>
                <AppButton label="+ Post Career Opportunity" size="sm" onPress={() => router.push('/(alumni)/jobs')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {activeJobs.map((job: any) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* 5. Student Mentorship Requests & Impact */}
        {isFeatureEnabled('alumni_mentorship') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="ribbon-outline" size={18} color="#10B981" style={{ flexShrink: 0 }} />
                <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  Student Mentorship & Giving Back
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/mentorship')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold">
                  Mentorship Hub →
                </AppText>
              </Pressable>
            </View>

            {(mentorships ?? []).length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.md, alignItems: 'center' }}>
                <Ionicons name="school-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">Mentor undergraduate students</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.sm }}>
                  Help undergraduates in your department with career advice and project guidance.
                </AppText>
                <AppButton label="Open Mentorship Desk" variant="secondary" size="sm" onPress={() => router.push('/(alumni)/mentorship')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {(mentorships ?? []).slice(0, 2).map((item: any) => (
                  <Pressable key={item.id} onPress={() => router.push('/(alumni)/mentorship')}>
                    <SolidCard radius={16} style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <Avatar name={item.studentName || 'Student'} size={28} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                              {item.studentName || 'Student Mentee'}
                            </AppText>
                            <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11 }}>
                              Focus: {item.focusArea || 'Career Guidance'}
                            </AppText>
                          </View>
                        </View>
                        <Badge
                          label={item.status === 'accepted' ? 'Active Mentee' : 'Pending Request'}
                          tone={item.status === 'accepted' ? 'success' : 'brand'}
                        />
                      </View>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 6. Upcoming Alumni Reunions & Events */}
        {isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Ionicons name="calendar-outline" size={18} color="#3B82F6" style={{ flexShrink: 0 }} />
                <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  Alumni Reunions & Events
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/events-list' as any)} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold">
                  View Calendar ({events?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {upcomingEvents.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.md, alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">No upcoming reunions scheduled</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.sm }}>
                  Alumni dinners, homecoming summits, and chapter meetings will appear here.
                </AppText>
                <AppButton label="Browse Alumni Events" variant="secondary" size="sm" onPress={() => router.push('/(alumni)/events-list' as any)} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {upcomingEvents.map((evt: any) => (
                  <EventCard key={evt.id} event={evt} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* 7. Live Campus & Alumni Pulse Feed */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" style={{ flexShrink: 0 }} />
              <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                Campus Pulse & Discussions
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(alumni)/forum')} style={{ flexShrink: 0 }} hitSlop={8}>
              <AppText tone="brand" variant="caption" weight="bold">
                View Global Forum →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.xs }}>
            {(posts ?? []).length === 0 ? (
              <SolidCard radius={18} style={{ padding: 0 }}>
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No discussions yet"
                  description="Be the first to start a conversation on the global forum."
                  actionLabel="Open Forum"
                  onAction={() => router.push('/(alumni)/forum')}
                />
              </SolidCard>
            ) : null}
            {(posts ?? []).slice(0, 3).map((post: any) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/(alumni)/post/${post.id}` as any)}
              >
                <SolidCard radius={16} style={{ padding: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Avatar name={post.authorName ?? 'Fellow'} size={26} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="caption" weight="bold" numberOfLines={1}>
                          {post.authorName ?? 'Fellow'}
                        </AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10 }}>
                          {post.department ?? 'Alumni Network'}
                        </AppText>
                      </View>
                    </View>
                    <Badge label={post.category ?? 'Discussion'} tone="brand" />
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" numberOfLines={1} style={{ marginTop: 2, marginBottom: 2 }}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2}>
                    {post.content}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart-outline" size={13} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                        {post.upvotesCount ?? 0}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                        {post.commentsCount ?? 0} replies
                      </AppText>
                    </View>
                  </View>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 8. Institutional Alumni & Graduate Services */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
            <Ionicons name="school-outline" size={18} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
            <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
              Alumni & Graduate Services
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(portalLinks ?? []).slice(0, 4).map((portal: any) => (
              <Pressable
                key={portal.id}
                onPress={() => handleOpenPortal(portal.url)}
                style={{ width: isDesktop ? '48%' : '100%', flexGrow: 1 }}
              >
                <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={portal.icon || 'globe-outline'} size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                      {portal.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2, fontSize: 11 }}>
                      {portal.category} • Official Alumni Service
                    </AppText>
                  </View>
                  <Ionicons name="open-outline" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
