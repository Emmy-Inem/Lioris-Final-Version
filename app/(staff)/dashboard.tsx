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
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EventCard } from '@/components/EventCard';
import { EmptyState } from '@/components/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { listAnnouncements } from '@/api/announcements';
import { listReports } from '@/api/moderation';
import { listEvents } from '@/api/events';
import { listFeedPosts } from '@/api/posts';
import { listResources } from '@/api/resources';
import { listPortalLinks } from '@/api/portalLinks';
import { getMyProfile } from '@/api/profile';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { haptics } from '@/utils/haptics';

export default function StaffDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
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

  const { data: openReports } = useQuery({
    queryKey: ['reports', 'open', effectiveCampus],
    queryFn: () => listReports({ status: 'open', institutionCode: effectiveCampus }),
  });

  const { data: pendingResources } = useQuery({
    queryKey: ['resources', 'pending-review', effectiveCampus],
    queryFn: () => listResources({ approvalStatus: 'pending', campusCode: effectiveCampus }),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'staff-dash', effectiveCampus],
    queryFn: () => listEvents({ scope: 'global', campusCode: effectiveCampus }),
  });

  const { data: studentPosts } = useQuery({
    queryKey: ['posts', 'staff-student-pulse', effectiveCampus],
    queryFn: () => listFeedPosts({ scope: 'student', viewerInstitutionCode: effectiveCampus, viewScope: 'campus' }),
  });

  const { data: portalLinks } = useQuery({
    queryKey: ['portal-links', 'staff-dash', effectiveCampus],
    queryFn: () => listPortalLinks(effectiveCampus),
  });

  const fullName = profile?.fullName ?? user?.fullName ?? 'Dr. Faculty Member';
  const institutionName = profile?.institutionName || LAUNCH_INSTITUTIONS.find((i) => i.code === effectiveCampus)?.name || 'University of Ibadan';
  const openReportsCount = openReports?.length ?? 0;
  const pendingResourcesCount = pendingResources?.length ?? 0;
  const upcomingEvents = (events ?? []).slice(0, 2);

  function handleOpenPortal(url: string) {
    haptics.light();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }

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
        {/* 1. Hero Faculty Card */}
        <GlassCard
          radius={22}
          padded={false}
          style={{
            overflow: 'hidden',
          }}
        >
          <View style={{ height: isDesktop ? 160 : 120, position: 'relative', width: '100%' }}>
            <Image
              source={require('../../assets/images/campus_students_photo.jpg')}
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

            <View style={{ position: 'absolute', top: 14, left: 16, right: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ionicons name="school" size={14} color="#68D391" style={[{ flexShrink: 0 }, heroTextShadowStyle]} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <AppText variant="caption" weight="bold" tone="inverse" style={heroTextShadowStyle}>
                    Faculty Console • {institutionName}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          <View style={{ padding: isDesktop ? spacing.lg : 14 }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 }}>
                <View style={{ flexShrink: 0 }}>
                  <Avatar name={fullName} uri={profile?.avatarUrl} size={isDesktop ? 56 : 46} role="staff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText
                      weight="bold"
                      numberOfLines={1}
                      style={{ fontSize: isDesktop ? 22 : 16, lineHeight: isDesktop ? 28 : 22 }}
                    >
                      Welcome, {fullName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: isDesktop ? 12 : 11.5, fontWeight: '500' }}>
                    {profile?.department || 'Department of Computer Science'}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10.5, opacity: 0.8 }}>
                    Faculty Member • {profile?.institutionCode || 'UI Node'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center', marginTop: isDesktop ? 0 : 4 }}>
                <Badge label="Faculty Staff" tone="neutral" />
                <Badge label="Harmattan Term 2026" tone="success" />
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Live Weather & Transit Widget */}
        {isFeatureEnabled('live_weather') && <CampusWeatherWidget />}

        {/* Live Campus Radio Player */}
        {isFeatureEnabled('campus_radio') && <CampusRadioPlayer />}

        {/* AI Faculty Teaching Copilot Banner */}
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
                    backgroundColor: colors.divider,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Ionicons name="sparkles" size={17} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 14 : 13, lineHeight: 16 }}>
                    AI Teaching Assistant
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ fontSize: isDesktop ? 12 : 10.5, lineHeight: 14, marginTop: 2 }}>
                    Syllabus, quiz generation & rubrics
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

        {/* 2. Urgent Safety & Content Moderation Alerts */}
        {openReportsCount > 0 && (
          <Pressable onPress={() => router.push('/(staff)/moderation')}>
            <SolidCard
              radius={16}
              style={{
                padding: isDesktop ? 14 : 11,
                backgroundColor: isDark ? '#2A1810' : '#FFF7ED',
                borderWidth: 1,
                borderColor: '#F97316',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="shield-half" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" style={{ color: '#EA580C', fontSize: isDesktop ? 13.5 : 12.5 }} numberOfLines={1}>
                    {openReportsCount} Pending Content Flag{openReportsCount > 1 ? 's' : ''}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10.5 }}>
                    Requires faculty review on moderation desk
                  </AppText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#EA580C" style={{ flexShrink: 0 }} />
            </SolidCard>
          </Pressable>
        )}

        {/* 3. Faculty Command Actions Grid */}
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
            Faculty Command Actions
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('e2ee_messaging') && (
              <Pressable
                onPress={() => router.push('/(staff)/messages')}
                style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? undefined : 78,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color={colors.textSecondary} />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Direct Messages
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Faculty chat
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
                style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
              >
                <GlassCard
                  radius={16}
                  padded={false}
                  contentStyle={{
                    padding: isDesktop ? 12 : 10,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? 10 : 8,
                    minHeight: isDesktop ? undefined : 78,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="cash-outline" size={20} color="#10B981" />
                  <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      Grant & FX Rates
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                      Rate converter
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push('/(staff)/announcements')}
              style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 12 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 10 : 8,
                  minHeight: isDesktop ? undefined : 78,
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="megaphone" size={20} color={colors.textSecondary} />
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Broadcast
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                    Post notices
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/moderation')}
              style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 12 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 10 : 8,
                  minHeight: isDesktop ? undefined : 78,
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="shield-checkmark" size={20} color="#EF4444" />
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Moderation
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                    {openReportsCount > 0 ? `${openReportsCount} flags` : 'Queue clear'}
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/events-list' as any)}
              style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 12 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 10 : 8,
                  minHeight: isDesktop ? undefined : 78,
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="calendar" size={20} color="#3B82F6" />
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Faculty Events
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                    Seminars & talks
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/forum')}
              style={{ width: isDesktop ? 180 : '48%', flexGrow: 1 }}
            >
              <GlassCard
                radius={16}
                padded={false}
                contentStyle={{
                  padding: isDesktop ? 12 : 10,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'flex-start',
                  gap: isDesktop ? 10 : 8,
                  minHeight: isDesktop ? undefined : 78,
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="chatbubbles" size={20} color="#EC4899" />
                <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                    Faculty Forum
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: isDesktop ? 11 : 10, marginTop: 1 }}>
                    Academic feed
                  </AppText>
                </View>
              </GlassCard>
            </Pressable>
          </View>
        </View>

        {/* 4. Official Faculty Broadcasts & Announcements */}
        {/* The widget owns this header so the section can't render a title
            with nothing under it (when there are no bulletins) or two
            stacked titles (when there are). */}
        <AnnouncementsWidget
          scope="staff"
          title="Campus Bulletins"
          showWhenEmpty
          emptyMessage="No bulletins posted yet. Publish a notice and it will appear here for faculty and students."
          action={
            <Pressable onPress={() => router.push('/(staff)/announcements')} style={{ flexShrink: 0 }} hitSlop={8}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                + New Notice →
              </AppText>
            </Pressable>
          }
        />

        {/* 5. Academic Symposiums & Faculty Events */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Ionicons name="calendar-outline" size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
              <AppText
                weight="bold"
                numberOfLines={1}
                style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
              >
                Faculty Events
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(staff)/events-list' as any)} style={{ flexShrink: 0 }} hitSlop={8}>
              <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                All ({events?.length ?? 0}) →
              </AppText>
            </Pressable>
          </View>

          {upcomingEvents.length === 0 ? (
            <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
              <AppText weight="bold" variant="bodySmall">No upcoming faculty seminars</AppText>
              <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                Academic symposiums, faculty meetings, and guest lectures will appear here.
              </AppText>
              <AppButton label="Browse Calendar" variant="secondary" onPress={() => router.push('/(staff)/events-list' as any)} />
            </SolidCard>
          ) : (
            <View style={{ gap: spacing.md }}>
              {upcomingEvents.map((evt: any) => (
                <EventCard key={evt.id} event={evt} />
              ))}
            </View>
          )}
        </View>

        {/* 6. Trending Campus Inquiries & Academic Discussions */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Ionicons name="chatbubbles-outline" size={16} color="#EC4899" style={{ flexShrink: 0 }} />
              <AppText
                weight="bold"
                numberOfLines={1}
                style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
              >
                Faculty Pulse
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(staff)/forum')} style={{ flexShrink: 0 }} hitSlop={8}>
              <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: isDesktop ? 12 : 11 }}>
                Forum →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {(studentPosts ?? []).slice(0, 3).map((post: any) => (
              <Pressable key={post.id} onPress={() => router.push(`/(staff)/post/${post.id}` as any)}>
                <SolidCard radius={18} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <View style={{ flexShrink: 0 }}>
                        <Avatar name={post.authorName ?? 'Student'} size={28} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="caption" weight="bold" numberOfLines={1}>
                          {post.authorName ?? 'Student'}
                        </AppText>
                        <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }} numberOfLines={1}>
                          {post.department ?? 'Computer Science'}
                        </AppText>
                      </View>
                    </View>
                    <View style={{ flexShrink: 0, marginLeft: 8 }}>
                      <Badge label={post.category ?? 'Discussion'} tone="neutral" />
                    </View>
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 4, marginBottom: 2 }}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2}>
                    {post.content}
                  </AppText>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 7. Official Faculty & Academic Institutional Portals */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs, flex: 1, minWidth: 0 }}>
            <Ionicons name="school-outline" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
            <AppText
              weight="bold"
              numberOfLines={1}
              style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, flex: 1 }}
            >
              Official Faculty Services
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
                  <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={portal.icon || 'globe-outline'} size={22} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 13 : 12, lineHeight: 16 }}>
                      {portal.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2, fontSize: isDesktop ? 11 : 10 }}>
                      {portal.category} • Official Faculty Portal
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
