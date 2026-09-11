import React, { useState } from 'react';
import { ScrollView, View, Pressable, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { CampusWeatherWidget } from '@/components/CampusWeatherWidget';
import { CampusRadioPlayer } from '@/components/CampusRadioPlayer';
import { AICopilotModal } from '@/components/AICopilotModal';
import { CurrencyConverterModal } from '@/components/CurrencyConverterModal';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
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
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

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
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={isDesktop ? true : false}
        keyboardShouldPersistTaps="handled"
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
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.55)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: '100%',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                <Ionicons name="school" size={13} color="#FCD34D" style={{ flexShrink: 0 }} />
                <AppText variant="caption" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>
                  Alumni Fellowship • {profile?.institutionName ?? 'University Chapter'}
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ padding: isDesktop ? spacing.lg : 14 }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0, width: '100%' }}>
                <Avatar name={fullName} uri={profile?.avatarUrl} size={isDesktop ? 52 : 44} role="alumni" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText
                      weight="bold"
                      numberOfLines={1}
                      style={{ fontSize: isDesktop ? 20 : 16, lineHeight: isDesktop ? 26 : 22, flexShrink: 1 }}
                    >
                      {fullName}
                    </AppText>
                    {profile?.verificationStatus === 'verified' && (
                      <VerifiedBadge role="alumni" size={14} />
                    )}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: isDesktop ? 12 : 11.5, fontWeight: '500' }}>
                    {profile?.department || 'Alumni Network'}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10.5, opacity: 0.8 }}>
                    {profile?.graduationYear ? `Class of '${String(profile.graduationYear).slice(-2)} • ` : ''}{profile?.institutionName || 'University Chapter'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: isDesktop ? 0 : 4 }}>
                {profile?.verificationStatus === 'pending' ? (
                  <Badge label="⏳ Verification In Review" tone="brand" />
                ) : profile?.verificationStatus !== 'verified' ? (
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
                ) : null}
                {profile?.graduationYear ? (
                  <Badge label={`Class of '${String(profile.graduationYear).slice(-2)}`} tone="brand" />
                ) : null}
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Alma Mater Live Campus Weather */}
        {isFeatureEnabled('live_weather') && <CampusWeatherWidget />}

        {/* Live Campus Radio Stream */}
        {isFeatureEnabled('campus_radio') && <CampusRadioPlayer />}

        {/* AI Career & Mentorship Assistant Banner */}
        {isFeatureEnabled('ai_study_copilot') && (
          <GlassCard
            radius={20}
            padded={false}
            contentStyle={{
              padding: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: `${colors.brandPrimary}20`,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Ionicons name="sparkles" size={17} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 14 : 13, lineHeight: 16 }}>
                    AI Career Copilot
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ fontSize: isDesktop ? 12 : 10.5, lineHeight: 14, marginTop: 2 }}>
                    Interviews, coaching & resume review
                  </AppText>
                </View>
              </View>
              <Pressable
                onPress={() => setCopilotOpen(true)}
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: isDesktop ? 12 : 10,
                  paddingVertical: isDesktop ? 6 : 5,
                  flexShrink: 0,
                }}
              >
                <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  Ask AI →
                </AppText>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* 2. Quick Alumni Action Hub (Responsive Grid) */}
        <View>
          <AppText
            weight="bold"
            style={{
              fontSize: isDesktop ? 18 : 15,
              lineHeight: isDesktop ? 24 : 20,
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
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#1F2937' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Direct Messages
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Mentees & fellows
                    </AppText>
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
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="cash-outline" size={16} color="#10B981" />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      FX & Endowments
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Live rate converter
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}
            {isFeatureEnabled('career_page') && (
              <Pressable
                onPress={() => router.push('/(alumni)/jobs')}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="briefcase" size={16} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Careers
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Post & find jobs
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('alumni_mentorship') && (
              <Pressable
                onPress={() => router.push('/(alumni)/mentorship')}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#1C2E2A' : '#ECFDF5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="people" size={16} color="#10B981" />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Mentorship
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      {pendingMentees.length > 0 ? `${pendingMentees.length} requests` : 'Guide students'}
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('campus_events') && (
              <Pressable
                onPress={() => router.push('/(alumni)/events-list' as any)}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="calendar" size={16} color="#3B82F6" />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Events
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Reunions & talks
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('marketplace') && (
              <Pressable
                onPress={() => router.push('/(alumni)/marketplace' as any)}
                style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 10 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 8 : 8,
                    minHeight: isDesktop ? 64 : 78,
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#2D2319' : '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="cart" size={16} color="#D97706" />
                  </View>
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Campus Trade
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Books & gear
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push('/(alumni)/forum')}
              style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 10 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 8 : 8,
                  minHeight: isDesktop ? 64 : 78,
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#2E1F30' : '#FDF2F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="chatbubbles" size={16} color="#EC4899" />
                </View>
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Global Forum
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                    Fellowship feed
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(alumni)/network' as any)}
              style={{ width: isDesktop ? 170 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 10 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 8 : 8,
                  minHeight: isDesktop ? 64 : 78,
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? '#2A1F3D' : '#F5F3FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="people-circle" size={16} color="#8B5CF6" />
                </View>
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Alumni Network
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
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
                <Ionicons name="briefcase-outline" size={16} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  numberOfLines={1}
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
                  numberOfLines={1}
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
                            <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13.5 : 12.5 }}>
                              {item.studentName || 'Student Mentee'}
                            </AppText>
                            <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10 }}>
                              Focus: {item.focusArea || 'Career Guidance'}
                            </AppText>
                          </View>
                        </View>
                        <View style={{ flexShrink: 0 }}>
                          <Badge
                            label={item.status === 'accepted' ? 'Active' : 'Pending'}
                            tone={item.status === 'accepted' ? 'success' : 'brand'}
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

        {/* 6. Upcoming Alumni Reunions & Events */}
        {isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="calendar-outline" size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
                <AppText
                  weight="bold"
                  numberOfLines={1}
                  style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
                >
                  Reunions & Events
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/(alumni)/events-list' as any)} style={{ flexShrink: 0 }} hitSlop={8}>
                <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                  All ({events?.length ?? 0}) →
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Ionicons name="chatbubbles-outline" size={16} color="#EC4899" style={{ flexShrink: 0 }} />
              <AppText
                weight="bold"
                numberOfLines={1}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
            <Ionicons name="school-outline" size={16} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
            <AppText
              weight="bold"
              numberOfLines={1}
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
                <SolidCard radius={16} style={{ padding: isDesktop ? 14 : 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={portal.icon || 'globe-outline'} size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      {portal.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2, fontSize: isDesktop ? 11 : 10 }}>
                      {portal.category} • Official Alumni Service
                    </AppText>
                  </View>
                  <Ionicons name="open-outline" size={15} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <AICopilotModal visible={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <CurrencyConverterModal visible={currencyModalOpen} onClose={() => setCurrencyModalOpen(false)} />
    </ScreenContainer>
  );
}
