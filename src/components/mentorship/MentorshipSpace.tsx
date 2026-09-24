import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../ScreenContainer';
import { AppHeader } from '../AppHeader';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { SolidCard } from '../SolidCard';
import { EmptyState } from '../EmptyState';
import { CallModal } from '../CallModal';
import { FormSheet } from '../common/FormSheet';
import { SegmentedTabs } from '../common/SegmentedTabs';
import { StarRating } from '../common/StarRating';
import { DateTimeFields } from '../common/DateTimeFields';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import {
  addMentorshipGoal,
  deleteMentorshipGoal,
  endMentorship,
  getMentorship,
  listMentorshipFeedback,
  listMentorshipGoals,
  listMentorshipSessions,
  listMentorshipUpdates,
  postMentorshipUpdate,
  proposeMentorshipSession,
  respondToMentorshipRequest,
  respondToMentorshipSession,
  setMentorshipGoalDone,
  submitMentorshipFeedback,
} from '@/api/mentorship';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { getCallRoomName, getCallUrl } from '@/api/calling';
import { Mentorship, MentorshipSession, MentorSessionMode } from '@/api/types';
import { SESSION_MODES, mentorshipStatusLabel, mentorshipStatusTone, sessionStatusLabel } from '@/utils/mentorship';
import { formatWhen, parseLocalDateTime, relativeTime, endTimeOf } from '@/utils/dateTime';
import { parseRpcError } from '@/utils/rpcErrors';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { haptics } from '@/utils/haptics';

type Role = 'student' | 'alumni';
type TabKey = 'overview' | 'sessions' | 'goals' | 'journal';

const DURATIONS = [15, 30, 45, 60, 90];

/** Runs an action, shows a readable error if it fails, and refreshes the space either way. */
function useAction(refresh: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<void>, successMessage?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      haptics.success();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      haptics.error();
      toast.error(parseRpcError(err).message);
    } finally {
      setBusy(null);
      refresh();
    }
  }
  return { busy, run };
}

