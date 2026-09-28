import React, { useState } from 'react';
import { ScrollView, View, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { CampusWeatherWidget } from '@/components/CampusWeatherWidget';
import { CampusRadioPlayer } from '@/components/CampusRadioPlayer';
import { CurrencyConverterModal } from '@/components/CurrencyConverterModal';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { UnverifiedAccountNotice } from '@/components/UnverifiedAccountNotice';
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EmptyState } from '@/components/EmptyState';
import { AppTutorialModal } from '@/components/AppTutorialModal';
import { JobCard } from '@/components/JobCard';
import { EventCard } from '@/components/EventCard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
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
import { useReadHomeAlerts } from '@/utils/readDiscussionsTracker';
import { haptics } from '@/utils/haptics';
import { openExternalUrl } from '@/utils/openExternalUrl';

export default function AlumniDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const { campusCode, homeInstitutionCode } = useCampusScope();
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const { isRead, markAsRead } = useReadHomeAlerts();

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
      : '';

  const { data: posts } = useQuery({
    queryKey: ['feed', 'alumni-dash', effectiveCampus],
    queryFn: () => listFeedPosts({ scope: 'global', viewerInstitutionCode: effectiveCampus || undefined, viewScope: effectiveCampus ? 'campus' : 'global' }),
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs', 'alumni-dash', effectiveCampus],
    queryFn: () => listJobs({ campusCode: effectiveCampus || undefined }),
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

  function handleOpenPortal(url: string) {
    haptics.light();
    void openExternalUrl(url);
  }

  const activeJobs = (jobs ?? []).slice(0, 2);
  const attendingEvents = (events ?? []).filter((e: any) => e.isRsvpd === true);
  const upcomingEvents = (events ?? []).filter((e: any) => !e.isRsvpd).slice(0, 2);
  const activeDiscussions = (posts ?? []).filter((post: any) => !isRead(post.id)).slice(0, 3);
  const pendingMentees = (mentorships ?? []).filter((m: any) => m.status === 'pending' && m.mentorId === user?.id);
  const openMentorships = (mentorships ?? [])
    .filter((m: any) => (m.status === 'pending' || m.status === 'active') && m.mentorId === user?.id)
    .sort((a: any, b: any) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorships'] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['announcements'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-links'] }),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={isDesktop ? true : false}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brandPrimary}
            colors={[colors.brandPrimary, colors.brandAccent]}
          />
        }
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 130,
          gap: spacing.lg,
        }}
      >
        {/* 1. Hero Alumni Fellow Banner */}
        <GlassCard
          radius={22}
          padded={false}
          style={{
            overflow: 'hidden',
          }}
        >
          <View style={{ height: isDesktop ? 175 : 148, position: 'relative', width: '100%', overflow: 'hidden' }}>
            <Image
              source={require('../../assets/images/campus_library_study.jpg')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              accessibilityLabel="Campus library banner"
            />
            {/* Ambient Multi-Stop Gradient Overlay */}
            <LinearGradient
              colors={[
                'rgba(10, 16, 30, 0.2)',
                'rgba(10, 16, 30, 0.55)',
                isDark ? 'rgba(8, 14, 28, 0.94)' : 'rgba(15, 23, 42, 0.86)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />

            {/* Hero Content Overlay */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: isDesktop ? spacing.lg : 14,
                justifyContent: 'space-between',
              }}
            >
              {/* Top Row: Institution Badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.16)',
                    paddingHorizontal: 10,
                    paddingVertical: 4.5,
                    borderRadius: radius.pill,
                    maxWidth: '85%',
                  }}
                >
                  <Ionicons name="school" size={13} color="#FCD34D" style={[{ flexShrink: 0 }, heroTextShadowStyle]} />
                  <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11, flexShrink: 1 }, heroTextShadowStyle]}>
                    Alumni Fellowship • {profile?.institutionName ?? 'University Chapter'}
                  </AppText>
                </View>
              </View>

              {/* Bottom Row: Floating DP on the Left + Identity Metadata */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  onPress={() => router.push('/(alumni)/profile')}
                  accessibilityRole="button"
                  accessibilityLabel="View profile"
                  style={{
                    borderRadius: 999,
                    borderWidth: 2.5,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 6,
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  }}
                >
                  <Avatar name={fullName} uri={profile?.avatarUrl} size={isDesktop ? 58 : 50} role="alumni" />
                </Pressable>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText
                      weight="bold"
                      tone="inverse"
                      style={[
                        {
                          fontSize: isDesktop ? 18 : 16,
                          lineHeight: isDesktop ? 22 : 20,
                          color: '#FFFFFF',
                        },
                        heroTextShadowStyle,
                      ]}
                    >
                      {fullName}
                    </AppText>
                    {profile?.verificationStatus === 'verified' && (
                      <VerifiedBadge role="alumni" size={14} />
                    )}
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>

                  <AppText
                    style={[
                      {
                        marginTop: 2,
                        fontSize: isDesktop ? 12 : 11,
                        lineHeight: 15,
                        color: 'rgba(255, 255, 255, 0.85)',
                      },
                      heroTextShadowStyle,
                    ]}
                  >
                    {[
                      profile?.department,
                      profile?.graduationYear ? `Class of '${String(profile.graduationYear).slice(-2)}` : null,
                    ].filter(Boolean).join(' • ') || 'Alumni Network'}
                  </AppText>

                  {profile?.verificationStatus !== 'verified' && (
                    <Pressable
                      onPress={() => router.push('/(alumni)/profile')}
                      style={{ alignSelf: 'flex-start', marginTop: 3 }}
                    >
                      <AppText variant="caption" tone="inverse" style={[{ fontSize: 11, textDecorationLine: 'underline', opacity: 0.95 }, heroTextShadowStyle]}>
                        Verify Alumni Credentials →
                      </AppText>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Verification Notice for unverified personal email accounts */}
        <UnverifiedAccountNotice />

        

        {/* 2. Quick Alumni Action Hub (Clean 4-Item Grid) */}
        <View>
          <AppText
            weight="bold"
            style={{
              fontSize: isDesktop ? 17 : 14.5,
              lineHeight: isDesktop ? 22 : 18,
              letterSpacing: -0.2,
              marginBottom: spacing.xs,
            }}
          >
            Alumni Action Hub
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('e2ee_messaging') && (
              <Pressable
                onPress={() => router.push('/(alumni)/messages')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brandPrimary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>
                      Direct Messages
                    </AppText>
                    <AppText tone="secondary" style={{ fontSize: 10.5, marginTop: 1 }}>
                      Mentees & fellows
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('alumni_mentorship') && (
              <Pressable
                onPress={() => router.push('/(alumni)/mentorship')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name="people-outline" size={20} color="#10B981" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>
                      Mentorship
                    </AppText>
                    <AppText tone="secondary" style={{ fontSize: 10.5, marginTop: 1 }}>
                      {pendingMentees.length > 0 ? `${pendingMentees.length} pending` : 'Guide students'}
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('career_page') && (
              <Pressable
                onPress={() => router.push('/(alumni)/jobs')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name="briefcase-outline" size={20} color="#3B82F6" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>
                      Career Board
                    </AppText>
                    <AppText tone="secondary" style={{ fontSize: 10.5, marginTop: 1 }}>
                      Hire campus talent
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push('/(alumni)/network' as any)}
              style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Ionicons name="people-circle-outline" size={20} color="#8B5CF6" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>
                    Alumni Network
                  </AppText>
                  <AppText tone="secondary" style={{ fontSize: 10.5, marginTop: 1 }}>
                    Fellow directory
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>
          </View>
        </View>

        {/* 3. Official Campus & Alumni Bulletins */}
        <AnnouncementsWidget scope="alumni" />

        {/* 4. Career & Talent Opportunities (Live Job Board) */}
        {isFeatureEnabled('career_page') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="briefcase-outline" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
                >
                  Career Board
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/jobs')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  All ({jobs?.length ?? 0}) →
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="ribbon-outline" size={16} color="#10B981" style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
                >
                  Student Mentorship
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/mentorship')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  Hub →
                </AppText>
              </Pressable>
            </View>

            {openMentorships.length === 0 ? (
              <SolidCard radius={18} style={{ padding: spacing.md, alignItems: 'center' }}>
                <Ionicons name="school-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">Mentor undergraduate students</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.sm }}>
                  Set up your mentor profile and students can ask you for career advice, interview practice and project guidance.
                </AppText>
                <AppButton label="Open Mentorship Desk" variant="secondary" size="sm" onPress={() => router.push('/(alumni)/mentorship')} />
              </SolidCard>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {openMentorships.slice(0, 2).map((item: any) => (
                  <Pressable key={item.id} onPress={() => router.push(`/(alumni)/mentorship-space/${item.id}` as any)}>
                    <SolidCard radius={16} style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <Avatar name={item.studentName || 'Student'} size={28} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <AppText weight="bold" style={{ fontSize: isDesktop ? 13.5 : 12.5 }}>
                              {item.studentName || 'Student Mentee'}
                            </AppText>
                            <AppText variant="caption" tone="secondary" style={{ fontSize: isDesktop ? 11 : 10 }}>
                              Focus: {item.focusArea || 'Career Guidance'}
                            </AppText>
                          </View>
                        </View>
                        <View style={{ flexShrink: 0 }}>
                          <Badge
                            label={item.status === 'active' ? 'Active' : 'Needs reply'}
                            tone={item.status === 'active' ? 'success' : 'warning'}
                          />
                        </View>
                      </View>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 6. Alumni Reunions & Events */}
        {isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="calendar-outline" size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
                >
                  {attendingEvents.length > 0 ? "Reunions You're Attending" : 'Alumni Reunions & Events'}
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/events-list' as any)} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  All ({events?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {attendingEvents.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                {attendingEvents.slice(0, 2).map((evt: any) => (
                  <View key={evt.id} style={{ gap: 6 }}>
                    <EventCard event={evt} />
                    <Pressable
                      onPress={() => router.push(`/(alumni)/events/${evt.id}` as any)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <Ionicons name="qr-code-outline" size={15} color="#10B981" />
                      <AppText weight="bold" style={{ color: '#10B981', fontSize: 12 }}>
                        View Alumni Pass & Registration
                      </AppText>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : upcomingEvents.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {upcomingEvents.map((evt: any) => (
                  <EventCard key={evt.id} event={evt} />
                ))}
              </View>
            ) : (
              <SolidCard radius={18} style={{ padding: spacing.md, alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">No upcoming reunions scheduled</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.sm }}>
                  Alumni dinners, homecoming summits, and chapter meetings will appear here.
                </AppText>
                <AppButton label="Browse Alumni Events" variant="secondary" size="sm" onPress={() => router.push('/(alumni)/events-list' as any)} />
              </SolidCard>
            )}
          </View>
        )}

        {/* 7. Campus Discussions (Dismissible) */}
        {activeDiscussions.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="chatbubbles-outline" size={16} color="#EC4899" style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
                >
                  Campus Discussions
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/forum')} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  Forum →
                </AppText>
              </Pressable>
            </View>

            <View style={{ gap: spacing.xs }}>
              {activeDiscussions.map((post: any) => (
                <Pressable
                  key={post.id}
                  onPress={() => {
                    markAsRead(post.id);
                    router.push(`/(alumni)/post/${post.id}` as any);
                  }}
                >
                  <SolidCard radius={16} style={{ padding: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Avatar name={post.authorName ?? 'Fellow'} size={26} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText variant="caption" weight="bold">
                            {post.authorName ?? 'Fellow'}
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                            {post.department ?? 'Alumni Network'}
                          </AppText>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Badge label={post.category ?? 'Discussion'} tone="neutral" />
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            haptics.light();
                            markAsRead(post.id);
                          }}
                          hitSlop={10}
                          accessibilityLabel="Dismiss notice from home"
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: 0.7 }}
                        >
                          <Ionicons name="checkmark-done" size={15} color={colors.textSecondary} />
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Dismiss
                          </AppText>
                        </Pressable>
                      </View>
                    </View>

                    <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 2, marginBottom: 2 }}>
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
        )}

        {/* 8. Institutional Alumni & Graduate Services */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
            <Ionicons name="school-outline" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
            <AppText
              weight="bold"
              style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
            >
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
                <SolidCard radius={14} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    {portal.title}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 1, fontSize: isDesktop ? 11 : 10 }}>
                    {portal.category} • Official Alumni Service
                  </AppText>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <CurrencyConverterModal visible={currencyModalOpen} onClose={() => setCurrencyModalOpen(false)} />
      <AppTutorialModal userId={user?.id} />
    </ScreenContainer>
  );
}
