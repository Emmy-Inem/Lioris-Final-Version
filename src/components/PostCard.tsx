import React, { useState } from'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import { router, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { Badge } from'./Badge';
import { UserTypeBadge } from'./UserTypeBadge';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { ActionSheetModal } from'./ActionSheetModal';
import { ImageViewerModal } from'./ImageViewerModal';
import { UserProfileModal } from'./UserProfileModal';
import { VisibilityBadge } from'./VisibilityBadge';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { Post } from'@/api/types';
import { togglePostLike, listPostComments, createPostComment, toggleCommentLike, voteOnPoll, deletePost, updatePost } from'@/api/posts';
import { submitReport } from'@/api/moderation';
import { haptics } from'@/utils/haptics';

const STOCK_IMAGES: Record<string, any> = {
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  event_academic_symposium: require('../../assets/images/event_academic_symposium.jpg'),
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PostCard({ post }: { post: Post }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const queryClient = useQueryClient();

  const [liked, setLiked] = useState(!!post.isLikedByMe);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [reposted, setReposted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Full screen image lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState<string | undefined>(undefined);

  // User Profile Inspector Modal
  const [inspectUser, setInspectUser] = useState<{ id: string; name: string; role: any; avatarUrl?: string | null } | null>(null);

  // Poll state
  const [poll, setPoll] = useState(post.poll);

  // Report state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const isGlobalPost = post.visibilityScope === 'global' || post.scopeVisibility === 'global';

  async function handleToggleLike() {
    haptics.light();
    const next = !liked;
    setLiked(next);
    setLikesCount((prev) => prev + (next ? 1 : -1));
    try {
      await togglePostLike(post.id, next);
    } catch {
      setLiked(!next);
      setLikesCount((prev) => prev + (next ? -1 : 1));
    }
  }

  async function handleVote(optionId: string) {
    if (!poll) return;
    haptics.medium();
    const hasVoted = poll.options.some((o) => o.isVotedByMe);
    if (hasVoted) return;

    const nextOptions = poll.options.map((opt) =>
      opt.id === optionId ? { ...opt, votes: opt.votes + 1, isVotedByMe: true } : opt,
    );
    const nextPoll = {
      ...poll,
      options: nextOptions,
      totalVotes: poll.totalVotes + 1,
    };
    setPoll(nextPoll);
    await voteOnPoll(post.id, optionId);
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  }

  function handleOpenDedicatedPost() {
    haptics.light();
    router.push(`/${roleGroup}/post/${post.id}` as any);
  }

  const postImageSource = post.imageUrl
    ? STOCK_IMAGES[post.imageUrl] ?? (post.imageUrl.startsWith('http') ? { uri: post.imageUrl } : null)
    : null;

  const isVideoPost = !!post.videoUrl || post.title.toLowerCase().includes('demo') || post.category === 'Tech Hub';

  return (
    <SolidCard frosted radius={20} style={{ marginBottom: spacing.md }}>
      {/* Header Row: Author Avatar (Tap to View Profile) & Menu */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
        <Pressable
          onPress={() => {
            haptics.light();
            setInspectUser({ id: post.authorId, name: post.authorName, role: post.authorRole, avatarUrl: post.authorAvatarUrl });
          }}
          style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flex: 1 }}
        >
          <Avatar name={post.authorName} uri={post.authorAvatarUrl} size={44} role={post.authorRole} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <AppText weight="bold"variant="bodySmall">
                {post.authorName}
              </AppText>
              <Ionicons name="checkmark-circle"size={14} color={colors.brandPrimary} />
              <UserTypeBadge role={post.authorRole} />
              <View style={{ backgroundColor: colors.pastelPrimaryBg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                <AppText variant="caption"weight="bold"tone="brand"style={{ fontSize: 9 }}>
                  {post.authorRole === 'student' ? '300L CS' : post.authorRole === 'alumni' ? "Alumni'21" : 'Staff Advisor'}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <AppText tone="secondary"variant="caption">
                {timeAgo(post.createdAt)}
              </AppText>
              <AppText tone="secondary"variant="caption">|</AppText>
              <AppText tone="brand"variant="caption"weight="semiBold">
                {post.category}
              </AppText>
            </View>
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <VisibilityBadge
            visibility={isGlobalPost ? 'global' : 'campus'}
            campusCode={post.institutionCode}
          />

          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityRole="button"accessibilityLabel="Post options"style={{ padding: 4 }}
          >
            <Ionicons name="ellipsis-horizontal"size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Thread Title & Content (Tap to Open Full Screen Post) */}
      <Pressable onPress={handleOpenDedicatedPost} style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
        <AppText variant="h3"weight="bold"style={{ marginBottom: 4 }}>
          {post.title}
        </AppText>
        <AppText tone="primary"variant="bodySmall"style={{ lineHeight: 20 }}>
          {post.content}
        </AppText>
      </Pressable>

      {/* Attached Media / Image / Video (Tap to Expand in Fullscreen Lightbox) */}
      {postImageSource ? (
        <Pressable
          onPress={() => {
            haptics.light();
            setLightboxMedia(post.imageUrl ?? null);
            setLightboxCaption(post.title);
            setLightboxOpen(true);
          }}
          style={{ width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', marginBottom: spacing.sm, position: 'relative' }}
        >
          <Image source={postImageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />

          {/* Video Play Overlay */}
          {isVideoPost ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }}>
                <Ionicons name="play"size={24} color="#FFFFFF"style={{ marginLeft: 3 }} />
              </View>
              <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="videocam"size={12} color="#FFFFFF" />
                <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>0:45 Demo</AppText>
              </View>
            </View>
          ) : null}

          <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="expand"size={12} color="#FFFFFF" />
            <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>Expand</AppText>
          </View>
        </Pressable>
      ) : null}

      {/* Interactive Poll Section */}
      {poll ? (
        <View
          style={{
            backgroundColor: colors.pastelPrimaryBg,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.sm,
            borderWidth: 1,
            borderColor: colors.brandPrimary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
            <Ionicons name="bar-chart-outline"size={16} color={colors.brandPrimary} />
            <AppText weight="bold"variant="bodySmall"tone="brand">
              {poll.question}
            </AppText>
          </View>

          {poll.options.map((opt) => {
            const hasVotedAny = poll.options.some((o) => o.isVotedByMe);
            const percentage = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
            return (
              <Pressable
                key={opt.id}
                onPress={() => handleVote(opt.id)}
                disabled={hasVotedAny}
                style={{
                  position: 'relative',
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  paddingVertical: 10,
                  paddingHorizontal: spacing.md,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: opt.isVotedByMe ? colors.brandPrimary : colors.border,
                  overflow: 'hidden',
                }}
              >
                {hasVotedAny ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${percentage}%`,
                      backgroundColor: opt.isVotedByMe ? `${colors.brandPrimary}25` : `${colors.border}40`,
                    }}
                  />
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 }}>
                    <Ionicons
                      name={opt.isVotedByMe ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={opt.isVotedByMe ? colors.brandPrimary : colors.textSecondary}
                    />
                    <AppText
                      weight={opt.isVotedByMe ? 'bold' : 'medium'}
                      variant="bodySmall"tone={opt.isVotedByMe ? 'brand' : 'primary'}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </AppText>
                  </View>
                  {hasVotedAny ? (
                    <AppText weight="bold"variant="caption"tone={opt.isVotedByMe ? 'brand' : 'secondary'}>
                      {percentage}% ({opt.votes})
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <AppText tone="secondary"variant="caption">
              {poll.totalVotes} votes | {poll.expiresIn ?? 'Active poll'}
            </AppText>
            {poll.options.some((o) => o.isVotedByMe) && (
              <AppText tone="brand"variant="caption"weight="bold">
                Vote recorded
              </AppText>
            )}
          </View>
        </View>
      ) : null}

      {/* Course Tags / Meta Badges */}
      {post.courseTags ? (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <AppText variant="caption"weight="bold"tone="brand">
              {post.courseTags}
            </AppText>
          </View>
          {post.sponsored ? <Badge label="Sponsored"tone="accent" /> : null}
        </View>
      ) : null}

      {/* Engagement Actions Bar (Twitter X / Threads Style) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.xs,
          paddingTop: spacing.xs,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        {/* Upvote / Like Pill */}
        <Pressable
          onPress={handleToggleLike}
          accessibilityRole="button"accessibilityLabel={liked ? 'Remove like' : 'Like thread'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: liked ? colors.pastelPrimaryBg : 'transparent',
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53E3E' : colors.textSecondary} />
          <AppText variant="bodySmall"weight={liked ? 'bold' : 'medium'} style={{ color: liked ? '#E53E3E' : colors.textSecondary }}>
            {likesCount}
          </AppText>
        </Pressable>

        {/* Reply / Comment Button (Opens Dedicated Full Screen Post Thread) */}
        <Pressable
          onPress={handleOpenDedicatedPost}
          accessibilityRole="button"accessibilityLabel="Open full screen thread"style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="chatbubble-outline"size={17} color={colors.textSecondary} />
          <AppText variant="bodySmall"tone="secondary"weight="medium">
            {post.commentsCount ?? 6}
          </AppText>
        </Pressable>

        {/* Repost / Share to Cohort */}
        <Pressable
          onPress={() => {
            haptics.light();
            setReposted((r) => !r);
            Alert.alert(reposted ? 'Removed from Reposts' : 'Reposted', 'Thread amplified to your campus followers.');
          }}
          accessibilityRole="button"accessibilityLabel="Repost to cohort"style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
        >
          <Ionicons name="repeat"size={18} color={reposted ? colors.brandPrimary : colors.textSecondary} />
          <AppText variant="bodySmall"tone={reposted ? 'brand' : 'secondary'} weight={reposted ? 'bold' : 'regular'}>
            {reposted ? 'Reposted' : 'Repost'}
          </AppText>
        </Pressable>

        {/* Bookmark Pill */}
        <Pressable
          onPress={() => {
            haptics.light();
            setBookmarked((b) => !b);
            Alert.alert(bookmarked ? 'Bookmark Removed' : 'Saved', 'Saved to your profile bookmarks.');
          }}
          accessibilityRole="button"accessibilityLabel="Bookmark thread"style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
        >
          <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={17} color={bookmarked ? colors.brandPrimary : colors.textSecondary} />
          <AppText variant="bodySmall"tone={bookmarked ? 'brand' : 'secondary'} weight={bookmarked ? 'bold' : 'regular'}>
            {bookmarked ? 'Saved' : 'Save'}
          </AppText>
        </Pressable>
      </View>

      {/* Action Sheet Menu Modal */}
      <ActionSheetModal visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            Alert.alert('Link Copied', 'Thread URL copied to clipboard.');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="share-social-outline"size={18} color={colors.textPrimary} />
          <AppText weight="medium">Share Thread Link</AppText>
        </Pressable>

        {/* Direct Admin Moderation Controls */}
        {(user?.role === 'admin' || user?.role === 'staff') && (
          <>
            <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
            <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.5, marginVertical: 2 }}>
              MODERATOR CONTROLS
            </AppText>

            <Pressable
              onPress={async () => {
                setMenuOpen(false);
                await updatePost(post.id, { sponsored: !post.sponsored });
                await queryClient.invalidateQueries({ queryKey: ['feed'] });
                Alert.alert('Moderation Action', post.sponsored ? 'Thread unpinned.' : 'Thread pinned as official campus announcement.');
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Ionicons name="pin-outline"size={18} color={colors.brandPrimary} />
              <AppText weight="medium"tone="brand">{post.sponsored ? 'Unpin Announcement' : 'Pin as Campus Announcement'}</AppText>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuOpen(false);
                Alert.alert(
                  'Takedown Post',
                  'Are you sure you want to remove this thread from the community feed? This action is logged.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Takedown & Delete',
                      style: 'destructive',
                      onPress: async () => {
                        await deletePost(post.id);
                        await queryClient.invalidateQueries({ queryKey: ['feed'] });
                        Alert.alert('Post Removed', 'The thread was removed by moderator action.');
                      },
                    },
                  ]
                );
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Ionicons name="trash-outline"size={18} color={colors.critical} />
              <AppText style={{ color: colors.critical }} weight="bold">Takedown & Delete Thread</AppText>
            </Pressable>
            <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
          </>
        )}

        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setReportOpen(true);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="flag-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }} weight="medium">Report Thread to Moderation</AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            setMenuOpen(false);
            Alert.alert(
              `Block ${post.authorName}?`,
              `You will no longer see posts, comments, or events from ${post.authorName}. This decision is saved for your session.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block User',
                  style: 'destructive',
                  onPress: async () => {
                    const { blockUser } = await import('@/api/connections');
                    await blockUser(post.authorId, post.authorName);
                    await queryClient.invalidateQueries({ queryKey: ['feed'] });
                    haptics.medium();
                    Alert.alert('User Blocked', `Content from ${post.authorName} has been hidden from your feed.`);
                  },
                },
              ]
            );
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="ban-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }} weight="medium">Block {post.authorName}</AppText>
        </Pressable>
      </ActionSheetModal>

      {/* Report Modal */}
      <Modal visible={reportOpen} transparent animationType="fade"onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <Ionicons name="shield-outline"size={20} color={colors.critical} />
              <AppText variant="h3"weight="bold"style={{ color: colors.critical }}>
                Report Policy Violation
              </AppText>
            </View>
            <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
              Describe how this post violates the Campus Honor Code or Academic Integrity policies.
            </AppText>
            <AppTextField
              label="Reason for Flag"placeholder="e.g. Harassment, unauthorized exam paper..."value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel"variant="ghost"onPress={() => setReportOpen(false)} />
              <AppButton
                label="Submit Report"variant="accent"onPress={async () => {
                  if (!reportReason.trim()) return;
                  await submitReport({
                    targetType: 'post',
                    targetId: post.id,
                    institutionCode: post.institutionCode || (post as any).campusCode || undefined,
                    reason: reportReason.trim(),
                  });
                  setReportOpen(false);
                  setReportReason('');
                  Alert.alert('Report Dispatched', 'Campus moderators have been notified.');
                }}
              />
            </View>
          </SolidCard>
        </View>
      </Modal>

      {/* User Profile Modal Inspector */}
      {inspectUser ? (
        <UserProfileModal
          visible={!!inspectUser}
          onClose={() => setInspectUser(null)}
          userId={inspectUser.id}
          userName={inspectUser.name}
          userRole={inspectUser.role}
          userAvatarUrl={inspectUser.avatarUrl}
        />
      ) : null}

      {/* Full-Screen Image / Media Lightbox Modal */}
      <ImageViewerModal
        visible={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        imageSource={lightboxMedia}
        caption={lightboxCaption}
      />
    </SolidCard>
  );
}