function Block({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <SolidCard radius={18} style={{ gap: spacing.sm }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText weight="bold">{title}</AppText>
          {right}
        </View>
      ) : null}
      {children}
    </SolidCard>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </AppText>
      <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
        {value}
      </AppText>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */

export function MentorshipSpace({ mentorshipId, role }: { mentorshipId: string; role: Role }) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('overview');
  const [replyOpen, setReplyOpen] = useState<null | 'accept' | 'decline'>(null);
  const [endOpen, setEndOpen] = useState<null | 'complete' | 'end'>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [call, setCall] = useState<{ roomName: string; callUrl: string } | null>(null);

  const key = ['mentorship', mentorshipId] as const;
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const { busy, run } = useAction(refresh);

  const { data: m, isLoading, isError } = useQuery({ queryKey: key, queryFn: () => getMentorship(mentorshipId), refetchInterval: 30000 });
  const active = m?.status === 'active';
  const over = m?.status === 'completed' || m?.status === 'ended';
  const { data: sessions = [] } = useQuery({
    queryKey: [...key, 'sessions'],
    queryFn: () => listMentorshipSessions(mentorshipId),
    enabled: !!m && m.status !== 'declined' && m.status !== 'withdrawn' && m.status !== 'pending',
    refetchInterval: 30000,
  });
  const { data: goals = [] } = useQuery({
    queryKey: [...key, 'goals'],
    queryFn: () => listMentorshipGoals(mentorshipId),
    enabled: !!m && (active || over),
  });
  const { data: updates = [] } = useQuery({
    queryKey: [...key, 'updates'],
    queryFn: () => listMentorshipUpdates(mentorshipId),
    enabled: !!m && (active || over),
    refetchInterval: 30000,
  });
  const { data: feedback = [] } = useQuery({
    queryKey: [...key, 'feedback'],
    queryFn: () => listMentorshipFeedback(mentorshipId),
    enabled: !!m && over,
  });

  useLiveRefresh(
    `mentorship-${mentorshipId}`,
    [
      { table: 'mentorships', filter: `id=eq.${mentorshipId}` },
      { table: 'mentorship_sessions', filter: `mentorship_id=eq.${mentorshipId}` },
      { table: 'mentorship_updates', filter: `mentorship_id=eq.${mentorshipId}` },
      { table: 'mentorship_goals', filter: `mentorship_id=eq.${mentorshipId}` },
    ],
    [key],
    !!m,
  );

  const iAmMentor = !!m && user?.id === m.mentorId;
  const partner = m
    ? iAmMentor
      ? { id: m.studentId, name: m.studentName || 'Student', avatar: m.studentAvatarUrl, sub: m.studentDepartment || 'Student mentee' }
      : { id: m.mentorId, name: m.mentorName, avatar: m.mentorAvatarUrl, sub: m.mentorHeadline || 'Alumni mentor' }
    : null;

  const nextSession = useMemo(
    () =>
      sessions
        .filter((s) => (s.status === 'confirmed' || s.status === 'proposed') && new Date(endTimeOf(s.scheduledAt, s.durationMinutes)).getTime() > Date.now())
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0],
    [sessions],
  );
  const doneGoals = goals.filter((g) => g.isDone).length;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace((`/(${role})/mentorship`) as any);
  }

  function startCall() {
    const roomName = getCallRoomName(mentorshipId);
    setCall({ roomName, callUrl: getCallUrl(roomName, false) });
  }

  async function openChat() {
    if (!partner) return;
    try {
      const conv = await getOrCreateConversationWithUser(partner.id, partner.name, 'avatar_male');
      router.push(`/(${role})/messages/${conv.id}` as any);
    } catch {
      Alert.alert('Could not open the chat', 'Please try again in a moment. You can also use the Journal tab to leave a note.');
    }
  }

  if (isLoading) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <AppText tone="secondary" style={{ marginTop: spacing.lg }}>
          Loading your mentorship…
        </AppText>
      </ScreenContainer>
    );
  }
  if (isError || !m || !partner) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <EmptyState
          icon="alert-circle-outline"
          title="Mentorship not found"
          description="It may have been removed, or you may not be part of it."
          actionLabel="Back to mentorship"
          onAction={goBack}
        />
      </ScreenContainer>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(active || over || sessions.length > 0
      ? [
          { key: 'sessions', label: 'Sessions', badge: sessions.filter((s) => s.status === 'proposed' && s.proposedBy !== user?.id).length },
          { key: 'goals', label: 'Goals', badge: 0 },
          { key: 'journal', label: 'Journal', badge: 0 },
        ]
      : []),
  ];

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 140, gap: spacing.md, maxWidth: 860, alignSelf: 'center', width: '100%' }}
      >
        <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: spacing.xs }}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          <AppText variant="bodySmall" tone="secondary">
            {role === 'alumni' ? 'Mentorship desk' : 'Mentorship'}
          </AppText>
        </Pressable>

        {/* Header */}
        <SolidCard radius={20} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Avatar name={partner.name} uri={partner.avatar} size={56} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="h3" weight="bold" numberOfLines={2}>
                {partner.name}
              </AppText>
              <AppText tone="secondary" variant="caption" numberOfLines={2}>
                {partner.sub}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                <Badge label={mentorshipStatusLabel(m.status)} tone={mentorshipStatusTone(m.status)} />
                {m.focusArea ? (
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {m.focusArea}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>

          {/* primary actions */}
          {m.status === 'pending' && iAmMentor ? (
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Accept mentee" fullWidth onPress={() => setReplyOpen('accept')} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Decline" variant="secondary" fullWidth onPress={() => setReplyOpen('decline')} />
              </View>
            </View>
          ) : null}
          {m.status === 'pending' && !iAmMentor ? (
            <AppButton
              label="Withdraw request"
              variant="secondary"
              size="sm"
              loading={busy === 'withdraw'}
              onPress={() =>
                Alert.alert('Withdraw this request?', `${partner.name} will be told you withdrew it.`, [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Withdraw', style: 'destructive', onPress: () => void run('withdraw', async () => void (await endMentorship(m.id, 'withdraw')), 'Request withdrawn.') },
                ])
              }
            />
          ) : null}
          {active ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <AppButton label="Video call" icon="videocam-outline" size="sm" onPress={startCall} />
              {isFeatureEnabled('e2ee_messaging') ? <AppButton label="Message" icon="chatbubble-outline" size="sm" variant="secondary" onPress={openChat} /> : null}
              <AppButton label="Plan a session" icon="calendar-outline" size="sm" variant="secondary" onPress={() => { setTab('sessions'); setProposeOpen(true); }} />
              <AppButton label="Finish" size="sm" variant="ghost" onPress={() => setEndOpen('complete')} />
            </View>
          ) : null}
        </SolidCard>

        {tabs.length > 1 ? <SegmentedTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} /> : null}

        {tab === 'overview' || tabs.length === 1 ? (
          <OverviewPanel
            m={m}
            iAmMentor={iAmMentor}
            partnerName={partner.name}
            nextSession={nextSession}
            goalsTotal={goals.length}
            goalsDone={doneGoals}
            onOpenSessions={() => setTab('sessions')}
            onOpenGoals={() => setTab('goals')}
            feedbackSection={
              over ? (
                <FeedbackPanel
                  mentorshipId={m.id}
                  viewerId={user?.id}
                  iAmMentor={iAmMentor}
                  partnerName={partner.name}
                  feedback={feedback}
                  onChanged={refresh}
                />
              ) : null
            }
          />
        ) : null}
        {tab === 'sessions' ? (
          <SessionsPanel
            m={m}
            sessions={sessions}
            viewerId={user?.id}
            canPlan={active}
            busy={busy}
            run={run}
            onPlan={() => setProposeOpen(true)}
            onJoinCall={startCall}
          />
        ) : null}
        {tab === 'goals' ? <GoalsPanel m={m} goals={goals} viewerId={user?.id} iAmMentor={iAmMentor} active={active} run={run} busy={busy} /> : null}
        {tab === 'journal' ? <JournalPanel m={m} updates={updates} viewerId={user?.id} active={active} run={run} busy={busy} /> : null}
      </ScrollView>

      {/* accept / decline with an optional note */}
      <ReplySheet
        mode={replyOpen}
        studentName={partner.name}
        onClose={() => setReplyOpen(null)}
        onSubmit={async (message) => {
          const action = replyOpen;
          setReplyOpen(null);
          if (!action) return;
          await run(action, async () => void (await respondToMentorshipRequest(m.id, action, message)), action === 'accept' ? 'You are now mentoring this student.' : 'Request declined.');
        }}
      />
      <EndSheet
        mode={endOpen}
        partnerName={partner.name}
        onClose={() => setEndOpen(null)}
        onSubmit={async (action, reason) => {
          setEndOpen(null);
          await run('end', async () => void (await endMentorship(m.id, action, reason)), action === 'complete' ? 'Marked as complete. Leave some feedback below.' : 'Mentorship ended.');
        }}
      />
      <ProposeSessionSheet
        visible={proposeOpen}
        onClose={() => setProposeOpen(false)}
        onSubmit={async (p) => {
          await run('propose', async () => void (await proposeMentorshipSession(m.id, p)), 'Session proposed. You will be told when it is answered.');
          setProposeOpen(false);
        }}
        busy={busy === 'propose'}
      />

      {call ? (
        <CallModal
          visible
          onClose={() => setCall(null)}
          callType="video"
          roomName={call.roomName}
          callUrl={call.callUrl}
          partnerName={partner.name}
          partnerDepartment={partner.sub}
        />
      ) : null}
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Overview                                                                                          */
/* ------------------------------------------------------------------------------------------------ */
function OverviewPanel({
  m,
  iAmMentor,
  partnerName,
  nextSession,
  goalsTotal,
  goalsDone,
  onOpenSessions,
  onOpenGoals,
  feedbackSection,
}: {
  m: Mentorship;
  iAmMentor: boolean;
  partnerName: string;
  nextSession?: MentorshipSession;
  goalsTotal: number;
  goalsDone: number;
  onOpenSessions: () => void;
  onOpenGoals: () => void;
  feedbackSection: React.ReactNode;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {m.status === 'pending' ? (
        <Block>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Ionicons name="hourglass-outline" size={20} color={colors.textSecondary} />
            <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 19 }}>
              {iAmMentor
                ? `${partnerName} is waiting for your reply. Requests that get no answer close after 21 days.`
                : `Waiting for ${partnerName} to reply. You will get a notification as soon as they do. Unanswered requests close after 21 days.`}
            </AppText>
          </View>
        </Block>
      ) : null}
      {m.status === 'declined' ? (
        <Block>
          <AppText weight="bold" variant="bodySmall">
            {iAmMentor ? 'You declined this request' : `${partnerName} could not take this on`}
          </AppText>
          {m.declineReason ? <AppText variant="bodySmall">"{m.declineReason}"</AppText> : null}
          {!iAmMentor ? <AppText tone="secondary" variant="caption">You can ask another mentor - or the same one again after a week.</AppText> : null}
        </Block>
      ) : null}
      {m.status === 'ended' || m.status === 'completed' ? (
        <Block>
          <AppText weight="bold" variant="bodySmall">
            {m.status === 'completed' ? 'This mentorship was completed' : 'This mentorship ended early'}
            {m.endedAt ? ` · ${formatWhen(m.endedAt)}` : ''}
          </AppText>
          {m.endReason ? <AppText variant="bodySmall">"{m.endReason}"</AppText> : null}
        </Block>
      ) : null}

      {m.status === 'active' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Pressable onPress={onOpenSessions} style={{ flex: 1, minWidth: 230 }}>
            <Block title="Next session">
              {nextSession ? (
                <View style={{ gap: 2 }}>
                  <AppText weight="bold">{formatWhen(nextSession.scheduledAt)}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {relativeTime(nextSession.scheduledAt)} · {nextSession.durationMinutes} min · {SESSION_MODES.find((x) => x.key === nextSession.mode)?.label}
                  </AppText>
                  <Badge label={sessionStatusLabel(nextSession.status)} tone={nextSession.status === 'confirmed' ? 'success' : 'warning'} />
                </View>
              ) : (
                <AppText tone="secondary" variant="bodySmall">
                  Nothing scheduled yet. Plan your first session from the Sessions tab.
                </AppText>
              )}
            </Block>
          </Pressable>
          <Pressable onPress={onOpenGoals} style={{ flex: 1, minWidth: 230 }}>
            <Block title="Goals">
              {goalsTotal > 0 ? (
                <View style={{ gap: 6 }}>
                  <AppText weight="bold">
                    {goalsDone} of {goalsTotal} done
                  </AppText>
                  <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
                    <View style={{ height: 8, width: `${Math.round((goalsDone / goalsTotal) * 100)}%`, backgroundColor: colors.brandPrimary }} />
                  </View>
                </View>
              ) : (
                <AppText tone="secondary" variant="bodySmall">
                  No goals yet. Agree on two or three to keep the mentorship focused.
                </AppText>
              )}
            </Block>
          </Pressable>
        </View>
      ) : null}

      <Block title={iAmMentor ? "The student's request" : 'Your request'}>
        <Fact label="What they want help with" value={m.focusArea} />
        <Fact label="Level" value={m.academicLevel} />
        <Fact label="Introduction" value={m.pitch} />
        <Fact label="Goals" value={m.goals} />
        <Fact label="Preferred rhythm" value={m.cadence} />
        <Fact label="Proposed plan" value={m.planOutline} />
        <Fact label="Requested" value={m.createdAt ? formatWhen(m.createdAt) : null} />
        {m.startedAt ? <Fact label="Started" value={formatWhen(m.startedAt)} /> : null}
        {m.documentUrl && isSafeHttpUrl(m.documentUrl) ? (
          <Pressable
            onPress={() => void openExternalUrl(m.documentUrl as string)}
            accessibilityRole="link"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: radius.md,
              backgroundColor: `${colors.brandPrimary}12`,
              borderWidth: 1,
              borderColor: `${colors.brandPrimary}35`,
            }}
          >
            <Ionicons name="document-text" size={18} color={colors.brandPrimary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="caption" weight="bold" numberOfLines={1}>
                {m.documentName || 'Attached document'}
              </AppText>
              <AppText tone="secondary" variant="caption">
                Tap to open
              </AppText>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
      </Block>

      {feedbackSection}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Sessions                                                                                          */
/* ------------------------------------------------------------------------------------------------ */
function SessionsPanel({
  m,
  sessions,
  viewerId,
  canPlan,
  busy,
  run,
  onPlan,
  onJoinCall,
}: {
  m: Mentorship;
  sessions: MentorshipSession[];
  viewerId?: string;
  canPlan: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void>;
  onPlan: () => void;
  onJoinCall: () => void;
}) {
  const { colors, spacing } = useTheme();
  const now = Date.now();
  const isCurrent = (s: MentorshipSession) => (s.status === 'proposed' || s.status === 'confirmed') && new Date(endTimeOf(s.scheduledAt, s.durationMinutes)).getTime() > now;
  const upcoming = sessions.filter(isCurrent).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const earlier = sessions.filter((s) => !isCurrent(s)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const card = (s: MentorshipSession) => {
    const mode = SESSION_MODES.find((x) => x.key === s.mode);
    const iProposed = s.proposedBy === viewerId;
    const started = new Date(s.scheduledAt).getTime() <= now;
    const joinable = s.status === 'confirmed' && s.mode === 'video' && now >= new Date(s.scheduledAt).getTime() - 15 * 60000;
    return (
      <SolidCard key={s.id} radius={16} style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <AppText weight="bold">{formatWhen(s.scheduledAt)}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {mode ? <Ionicons name={mode.icon} size={14} color={colors.textSecondary} /> : null}
              <AppText tone="secondary" variant="caption">
                {mode?.label} · {s.durationMinutes} min{isCurrent(s) ? ` · ${relativeTime(s.scheduledAt)}` : ''}
              </AppText>
            </View>
          </View>
          <Badge
            label={sessionStatusLabel(s.status)}
            tone={s.status === 'confirmed' ? 'success' : s.status === 'proposed' ? 'warning' : s.status === 'completed' ? 'neutral' : 'critical'}
          />
        </View>
        {s.location ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Ionicons name={s.mode === 'in_person' ? 'location-outline' : 'link-outline'} size={14} color={colors.textSecondary} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {s.location}
            </AppText>
          </View>
        ) : null}
        {s.agenda ? <AppText variant="bodySmall" tone="secondary">Agenda: {s.agenda}</AppText> : null}
        {s.decisionNote ? <AppText variant="caption" tone="secondary">Note: {s.decisionNote}</AppText> : null}
        {s.outcomeNotes ? <AppText variant="caption">Takeaways: {s.outcomeNotes}</AppText> : null}

        {m.status === 'active' && (s.status === 'proposed' || s.status === 'confirmed') ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
            {s.status === 'proposed' && !iProposed ? (
              <>
                <AppButton label="Confirm" size="sm" loading={busy === `c-${s.id}`} onPress={() => run(`c-${s.id}`, async () => void (await respondToMentorshipSession(s.id, 'confirm')), 'Session confirmed.')} />
                <AppButton label="Decline" size="sm" variant="secondary" onPress={() => run(`d-${s.id}`, async () => void (await respondToMentorshipSession(s.id, 'decline')))} />
              </>
            ) : null}
            {s.status === 'proposed' && iProposed ? (
              <AppText variant="caption" tone="secondary" style={{ alignSelf: 'center' }}>
                Waiting for the other person to answer.
              </AppText>
            ) : null}
            {joinable ? <AppButton label="Join video call" icon="videocam-outline" size="sm" onPress={onJoinCall} /> : null}
            {s.status === 'confirmed' && started ? (
              <AppButton
                label="Mark as done"
                size="sm"
                variant="secondary"
                loading={busy === `m-${s.id}`}
                onPress={() => run(`m-${s.id}`, async () => void (await respondToMentorshipSession(s.id, 'complete')), 'Marked as done.')}
              />
            ) : null}
            <AppButton
              label="Cancel"
              size="sm"
              variant="ghost"
              onPress={() =>
                Alert.alert('Cancel this session?', 'The other person will be told.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel session', style: 'destructive', onPress: () => void run(`x-${s.id}`, async () => void (await respondToMentorshipSession(s.id, 'cancel')), 'Session cancelled.') },
                ])
              }
            />
          </View>
        ) : null}
      </SolidCard>
    );
  };

  return (
    <View style={{ gap: spacing.md }}>
      {canPlan ? <AppButton label="Plan a session" icon="add" onPress={onPlan} /> : null}
      <AppText weight="bold">Upcoming</AppText>
      {upcoming.length === 0 ? (
        <AppText tone="secondary" variant="bodySmall">
          {canPlan ? 'No sessions planned. Propose a time and the other person can confirm it.' : 'No upcoming sessions.'}
        </AppText>
      ) : (
        upcoming.map(card)
      )}
      {earlier.length > 0 ? (
        <>
          <AppText weight="bold" style={{ marginTop: spacing.xs }}>
            Earlier
          </AppText>
          {earlier.map(card)}
        </>
      ) : null}
    </View>
  );
}

