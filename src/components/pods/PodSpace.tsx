import React, { useEffect, useState } from 'react';
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
import { FormSheet } from '../common/FormSheet';
import { SegmentedTabs } from '../common/SegmentedTabs';
import { DateTimeFields } from '../common/DateTimeFields';
import { CreateStudyGroupModal, PodFormValues } from '../CreateStudyGroupModal';
import { StudyGroupCard } from '../StudyGroupCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import {
  cancelPodSession,
  deletePodPost,
  getStudyGroup,
  leaveStudyGroup,
  listPodMembers,
  listPodPosts,
  listPodSessions,
  markPodRead,
  moderatePodPost,
  postToPod,
  removePodMember,
  reportPodPost,
  respondToJoinRequest,
  rsvpPodSession,
  schedulePodSession,
  setPodMemberRole,
  updateStudyGroup,
} from '@/api/studyGroups';
import { PodMember, PodPost, PodPostKind, PodSession, StudyGroup } from '@/api/types';
import { formatWhen, parseLocalDateTime, relativeTime } from '@/utils/dateTime';
import { parseRpcError } from '@/utils/rpcErrors';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { haptics } from '@/utils/haptics';

type TabKey = 'discussion' | 'sessions' | 'members' | 'about';

const KIND_LABEL: Record<PodPostKind, string> = { discussion: 'Discussion', question: 'Question', announcement: 'Announcement', resource: 'Resource' };
const KIND_ICON: Record<PodPostKind, keyof typeof Ionicons.glyphMap> = {
  discussion: 'chatbubble-ellipses-outline',
  question: 'help-circle-outline',
  announcement: 'megaphone-outline',
  resource: 'link-outline',
};

