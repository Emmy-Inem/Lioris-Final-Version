import React, { useState } from 'react';
import { ScrollView, Pressable, TextInput, View, Alert } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/context/ToastContext';
import { listCommunities, ForumCommunityRecord, proposeCommunity } from '@/api/communities';
import { listMyJoinedCommunityIds, joinCommunity, leaveCommunity, DEFAULT_JOINED_COMMUNITY_IDS, getCommunityStatsMap } from '@/api/forumMemberships';
import { useForumScope } from '@/hooks/useForumScope';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { ApplyForVerificationModal } from '@/components/ApplyForVerificationModal';
import { submitVerificationRequest } from '@/api/verification';

const CATEGORIES = ['All', 'Academic & Tech', 'Campus Life', 'Union & Polls'] as const;
type CategoryFilter = typeof CATEGORIES[number];

export default function ExploreForumsScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const { isDesktop, width } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';

  const { scope: forumScope, globalEnabled } = useForumScope();
  const { campusCode: activeCampus, homeInstitutionCode } = useCampusScope();
  const effectiveCampus = (activeCampus && activeCampus !== 'GLOBAL') ? activeCampus : (homeInstitutionCode || 'UNILAG');
  const isGlobalActive = globalEnabled && forumScope === 'global';

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const isModeratorOrAdmin = !!(
    profile?.isCampusAmbassador ||
    user?.role === 'admin' ||
    user?.actualRole === 'admin' ||
    user?.isSuperAdmin ||
    user?.role === 'staff' ||
    (user?.email && user.email.toLowerCase().trim() === 'inememmanuel@gmail.com')
  );
  const isUnverified = isUnverifiedPersonalUser(profile);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [proposingOpen, setProposingOpen] = useState(false);
  const [spaceInfoOpen, setSpaceInfoOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: communities = [] } = useQuery({
    queryKey: ['communities', isGlobalActive ? 'global' : effectiveCampus],
    queryFn: () => listCommunities(isGlobalActive ? undefined : effectiveCampus),
  });

  const { data: joinedIds = DEFAULT_JOINED_COMMUNITY_IDS, refetch: refetchJoined } = useQuery({
    queryKey: ['my-joined-community-ids', user?.id],
    queryFn: () => listMyJoinedCommunityIds(user?.id),
  });

  const { data: communityStatsMap } = useQuery({
    queryKey: ['forum-communities-stats'],
    queryFn: getCommunityStatsMap,
  });

  const joinedSet = React.useMemo(() => {
    const s = new Set<string>();
    for (const id of joinedIds) {
      s.add(id);
      s.add(id.toLowerCase());
    }
    return s;
  }, [joinedIds]);

  const isJoined = (ch: ForumCommunityRecord) => {
    if (ch.id === 'all') return true;
    return (
      joinedSet.has(ch.id) ||
      joinedSet.has(ch.id.toLowerCase()) ||
      (ch.category ? joinedSet.has(ch.category.toLowerCase()) : false) ||
      (ch.slug ? joinedSet.has(ch.slug.replace('c/', '').toLowerCase()) : false)
    );
  };

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return communities.filter((ch) => {
      if (ch.id === 'all') return false;
      const matchesSearch =
        !q ||
        ch.label.toLowerCase().includes(q) ||
        ch.description.toLowerCase().includes(q) ||
        (ch.category ? ch.category.toLowerCase().includes(q) : false);
      if (!matchesSearch) return false;
      if (category === 'Academic & Tech') return ['tech', 'academic'].includes(ch.id) || ch.category === 'Academic' || ch.category === 'Tech Hub';
      if (category === 'Campus Life') return ['housing', 'social', 'lost'].includes(ch.id);
      if (category === 'Union & Polls') return ['polls'].includes(ch.id);
      return true;
    });
  }, [communities, search, category]);

  async function handleToggleJoin(ch: ForumCommunityRecord) {
    haptics.medium();
    const joined = isJoined(ch);
    if (joined) {
      Alert.alert(
        `Leave ${ch.label}?`,
        `Discussions from ${ch.label} will no longer appear in your joined spaces feed. You can rejoin anytime from this Explore page.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave Space',
            style: 'destructive',
            onPress: async () => {
              try {
                await leaveCommunity(ch.id, user?.id);
                await queryClient.invalidateQueries({ queryKey: ['my-joined-community-ids'] });
                await refetchJoined();
                toast.info(`Left ${ch.label}.`);
              } catch (e: any) {
                toast.error(e?.message || 'Failed to leave space.');
              }
            },
          },
        ]
      );
    } else {
      try {
        await joinCommunity(ch.id, user?.id);
        await queryClient.invalidateQueries({ queryKey: ['my-joined-community-ids'] });
        await refetchJoined();
        toast.success(`Joined ${ch.label}!`);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to join space.');
      }
    }
  }

  const isSmallMobile = width < 400;

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{
          paddingBottom: isDesktop ? 60 : 120,
          paddingTop: spacing.xs,
          paddingHorizontal: isDesktop ? 0 : 2,
          gap: spacing.md,
          maxWidth: isDesktop ? 860 : undefined,
          width: '100%',
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Header - Responsive Mobile & Desktop Layout */}
        <View
          style={{
            flexDirection: isSmallMobile ? 'column' : 'row',
            alignItems: isSmallMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: spacing.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace(`/${roleGroup}/feed` as any);
              }}
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="bold" variant={isDesktop ? 'h1' : 'h3'} numberOfLines={1}>
                {isGlobalActive ? 'Global Discussion Spaces' : `${effectiveCampus} Discussion Spaces`}
              </AppText>
              <AppText tone="secondary" variant="caption" numberOfLines={1}>
                {isGlobalActive
                  ? `Discover and join student communities across all campuses (${communities.length > 1 ? communities.length - 1 : communities.length} available)`
                  : `Curated campus communities for ${effectiveCampus} (${communities.length > 1 ? communities.length - 1 : communities.length} available)`}
              </AppText>
            </View>
          </View>

          <Pressable
            onPress={() => {
              if (isUnverified) {
                setVerificationModalOpen(true);
                return;
              }
              setProposingOpen(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.brandPrimary,
              alignSelf: isSmallMobile ? 'stretch' : 'auto',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add-outline" size={16} color="#FFFFFF" />
            <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
              Propose Space
            </AppText>
          </Pressable>
        </View>

        {/* Discussion Spaces Clean Overview Banner */}
        {!isGlobalActive && (
          <SolidCard
            frosted
            radius={16}
            style={{
              padding: spacing.md,
              flexDirection: isSmallMobile ? 'column' : 'row',
              alignItems: isSmallMobile ? 'flex-start' : 'center',
              gap: 12,
              borderLeftWidth: 4,
              borderLeftColor: colors.brandPrimary,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <Ionicons
                name="chatbubbles-outline"
                size={24}
                color={colors.brandPrimary}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" variant="bodySmall">
                  {effectiveCampus} Campus Discussion Spaces
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2, fontSize: 11.5, lineHeight: 16 }}>
                  Course-specific channels and departmental communities curated for verified students of {effectiveCampus}.
                </AppText>
              </View>
            </View>

            <Pressable
              onPress={() => setSpaceInfoOpen(true)}
              hitSlop={8}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: colors.brandPrimary + '15',
                alignSelf: isSmallMobile ? 'flex-start' : 'center',
              }}
            >
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                About Spaces
              </AppText>
            </Pressable>
          </SolidCard>
        )}

        {/* Search Input Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            height: 44,
          }}
        >
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search discussion spaces by topic, name, or keywords..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 13.5, marginLeft: 8 }}
            accessibilityLabel="Search discussion spaces"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Category Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  haptics.light();
                  setCategory(cat);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                  {cat}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Community Directory List - Mobile Optimized */}
        <View style={{ gap: spacing.md }}>
          {filtered.map((ch) => {
            const joined = isJoined(ch);
            const liveStat = communityStatsMap?.get(ch.id);
            const realMembers = liveStat?.members ?? 0;
            const realThreads = liveStat?.threads ?? 0;

            return (
              <SolidCard
                key={ch.id}
                radius={18}
                frosted
                style={{
                  padding: spacing.md,
                  borderLeftWidth: 4,
                  borderLeftColor: ch.accentColor,
                  gap: 10,
                }}
              >
                {/* Header row - Responsive flex wrapping on mobile */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    flexWrap: isSmallMobile ? 'wrap' : 'nowrap',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 160 }}>
                    <Ionicons name={ch.icon} size={24} color={ch.accentColor} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <AppText weight="bold" variant="body">
                          {ch.label}
                        </AppText>
                        <View style={{ backgroundColor: ch.accentColor + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill }}>
                          <AppText weight="bold" style={{ color: ch.accentColor, fontSize: 10.5 }}>
                            {ch.slug}
                          </AppText>
                        </View>
                        {ch.approvalStatus === 'pending' && <Badge label="Under Review" tone="warning" />}
                      </View>
                      <AppText tone="secondary" variant="caption" style={{ fontSize: 11, marginTop: 2 }}>
                        👥 {realMembers} members • 💬 {realThreads} discussions
                      </AppText>
                    </View>
                  </View>

                  {/* Join / Leave button */}
                  <Pressable
                    onPress={() => handleToggleJoin(ch)}
                    hitSlop={8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: joined ? (isDark ? 'rgba(16,185,129,0.15)' : '#DCFCE7') : colors.brandPrimary,
                      borderWidth: 1,
                      borderColor: joined ? (isDark ? 'rgba(16,185,129,0.40)' : '#86EFAC') : colors.brandPrimary,
                      alignSelf: isSmallMobile ? 'flex-end' : 'auto',
                    }}
                  >
                    <Ionicons name={joined ? 'checkmark-circle' : 'add-circle-outline'} size={14} color={joined ? '#10B981' : '#FFFFFF'} />
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: joined ? (isDark ? '#34D399' : '#15803D') : '#FFFFFF', fontSize: 11 }}
                    >
                      {joined ? 'Joined' : 'Join Space'}
                    </AppText>
                  </Pressable>
                </View>

                {/* Description */}
                <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 20 }}>
                  {ch.description}
                </AppText>

                {/* Bottom Details Bar - Responsive */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 120 }}>
                    <Ionicons name="shield-checkmark" size={13} color={colors.textSecondary} />
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11 }}>
                      <AppText weight="bold" tone="primary" style={{ fontSize: 11 }}>
                        Moderated by:{' '}
                      </AppText>
                      {ch.moderatorTitle || 'Campus Rep'}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      {ch.rules.length} guidelines
                    </AppText>
                    <Pressable
                      onPress={() => {
                        haptics.light();
                        router.push(`/${roleGroup}/feed?category=${encodeURIComponent(ch.category)}` as any);
                      }}
                      hitSlop={8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                        Open Feed →
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </SolidCard>
            );
          })}

          {filtered.length === 0 && (
            <EmptyState
              title="No matching discussion spaces"
              description={search ? 'Try a different search term or clear your filters.' : 'No discussion spaces available in this category.'}
            />
          )}
        </View>

        {/* Propose Space Modal */}
        {proposingOpen && (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              zIndex: 99,
            }}
          >
            <SolidCard frosted radius={20} style={{ width: '100%', maxWidth: 480, padding: spacing.lg }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                Propose New Discussion Space
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                Submit a new community space for peer discussion on {effectiveCampus}. It will go live after review by campus moderators.
              </AppText>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Space name (e.g. Robotics & AI Club)"
                placeholderTextColor={colors.textSecondary}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  color: colors.textPrimary,
                  marginBottom: 10,
                  fontSize: 14,
                }}
              />
              <TextInput
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="What will students discuss in this space?"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  color: colors.textPrimary,
                  marginBottom: spacing.md,
                  fontSize: 14,
                  minHeight: 70,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setProposingOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <AppText weight="semiBold" tone="secondary">
                    Cancel
                  </AppText>
                </Pressable>
                <Pressable
                  disabled={submitting || !newName.trim()}
                  onPress={async () => {
                    if (!newName.trim()) return;
                    setSubmitting(true);
                    try {
                      await proposeCommunity({
                        label: newName.trim(),
                        description: newDesc.trim(),
                        campusCode: isGlobalActive ? undefined : effectiveCampus,
                      });
                      await queryClient.invalidateQueries({ queryKey: ['communities'] });
                      toast.success(`Space proposal submitted for ${effectiveCampus} review!`);
                      setProposingOpen(false);
                      setNewName('');
                      setNewDesc('');
                    } catch (e: any) {
                      toast.error(e?.message || 'Could not submit proposal.');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: radius.pill,
                    backgroundColor: newName.trim() ? colors.brandPrimary : colors.border,
                    alignItems: 'center',
                  }}
                >
                  <AppText weight="bold" tone={newName.trim() ? 'inverse' : 'secondary'}>
                    {submitting ? 'Submitting...' : 'Submit'}
                  </AppText>
                </Pressable>
              </View>
            </SolidCard>
          </View>
        )}

        {/* Discussion Spaces Info Modal */}
        {spaceInfoOpen && (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              zIndex: 99,
            }}
          >
            <SolidCard frosted radius={20} style={{ width: '100%', maxWidth: 480, padding: spacing.lg }}>
              <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                <Ionicons name="chatbubbles-outline" size={32} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold" style={{ textAlign: 'center', marginTop: 8 }}>
                  {effectiveCampus} Discussion Spaces
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2 }}>
                  Curated Student Communities
                </AppText>
              </View>

              <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 21, marginBottom: spacing.md }}>
                Discussion spaces are dedicated forums for academic courses, department talk, and campus activities on {effectiveCampus}.
              </AppText>

              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  marginBottom: spacing.lg,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <AppText variant="caption" weight="semiBold">Curated discussion spaces for your university</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <AppText variant="caption" weight="semiBold">Connect with classmates across academic levels</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <AppText variant="caption" weight="semiBold">Safe, spam-free spaces guided by campus moderation</AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setSpaceInfoOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <AppText weight="semiBold" tone="secondary">
                    Close
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSpaceInfoOpen(false);
                    if (isUnverified) {
                      setVerificationModalOpen(true);
                    } else {
                      setProposingOpen(true);
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: radius.pill,
                    backgroundColor: colors.brandPrimary,
                    alignItems: 'center',
                  }}
                >
                  <AppText weight="bold" tone="inverse">
                    Propose a Space
                  </AppText>
                </Pressable>
              </View>
            </SolidCard>
          </View>
        )}

        {/* Verification Modal for Unverified Students */}
        <ApplyForVerificationModal
          visible={verificationModalOpen}
          onClose={() => setVerificationModalOpen(false)}
          defaultInstitution={effectiveCampus}
          onSubmit={async (data) => {
            if (!user) return;
            try {
              await submitVerificationRequest({
                userId: user.id,
                applicantName: profile?.fullName ?? user.fullName,
                documentType: data.documentType,
                documentReference: data.documentReference,
                institutionClaimed: data.institutionClaimed,
                documentPhotoUri: data.documentPhotoUri,
                photoBlob: data.photoBlob,
              });
              markVerificationPending(user.id);
              await queryClient.invalidateQueries({ queryKey: ['profile'] });
              setVerificationModalOpen(false);
              toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
            } catch (err: any) {
              toast.error(err?.message || 'Could not submit verification request. Please try again.');
            }
          }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}