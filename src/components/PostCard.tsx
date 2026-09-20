import React, { useState } from'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from'expo-image';
import { router, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { Badge } from'./Badge';
import { UserTypeBadge } from'./UserTypeBadge';
import { VerifiedBadge } from './VerifiedBadge';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { ActionSheetModal } from'./ActionSheetModal';
import { ImageViewerModal } from'./ImageViewerModal';
import { UserProfileModal } from'./UserProfileModal';
import { VisibilityBadge } from'./VisibilityBadge';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { Post } from'@/api/types';
import { togglePostLike, togglePostRepost, listPostComments, createPostComment, toggleCommentLike, voteOnPoll, deletePost, updatePost } from'@/api/posts';
import { toggleSavedItem, SAVED_ITEMS_KEY } from'@/api/bookmarks';
import { submitReport } from'@/api/moderation';
import { haptics } from'@/utils/haptics';
import { getFriendlyErrorMessage } from '@/utils/errors';

/** Every cache that can show a post: the feed, the profile's "Authored" list and the saved list. */
async function invalidatePostCaches(queryClient: ReturnType<typeof useQueryClient>, postId?: string) {
 await Promise.all([
 queryClient.invalidateQueries({ queryKey: ['feed'] }),
 queryClient.invalidateQueries({ queryKey: ['my-posts'] }),
 queryClient.invalidateQueries({ queryKey: ['my-drafts'] }),
 queryClient.invalidateQueries({ queryKey: ['my-scheduled'] }),
 queryClient.invalidateQueries({ queryKey: ['profile'] }),
 postId ? queryClient.invalidateQueries({ queryKey: ['post', postId] }) : Promise.resolve(),
 ]);
}

/** "Closes in 3h" / "Poll closed" for a poll's closesAt timestamp. */
function pollClosingLabel(closesAt?: string, isClosed?: boolean) {
 if (!closesAt) return isClosed ? 'Poll closed' : 'Active poll';
 const ms = new Date(closesAt).getTime() - Date.now();
 if (Number.isNaN(ms)) return isClosed ? 'Poll closed' : 'Active poll';
 if (ms <= 0) return 'Poll closed';
 const minutes = Math.floor(ms / 60000);
 if (minutes < 60) return `Closes in ${Math.max(1, minutes)}m`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `Closes in ${hours}h`;
 return `Closes in ${Math.floor(hours / 24)}d`;
}

function isPollClosed(poll?: { closesAt?: string; isClosed?: boolean } | null) {
 if (!poll) return false;
 if (poll.isClosed) return true;
 if (!poll.closesAt) return false;
 const t = new Date(poll.closesAt).getTime();
 return !Number.isNaN(t) && t <= Date.now();
}

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
 const insets = useSafeAreaInsets();
 const { user } = useAuth();
 const segments = useSegments();
 const roleGroup = segments[0] ?? '(student)';
 const queryClient = useQueryClient();

 const [liked, setLiked] = useState(!!post.isLikedByMe);
 const [likesCount, setLikesCount] = useState(post.likesCount);
 const [reposted, setReposted] = useState(!!post.isRepostedByMe);
 const [repostsCount, setRepostsCount] = useState(post.repostsCount);
 const [bookmarked, setBookmarked] = useState(!!post.isBookmarkedByMe);
 const [savingBookmark, setSavingBookmark] = useState(false);
 const [menuOpen, setMenuOpen] = useState(false);
 const [deleting, setDeleting] = useState(false);

 React.useEffect(() => {
 setReposted(!!post.isRepostedByMe);
 setBookmarked(!!post.isBookmarkedByMe);
 setRepostsCount(post.repostsCount);
 }, [post.isRepostedByMe, post.isBookmarkedByMe, post.repostsCount]);

 // Full screen image lightbox
 const [lightboxOpen, setLightboxOpen] = useState(false);
 const [lightboxMedia, setLightboxMedia] = useState<string | null>(null);
 const [lightboxCaption, setLightboxCaption] = useState<string | undefined>(undefined);

 // User Profile Inspector Modal
 const [inspectUser, setInspectUser] = useState<{ id: string; name: string; role: any; avatarUrl?: string | null; isVerified?: boolean } | null>(null);

 // Poll state
 const [poll, setPoll] = useState(post.poll);
 const pollClosed = isPollClosed(poll);

 // Report state
 const [reportOpen, setReportOpen] = useState(false);
 const [reportReason, setReportReason] = useState('');

 const isGlobalPost = post.visibilityScope === 'global' || post.scopeVisibility === 'global';
 const isAuthor = Boolean(
   user?.id &&
     (post.authorId === user.id ||
       post.authorId === 'student-me' ||
       post.authorId === 'me' ||
       (user.fullName && post.authorName.toLowerCase() === user.fullName.toLowerCase()) ||
       post.authorName === 'You'),
 );

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

 /**
  * Voting again on another option moves the vote; voting on your current option clears it.
  * The optimistic update mirrors that, and any refusal from the server (closed poll, etc.)
  * rolls back and shows the message voteOnPoll threw.
  */
 async function handleVote(optionId: string) {
 if (!poll || pollClosed) return;
 haptics.medium();

 const previous = poll;
 const current = poll.options.find((o) => o.isVotedByMe);
 const clearing = current?.id === optionId;

 const nextOptions = poll.options.map((opt) => {
 const wasMine = !!opt.isVotedByMe;
 const willBeMine = !clearing && opt.id === optionId;
 const delta = (willBeMine ? 1 : 0) - (wasMine ? 1 : 0);
 return { ...opt, votes: Math.max(0, opt.votes + delta), isVotedByMe: willBeMine };
 });
 const totalDelta = (clearing ? -1 : current ? 0 : 1);
 setPoll({ ...poll, options: nextOptions, totalVotes: Math.max(0, poll.totalVotes + totalDelta) });

 try {
 const serverPoll = await voteOnPoll(post.id, optionId);
 if (serverPoll && typeof serverPoll === 'object' && 'options' in serverPoll) {
 setPoll(serverPoll as typeof poll);
 }
 queryClient.invalidateQueries({ queryKey: ['feed'] });
 queryClient.invalidateQueries({ queryKey: ['post', post.id] });
 } catch (err: any) {
 setPoll(previous);
 haptics.error();
 Alert.alert('Vote not counted', getFriendlyErrorMessage(err, 'Could not record your vote. Please try again.'));
 }
 }

 /** Saves/unsaves this post into the one shared saved_items store. */
 async function handleToggleBookmark() {
 if (savingBookmark) return;
 haptics.light();
 const next = !bookmarked;
 setBookmarked(next);
 setSavingBookmark(true);
 try {
 await toggleSavedItem('post', post.id, next, {
 title: post.title,
 subtitle: `${post.authorName} • c/${post.category ? post.category.toLowerCase().replace(/\s+/g, '') : 'campus'}`,
 });
 await queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY() });
 await queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY('post') });
 } catch (err: any) {
 setBookmarked(!next);
 haptics.error();
 Alert.alert(next ? 'Could not save' : 'Could not remove', getFriendlyErrorMessage(err, 'Please try again.'));
 } finally {
 setSavingBookmark(false);
 }
 }

 async function handleToggleRepost() {
 haptics.light();
 const next = !reposted;
 setReposted(next);
 setRepostsCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
 try {
 const result = await togglePostRepost(post.id, next);
 if (result && typeof result === 'object') {
 setReposted(result.reposted);
 setRepostsCount(result.count);
 }
 queryClient.invalidateQueries({ queryKey: ['feed'] });
 queryClient.invalidateQueries({ queryKey: ['my-posts'] });
 } catch (err: any) {
 setReposted(!next);
 setRepostsCount((prev) => Math.max(0, prev + (next ? -1 : 1)));
 Alert.alert('Repost failed', getFriendlyErrorMessage(err, 'Could not repost at this time. Please try again.'));
 }
 }

 /**
  * deletePost throws when the database refused the delete, so nothing is removed
  * optimistically - the row only disappears once the server confirmed it.
  */
 async function handleDelete(moderation: boolean) {
 if (deleting) return;
 setDeleting(true);
 try {
 await deletePost(post.id);
 await invalidatePostCaches(queryClient, post.id);
 haptics.medium();
 Alert.alert(
 moderation ? 'Post Removed' : 'Post Deleted',
 moderation ? 'The thread was removed by moderator action.' : 'Your thread has been removed from the feed and your profile.',
 );
 } catch (err: any) {
 haptics.error();
 Alert.alert('Delete failed', getFriendlyErrorMessage(err, 'The post could not be deleted. Please try again.'));
 } finally {
 setDeleting(false);
 }
 }

 function confirmDelete(moderation: boolean) {
 Alert.alert(
 moderation ? 'Takedown Post' : 'Delete Your Post',
 moderation
 ? 'Are you sure you want to remove this thread from the community feed? This action is logged.'
 : 'Are you sure you want to delete this thread? This cannot be undone.',
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: moderation ? 'Takedown & Delete' : 'Delete Post',
 style: 'destructive',
 onPress: () => { handleDelete(moderation); },
 },
 ],
 );
 }

 function handleOpenDedicatedPost() {
 haptics.light();
 router.push(`/${roleGroup}/post/${post.id}` as any);
 }

 const postImageSource = post.imageUrl
 ? STOCK_IMAGES[post.imageUrl] ?? (post.imageUrl.startsWith('http') ? { uri: post.imageUrl } : null)
 : null;

 const isVideoPost = !!post.videoUrl;

 return (
 <SolidCard frosted radius={20} style={{ marginBottom: spacing.md }}>
 {/* Header Row: Author Avatar (Tap to View Profile) & Menu */}
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <Pressable
 onPress={() => {
 haptics.light();
 setInspectUser({ id: post.authorId, name: post.authorName, role: post.authorRole, avatarUrl: post.authorAvatarUrl, isVerified: post.authorVerified });
 }}
 style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flex: 1, minWidth: 0 }}
 >
 <Avatar name={post.authorName} uri={post.authorAvatarUrl} size={44} role={post.authorRole} />
 <View style={{ flex: 1, minWidth: 0 }}>
    {/* Row 1: Name · Verified badge · Role */}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <AppText weight="bold" variant="bodySmall" style={{ flexShrink: 1 }}>
        {post.authorName}
      </AppText>
      {post.authorVerified || post.authorRole === 'admin' ? (
        <VerifiedBadge size={14} role={post.authorRole} name={post.authorName} />
      ) : null}
      <AppText tone="secondary" variant="caption" style={{ fontSize: 11, flexShrink: 0 }}>
        •{' '}
        {post.authorRole === 'student'
          ? 'Student'
          : post.authorRole === 'alumni'
          ? 'Alumni'
          : post.authorRole === 'admin'
          ? 'Admin'
          : 'Staff'}
      </AppText>
    </View>
    {/* Row 2: Channel · Pinned · Time — all inline on one line */}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1, flexWrap: 'wrap' }}>
      <AppText tone="brand" variant="caption" weight="bold" style={{ fontSize: 10.5, flexShrink: 0 }}>
        c/{post.category ? post.category.toLowerCase().replace(/\s+/g, '') : 'campus'}
      </AppText>
      {post.isPinned ? (
        <>
          <Ionicons name="pin" size={10} color={colors.textSecondary} />
          <AppText tone="secondary" variant="caption" weight="bold" style={{ fontSize: 10.5, flexShrink: 0 }}>
            Pinned
          </AppText>
        </>
      ) : null}
      <AppText tone="secondary" variant="caption" style={{ fontSize: 11, flexShrink: 0 }}>
        • {timeAgo(post.createdAt)}
      </AppText>
    </View>
  </View>
 </Pressable>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
 <VisibilityBadge
 visibility={isGlobalPost ? 'global' : 'campus'}
 campusCode={post.institutionCode}
 subtle
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
 <AppText weight="bold" style={{ fontSize: 15, lineHeight: 20, marginBottom: 4, flexShrink: 1 }}>
 {post.title}
 </AppText>
 {/* The body is the ONE clamped field left: this is a dense feed row and tapping
     the card opens the full thread, where the text is shown in full. */}
 <AppText tone="primary" variant="bodySmall" numberOfLines={4} style={{ lineHeight: 20, fontSize: 13, flexShrink: 1 }}>
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
 <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>Video</AppText>
 </View>
 </View>
 ) : null}
 </Pressable>
 ) : null}

 {/* Interactive Poll Section */}
 {poll ? (
 <View
 style={{
 backgroundColor: colors.divider,
 borderRadius: radius.md,
 padding: spacing.md,
 marginBottom: spacing.sm,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: spacing.sm }}>
 <Ionicons name="bar-chart-outline"size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
 <AppText weight="bold"variant="bodySmall"style={{ flex: 1, flexShrink: 1 }}>
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
 disabled={pollClosed}
 accessibilityRole="button"
 accessibilityState={{ selected: !!opt.isVotedByMe, disabled: pollClosed }}
 accessibilityLabel={opt.isVotedByMe ? `${opt.label}, your vote. Tap to remove it.` : `Vote for ${opt.label}`}
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
 {hasVotedAny || pollClosed ? (
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
 style={{ flex: 1, flexShrink: 1 }}
 >
 {opt.label}
 </AppText>
 </View>
 {hasVotedAny || pollClosed ? (
 <AppText weight="bold"variant="caption"tone={opt.isVotedByMe ? 'brand' : 'secondary'}>
 {percentage}% ({opt.votes})
 </AppText>
 ) : null}
 </View>
 </Pressable>
 );
 })}

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
 <AppText tone="secondary"variant="caption"style={{ flexShrink: 1 }}>
 {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'} • {pollClosingLabel(poll.closesAt, poll.isClosed)}
 </AppText>
 {poll.options.some((o) => o.isVotedByMe) ? (
 <AppText tone="brand"variant="caption"weight="bold"style={{ flexShrink: 1 }}>
 {pollClosed ? 'You voted' : 'Voted - tap another option to change, or tap yours to undo'}
 </AppText>
 ) : pollClosed ? (
 <AppText tone="secondary"variant="caption"weight="bold"style={{ flexShrink: 1 }}>
 Voting has ended
 </AppText>
 ) : null}
 </View>
 </View>
 ) : null}

 {/* Course Tags / Meta Badges */}
 {post.courseTags ? (
 <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
 <View style={{ backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
 <AppText variant="caption"weight="bold"tone="secondary">
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
 {/* Upvote / Like Action */}
 <Pressable
 onPress={handleToggleLike}
 accessibilityRole="button"accessibilityLabel={liked ? 'Remove like' : 'Like thread'}
 accessibilityState={{ selected: liked }}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
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
 {post.commentsCount ?? 0}
 </AppText>
 </Pressable>

 {/* Repost / Share to Cohort */}
 <Pressable
 onPress={handleToggleRepost}
 accessibilityRole="button"accessibilityLabel={reposted ? 'Undo repost' : 'Repost to cohort'}
 accessibilityState={{ selected: reposted }}style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
 >
 <Ionicons name="repeat"size={18} color={reposted ? colors.brandPrimary : colors.textSecondary} />
 <AppText variant="bodySmall"tone={reposted ? 'brand' : 'secondary'} weight={reposted ? 'bold' : 'regular'}>
 {reposted ? 'Reposted' : repostsCount > 0 ? `${repostsCount}` : 'Repost'}
 </AppText>
 </Pressable>

 {/* Bookmark Pill */}
 <Pressable
 onPress={handleToggleBookmark}
 disabled={savingBookmark}
 accessibilityRole="button"accessibilityLabel={bookmarked ? 'Remove from saved items' : 'Save this post'}
 accessibilityState={{ selected: bookmarked }}style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
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

 {/* Author Delete Thread Control */}
 {isAuthor && !(user?.role === 'admin' || user?.role === 'staff') && (
 <>
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
 <Pressable
 onPress={() => {
 setMenuOpen(false);
 confirmDelete(false);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 }}
 >
 <Ionicons name="trash-outline" size={18} color={colors.critical} />
 <AppText style={{ color: colors.critical, flexShrink: 1 }} weight="bold">Delete My Post</AppText>
 </Pressable>
 </>
 )}

 {/* Direct Admin Moderation Controls */}
 {(user?.role === 'admin' || user?.role === 'staff') && (
 <>
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
 <AppText variant="caption"weight="bold"tone="secondary"style={{ letterSpacing: 0.5, marginVertical: 2 }}>
 MODERATOR CONTROLS
 </AppText>

 <Pressable
 onPress={async () => {
 setMenuOpen(false);
 await updatePost(post.id, { isPinned: !post.isPinned });
 await invalidatePostCaches(queryClient, post.id);
 Alert.alert('Moderation Action', post.isPinned ? 'Thread unpinned.' : 'Thread pinned as an official announcement.');
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
 >
 <Ionicons name="pin-outline"size={18} color={colors.textPrimary} />
 <AppText weight="medium">{post.isPinned ? 'Unpin Announcement' : 'Pin as Announcement'}</AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 setMenuOpen(false);
 confirmDelete(true);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 }}
 >
 <Ionicons name="trash-outline"size={18} color={colors.critical} />
 <AppText style={{ color: colors.critical, flexShrink: 1 }} weight="bold">Takedown & Delete Thread</AppText>
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
      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReportOpen(false)} />
          <SolidCard style={{ width: '100%', maxWidth: 420 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="shield-outline" size={20} color={colors.critical} />
                <AppText variant="h3" weight="bold" style={{ color: colors.critical }}>
                  Report Policy Violation
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setReportOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              Describe how this post violates the Campus Honor Code or Academic Integrity policies.
            </AppText>
            <AppTextField
              label="Reason for Flag"
              placeholder="e.g. Harassment, unauthorized exam paper..."
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setReportOpen(false)} />
              <AppButton
                label="Submit Report"
                variant="accent"
                onPress={async () => {
                  if (!reportReason.trim()) return;
                  try {
                    await submitReport({
                      targetType: 'post',
                      targetId: post.id,
                      institutionCode: post.institutionCode || (post as any).campusCode || undefined,
                      reason: reportReason.trim(),
                    });
                    setReportOpen(false);
                    setReportReason('');
                    Alert.alert('Report Dispatched', 'Campus moderators have been notified.');
                  } catch (err: any) {
                    Alert.alert('Report Failed', getFriendlyErrorMessage(err, 'Could not submit your report. Please try again.'));
                  }
                }}
              />
            </View>
          </SolidCard>
        </KeyboardAvoidingView>
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
 isVerified={inspectUser.isVerified}
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