function useRun(refresh: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<void>, ok?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      haptics.success();
      if (ok) toast.success(ok);
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

/* ------------------------------------------------------------------------------------------------ */

export function PodSpace({ podId }: { podId: string }) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('discussion');
  const [editOpen, setEditOpen] = useState(false);

  const key = ['pod', podId] as const;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['study-groups'] });
  };
  const { busy, run } = useRun(refresh);

  const podQuery = useQuery({ queryKey: key, queryFn: () => getStudyGroup(podId), refetchInterval: 30000 });
  const pod = podQuery.data;
  const member = pod?.myStatus === 'active';
  const mod = member && (pod?.myRole === 'owner' || pod?.myRole === 'moderator');

  useLiveRefresh(
    `pod-${podId}`,
    [
      { table: 'study_group_posts', filter: `group_id=eq.${podId}` },
      { table: 'study_group_sessions', filter: `group_id=eq.${podId}` },
      { table: 'study_group_members', filter: `group_id=eq.${podId}` },
    ],
    [key],
    !!member,
  );

  const posts = useQuery({ queryKey: [...key, 'posts'], queryFn: () => listPodPosts(podId), enabled: !!member, refetchInterval: 20000 });
  const sessions = useQuery({ queryKey: [...key, 'sessions'], queryFn: () => listPodSessions(podId), enabled: !!member, refetchInterval: 60000 });
  const members = useQuery({ queryKey: [...key, 'members'], queryFn: () => listPodMembers(podId), enabled: !!member });

  // Opening the discussion clears the unread counter.
  useEffect(() => {
    if (member && tab === 'discussion' && (pod?.unreadCount ?? 0) > 0) {
      markPodRead(podId).then(() => queryClient.invalidateQueries({ queryKey: ['study-groups'] }));
    }
  }, [member, tab, pod?.unreadCount, podId, queryClient]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(student)/study-groups' as any);
  }

  if (podQuery.isLoading) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <AppText tone="secondary" style={{ marginTop: spacing.lg }}>
          Opening the pod…
        </AppText>
      </ScreenContainer>
    );
  }
  if (podQuery.isError || !pod) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <EmptyState
          icon="alert-circle-outline"
          title="Study pod not found"
          description="It may have been closed, or it belongs to another campus."
          actionLabel="Back to study pods"
          onAction={goBack}
        />
      </ScreenContainer>
    );
  }

  const pendingCount = pod.pendingCount ?? 0;
  const tabs = [
    { key: 'discussion', label: 'Discussion' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'members', label: 'Members', badge: pendingCount },
    { key: 'about', label: 'About' },
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
            Study pods
          </AppText>
        </Pressable>

        {!member ? (
          <View style={{ gap: spacing.md }}>
            <StudyGroupCard group={pod} onJoined={refresh} />
            <SolidCard radius={16}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
                <AppText variant="bodySmall" tone="secondary" style={{ flex: 1, lineHeight: 19 }}>
                  {pod.myStatus === 'pending'
                    ? 'Your request is with the pod owner. You will be notified when it is answered.'
                    : 'The discussion, sessions and member list are visible to members only. Join to take part.'}
                </AppText>
              </View>
            </SolidCard>
          </View>
        ) : (
          <>
            <SolidCard radius={20} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {pod.courseCode ? <Badge label={pod.courseCode} tone="brand" /> : null}
                <Badge label={pod.isPublic ? 'Public' : 'Private'} tone="neutral" />
                {pod.myRole === 'owner' ? <Badge label="You run this pod" tone="success" /> : pod.myRole === 'moderator' ? <Badge label="Moderator" tone="success" /> : null}
              </View>
              <AppText variant="h2" weight="bold">
                {pod.name}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                  <AppText variant="caption" tone="secondary">
                    {pod.memberCount}
                    {pod.maxMembers ? `/${pod.maxMembers}` : ''} members
                  </AppText>
                </View>
                {pod.scheduleNote ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="repeat-outline" size={14} color={colors.textSecondary} />
                    <AppText variant="caption" tone="secondary">
                      {pod.scheduleNote}
                    </AppText>
                  </View>
                ) : null}
                {pod.nextSessionAt ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="calendar-outline" size={14} color={colors.brandPrimary} />
                    <AppText variant="caption" tone="brand" weight="semiBold">
                      Next: {formatWhen(pod.nextSessionAt)} ({relativeTime(pod.nextSessionAt)})
                    </AppText>
                  </View>
                ) : null}
              </View>
              {pod.goal ? (
                <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
                  <AppText variant="bodySmall" weight="bold">
                    Goal:{' '}
                  </AppText>
                  {pod.goal}
                </AppText>
              ) : null}
              {pod.meetingLink && isSafeHttpUrl(pod.meetingLink) ? (
                <View style={{ flexDirection: 'row' }}>
                  <AppButton label="Open meeting link" icon="videocam-outline" size="sm" variant="secondary" onPress={() => void openExternalUrl(pod.meetingLink as string)} />
                </View>
              ) : null}
            </SolidCard>

            <SegmentedTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

            {tab === 'discussion' ? <DiscussionPanel pod={pod} posts={posts.data ?? []} loading={posts.isLoading} viewerId={user?.id} mod={!!mod} refresh={() => { posts.refetch(); refresh(); }} /> : null}
            {tab === 'sessions' ? <SessionsPanel pod={pod} sessions={sessions.data ?? []} mod={!!mod} busy={busy} run={run} /> : null}
            {tab === 'members' ? <MembersPanel pod={pod} members={members.data ?? []} viewerId={user?.id} busy={busy} run={run} /> : null}
            {tab === 'about' ? <AboutPanel pod={pod} onEdit={() => setEditOpen(true)} busy={busy} run={run} onLeft={goBack} /> : null}
          </>
        )}
      </ScrollView>

      <CreateStudyGroupModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        initial={
          {
            name: pod.name,
            courseCode: pod.courseCode,
            description: pod.description,
            isPublic: pod.isPublic,
            level: pod.level ?? '',
            department: pod.department ?? '',
            topics: pod.topics,
            meetingLink: pod.meetingLink ?? '',
            scheduleNote: pod.scheduleNote ?? '',
            goal: pod.goal ?? '',
            maxMembers: pod.maxMembers ?? 20,
          } satisfies PodFormValues
        }
        onSubmit={async (values) => {
          await updateStudyGroup(pod.id, values);
          refresh();
        }}
      />
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Discussion                                                                                        */
/* ------------------------------------------------------------------------------------------------ */
function DiscussionPanel({ pod, posts, loading, viewerId, mod, refresh }: { pod: StudyGroup; posts: PodPost[]; loading: boolean; viewerId?: string; mod: boolean; refresh: () => void }) {
  const { spacing } = useTheme();
  const [composeOpen, setComposeOpen] = useState(false);
  const [thread, setThread] = useState<PodPost | null>(null);
  const { busy, run } = useRun(refresh);

  const openThread = thread ? posts.find((p) => p.id === thread.id) ?? thread : null;

  return (
    <View style={{ gap: spacing.md }}>
      <AppButton label="Start a post" icon="create-outline" onPress={() => setComposeOpen(true)} />
      {loading ? (
        <AppText tone="secondary" variant="bodySmall">
          Loading the discussion…
        </AppText>
      ) : posts.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="No posts yet" description="Ask a question, share a resource or start a discussion. Everyone in the pod can reply." actionLabel="Start a post" onAction={() => setComposeOpen(true)} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} viewerId={viewerId} mod={mod} busy={busy} run={run} onOpen={() => setThread(p)} />)
      )}

      <ComposeSheet visible={composeOpen} onClose={() => setComposeOpen(false)} canAnnounce={mod} podId={pod.id} onPosted={refresh} />
      <ThreadSheet post={openThread} onClose={() => setThread(null)} podId={pod.id} viewerId={viewerId} mod={mod} onChanged={refresh} />
    </View>
  );
}

