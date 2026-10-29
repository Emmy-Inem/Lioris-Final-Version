import React, { useState, useEffect } from 'react';
import { Alert, ScrollView, View, Pressable, RefreshControl, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { haptics } from '@/utils/haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { CampusMapModal } from '@/components/CampusMapModal';
import { AppTutorialModal } from '@/components/AppTutorialModal';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AmbassadorBadge } from '@/components/AmbassadorBadge';
import { UnverifiedAccountNotice } from '@/components/UnverifiedAccountNotice';
import { ErrorStateView } from '@/components/ErrorStateView';
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
import { listSavedItems, SAVED_ITEMS_KEY } from '@/api/bookmarks';
import { listStudyGroups } from '@/api/studyGroups';
import { listPortalLinks } from '@/api/portalLinks';
import { listAnnouncements } from '@/api/announcements';
import { Announcement } from '@/api/types';
import { useReadHomeAlerts } from '@/utils/readDiscussionsTracker';
import { useBotVisibility } from '@/hooks/useBotVisibility';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isSuperAdminIdentity } from '@/utils/campusAccess';
import { refetchFailedQueries, summarizeQueryErrors } from '@/utils/queryError';
import { getInstitutionByCode } from '@/api/institutions';
import {
  getVisitedPortalLinks,
  recordPortalLinkVisit,
  isPortalVisitedInLast3Months,
  subscribePortalVisits,
} from '@/utils/portalVisits';

