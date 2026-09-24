import React, { useState } from 'react';
import { ScrollView, View, Pressable, Alert, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { CampusWeatherWidget } from '@/components/CampusWeatherWidget';
import { CampusRadioPlayer } from '@/components/CampusRadioPlayer';
import { CurrencyConverterModal } from '@/components/CurrencyConverterModal';
import { CampusMapModal } from '@/components/CampusMapModal';
import { AppTutorialModal } from '@/components/AppTutorialModal';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { UnverifiedAccountNotice } from '@/components/UnverifiedAccountNotice';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile } from '@/api/profile';
import { useSignedUrl } from '@/api/signedUrls';
import { listFeedPosts } from '@/api/posts';
import { listEvents } from '@/api/events';
import { listResources } from '@/api/resources';
import { listStudyGroups } from '@/api/studyGroups';
import { listPortalLinks } from '@/api/portalLinks';
import { haptics } from '@/utils/haptics';
import { openExternalUrl } from '@/utils/openExternalUrl';

export default function StudentDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { campusCode, homeInstitutionCode } = useCampusScope();
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
      : '';

  const { data: recentPosts } = useQuery({
    queryKey: ['posts', 'dashboard-feed', effectiveCampus],
    queryFn: () => listFeedPosts({ scope: 'student', viewerInstitutionCode: effectiveCampus || undefined, viewScope: effectiveCampus ? 'campus' : 'global' }),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'student', effectiveCampus],
    queryFn: () => listEvents({ scope: 'student', campusCode: effectiveCampus || undefined }),
    enabled: isFeatureEnabled('campus_events'),
  });

  const { data: resources } = useQuery({
    queryKey: ['resources', 'dashboard', effectiveCampus],
    queryFn: () => listResources({ approvalStatus: 'approved', campusCode: effectiveCampus || undefined }),
    enabled: isFeatureEnabled('academic_resources'),
  });

  const { data: studyGroups } = useQuery({
    queryKey: ['study-groups', 'dashboard', effectiveCampus],
    queryFn: () => listStudyGroups(effectiveCampus || undefined),
    enabled: isFeatureEnabled('study_groups'),
  });

  const { data: portalLinks } = useQuery({
    queryKey: ['portal-links', 'dashboard', effectiveCampus],
    queryFn: () => listPortalLinks(effectiveCampus || undefined),
  });

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Student';
  const { url: resolvedCoverUrl } = useSignedUrl('campus-media', profile?.coverUrl);
  const activeCover = resolvedCoverUrl
    ? { uri: resolvedCoverUrl }
    : null;

  function handleOpenPortal(url: string) {
    haptics.light();
    void openExternalUrl(url);
  }

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    haptics.light();
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
        queryClient.invalidateQueries({ queryKey: ['study-groups'] }),
        queryClient.invalidateQueries({ queryKey: ['announcements'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-links'] }),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

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
          <View style={{ height: isDesktop ? 175 : 148, position: 'relative', width: '100%', overflow: 'hidden' }}>
            {activeCover ? (
              <Image source={activeCover} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={isDark ? ['#0d1b2a', '#1e293b', '#0f172a'] : ['#dbeafe', '#bfdbfe', '#93c5fd']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: '100%', height: '100%' }}
              />
            )}

            {/* Ambient Multi-Stop Gradient Overlay for Rich Glass Depth and High Contrast */}
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
                  <Ionicons name="school" size={13} color="#68D391" style={heroTextShadowStyle} />
                  <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11, flexShrink: 1 }, heroTextShadowStyle]}>
                    {profile?.institutionName ?? 'Campus Workspace'}
                  </AppText>
                </View>
              </View>

              {/* Bottom Row: Floating DP on the Left + Identity Metadata */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Floating DP on Left Side of Cover */}
                <Pressable
                  onPress={() => router.push('/(student)/profile')}
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
                  <Avatar name={profile?.fullName ?? user?.fullName ?? 'Student'} uri={profile?.avatarUrl} size={isDesktop ? 58 : 50} />
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
                      Welcome back, {firstName}
                    </AppText>
                    {profile?.verificationStatus === 'verified' || user?.role === 'admin' ? (
                      <VerifiedBadge size={16} name={profile?.fullName || firstName} role={user?.role} />
                    ) : null}
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
                    {[profile?.department, profile?.institutionCode].filter(Boolean).join(' • ') ||
                      'Complete your profile'}
                  </AppText>

                  {profile?.verificationStatus !== 'verified' && user?.role !== 'admin' ? (
                    <Pressable
                      onPress={() => router.push('/(student)/profile')}
                      style={{ alignSelf: 'flex-start', marginTop: 3 }}
                    >
                      <AppText variant="caption" tone="inverse" style={[{ fontSize: 11, textDecorationLine: 'underline', opacity: 0.95 }, heroTextShadowStyle]}>
                        Verify student ID →
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Verification Notice for unverified personal email accounts */}
        <UnverifiedAccountNotice />

        {/* Live Campus Weather & Transit Widget */}
        <CampusWeatherWidget campusCode={effectiveCampus} />

        {/* Live Campus Radio Player */}
        <CampusRadioPlayer />

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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Direct Messages</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Chats & calls</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>FX Converter</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Live rates & NGN</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Resources</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Past Qs & notes</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Study Pods</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Course revision</AppText>
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
                  <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Forum</AppText>
                  <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Ask questions</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Events & RSVPs</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Talks & summits</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Marketplace</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Buy, sell & swap</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Career & Jobs</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Internships & gigs</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Mentorship</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Alumni advisors</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>My Schedule</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>Timetable & tests</AppText>
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
                    <AppText weight="bold" style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>Campus Map & POIs</AppText>
                    <AppText tone="secondary" style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>ATMs, halls & food</AppText>
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
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
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
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
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
                          <AppText variant="caption" tone="secondary">
                            {res.department || 'Academic'}
                          </AppText>
                        </View>
                        <View style={{ flexShrink: 0, paddingLeft: 8 }}>
                          <Badge label={res.category || 'Notes'} tone="neutral" />
                        </View>
                      </View>
                      <AppText variant="bodySmall" weight="bold" style={{ lineHeight: 18 }}>
                        {res.title}
                      </AppText>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <AppText variant="caption" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
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
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
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
                          <AppText variant="bodySmall" weight="bold" style={{ flex: 1, lineHeight: 18 }}>
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
                      <AppText tone="secondary" variant="caption">
                        {group.description || 'Collaborative study pod for shared review and academic discussion.'}
                      </AppText>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 7. Active Campus Discussions */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" style={{ flexShrink: 0 }} />
              <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}>
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
                  description="Be the first to ask a question or start an academic discussion."
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
                        <AppText variant="caption" weight="bold">
                          {post.authorName ?? 'Student'}
                        </AppText>
                      </View>
                    </View>
                    <View style={{ flexShrink: 0 }}>
                      <Badge label={post.category ?? 'Discussion'} tone="neutral" />
                    </View>
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 4, marginBottom: 2 }}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {post.content}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="bulb-outline" size={14} color={colors.textSecondary} />
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
                      <AppText variant="bodySmall" weight="bold">
                        {portal.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
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

      <CurrencyConverterModal visible={currencyModalOpen} onClose={() => setCurrencyModalOpen(false)} />
      <CampusMapModal visible={campusMapOpen} onClose={() => setCampusMapOpen(false)} campusFilter={effectiveCampus} />
      <AppTutorialModal userId={user?.id} />
    </ScreenContainer>
  );
}