function PostCard({
  post,
  viewerId,
  mod,
  busy,
  run,
  onOpen,
}: {
  post: PodPost;
  viewerId?: string;
  mod: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void>;
  onOpen: () => void;
}) {
  const { colors, spacing } = useTheme();
  const mine = post.authorId === viewerId;
  const [reporting, setReporting] = useState(false);
  return (
    <SolidCard radius={18} style={{ gap: spacing.xs, borderLeftWidth: post.kind === 'announcement' ? 3 : 0, borderLeftColor: colors.brandPrimary }}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={post.authorName} uri={post.authorAvatar} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="bodySmall" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {mine ? 'You' : post.authorName}
              </AppText>
              {post.authorPodRole === 'owner' || post.authorPodRole === 'moderator' ? (
                <AppText variant="caption" tone="brand" weight="bold" style={{ fontSize: 10 }}>
                  {post.authorPodRole === 'owner' ? 'OWNER' : 'MOD'}
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" tone="secondary">
              {formatWhen(post.createdAt)}
            </AppText>
          </View>
          {post.isPinned ? <Ionicons name="pin" size={16} color={colors.brandPrimary} /> : null}
          {post.kind !== 'discussion' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name={KIND_ICON[post.kind]} size={14} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary" weight="semiBold">
                {KIND_LABEL[post.kind]}
              </AppText>
            </View>
          ) : null}
        </View>
        {post.title ? (
          <AppText weight="bold" style={{ lineHeight: 21 }}>
            {post.title}
          </AppText>
        ) : null}
        <AppText variant="bodySmall" numberOfLines={6} style={{ lineHeight: 19 }}>
          {post.body}
        </AppText>
        {post.linkUrl && isSafeHttpUrl(post.linkUrl) ? (
          <Pressable onPress={() => void openExternalUrl(post.linkUrl as string)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="link-outline" size={14} color={colors.brandPrimary} />
            <AppText variant="caption" tone="brand" numberOfLines={1} style={{ flex: 1 }}>
              {post.linkUrl}
            </AppText>
          </Pressable>
        ) : null}
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.xs }}>
        <Pressable onPress={onOpen} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button">
          <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
          <AppText variant="caption" tone="secondary" weight="semiBold">
            {post.replyCount === 0 ? 'Reply' : `${post.replyCount} repl${post.replyCount === 1 ? 'y' : 'ies'}`}
          </AppText>
        </Pressable>
        {post.kind === 'question' ? (
          post.isResolved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <AppText variant="caption" weight="semiBold" style={{ color: colors.success }}>
                Resolved
              </AppText>
            </View>
          ) : null
        ) : null}
        <View style={{ flex: 1 }} />
        {post.kind === 'question' && (mine || mod) ? (
          <Pressable onPress={() => run(`r-${post.id}`, async () => moderatePodPost(post.id, post.isResolved ? 'unresolve' : 'resolve'))} hitSlop={6} accessibilityRole="button" disabled={busy === `r-${post.id}`}>
            <AppText variant="caption" tone="brand" weight="semiBold">
              {post.isResolved ? 'Reopen' : 'Mark resolved'}
            </AppText>
          </Pressable>
        ) : null}
        {mod && !post.parentId ? (
          <Pressable onPress={() => run(`p-${post.id}`, async () => moderatePodPost(post.id, post.isPinned ? 'unpin' : 'pin'))} hitSlop={6} accessibilityRole="button" disabled={busy === `p-${post.id}`}>
            <AppText variant="caption" tone="secondary" weight="semiBold">
              {post.isPinned ? 'Unpin' : 'Pin'}
            </AppText>
          </Pressable>
        ) : null}
        {!mine ? (
          <Pressable onPress={() => setReporting(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Report post">
            <Ionicons name="flag-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {mine || mod ? (
          <Pressable
            onPress={() =>
              Alert.alert('Delete this post?', 'Its replies are deleted too.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void run(`x-${post.id}`, async () => deletePodPost(post.id), 'Post deleted.') },
              ])
            }
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Delete post"
          >
            <Ionicons name="trash-outline" size={16} color={colors.critical} />
          </Pressable>
        ) : null}
      </View>
      <ReportPostSheet visible={reporting} postId={post.id} onClose={() => setReporting(false)} />
    </SolidCard>
  );
}

