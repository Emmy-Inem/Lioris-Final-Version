import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { SegmentedTabs } from '@/components/common/SegmentedTabs';
import { StarRating } from '@/components/common/StarRating';
import { MentorshipListCard } from '@/components/mentorship/MentorshipListCard';
import { MentorProfileEditor } from '@/components/mentorship/MentorProfileEditor';
import { MentorDetailSheet } from '@/components/mentorship/MentorDetailSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import {
  EMPTY_MENTOR_PROFILE,
  getMyMentorProfile,
  listMentorships,
  listMyMentorReviews,
  respondToMentorshipRequest,
  setMentorAccepting,
} from '@/api/mentorship';
import { getMyProfile } from '@/api/profile';
import { MentorProfile, MyMentorProfile } from '@/api/types';
import { describeAvailability, mentorshipSortRank } from '@/utils/mentorship';
import { formatWhen } from '@/utils/dateTime';
import { parseRpcError } from '@/utils/rpcErrors';
import { haptics } from '@/utils/haptics';

type Tab = 'requests' | 'active' | 'history' | 'reviews';

function Stat({ icon, value, label, sub }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; sub?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 96, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="h3" weight="bold">
        {value}
      </AppText>
      <AppText tone="secondary" variant="caption" style={{ textAlign: 'center' }}>
        {label}
      </AppText>
      {sub ? (
        <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5, textAlign: 'center' }}>
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

export default function AlumniMentorshipScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('requests');
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mentorships = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships, refetchInterval: 45000 });
  const profileQuery = useQuery({ queryKey: ['mentor-profile', 'me'], queryFn: getMyMentorProfile });
  const reviews = useQuery({ queryKey: ['mentor-reviews'], queryFn: listMyMentorReviews });
  const { data: me } = useQuery({ queryKey: ['profile', 'me', user?.id], queryFn: () => getMyProfile(user!), enabled: !!user });

  const profile = profileQuery.data;
  const mine = useMemo(
    () =>
      (mentorships.data ?? [])
        .filter((m) => m.mentorId === user?.id)
        .sort((a, b) => mentorshipSortRank(a.status) - mentorshipSortRank(b.status) || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')),
    [mentorships.data, user?.id],
  );
  const pending = mine.filter((m) => m.status === 'pending');
  const activeOnes = mine.filter((m) => m.status === 'active');
  const history = mine.filter((m) => m.status !== 'pending' && m.status !== 'active');
  const completed = mine.filter((m) => m.status === 'completed').length;
  const avgRating = reviews.data && reviews.data.length > 0 ? reviews.data.reduce((sum, r) => sum + r.rating, 0) / reviews.data.length : null;
  const capacity = profile?.maxMentees ?? 0;
  const full = !!profile && activeOnes.length >= capacity;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['mentorships'] });
    queryClient.invalidateQueries({ queryKey: ['mentor-profile'] });
    queryClient.invalidateQueries({ queryKey: ['mentor-reviews'] });
  }
  const open = (id: string) => router.push(`/(alumni)/mentorship-space/${id}` as any);

  async function toggleAccepting(next: boolean) {
    try {
      await setMentorAccepting(next);
      haptics.success();
      toast.success(next ? 'You are open to new requests.' : 'New requests are paused.');
    } catch (err) {
      toast.error(parseRpcError(err).message);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['mentor-profile'] });
    }
  }

  async function quickRespond(id: string, action: 'accept' | 'decline') {
    setBusyId(id);
    try {
      await respondToMentorshipRequest(id, action);
      haptics.success();
      toast.success(action === 'accept' ? 'Accepted. Your mentorship space is open.' : 'Request declined.');
    } catch (err) {
      haptics.error();
      toast.error(parseRpcError(err).message);
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  // What students will see, built from the alumnus's own fields so they can check it before publishing.
  const previewMentor: MentorProfile | null = profile
    ? {
        id: profile.userId,
        fullName: user?.fullName ?? 'You',
        avatarUrl: me?.avatarUrl ?? null,
        department: me?.department ?? undefined,
        campusCode: me?.institutionCode,
        headline: profile.headline,
        about: profile.about,
        jobTitle: profile.jobTitle,
        company: profile.company,
        yearsExperience: profile.yearsExperience,
        expertiseTags: profile.expertise,
        industries: profile.industries,
        sessionModes: profile.sessionModes,
        availability: profile.availability,
        linkedinUrl: profile.linkedinUrl || null,
        isAccepting: profile.isAccepting,
        maxMentees: profile.maxMentees,
        activeMentees: activeOnes.length,
        openSlots: Math.max(profile.maxMentees - activeOnes.length, 0),
        completedCount: completed,
        avgRating,
        ratingCount: reviews.data?.length ?? 0,
        matchScore: 0,
      }
    : null;

  const editorInitial: MyMentorProfile = profile ?? { ...EMPTY_MENTOR_PROFILE(user?.id ?? ''), company: '', headline: '' };
  const listed = !!profile && profile.isAccepting && !full && !!me?.isVerified;

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 130, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={mentorships.isRefetching} onRefresh={refresh} />}
      >
        <View style={{ paddingTop: isDesktop ? spacing.md : spacing.xs }}>
          <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
            Alumni Mentorship Desk
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
            Guide students one to one: answer requests, plan sessions, set goals together and keep notes in one place.
          </AppText>
        </View>

        {/* Mentor profile */}
        {profileQuery.isLoading ? null : !profile ? (
          <SolidCard radius={20} style={{ gap: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles-outline" size={20} color={colors.brandPrimary} />
              <AppText weight="bold">Become a mentor</AppText>
            </View>
            <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 19 }}>
              Students can only find and ask you once you set up a mentor profile: a headline, what you can help with, when you are free and how many mentees you can take. You stay in control - pause requests any time.
            </AppText>
            <AppButton label="Set up my mentor profile" icon="person-add-outline" onPress={() => setEditorOpen(true)} />
          </SolidCard>
        ) : (
          <SolidCard radius={20} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AppText weight="bold" numberOfLines={2}>
                  {profile.headline || 'Add a headline'}
                </AppText>
                <AppText tone="secondary" variant="caption" numberOfLines={2}>
                  {[[profile.jobTitle, profile.company].filter(Boolean).join(' at '), describeAvailability(profile.availability)].filter(Boolean).join(' · ') || 'Add your role and availability'}
                </AppText>
              </View>
              <Badge label={listed ? 'Visible to students' : 'Not listed'} tone={listed ? 'success' : 'warning'} />
            </View>
            {profile.expertise.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {profile.expertise.slice(0, 6).map((t) => (
                  <View key={t} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.pastelPrimaryBg }}>
                    <AppText variant="caption" weight="semiBold" tone="brand">
                      {t}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {!listed ? (
              <AppText variant="caption" tone="secondary">
                {!me?.isVerified
                  ? 'You will appear to students once your alumni status is verified.'
                  : !profile.isAccepting
                  ? 'Requests are paused, so students cannot see you in the directory.'
                  : 'All your mentee slots are taken, so new requests are closed until one frees up.'}
              </AppText>
            ) : null}

            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" weight="semiBold">
                  Mentee slots
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {activeOnes.length} of {capacity} in use
                </AppText>
              </View>
              <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
                <View style={{ height: 8, width: `${Math.min(100, Math.round((activeOnes.length / Math.max(capacity, 1)) * 100))}%`, backgroundColor: full ? colors.critical : colors.brandPrimary }} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodySmall" weight="bold">
                  Accepting new requests
                </AppText>
              </View>
              <Switch value={profile.isAccepting} onValueChange={toggleAccepting} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              <AppButton label="Edit profile" size="sm" variant="secondary" icon="create-outline" onPress={() => setEditorOpen(true)} />
              <AppButton label="Preview as student" size="sm" variant="ghost" icon="eye-outline" onPress={() => setPreviewOpen(true)} />
            </View>
          </SolidCard>
        )}

        {/* Numbers */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Stat icon="people-outline" value={String(activeOnes.length)} label="Active mentees" sub={profile ? `of ${capacity}` : undefined} />
          <Stat icon="mail-unread-outline" value={String(pending.length)} label="Waiting for you" />
          <Stat icon="checkmark-done-outline" value={String(completed)} label="Completed" />
          <Stat icon="star-outline" value={avgRating != null ? avgRating.toFixed(1) : '-'} label="Avg rating" sub={reviews.data && reviews.data.length > 0 ? `${reviews.data.length} review${reviews.data.length === 1 ? '' : 's'}` : 'no reviews yet'} />
        </View>

        <SegmentedTabs
          tabs={[
            { key: 'requests', label: 'Requests', badge: pending.length },
            { key: 'active', label: 'Active mentees', badge: activeOnes.length },
            { key: 'history', label: 'History' },
            { key: 'reviews', label: 'Reviews' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />

        {mentorships.isError ? (
          <EmptyState icon="cloud-offline-outline" title="Could not load your mentorships" description={parseRpcError(mentorships.error).message} actionLabel="Try again" onAction={() => mentorships.refetch()} />
        ) : null}

        {tab === 'requests' ? (
          pending.length === 0 ? (
            <EmptyState
              icon="mail-open-outline"
              title="No requests waiting"
              description={profile ? 'New requests from students appear here, and you are notified as soon as one arrives.' : 'Set up your mentor profile so students can find you.'}
            />
          ) : (
            <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: spacing.md }}>
              {pending.map((m) => (
                <View key={m.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 340 } : undefined}>
                  <MentorshipListCard
                    mentorship={m}
                    viewerIsMentor
                    onPress={() => open(m.id)}
                    footer={
                      <View style={{ flexDirection: 'row', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <AppButton label="Accept" size="sm" fullWidth loading={busyId === m.id} onPress={() => quickRespond(m.id, 'accept')} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppButton label="Decline" size="sm" variant="secondary" fullWidth disabled={busyId === m.id} onPress={() => quickRespond(m.id, 'decline')} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppButton label="Review" size="sm" variant="ghost" fullWidth onPress={() => open(m.id)} />
                        </View>
                      </View>
                    }
                  />
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === 'active' ? (
          activeOnes.length === 0 ? (
            <EmptyState icon="people-outline" title="No active mentees" description="Accept a request and the mentee's space opens here." />
          ) : (
            <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: spacing.md }}>
              {activeOnes.map((m) => (
                <View key={m.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 340 } : undefined}>
                  <MentorshipListCard mentorship={m} viewerIsMentor onPress={() => open(m.id)} />
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === 'history' ? (
          history.length === 0 ? (
            <EmptyState icon="time-outline" title="No history yet" description="Completed, ended and declined mentorships are kept here." />
          ) : (
            <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: spacing.md }}>
              {history.map((m) => (
                <View key={m.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 340 } : undefined}>
                  <MentorshipListCard mentorship={m} viewerIsMentor onPress={() => open(m.id)} />
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === 'reviews' ? (
          (reviews.data?.length ?? 0) === 0 ? (
            <EmptyState icon="star-outline" title="No reviews yet" description="When a mentee finishes and rates the mentorship, their review shows here and on your mentor profile." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {reviews.data!.map((r) => (
                <SolidCard key={r.mentorshipId} radius={16} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StarRating value={r.rating} size={16} />
                    <AppText variant="caption" tone="secondary">
                      {formatWhen(r.createdAt)}
                    </AppText>
                  </View>
                  {r.comment ? <AppText variant="bodySmall">"{r.comment}"</AppText> : null}
                  <AppText variant="caption" tone="secondary">
                    {[r.fromName, r.track].filter(Boolean).join(' · ')}
                  </AppText>
                </SolidCard>
              ))}
            </View>
          )
        ) : null}
      </ScrollView>

      <MentorProfileEditor visible={editorOpen} initial={editorInitial} onClose={() => setEditorOpen(false)} onSaved={refresh} />
      {previewMentor ? <MentorDetailSheet mentor={previewMentor} visible={previewOpen} onClose={() => setPreviewOpen(false)} /> : null}
    </ScreenContainer>
  );
}