export default function StudentDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user, enterAmbassadorWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { campusCode, homeInstitutionCode, activeCampusCode } = useCampusScope();
  const insets = useSafeAreaInsets();

  const [campusMapOpen, setCampusMapOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [profileNudgeDismissed, setProfileNudgeDismissed] = useState(false);

  // Read / Dismissed Tracker for Home broadcasts & discussions
  const { isRead, markAsRead } = useReadHomeAlerts();
  const { showBots, isBotPost } = useBotVisibility();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const isSuperAdmin = isSuperAdminIdentity(user);

  const effectiveCampus = isSuperAdmin
    ? (activeCampusCode && activeCampusCode !== 'GLOBAL' && activeCampusCode !== 'ALL'
        ? activeCampusCode
        : 'ALL')
    : (homeInstitutionCode && homeInstitutionCode !== 'GLOBAL'
        ? homeInstitutionCode
        : campusCode && campusCode !== 'GLOBAL'
        ? campusCode
        : profile?.institutionCode && profile.institutionCode !== 'GLOBAL'
        ? profile.institutionCode
        : 'GLOBAL');

  // 1. Announcements & Important Alerts
  const announcementsQuery = useQuery({
    queryKey: ['announcements', 'dashboard', effectiveCampus],
    queryFn: () => listAnnouncements({ campusCode: effectiveCampus }),
    enabled: isFeatureEnabled('campus_announcements'),
  });
  const announcements = announcementsQuery.data ?? [];

  // 2. Pinned or urgent discussion threads
  const recentPostsQuery = useQuery({
    queryKey: ['posts', 'dashboard-feed', effectiveCampus, showBots],
    queryFn: () =>
      listFeedPosts({
        scope: 'student',
        viewerInstitutionCode: effectiveCampus === 'ALL' ? undefined : (effectiveCampus || undefined),
        viewScope: effectiveCampus === 'ALL' ? 'global' : (effectiveCampus ? 'campus' : 'global'),
        showBots,
        pageSize: 30,
      }),
  });
  const recentPosts = recentPostsQuery.data ?? [];

  // 3. Events (Attending vs Featured)
  const eventsQuery = useQuery({
    queryKey: ['events', isSuperAdmin ? 'all' : 'student', effectiveCampus],
    queryFn: () => listEvents({ scope: isSuperAdmin ? 'all' : 'student', campusCode: effectiveCampus || undefined }),
    enabled: isFeatureEnabled('campus_events'),
  });
  const events = eventsQuery.data ?? [];

  // 4. Saved Resources ONLY (per user request: replace cross-department clutter with bookmarked materials)
  const savedResourcesQuery = useQuery({
    queryKey: SAVED_ITEMS_KEY('resource'),
    queryFn: () => listSavedItems('resource'),
    enabled: isFeatureEnabled('academic_resources'),
  });
  const savedResources = savedResourcesQuery.data ?? [];

  // 5. Active Study Pods (enrolled only)
  const studyGroupsQuery = useQuery({
    queryKey: ['study-groups', 'dashboard', effectiveCampus],
    queryFn: () => listStudyGroups(effectiveCampus === 'ALL' ? undefined : (effectiveCampus || undefined), { mineOnly: true }),
    enabled: isFeatureEnabled('study_groups'),
  });
  const studyGroups = studyGroupsQuery.data ?? [];

  // 6. University Services
  const { data: portalLinks = [] } = useQuery({
    queryKey: ['portal-links', 'dashboard', effectiveCampus],
    queryFn: () => listPortalLinks(effectiveCampus || undefined),
  });

  // A failed load must not read as "nothing here": show an error (or a small notice if other sections loaded).
  const mainQueries = [announcementsQuery, recentPostsQuery, eventsQuery, savedResourcesQuery, studyGroupsQuery];
  const loadErrors = summarizeQueryErrors(mainQueries);
  const loadBlocked = loadErrors.mode === 'blocking';

  const [portalVisits, setPortalVisits] = useState<Record<string, number>>({});

  useEffect(() => {
    getVisitedPortalLinks(user?.id).then(setPortalVisits);
    return subscribePortalVisits(setPortalVisits);
  }, [user?.id]);

  // Requirement: The official portal links on the homepage should only be the portal link that has been visited in the last 3 months by the users, rather than random or all portal links in the resource directory.
  const recentlyVisitedPortals = (portalLinks ?? [])
    .filter((portal: any) => isPortalVisitedInLast3Months(portal, portalVisits))
    .sort((a: any, b: any) => {
      const aTime = portalVisits[a.id] || portalVisits[a.url] || 0;
      const bTime = portalVisits[b.id] || portalVisits[b.url] || 0;
      return bTime - aTime;
    });

  // Department is the only essential mentorship field. Interests remain an
  // optional profile enhancement; onboarding no longer forces students to
  // choose generic interest tags before they can enter their campus.
  const missingMentorshipFields = !!profile && !profile.department?.trim();

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Student';
  const { url: resolvedCoverUrl } = useSignedUrl('campus-media', profile?.coverUrl);
  const activeCover = resolvedCoverUrl ? { uri: resolvedCoverUrl } : null;

  function handleOpenPortal(url: string, id?: string) {
    haptics.light();
    if (id) {
      void recordPortalLinkVisit(id, url, user?.id);
    }
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
        queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY('resource') }),
        queryClient.invalidateQueries({ queryKey: ['study-groups'] }),
        queryClient.invalidateQueries({ queryKey: ['announcements'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-links'] }),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter unread urgent announcements
  const unreadAnnouncements = announcements
    .filter((a) => !isRead(a.id))
    .filter((a) => {
      const target = (a.campusCode || 'GLOBAL').toUpperCase();
      if (effectiveCampus === 'ALL' || target === 'GLOBAL') return true;
      return !!effectiveCampus && target === effectiveCampus.toUpperCase();
    })
    .filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > Date.now());

  // Filter unread pinned / urgent discussions
  const unreadPinnedDiscussions = (recentPosts ?? [])
    .filter((p: any) => (!showBots ? !isBotPost(p) : true) && p.isPinned && !isRead(p.id))
    .slice(0, 2);

  // Combine into urgent broadcast list (max 3 items on Home)
  const urgentBroadcasts = [
    ...unreadAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      badge: a.priority === 'critical' ? 'Urgent Alert' : a.priority === 'high' ? 'High Priority' : 'Campus Bulletin',
      tone: a.priority === 'critical' ? ('critical' as const) : a.priority === 'high' ? ('warning' as const) : ('brand' as const),
      type: 'announcement' as const,
      raw: a,
    })),
    ...unreadPinnedDiscussions.map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      badge: 'Pinned Discussion',
      tone: 'neutral' as const,
      type: 'post' as const,
      raw: p,
    })),
  ].slice(0, 3);

  // Partition events into attending vs featured
  const attendingEvents = (events ?? []).filter((e) => e.isRsvpd);
  const featuredEvents = (events ?? []).filter((e) => !e.isRsvpd).slice(0, 2);

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
              <Image
                source={activeCover}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                accessibilityLabel="Student campus banner"
              />
            ) : (
              <LinearGradient
                colors={isDark ? ['#0d1b2a', '#1e293b', '#0f172a'] : ['#dbeafe', '#bfdbfe', '#93c5fd']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: '100%', height: '100%' }}
              />
            )}

            {/* Ambient Multi-Stop Gradient Overlay for Rich Glass Depth */}
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
                  <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 12, flexShrink: 1 }, heroTextShadowStyle]}>
                    {effectiveCampus === 'ALL'
                      ? 'All Campus Networks (Global)'
                      : ((activeCampusCode && getInstitutionByCode(activeCampusCode)?.name) || profile?.institutionName) ?? 'Campus Network'}
                  </AppText>
                </View>
              </View>

              {/* Bottom Row: Avatar + Metadata */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                  <Avatar name={profile?.fullName ?? user?.fullName ?? 'Student'} uri={profile?.avatarUrl ?? user?.avatarUrl} size={isDesktop ? 58 : 50} />
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
                    {profile?.isCampusAmbassador ? (
                      <AmbassadorBadge size={11} label="Ambassador" />
                    ) : null}
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981', flexShrink: 0 }} />
                  </View>

                  <AppText
                    style={[
                      {
                        marginTop: 2,
                        fontSize: 12,
                        lineHeight: 15,
                        color: 'rgba(255, 255, 255, 0.85)',
                      },
                      heroTextShadowStyle,
                    ]}
                  >
                    {[profile?.department, effectiveCampus === 'ALL' ? 'Global Admin' : (profile?.institutionCode || effectiveCampus)].filter(Boolean).join(' • ') ||
                      'Complete your profile'}
                  </AppText>

                  {profile?.verificationStatus !== 'verified' && user?.role !== 'admin' ? (
                    <Pressable accessibilityRole="link"
                      accessibilityLabel="Verify your student ID"
                      onPress={() => router.push('/(student)/profile')}
                      hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
                      style={{ alignSelf: 'flex-start', marginTop: 3 }}
                    >
                      <AppText variant="caption" tone="inverse" style={[{ fontSize: 12, textDecorationLine: 'underline', opacity: 0.95 }, heroTextShadowStyle]}>
                        Verify student ID →
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </GlassCard>

        {user?.isCampusAmbassador || profile?.isCampusAmbassador ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Campus Ambassador Console"
            onPress={async () => {
              haptics.light();
              try {
                await enterAmbassadorWorkspace();
                router.push('/(admin)/dashboard' as any);
              } catch (error: any) {
                haptics.error();
                Alert.alert('Ambassador access unavailable', error?.message || 'Your appointment could not be verified.');
              }
            }}
          >
            <SolidCard style={{ borderColor: colors.brandPrimary, borderWidth: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="star" size={21} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold">Campus Ambassador Console</AppText>
                  <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                    Manage your discussion space proposals and campus events.
                  </AppText>
                </View>
                <Ionicons name="arrow-forward" size={19} color={colors.brandPrimary} />
              </View>
            </SolidCard>
          </Pressable>
        ) : null}

        {/* Verification Notice for unverified personal email accounts */}
        <UnverifiedAccountNotice />

        {loadErrors.mode === 'inline' && (
          <ErrorStateView
            compact
            subject="your dashboard"
            title="Some sections couldn't refresh"
            error={loadErrors.error}
            onRetry={() => refetchFailedQueries(mainQueries)}
          />
        )}

        {/* Nudge toward a fuller profile - the fields it names are exactly what mentor matching uses */}
        {isFeatureEnabled('alumni_mentorship') && missingMentorshipFields && !profileNudgeDismissed ? (
          <View
            accessibilityRole="alert"
            style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: radius.lg,
              backgroundColor: colors.pastelPrimaryBg,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Ionicons name="person-circle-outline" size={18} color={colors.brandPrimary} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="bold" style={{ fontSize: 13, lineHeight: 16 }}>
                Complete Your Profile
              </AppText>
              <AppText tone="secondary" style={{ fontSize: 12, lineHeight: 15, marginTop: 2 }}>
                Add your department to get better alumni mentor matches.
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                onPress={() => {
                  haptics.light();
                  router.push('/(student)/profile');
                }}
                hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                style={{ alignSelf: 'flex-start', marginTop: 3 }}
              >
                <AppText variant="caption" tone="brand" style={{ fontSize: 12, textDecorationLine: 'underline' }}>
                  Edit profile →
                </AppText>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss profile completion reminder"
              onPress={() => {
                haptics.light();
                setProfileNudgeDismissed(true);
              }}
              hitSlop={14}
              style={{ padding: 4, flexShrink: 0 }}
            >
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {/* 2. Important Campus Broadcasts (Disappears once clicked or dismissed) */}
        {urgentBroadcasts.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="megaphone-outline" size={17} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2 }}>
                  Important Campus Notices
                </AppText>
              </View>
              <AppText tone="secondary" style={{ fontSize: 12 }}>
                Tap to view • auto-dismisses
              </AppText>
            </View>

            <View style={{ gap: spacing.sm }}>
              {urgentBroadcasts.map((item) => {
                // The card is not itself a button: the open action and Dismiss are siblings, because a button
                // nested inside a button is invalid for keyboard and screen-reader users.
                const openItem = () => {
                  haptics.light();
                  markAsRead(item.id);
                  if (item.type === 'announcement') {
                    setSelectedAnnouncement(item.raw);
                  } else {
                    router.push(`/(student)/post/${item.id}` as any);
                  }
                };
                return (
                  <SolidCard
                    key={item.id}
                    radius={16}
                    style={{
                      padding: 13,
                      borderLeftWidth: 3.5,
                      borderLeftColor: item.tone === 'critical' ? colors.critical : item.tone === 'warning' ? '#F59E0B' : colors.brandPrimary,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Open notice: ${item.title}`} onPress={openItem}>
                        <Badge label={item.badge} tone={item.tone === 'critical' ? 'critical' : item.tone === 'warning' ? 'warning' : 'brand'} />
                      </Pressable>
                      <Pressable accessibilityRole="button"
                        onPress={() => {
                          haptics.light();
                          markAsRead(item.id);
                        }}
                        hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                        accessibilityLabel="Dismiss notice from home"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Ionicons name="checkmark-done" size={15} color={isDark ? colors.textPrimary : '#475467'} />
                        <AppText
                          variant="caption"
                          style={{ fontSize: 12, color: isDark ? colors.textPrimary : '#475467' }}
                        >
                          Dismiss
                        </AppText>
                      </Pressable>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Open notice: ${item.title}`} onPress={openItem}>
                      <AppText weight="bold" style={{ fontSize: 13.5, lineHeight: 18, marginBottom: 2 }}>
                        {item.title}
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ lineHeight: 16 }}>
                        {item.content}
                      </AppText>
                    </Pressable>
                  </SolidCard>
                );
              })}
            </View>
          </View>
        )}

        {/* 3. Essential Everyday Services (Clean 4-Item Quick Strip) */}
        <View>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2, marginBottom: spacing.xs }}>
            Quick Services
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {isFeatureEnabled('e2ee_messaging') && (
              <Pressable accessibilityRole="link"
                onPress={() => router.push('/(student)/messages')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brandPrimary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>Direct Messages</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>Chats & calls</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('utility_cards') && (
              <Pressable accessibilityRole="link"
                onPress={() => router.push('/(student)/calendar')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="time-outline" size={20} color="#0D9488" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>My Schedule</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>Timetable & tests</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('campus_map') && (
              <Pressable accessibilityRole="button"
                onPress={() => {
                  haptics.light();
                  setCampusMapOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="map-outline" size={20} color="#3B82F6" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>Campus Map</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>Halls, ATMs & food</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('academic_resources') && (
              <Pressable accessibilityRole="link"
                onPress={() => router.push('/(student)/resources')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="folder-open-outline" size={20} color="#10B981" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>Course Catalog</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>All past Qs & slides</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('marketplace') && (
              <Pressable accessibilityRole="link"
                onPress={() => router.push('/(student)/marketplace')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="cart-outline" size={20} color="#F59E0B" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>Marketplace</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>Buy & sell with classmates</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}

            {isFeatureEnabled('alumni_mentorship') && (
              <Pressable accessibilityRole="link"
                onPress={() => router.push('/(student)/mentorship')}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 150 : '47%' }}
              >
                <GlassCard radius={16} padded={false} contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="people-outline" size={20} color="#8B5CF6" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 12.5, lineHeight: 16 }}>Mentorship Hub</AppText>
                    <AppText tone="secondary" style={{ fontSize: 12, marginTop: 1 }}>Alumni mentors & guidance</AppText>
                  </View>
                </GlassCard>
              </Pressable>
            )}
          </View>
        </View>

        {loadBlocked && (
          <ErrorStateView subject="your dashboard" error={loadErrors.error} onRetry={() => refetchFailedQueries(mainQueries)} />
        )}

        {/* 4. Events You're Attending (or Featured Campus Events) */}
        {!loadBlocked && isFeatureEnabled('campus_events') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="calendar-outline" size={17} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2 }}>
                  {attendingEvents.length > 0 ? "Events You're Attending" : 'Featured Campus Events'}
                </AppText>
              </View>
              <Pressable accessibilityRole="link" accessibilityLabel="View all campus events" onPress={() => router.push('/(student)/events-list')} style={{ flexShrink: 0 }} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 12 }}>
                  View All ({events?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {attendingEvents.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                {attendingEvents.slice(0, 2).map((evt: any) => (
                  <View key={evt.id} style={{ gap: 6 }}>
                    <EventCard event={evt} />
                    <Pressable accessibilityRole="button"
                      onPress={() => router.push(`/(student)/events/${evt.id}` as any)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        minHeight: 44,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <Ionicons name="qr-code-outline" size={15} color="#10B981" />
                      <AppText weight="bold" style={{ color: '#10B981', fontSize: 12 }}>
                        View Your Entry Pass & Ticket Code
                      </AppText>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : featuredEvents.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                {featuredEvents.map((evt: any) => (
                  <EventCard key={evt.id} event={evt} />
                ))}
              </View>
            ) : (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">No upcoming campus events</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Check the calendar for guest lectures, seminars, and student gatherings.
                </AppText>
                <AppButton label="Browse Calendar" variant="secondary" onPress={() => router.push('/(student)/events-list')} />
              </SolidCard>
            )}
          </View>
        )}

        {/* 5. My Saved Course Materials (Only bookmarked resources display here) */}
        {!loadBlocked && isFeatureEnabled('academic_resources') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="bookmark-outline" size={17} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2 }}>
                  My Saved Course Materials
                </AppText>
              </View>
              <Pressable accessibilityRole="link" accessibilityLabel="View saved course materials" onPress={() => router.push('/(student)/saved')} style={{ flexShrink: 0 }} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 12 }}>
                  Saved ({savedResources.length}) →
                </AppText>
              </Pressable>
            </View>

            {savedResources.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {savedResources.slice(0, 3).map((item) => {
                  const isUuid = /^[0-9a-f-]{36}$/i.test(item.title);
                  let cleanCourseName = isUuid ? (item.subtitle || 'Course Material') : item.title;
                  let cleanCourseCode = item.subtitle && !/^[0-9a-f-]{36}$/i.test(item.subtitle) ? item.subtitle : 'Study Note';

                  // If title has format "ENG 201: Engineering Mathematics I — ..."
                  if (cleanCourseName.includes(':')) {
                    const parts = cleanCourseName.split(':');
                    const prefix = parts[0].trim();
                    const after = parts.slice(1).join(':').trim();
                    if (/^[A-Z]{2,4}\s*\d{3}/i.test(prefix)) {
                      cleanCourseCode = prefix;
                      cleanCourseName = after.split('—')[0].split('-')[0].trim();
                    }
                  } else if (cleanCourseName.includes('—')) {
                    cleanCourseName = cleanCourseName.split('—')[0].trim();
                  }

                  if (cleanCourseName.includes('_')) {
                    cleanCourseName = cleanCourseName.replace(/_/g, ' ');
                  }

                  return (
                    <Pressable accessibilityRole="button"
                      accessibilityLabel={`Open ${cleanCourseName} in Resources`}
                      key={item.id}
                      onPress={() => router.push({ pathname: '/(student)/resources', params: { resourceId: item.itemId } })}
                    >
                      <SolidCard radius={16} style={{ padding: 13 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <Badge label={cleanCourseCode} tone="brand" />
                            <AppText variant="caption" tone="secondary" numberOfLines={1}>
                              Saved on {new Date(item.savedAt).toLocaleDateString()}
                            </AppText>
                          </View>
                          <Ionicons name="bookmark" size={16} color={colors.brandPrimary} />
                        </View>
                        <AppText variant="bodySmall" weight="bold" style={{ lineHeight: 18, marginTop: 2 }}>
                          {cleanCourseName}
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Ionicons name="document-text-outline" size={13} color={colors.brandPrimary} />
                          <AppText variant="caption" weight="bold" tone="brand">
                            Open in Resources
                          </AppText>
                        </View>
                      </SolidCard>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="folder-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">No saved course materials yet</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Bookmark past questions, lecture slides, and notes for your department to access them quickly here.
                </AppText>
                <AppButton
                  label={`Browse ${profile?.department || 'Department'} Materials`}
                  variant="secondary"
                  onPress={() => router.push('/(student)/resources')}
                />
              </SolidCard>
            )}
          </View>
        )}

        {/* 6. Active Study Pods (Enrolled Only) */}
        {!loadBlocked && isFeatureEnabled('study_groups') && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Ionicons name="people-outline" size={17} color="#10B981" style={{ flexShrink: 0 }} />
                <AppText weight="bold" style={{ flex: 1, fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2 }}>
                  My Study Pods
                </AppText>
              </View>
              <Pressable accessibilityRole="link" accessibilityLabel="View all study pods" onPress={() => router.push('/(student)/study-groups')} style={{ flexShrink: 0 }} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
                <AppText tone="brand" weight="bold" style={{ fontSize: isDesktop ? 13 : 12 }}>
                  View All ({studyGroups.length}) →
                </AppText>
              </Pressable>
            </View>

            {studyGroups.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {studyGroups.slice(0, 3).map((group: any) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open study pod ${group.name}`} key={group.id} onPress={() => router.push(`/(student)/pod/${group.id}` as any)}>
                    <SolidCard radius={16} style={{ padding: 13 }}>
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
                      <AppText tone="secondary" variant="caption" numberOfLines={2}>
                        {group.description || 'Collaborative study pod for shared review and academic discussion.'}
                      </AppText>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            ) : (
              <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <AppText weight="bold" variant="bodySmall">You are not in a study pod yet</AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                  Form a pod for your courses to discuss past questions, share revision notes, and prep with classmates.
                </AppText>
                <AppButton label="Find or Create a Pod" variant="secondary" onPress={() => router.push('/(student)/study-groups')} />
              </SolidCard>
            )}
          </View>
        )}

        {/* 7. Institutional Direct Portal Shortcuts (Only portals visited in last 3 months) */}
        {recentlyVisitedPortals.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
              <Ionicons name="link-outline" size={17} color={colors.textSecondary} />
              <AppText weight="bold" style={{ fontSize: isDesktop ? 17 : 14.5, letterSpacing: -0.2 }}>
                Recently Visited Portals
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {recentlyVisitedPortals.slice(0, 4).map((portal: any) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`Open ${portal.title} portal`}
                  key={portal.id}
                  onPress={() => handleOpenPortal(portal.url, portal.id)}
                  style={{ width: isDesktop ? '48%' : '100%', flexGrow: 1 }}
                >
                  <GlassCard radius={14} padded={false} contentStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                      {portal.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                      {portal.category} • Visited Recently
                    </AppText>
                  </GlassCard>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Announcement Detail Modal */}
      <Modal
        visible={!!selectedAnnouncement}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAnnouncement(null)}
      >
        <View style={modalStyles.backdrop}>
          <Pressable accessibilityRole="none" accessible={false} focusable={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={() => setSelectedAnnouncement(null)} />
          <View
            style={[
              modalStyles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxWidth: 480,
                marginBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Badge
                label={selectedAnnouncement?.priority === 'critical' ? 'Urgent Alert' : 'Campus Bulletin'}
                tone={selectedAnnouncement?.priority === 'critical' ? 'critical' : 'brand'}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Close announcement" onPress={() => setSelectedAnnouncement(null)} hitSlop={14}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText weight="bold" style={{ fontSize: 17, lineHeight: 22, marginBottom: 8 }}>
              {selectedAnnouncement?.title}
            </AppText>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator>
              <AppText tone="secondary" style={{ fontSize: 13, lineHeight: 19 }}>
                {selectedAnnouncement?.content}
              </AppText>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <AppButton
                label="Dismiss from Home"
                variant="primary"
                onPress={() => setSelectedAnnouncement(null)}
              />
            </View>
          </View>
        </View>
      </Modal>

      <CampusMapModal visible={campusMapOpen} onClose={() => setCampusMapOpen(false)} campusFilter={effectiveCampus} />
      <AppTutorialModal userId={user?.id} />
    </ScreenContainer>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
});