const REPORT_REASONS = ['Spam or ads', 'Harassment or bullying', 'Inappropriate content', 'Cheating or plagiarism', 'Something else'];

function ReportPostSheet({ visible, postId, onClose }: { visible: boolean; postId: string; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      await reportPodPost(postId, details.trim() ? `${reason}: ${details.trim()}` : reason);
      haptics.success();
      toast.success('Thanks - a moderator will review this post.');
      setDetails('');
      onClose();
    } catch (err) {
      haptics.error();
      toast.error(parseRpcError(err).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Report this post"
      subtitle="Campus moderators review reports. The author is not told who reported."
      footer={<AppButton label="Send report" onPress={send} loading={sending} fullWidth />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REPORT_REASONS.map((x) => (
          <Pressable
            key={x}
            onPress={() => setReason(x)}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === x }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: reason === x ? colors.brandPrimary : colors.border, backgroundColor: reason === x ? `${colors.brandPrimary}18` : 'transparent' }}
          >
            <AppText variant="caption" weight="semiBold" tone={reason === x ? 'brand' : 'secondary'}>
              {x}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppTextField label="More detail (optional)" value={details} onChangeText={(v) => setDetails(v.slice(0, 300))} placeholder="What should the moderator know?" multiline numberOfLines={3} />
    </FormSheet>
  );
}

function ComposeSheet({ visible, onClose, canAnnounce, podId, onPosted }: { visible: boolean; onClose: () => void; canAnnounce: boolean; podId: string; onPosted: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const [kind, setKind] = useState<PodPostKind>('discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const kinds: PodPostKind[] = ['discussion', 'question', 'resource', ...(canAnnounce ? (['announcement'] as PodPostKind[]) : [])];
  const needsTitle = kind !== 'discussion';

  async function submit() {
    setError(null);
    if (!body.trim()) return setError('Write something first.');
    if (needsTitle && title.trim().length < 3) return setError('Add a short title (at least 3 characters).');
    if (kind === 'resource' && !/^https?:\/\//i.test(link.trim())) return setError('Add the link you are sharing (it must start with https://).');
    setSaving(true);
    try {
      await postToPod(podId, { body: body.trim(), kind, title: needsTitle ? title.trim() : undefined, linkUrl: link.trim() || undefined });
      haptics.success();
      toast.success(kind === 'announcement' ? 'Announcement sent to every member.' : 'Posted.');
      setBody('');
      setTitle('');
      setLink('');
      onPosted();
      onClose();
    } catch (err) {
      haptics.error();
      setError(parseRpcError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Start a post"
      footer={
        <View style={{ gap: spacing.xs }}>
          {error ? (
            <AppText variant="caption" weight="semiBold" style={{ color: colors.critical }}>
              {error}
            </AppText>
          ) : null}
          <AppButton label="Post" onPress={submit} loading={saving} fullWidth />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {kinds.map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: kind === k ? colors.brandPrimary : colors.border, backgroundColor: kind === k ? `${colors.brandPrimary}18` : 'transparent' }}
          >
            <Ionicons name={KIND_ICON[k]} size={14} color={kind === k ? colors.brandPrimary : colors.textSecondary} />
            <AppText variant="caption" weight="semiBold" tone={kind === k ? 'brand' : 'secondary'}>
              {KIND_LABEL[k]}
            </AppText>
          </Pressable>
        ))}
      </View>
      {needsTitle ? <AppTextField label="Title" value={title} onChangeText={(v) => setTitle(v.slice(0, 140))} placeholder={kind === 'question' ? 'Your question in one line' : kind === 'resource' ? 'What is it?' : 'Headline'} /> : null}
      <AppTextField
        label={kind === 'question' ? 'Details' : kind === 'resource' ? 'Why is it useful?' : 'Message'}
        value={body}
        onChangeText={(v) => setBody(v.slice(0, 4000))}
        placeholder={kind === 'announcement' ? 'Every member is notified.' : 'Write here…'}
        multiline
        numberOfLines={5}
      />
      {kind === 'resource' || link ? <AppTextField label="Link" value={link} onChangeText={setLink} placeholder="https://" autoCapitalize="none" keyboardType="url" /> : null}
    </FormSheet>
  );
}

function ThreadSheet({ post, onClose, podId, viewerId, mod, onChanged }: { post: PodPost | null; onClose: () => void; podId: string; viewerId?: string; mod: boolean; onChanged: () => void }) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const replies = useQuery({ queryKey: ['pod', podId, 'replies', post?.id], queryFn: () => listPodPosts(podId, post!.id), enabled: !!post, refetchInterval: 15000 });

  async function send() {
    if (!post || !reply.trim()) return;
    setSending(true);
    try {
      await postToPod(podId, { body: reply.trim(), parentId: post.id });
      setReply('');
      await replies.refetch();
      onChanged();
    } catch (err) {
      haptics.error();
      toast.error(parseRpcError(err).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <FormSheet
      visible={!!post}
      onClose={onClose}
      title={post?.title || 'Discussion'}
      subtitle={post ? `${post.authorName} · ${formatWhen(post.createdAt)}` : undefined}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <AppTextField label="" value={reply} onChangeText={(v) => setReply(v.slice(0, 4000))} placeholder="Write a reply…" multiline numberOfLines={2} />
          </View>
          <AppButton label="Send" size="sm" onPress={send} loading={sending} disabled={!reply.trim()} />
        </View>
      }
    >
      {post ? (
        <SolidCard radius={14}>
          <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
            {post.body}
          </AppText>
        </SolidCard>
      ) : null}
      {(replies.data ?? []).length === 0 && !replies.isLoading ? (
        <AppText tone="secondary" variant="bodySmall">
          No replies yet. Be the first.
        </AppText>
      ) : null}
      {(replies.data ?? []).map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Avatar name={r.authorName} uri={r.authorAvatar} size={28} />
          <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.divider, borderRadius: 14, padding: 10, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
              <AppText variant="caption" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {r.authorId === viewerId ? 'You' : r.authorName}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {formatWhen(r.createdAt)}
              </AppText>
            </View>
            <AppText variant="bodySmall" style={{ lineHeight: 18 }}>
              {r.body}
            </AppText>
          </View>
          {r.authorId === viewerId || mod ? (
            <Pressable
              onPress={async () => {
                try {
                  await deletePodPost(r.id);
                  await replies.refetch();
                  onChanged();
                } catch (err) {
                  toast.error(parseRpcError(err).message);
                }
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Delete reply"
              style={{ paddingTop: 8 }}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </FormSheet>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Sessions                                                                                          */
/* ------------------------------------------------------------------------------------------------ */
function SessionsPanel({ pod, sessions, mod, busy, run }: { pod: StudyGroup; sessions: PodSession[]; mod: boolean; busy: string | null; run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void> }) {
  const { colors, spacing } = useTheme();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const now = Date.now();
  const upcoming = sessions.filter((s) => s.status === 'scheduled' && new Date(s.scheduledAt).getTime() + s.durationMinutes * 60000 > now);
  const earlier = sessions.filter((s) => !upcoming.includes(s)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const card = (s: PodSession, isUpcoming: boolean) => (
    <SolidCard key={s.id} radius={16} style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold">{s.title}</AppText>
          <AppText variant="caption" tone="secondary">
            {formatWhen(s.scheduledAt)} · {s.durationMinutes} min{isUpcoming ? ` · ${relativeTime(s.scheduledAt)}` : ''}
          </AppText>
        </View>
        <Badge label={s.mode === 'online' ? 'Online' : 'In person'} tone="neutral" />
      </View>
      {s.location ? (
        s.mode === 'online' && isSafeHttpUrl(s.location) ? (
          <Pressable onPress={() => void openExternalUrl(s.location as string)} accessibilityRole="link" style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Ionicons name="videocam-outline" size={14} color={colors.brandPrimary} />
            <AppText variant="caption" tone="brand" numberOfLines={1} style={{ flex: 1 }}>
              {s.location}
            </AppText>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {s.location}
            </AppText>
          </View>
        )
      ) : null}
      {s.agenda ? (
        <AppText variant="bodySmall" tone="secondary">
          {s.agenda}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
        <AppText variant="caption" tone="secondary">
          {s.goingCount} going
        </AppText>
        <View style={{ flex: 1 }} />
        {isUpcoming ? (
          <>
            <AppButton
              label={s.iAmGoing ? "I'm going ✓" : 'Count me in'}
              size="sm"
              variant={s.iAmGoing ? 'secondary' : 'primary'}
              loading={busy === `g-${s.id}`}
              onPress={() => run(`g-${s.id}`, async () => rsvpPodSession(s.id, !s.iAmGoing))}
            />
            {mod || s.createdBy ? (
              mod ? (
                <AppButton
                  label="Cancel"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    Alert.alert('Cancel this session?', 'Members who said they were going are told.', [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Cancel session', style: 'destructive', onPress: () => void run(`c-${s.id}`, async () => cancelPodSession(s.id), 'Session cancelled.') },
                    ])
                  }
                />
              ) : null
            ) : null}
          </>
        ) : null}
      </View>
    </SolidCard>
  );

  return (
    <View style={{ gap: spacing.md }}>
      {mod ? <AppButton label="Schedule a session" icon="add" onPress={() => setScheduleOpen(true)} /> : null}
      <AppText weight="bold">Upcoming</AppText>
      {upcoming.length === 0 ? (
        <AppText tone="secondary" variant="bodySmall">
          {mod ? 'No sessions scheduled. Plan one and everyone is notified.' : 'No sessions scheduled yet. The owner or a moderator can plan one.'}
        </AppText>
      ) : (
        upcoming.map((s) => card(s, true))
      )}
      {earlier.length > 0 ? (
        <>
          <AppText weight="bold">Earlier</AppText>
          {earlier.slice(0, 10).map((s) => card(s, false))}
        </>
      ) : null}
      <ScheduleSheet visible={scheduleOpen} onClose={() => setScheduleOpen(false)} pod={pod} onSubmit={(p) => run('schedule', async () => schedulePodSession(pod.id, p), 'Session scheduled. Members were notified.')} />
    </View>
  );
}

function ScheduleSheet({ visible, onClose, pod, onSubmit }: { visible: boolean; onClose: () => void; pod: StudyGroup; onSubmit: (p: Parameters<typeof schedulePodSession>[1]) => Promise<void> }) {
  const { colors, spacing, radius } = useTheme();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<'online' | 'in_person'>('online');
  const [location, setLocation] = useState('');
  const [agenda, setAgenda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (title.trim().length < 3) return setError('Give the session a title.');
    const when = parseLocalDateTime(date, time);
    if (!when) return setError('Enter a valid date (YYYY-MM-DD) and time (HH:MM), or use the quick picks.');
    if (when.getTime() < Date.now() + 5 * 60000) return setError('Pick a time at least 5 minutes from now.');
    if (mode === 'in_person' && !location.trim()) return setError('Say where you will meet.');
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), scheduledAt: when.toISOString(), durationMinutes: duration, mode, location: location.trim() || undefined, agenda: agenda.trim() || undefined });
      setTitle('');
      setAgenda('');
      setLocation('');
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Schedule a session"
      footer={
        <View style={{ gap: spacing.xs }}>
          {error ? (
            <AppText variant="caption" weight="semiBold" style={{ color: colors.critical }}>
              {error}
            </AppText>
          ) : null}
          <AppButton label="Schedule" onPress={submit} loading={saving} fullWidth />
        </View>
      }
    >
      <AppTextField label="Title" value={title} onChangeText={(v) => setTitle(v.slice(0, 120))} placeholder="e.g. Graphs problem set" />
      <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[30, 60, 90, 120, 180].map((d) => (
          <Pressable key={d} onPress={() => setDuration(d)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: duration === d ? colors.brandPrimary : colors.border, backgroundColor: duration === d ? colors.pastelPrimaryBg : 'transparent' }}>
            <AppText variant="caption" weight="semiBold" tone={duration === d ? 'brand' : 'secondary'}>
              {d} min
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['online', 'in_person'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: mode === m ? colors.brandPrimary : colors.border, backgroundColor: mode === m ? colors.pastelPrimaryBg : 'transparent' }}>
            <AppText variant="caption" weight="semiBold" tone={mode === m ? 'brand' : 'secondary'}>
              {m === 'online' ? 'Online' : 'In person'}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppTextField
        label={mode === 'online' ? 'Meeting link' : 'Where? *'}
        value={location}
        onChangeText={setLocation}
        placeholder={mode === 'online' ? (pod.meetingLink ? 'Leave empty to use the pod link' : 'https://meet.google.com/...') : 'e.g. Faculty library, room 2'}
        autoCapitalize="none"
      />
      <AppTextField label="Agenda (optional)" value={agenda} onChangeText={(v) => setAgenda(v.slice(0, 600))} placeholder="What will you cover?" multiline numberOfLines={3} />
    </FormSheet>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Members                                                                                           */
/* ------------------------------------------------------------------------------------------------ */
function MembersPanel({ pod, members, viewerId, busy, run }: { pod: StudyGroup; members: PodMember[]; viewerId?: string; busy: string | null; run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void> }) {
  const { colors, spacing } = useTheme();
  const owner = pod.myRole === 'owner';
  const mod = owner || pod.myRole === 'moderator';
  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');

  function manage(m: PodMember) {
    const options: Array<{ text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }> = [];
    if (owner && m.role === 'member') options.push({ text: 'Make moderator', onPress: () => void run(`m-${m.userId}`, async () => setPodMemberRole(pod.id, m.userId, 'moderator'), `${m.fullName} is now a moderator.`) });
    if (owner && m.role === 'moderator') options.push({ text: 'Make regular member', onPress: () => void run(`m-${m.userId}`, async () => setPodMemberRole(pod.id, m.userId, 'member')) });
    if (owner)
      options.push({
        text: 'Hand over ownership',
        onPress: () =>
          Alert.alert('Hand over ownership?', `${m.fullName} will run this pod and you become a moderator.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Hand over', onPress: () => void run(`m-${m.userId}`, async () => setPodMemberRole(pod.id, m.userId, 'owner'), 'Ownership handed over.') },
          ]),
      });
    if (m.role !== 'owner' && (owner || m.role === 'member')) {
      options.push({ text: 'Remove from pod', style: 'destructive', onPress: () => void run(`m-${m.userId}`, async () => removePodMember(pod.id, m.userId, false), `${m.fullName} was removed.`) });
      options.push({ text: 'Remove and block', style: 'destructive', onPress: () => void run(`m-${m.userId}`, async () => removePodMember(pod.id, m.userId, true), `${m.fullName} was removed and cannot rejoin.`) });
    }
    options.push({ text: 'Close', style: 'cancel' });
    Alert.alert(m.fullName, undefined, options);
  }

  return (
    <View style={{ gap: spacing.md }}>
      {mod && pending.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText weight="bold">Requests to join ({pending.length})</AppText>
          {pending.map((m) => (
            <SolidCard key={m.userId} radius={16} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Avatar name={m.fullName} uri={m.avatarUrl} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {m.fullName}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {m.department || 'Student'} · asked {formatWhen(m.joinedAt)}
                  </AppText>
                </View>
              </View>
              {m.requestedMessage ? <AppText variant="bodySmall">"{m.requestedMessage}"</AppText> : null}
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Approve" size="sm" fullWidth loading={busy === `a-${m.userId}`} onPress={() => run(`a-${m.userId}`, async () => respondToJoinRequest(pod.id, m.userId, true), `${m.fullName} joined the pod.`)} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton label="Decline" size="sm" variant="secondary" fullWidth onPress={() => run(`a-${m.userId}`, async () => respondToJoinRequest(pod.id, m.userId, false))} />
                </View>
              </View>
            </SolidCard>
          ))}
        </View>
      ) : null}

      <AppText weight="bold">Members ({active.length})</AppText>
      {active.map((m) => (
        <SolidCard key={m.userId} radius={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={m.fullName} uri={m.avatarUrl} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {m.userId === viewerId ? 'You' : m.fullName}
              </AppText>
              {m.role !== 'member' ? <Badge label={m.role === 'owner' ? 'Owner' : 'Moderator'} tone="brand" /> : null}
            </View>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {m.department || 'Student'} · joined {formatWhen(m.joinedAt).split(',')[0]}
            </AppText>
          </View>
          {mod && m.userId !== viewerId && m.role !== 'owner' && (owner || m.role === 'member') ? (
            <Pressable onPress={() => manage(m)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Manage ${m.fullName}`} disabled={busy === `m-${m.userId}`}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </SolidCard>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* About                                                                                             */
/* ------------------------------------------------------------------------------------------------ */
function AboutPanel({ pod, onEdit, busy, run, onLeft }: { pod: StudyGroup; onEdit: () => void; busy: string | null; run: (key: string, fn: () => Promise<void>, ok?: string) => Promise<void>; onLeft: () => void }) {
  const { spacing } = useTheme();
  const owner = pod.myRole === 'owner';
  const fact = (label: string, value?: string | null) =>
    value ? (
      <View key={label} style={{ gap: 2 }}>
        <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </AppText>
        <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
          {value}
        </AppText>
      </View>
    ) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <SolidCard radius={18} style={{ gap: spacing.sm }}>
        {fact('About this pod', pod.description)}
        {fact('Goal', pod.goal)}
        {fact('Meets', pod.scheduleNote)}
        {fact('Course', [pod.courseCode, pod.level, pod.department].filter(Boolean).join(' · '))}
        {fact('Topics', pod.topics.map((t) => `#${t}`).join('  '))}
        {fact('Run by', pod.creatorName)}
        {fact('Visibility', pod.isPublic ? 'Public - anyone on the campus can join' : 'Private - members approved by the owner')}
        {fact('Created', pod.createdAt ? formatWhen(pod.createdAt) : null)}
      </SolidCard>
      {owner ? <AppButton label="Edit pod details" icon="create-outline" variant="secondary" onPress={onEdit} /> : null}
      <AppButton
        label="Leave pod"
        variant="ghost"
        loading={busy === 'leave'}
        onPress={() =>
          Alert.alert(
            'Leave this pod?',
            owner ? 'You run this pod. Ownership passes to another member; if you are the last member, the pod is closed.' : 'You can rejoin later if it is public.',
            [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => void run('leave', async () => { await leaveStudyGroup(pod.id); onLeft(); }, 'You left the pod.') },
            ],
          )
        }
      />
    </View>
  );
}