function ProposeSessionSheet({
  visible,
  onClose,
  onSubmit,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (p: { scheduledAt: string; durationMinutes: number; mode: MentorSessionMode; location?: string; agenda?: string }) => Promise<void>;
  busy: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<MentorSessionMode>('video');
  const [location, setLocation] = useState('');
  const [agenda, setAgenda] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const when = parseLocalDateTime(date, time);
    if (!when) return setError('Enter a valid date (YYYY-MM-DD) and time (HH:MM), or use the quick picks.');
    if (when.getTime() < Date.now() + 10 * 60000) return setError('Pick a time at least 10 minutes from now.');
    if (mode === 'in_person' && !location.trim()) return setError('Say where you will meet.');
    await onSubmit({
      scheduledAt: when.toISOString(),
      durationMinutes: duration,
      mode,
      location: location.trim() || undefined,
      agenda: agenda.trim() || undefined,
    });
    setDate('');
    setTime('');
    setAgenda('');
    setLocation('');
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Plan a session"
      subtitle="The other person confirms or suggests another time."
      footer={
        <View style={{ gap: spacing.xs }}>
          {error ? (
            <AppText variant="caption" weight="semiBold" style={{ color: colors.critical }}>
              {error}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} fullWidth disabled={busy} />
            </View>
            <View style={{ flex: 2 }}>
              <AppButton label="Send proposal" onPress={submit} loading={busy} fullWidth />
            </View>
          </View>
        </View>
      }
    >
      <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          Length
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDuration(d)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: duration === d ? colors.brandPrimary : colors.border, backgroundColor: duration === d ? colors.pastelPrimaryBg : 'transparent' }}
            >
              <AppText variant="caption" weight="semiBold" tone={duration === d ? 'brand' : 'secondary'}>
                {d} min
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          How will you meet?
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {SESSION_MODES.map((x) => (
            <Pressable
              key={x.key}
              onPress={() => setMode(x.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: mode === x.key ? colors.brandPrimary : colors.border, backgroundColor: mode === x.key ? colors.pastelPrimaryBg : 'transparent' }}
            >
              <Ionicons name={x.icon} size={14} color={mode === x.key ? colors.brandPrimary : colors.textSecondary} />
              <AppText variant="caption" weight="semiBold" tone={mode === x.key ? 'brand' : 'secondary'}>
                {x.label}
              </AppText>
            </Pressable>
          ))}
        </View>
        <AppText tone="secondary" variant="caption">
          {mode === 'video' ? 'Video sessions use the private call room for this mentorship.' : mode === 'chat' ? 'Chat sessions happen in the Journal tab or your messages.' : 'Only the two of you can see the place you enter.'}
        </AppText>
      </View>
      {mode === 'in_person' ? <AppTextField label="Where? *" value={location} onChangeText={setLocation} placeholder="e.g. Faculty cafeteria, or a public place on campus" /> : null}
      <AppTextField label="Agenda (optional)" value={agenda} onChangeText={(v) => setAgenda(v.slice(0, 600))} placeholder="What do you want to cover?" multiline numberOfLines={3} />
    </FormSheet>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Goals                                                                                             */
/* ------------------------------------------------------------------------------------------------ */
function GoalsPanel({
  m,
  goals,
  viewerId,
  iAmMentor,
  active,
  run,
  busy,
}: {
  m: Mentorship;
  goals: import('@/api/types').MentorshipGoal[];
  viewerId?: string;
  iAmMentor: boolean;
  active: boolean;
  run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void>;
  busy: string | null;
}) {
  const { colors, spacing } = useTheme();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  async function add() {
    const clean = title.trim();
    if (clean.length < 3) return;
    const dueDate = due.trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      Alert.alert('Due date', 'Use the format YYYY-MM-DD, or leave it empty.');
      return;
    }
    await run('goal-add', async () => void (await addMentorshipGoal(m.id, clean, dueDate || null)));
    setTitle('');
    setDue('');
  }

  return (
    <View style={{ gap: spacing.md }}>
      {active ? (
        <Block title="Add a goal">
          <AppTextField label="" value={title} onChangeText={(v) => setTitle(v.slice(0, 160))} placeholder="e.g. Finish a portfolio project" onSubmitEditing={add} />
          <AppTextField label="" value={due} onChangeText={setDue} placeholder="Due date (YYYY-MM-DD, optional)" autoCapitalize="none" />
          <AppButton label="Add goal" size="sm" onPress={add} disabled={title.trim().length < 3} loading={busy === 'goal-add'} />
        </Block>
      ) : null}
      {goals.length === 0 ? (
        <AppText tone="secondary" variant="bodySmall">
          No goals yet.
        </AppText>
      ) : (
        goals.map((g) => (
          <SolidCard key={g.id} radius={16} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              disabled={!active}
              onPress={() => run(`g-${g.id}`, async () => void (await setMentorshipGoalDone(g.id, !g.isDone)))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: g.isDone }}
              hitSlop={8}
            >
              <Ionicons name={g.isDone ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={g.isDone ? colors.success : colors.textSecondary} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="semiBold" style={{ textDecorationLine: g.isDone ? 'line-through' : 'none', opacity: g.isDone ? 0.6 : 1 }}>
                {g.title}
              </AppText>
              {g.dueDate ? (
                <AppText tone="secondary" variant="caption">
                  Due {g.dueDate}
                </AppText>
              ) : null}
            </View>
            {active && (iAmMentor || g.createdBy === viewerId) ? (
              <Pressable onPress={() => run(`gd-${g.id}`, async () => deleteMentorshipGoal(g.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove goal">
                <Ionicons name="trash-outline" size={18} color={colors.critical} />
              </Pressable>
            ) : null}
          </SolidCard>
        ))
      )}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Journal                                                                                           */
/* ------------------------------------------------------------------------------------------------ */
function JournalPanel({
  m,
  updates,
  viewerId,
  active,
  run,
  busy,
}: {
  m: Mentorship;
  updates: import('@/api/types').MentorshipUpdate[];
  viewerId?: string;
  active: boolean;
  run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void>;
  busy: string | null;
}) {
  const { colors, spacing, radius } = useTheme();
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [kind, setKind] = useState<'note' | 'progress' | 'resource'>('note');

  async function post() {
    if (!body.trim()) return;
    if (link.trim() && !/^https:\/\//i.test(link.trim())) {
      Alert.alert('Link', 'The link must start with https://');
      return;
    }
    await run('post', async () => postMentorshipUpdate(m.id, body.trim(), kind, link.trim() || undefined));
    setBody('');
    setLink('');
  }

  return (
    <View style={{ gap: spacing.md }}>
      {active ? (
        <Block title="Share an update">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {(['note', 'progress', 'resource'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: kind === k ? colors.brandPrimary : colors.border, backgroundColor: kind === k ? colors.pastelPrimaryBg : 'transparent' }}
              >
                <AppText variant="caption" weight="semiBold" tone={kind === k ? 'brand' : 'secondary'}>
                  {k === 'note' ? 'Note' : k === 'progress' ? 'Progress' : 'Resource'}
                </AppText>
              </Pressable>
            ))}
          </View>
          <AppTextField label="" value={body} onChangeText={(v) => setBody(v.slice(0, 2000))} placeholder={kind === 'resource' ? 'What are you sharing and why is it useful?' : 'Write to each other here - it stays between the two of you.'} multiline numberOfLines={3} />
          {kind === 'resource' || link ? <AppTextField label="" value={link} onChangeText={setLink} placeholder="https:// link (optional)" autoCapitalize="none" keyboardType="url" /> : null}
          <AppButton label="Post" size="sm" onPress={post} disabled={!body.trim()} loading={busy === 'post'} />
        </Block>
      ) : null}
      {updates.length === 0 ? (
        <AppText tone="secondary" variant="bodySmall">
          Nothing here yet. Notes, progress updates and useful links you both post appear in this journal.
        </AppText>
      ) : (
        updates.map((u) => {
          const mine = u.authorId === viewerId;
          return (
            <SolidCard key={u.id} radius={16} style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: mine ? colors.brandPrimary : colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText variant="caption" weight="bold">
                  {mine ? 'You' : u.authorName || 'Your partner'}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {u.kind !== 'note' ? <Badge label={u.kind} tone="brand" /> : null}
                  <AppText variant="caption" tone="secondary">
                    {formatWhen(u.createdAt)}
                  </AppText>
                </View>
              </View>
              <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
                {u.body}
              </AppText>
              {u.linkUrl && isSafeHttpUrl(u.linkUrl) ? (
                <Pressable onPress={() => void openExternalUrl(u.linkUrl as string)} accessibilityRole="link" style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <Ionicons name="link-outline" size={14} color={colors.brandPrimary} />
                  <AppText variant="caption" tone="brand" numberOfLines={1} style={{ flex: 1 }}>
                    {u.linkUrl}
                  </AppText>
                </Pressable>
              ) : null}
            </SolidCard>
          );
        })
      )}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Feedback, reply + end sheets                                                                      */
/* ------------------------------------------------------------------------------------------------ */
function FeedbackPanel({
  mentorshipId,
  viewerId,
  iAmMentor,
  partnerName,
  feedback,
  onChanged,
}: {
  mentorshipId: string;
  viewerId?: string;
  iAmMentor: boolean;
  partnerName: string;
  feedback: import('@/api/types').MentorshipFeedback[];
  onChanged: () => void;
}) {
  const { spacing } = useTheme();
  const toast = useToast();
  const mine = feedback.find((f) => f.fromUser === viewerId);
  const theirs = feedback.find((f) => f.fromUser !== viewerId);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (rating < 1) return toast.error('Choose a star rating first.');
    setSaving(true);
    try {
      await submitMentorshipFeedback(mentorshipId, rating, comment);
      toast.success('Thanks for your feedback.');
      onChanged();
    } catch (err) {
      toast.error(parseRpcError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Block title={iAmMentor ? 'Feedback' : `How was ${partnerName}?`}>
      <AppText tone="secondary" variant="caption">
        {iAmMentor ? 'Leave a private note about how it went. Only ratings from mentees appear on your mentor profile.' : 'Your rating appears on their mentor profile and helps other students choose.'}
      </AppText>
      <StarRating value={rating} onChange={setRating} size={28} />
      <AppTextField label="" value={comment} onChangeText={(v) => setComment(v.slice(0, 1000))} placeholder="What went well? What could be better? (optional)" multiline numberOfLines={3} />
      <AppButton label={mine ? 'Update feedback' : 'Send feedback'} size="sm" onPress={save} loading={saving} />
      {theirs ? (
        <View style={{ marginTop: spacing.xs, gap: 4 }}>
          <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase' }}>
            {partnerName} said
          </AppText>
          <StarRating value={theirs.rating} size={16} />
          {theirs.comment ? <AppText variant="bodySmall">"{theirs.comment}"</AppText> : null}
        </View>
      ) : null}
    </Block>
  );
}

function ReplySheet({
  mode,
  studentName,
  onClose,
  onSubmit,
}: {
  mode: null | 'accept' | 'decline';
  studentName: string;
  onClose: () => void;
  onSubmit: (message?: string) => Promise<void>;
}) {
  const { spacing } = useTheme();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const accept = mode === 'accept';
  return (
    <FormSheet
      visible={!!mode}
      onClose={onClose}
      title={accept ? `Accept ${studentName}?` : `Decline ${studentName}?`}
      subtitle={accept ? 'They are told straight away and your mentorship space opens.' : 'They are told, with your note if you write one.'}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppButton label="Back" variant="ghost" onPress={onClose} fullWidth disabled={busy} />
          </View>
          <View style={{ flex: 2 }}>
            <AppButton
              label={accept ? 'Accept mentee' : 'Decline request'}
              variant={accept ? 'primary' : 'secondary'}
              loading={busy}
              fullWidth
              onPress={async () => {
                setBusy(true);
                try {
                  await onSubmit(message.trim() || undefined);
                  setMessage('');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      }
    >
      <AppTextField
        label={accept ? 'Welcome note (optional)' : 'Reason (optional)'}
        value={message}
        onChangeText={(v) => setMessage(v.slice(0, 500))}
        placeholder={accept ? 'e.g. Happy to help - let us find a time this week.' : 'e.g. I am at capacity until next semester.'}
        multiline
        numberOfLines={3}
      />
    </FormSheet>
  );
}

function EndSheet({
  mode,
  partnerName,
  onClose,
  onSubmit,
}: {
  mode: null | 'complete' | 'end';
  partnerName: string;
  onClose: () => void;
  onSubmit: (action: 'complete' | 'end', reason?: string) => Promise<void>;
}) {
  const { spacing } = useTheme();
  const [action, setAction] = useState<'complete' | 'end'>('complete');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (mode) setAction(mode);
  }, [mode]);
  return (
    <FormSheet
      visible={!!mode}
      onClose={onClose}
      title="Finish this mentorship"
      subtitle={`${partnerName} is told. Scheduled sessions are cancelled and feedback opens for both of you.`}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppButton label="Back" variant="ghost" onPress={onClose} fullWidth disabled={busy} />
          </View>
          <View style={{ flex: 2 }}>
            <AppButton
              label={action === 'complete' ? 'Mark as completed' : 'End early'}
              loading={busy}
              fullWidth
              onPress={async () => {
                setBusy(true);
                try {
                  await onSubmit(action, reason.trim() || undefined);
                  setReason('');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['complete', 'end'] as const).map((a) => (
          <View key={a} style={{ flex: 1 }}>
            <AppButton label={a === 'complete' ? 'We reached our goals' : 'Stop early'} variant={action === a ? 'primary' : 'secondary'} size="sm" fullWidth onPress={() => setAction(a)} />
          </View>
        ))}
      </View>
      <AppTextField label="Note (optional)" value={reason} onChangeText={(v) => setReason(v.slice(0, 500))} placeholder="Anything you want the other person to know" multiline numberOfLines={3} />
    </FormSheet>
  );
}
