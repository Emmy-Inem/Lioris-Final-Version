import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, findNodeHandle, Modal, Platform, Pressable, ScrollView, TextInput, UIManager, View } from 'react-native';
import { Image } from'expo-image';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { Badge } from'./Badge';
import { UserTypeBadge } from'./UserTypeBadge';
import { VerifiedBadge } from './VerifiedBadge';
import { SolidCard } from'./SolidCard';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { ImageViewerModal } from'./ImageViewerModal';
import { UserProfileModal } from'./UserProfileModal';
import { ActionSheetModal } from'./ActionSheetModal';
import { EditPostModal } from'./EditPostModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getPost, listFeedPosts, listPostComments, createPostComment, togglePostLike, toggleCommentLike, voteOnPoll, deletePost, updatePost, updatePostComment, deletePostComment, extractMentionHandles, resolvePostMentions, buildPostShareUrl, PostComment } from '@/api/posts';
import { toggleSavedItem, SAVED_ITEMS_KEY } from '@/api/bookmarks';
import { canManageCommunityCategory } from '@/api/communities';
import { getMyProfile } from '@/api/profile';
import { submitReport } from '@/api/moderation';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { VerificationRequiredGate } from './VerificationRequiredGate';
import { haptics } from '@/utils/haptics';
import { getFriendlyErrorMessage } from '@/utils/errors';

const STOCK_IMAGES: Record<string, any> = {
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  event_academic_symposium: require('../../assets/images/event_academic_symposium.jpg'),
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

const COMMENT_MEDIA_PRESETS = [
  { id: 'campus_library_study', label: 'Study Notes', src: require('../../assets/images/campus_library_study.jpg') },
  { id: 'event_tech_hackathon', label: 'Code Demo', src: require('../../assets/images/event_tech_hackathon.jpg') },
];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Splits body text on @mention/#hashtag tokens so they can be rendered as
// nested, individually-tappable AppText runs inside the parent Text.
const CONTENT_TOKEN_SPLIT = /(@[a-zA-Z0-9_.]{2,40}|#[a-zA-Z0-9_]{2,40})/g;
const MENTION_TOKEN = /^@[a-zA-Z0-9_.]{2,40}$/;
const HASHTAG_TOKEN = /^#[a-zA-Z0-9_]{2,40}$/;

export function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';
  const { colors, spacing, radius, isDark } = useTheme();
  const handleGoBack = () => {
    if (router.canGoBack()) {
      handleGoBack();
    } else {
      router.replace(`/${roleGroup}/feed` as any);
    }
  };
  const { isDesktop, contentMaxWidth } = useResponsive();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => (id ? getPost(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const isRestrictedGuest = isUnverifiedPersonalUser(profile);

  const [liked, setLiked] = useState(!!post?.isLikedByMe);
  const [likesCount, setLikesCount] = useState(post?.likesCount ?? 0);
  const [bookmarked, setBookmarked] = useState(!!post?.isBookmarkedByMe);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthor = Boolean(
    user?.id &&
      post &&
      (post.authorId === user.id ||
        post.authorId === 'student-me' ||
        post.authorId === 'me' ||
        (user.fullName && post.authorName.toLowerCase() === user.fullName.toLowerCase()) ||
        post.authorName === 'You'),
  );
  const isPlatformModerator = user?.role === 'admin' || user?.role === 'staff';
  const { data: canModerateCommunity } = useQuery({
    queryKey: ['can-manage-community', post?.category],
    queryFn: () => canManageCommunityCategory(post!.category!),
    enabled: !!post?.category && !isPlatformModerator,
  });
  const canModerate = isPlatformModerator || !!canModerateCommunity;
  const [editOpen, setEditOpen] = useState(false);

  // @mentions found in this post's content, resolved to a profile when one exists
  // (profiles.username - see resolvePostMentions for why) so they can render as
  // tappable brand-colored text instead of plain "@handle".
  const mentionHandles = React.useMemo(() => extractMentionHandles(post?.content ?? ''), [post?.content]);
  const { data: resolvedMentions } = useQuery({
    queryKey: ['post-mentions', mentionHandles, post?.institutionCode],
    queryFn: () => resolvePostMentions(mentionHandles, post?.institutionCode),
    enabled: mentionHandles.length > 0,
    staleTime: 5 * 60_000,
  });
  const mentionByHandle = React.useMemo(() => {
    const map = new Map<string, { id: string; fullName: string }>();
    for (const u of resolvedMentions ?? []) map.set(u.username.toLowerCase(), u);
    return map;
  }, [resolvedMentions]);

  function renderContent(content: string) {
    return content.split(CONTENT_TOKEN_SPLIT).map((part, i) => {
      if (MENTION_TOKEN.test(part)) {
        const match = mentionByHandle.get(part.slice(1).toLowerCase());
        if (!match) return part;
        return (
          <AppText
            key={i}
            weight="bold"
            tone="brand"
            accessibilityLabel={`View ${match.fullName}'s profile`}
            onPress={() => {
              haptics.light();
              setInspectUser({ id: match.id, name: match.fullName, role: 'student' });
            }}
          >
            {part}
          </AppText>
        );
      }
      if (HASHTAG_TOKEN.test(part)) {
        return (
          <AppText
            key={i}
            weight="bold"
            tone="brand"
            accessibilityLabel={`Search posts tagged ${part}`}
            onPress={() => {
              haptics.light();
              router.push({ pathname: `/${roleGroup}/search` as any, params: { q: part.slice(1) } });
            }}
          >
            {part}
          </AppText>
        );
      }
      return part;
    });
  }

 // Discussion reply state. replyingToComment carries the real parent_comment_id
 // link (see createPostComment below) - the composer's "Replying to" chip and
 // placeholder just read its authorName/snippet, there is no more @name
 // text-prefix hack.
 const [newReply, setNewReply] = useState('');
 const [attachedReplyMedia, setAttachedReplyMedia] = useState<string | null>(null);
 const [submittingReply, setSubmittingReply] = useState(false);
 const [replyingToComment, setReplyingToComment] = useState<{ id: string; authorName: string } | null>(null);

 // Full screen image lightbox
 const [lightboxOpen, setLightboxOpen] = useState(false);
 const [lightboxMedia, setLightboxMedia] = useState<string | null>(null);
 const [lightboxCaption, setLightboxCaption] = useState<string | undefined>(undefined);

 // User Profile Inspector Modal
 const [inspectUser, setInspectUser] = useState<{ id: string; name: string; role: any; avatarUrl?: string | null; isVerified?: boolean } | null>(null);

 // Comment likes local state
 const [commentLikes, setCommentLikes] = useState<Record<string, number>>({});
 const [commentLikedByMe, setCommentLikedByMe] = useState<Record<string, boolean>>({});

 // Comment edit state (own-comment menu, same visibility rule as delete)
 const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
 const [editingCommentText, setEditingCommentText] = useState('');
 const [savingCommentEdit, setSavingCommentEdit] = useState(false);

 // Scroll-to-parent for a reply's "Replying to" chip: each comment row
 // registers its own View ref, measured against the scroll view on demand.
 const scrollViewRef = useRef<ScrollView>(null);
 const commentRefs = useRef<Record<string, View | null>>({});
 const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

 function scrollToComment(commentId: string) {
   const target = commentRefs.current[commentId];
   const scroller = scrollViewRef.current;
   if (!target || !scroller) return;
   const targetHandle = findNodeHandle(target);
   const scrollerHandle = findNodeHandle(scroller);
   if (!targetHandle || !scrollerHandle) return;
   UIManager.measureLayout(
     targetHandle,
     scrollerHandle,
     () => {},
     (_x: number, y: number) => {
       scroller.scrollTo({ y: Math.max(0, y - 80), animated: true });
     },
   );
 }

 function handleJumpToComment(commentId: string) {
   haptics.light();
   scrollToComment(commentId);
   setHighlightedCommentId(commentId);
   setTimeout(() => setHighlightedCommentId((cur) => (cur === commentId ? null : cur)), 1600);
 }

 // Poll state
 const [poll, setPoll] = useState(post?.poll ?? null);

 React.useEffect(() => {
   if (post) {
     setLiked(!!post.isLikedByMe);
     setLikesCount(post.likesCount);
     setPoll(post.poll ?? null);
     setBookmarked(!!post.isBookmarkedByMe);
   }
 }, [post]);

 // Report state
 const [reportOpen, setReportOpen] = useState(false);
 const [reportReason, setReportReason] = useState('');

 const { data: comments, refetch: refetchComments, isLoading: commentsLoading } = useQuery({
 queryKey: ['post-comments', id],
 queryFn: () => id ? listPostComments(id) : Promise.resolve([]),
 enabled: !!id,
 });

 // Looked up by a reply's "Replying to" chip to show the parent's author/snippet.
 const commentById = React.useMemo(() => {
   const map = new Map<string, PostComment>();
   for (const c of comments ?? []) map.set(c.id, c);
   return map;
 }, [comments]);

 async function handleToggleLike() {
   if (!post) return;
   haptics.light();
   const next = !liked;
   setLiked(next);
   setLikesCount((prev) => prev + (next ? 1 : -1));
   try {
     await togglePostLike(post.id, next);
     queryClient.invalidateQueries({ queryKey: ['feed'] });
     queryClient.invalidateQueries({ queryKey: ['post', post.id] });
   } catch {
     setLiked(!next);
     setLikesCount((prev) => prev + (next ? -1 : 1));
   }
 }

 async function handleVote(optionId: string) {
   if (!poll || !post) return;
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
   queryClient.invalidateQueries({ queryKey: ['post', post.id] });
 }

 async function handleAddReply() {
   if (!post || (!newReply.trim() && !attachedReplyMedia)) return;
   setSubmittingReply(true);
   try {
     await createPostComment(
       post.id,
       newReply.trim(),
       user?.fullName ?? 'You',
       user?.role ?? 'student',
       attachedReplyMedia || undefined,
       replyingToComment?.id ?? undefined,
     );
     setNewReply('');
     setAttachedReplyMedia(null);
     setReplyingToComment(null);
     await refetchComments();
     await queryClient.invalidateQueries({ queryKey: ['post-comments', post.id] });
     await queryClient.invalidateQueries({ queryKey: ['feed'] });
     await queryClient.invalidateQueries({ queryKey: ['post', post.id] });
     haptics.success();
   } catch (err: any) {
     haptics.error();
     Alert.alert('Reply Failed', getFriendlyErrorMessage(err, 'Could not submit reply. Please try again.'));
   } finally {
     setSubmittingReply(false);
   }
 }

 async function handleToggleCommentLikeAction(commentId: string, currentCount: number) {
   if (!post) return;
   haptics.light();
   const isCurrentlyLiked = commentLikedByMe[commentId] ?? false;
   const nextLiked = !isCurrentlyLiked;
   setCommentLikedByMe((prev) => ({ ...prev, [commentId]: nextLiked }));
   setCommentLikes((prev) => ({
     ...prev,
     [commentId]: (prev[commentId] ?? currentCount) + (nextLiked ? 1 : -1),
   }));
   await toggleCommentLike(post.id, commentId, nextLiked);
 }

  function confirmDeleteComment(commentId: string) {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to remove this comment? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!post) return;
            haptics.medium();
            try {
              await deletePostComment(post.id, commentId);
              await refetchComments();
              await queryClient.invalidateQueries({ queryKey: ['post', post.id] });
              await queryClient.invalidateQueries({ queryKey: ['feed'] });
            } catch (err: any) {
              haptics.error();
              Alert.alert('Error', getFriendlyErrorMessage(err, 'Could not delete comment.'));
            }
          },
        },
      ],
    );
  }

  function startEditComment(c: PostComment) {
    haptics.light();
    setEditingCommentId(c.id);
    setEditingCommentText(c.content);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingCommentText('');
  }

  async function handleSaveCommentEdit(commentId: string) {
    const trimmed = editingCommentText.trim();
    if (!trimmed) return;
    setSavingCommentEdit(true);
    try {
      await updatePostComment(commentId, trimmed);
      await refetchComments();
      setEditingCommentId(null);
      setEditingCommentText('');
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', getFriendlyErrorMessage(err, 'Could not save your changes.'));
    } finally {
      setSavingCommentEdit(false);
    }
  }

  /** Saves/unsaves this post into the one shared saved_items store - mirrors PostCard's handleToggleBookmark. */
  async function handleToggleBookmark() {
    if (!post || savingBookmark) return;
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

  async function handleCopyLink() {
    if (!post) return;
    setMenuOpen(false);
    await Clipboard.setStringAsync(buildPostShareUrl(roleGroup, post.id));
    haptics.light();
    Alert.alert('Link Copied', 'Thread URL copied to clipboard.');
  }

  const postImageSource = post?.imageUrl
 ? STOCK_IMAGES[post.imageUrl] ?? (post.imageUrl.startsWith('http') ? { uri: post.imageUrl } : null)
 : null;
  // A stock-art key never belongs in a multi-image gallery (it isn't a real
  // uploaded URL) - only resolvable http(s) images render there.
  const galleryUrls = (post?.imageUrls ?? []).filter((u) => u.startsWith('http'));

  if (postLoading) {
    return (
      <ScreenContainer glow={true}>
        <AppHeader />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, opacity: 0.7 }} />
          <View style={{ width: 200, height: 16, borderRadius: 8, backgroundColor: colors.surface, opacity: 0.6 }} />
          <View style={{ width: 140, height: 12, borderRadius: 6, backgroundColor: colors.surface, opacity: 0.4 }} />
        </View>
      </ScreenContainer>
    );
  }

  if (!post) {
    return (
      <ScreenContainer glow={true}>
        <AppHeader />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
          <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
          <AppText variant="h3" weight="bold" style={{ textAlign: 'center' }}>Thread Not Found</AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center' }}>
            This discussion may have been removed or is no longer available.
          </AppText>
          <Pressable
            onPress={handleGoBack}
            style={{ marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.brandPrimary }}
          >
            <AppText tone="inverse" weight="bold">Go Back</AppText>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

 return (
 <ScreenContainer glow={true}>
 {/* Top Thread Navigation Bar */}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs, marginBottom: spacing.sm }}>
 <Pressable
 onPress={handleGoBack}
 hitSlop={8}
 accessibilityRole="button"
 accessibilityLabel="Back to community feed"
 style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
 >
 <Ionicons name="arrow-back"size={22} color={colors.textPrimary} />
 <AppText variant="h3"weight="bold">Thread</AppText>
 </Pressable>

 <Pressable 
 onPress={() => setMenuOpen(true)} 
 hitSlop={8}
 accessibilityRole="button"
 accessibilityLabel="Thread options menu"
 >
 <Ionicons name="ellipsis-horizontal"size={20} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView ref={scrollViewRef} style={{ flex: 1, width: '100%' }}
 showsVerticalScrollIndicator={false}
 keyboardShouldPersistTaps="handled"
 contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 120,
    maxWidth: isDesktop ? 820 : undefined, width: '100%', alignSelf: 'center' }}
 >
 {/* Full-Screen Master Thread Card */}
 <SolidCard frosted radius={24} style={{ marginBottom: spacing.md }}>
 {/* Author Header Row (Tap to View User Profile) */}
 <Pressable
  onPress={() => {
    haptics.light();
    setInspectUser({ id: post.authorId, name: post.authorName, role: post.authorRole, avatarUrl: post.authorAvatarUrl, isVerified: post.authorVerified });
  }}
 accessibilityRole="button"
 accessibilityLabel={`View ${post.authorName}'s profile`}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}
 >
  <Avatar name={post.authorName} uri={post.authorAvatarUrl} size={50} role={post.authorRole} />
  <View style={{ flex: 1, minWidth: 0 }}>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
  <AppText weight="bold" variant="body" style={{ flexShrink: 1 }}>
  {post.authorName}
  </AppText>
  {post.authorVerified || post.authorRole === 'admin' ? (
  <VerifiedBadge size={16} role={post.authorRole} name={post.authorName} />
  ) : null}
  <AppText tone="secondary" variant="caption" style={{ fontSize: 12, flexShrink: 0 }}>
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
  <AppText tone="secondary" variant="caption">
  {timeAgo(post.createdAt)}{post.institutionCode ? ` • ${post.institutionCode}` : ''}
  </AppText>
  </View>
 <Ionicons name="chevron-forward"size={16} color={colors.textSecondary} />
 </Pressable>

 {/* Topic & Full Body Text */}
 <AppText variant="h2"weight="bold"style={{ marginBottom: spacing.xs, lineHeight: 28 }}>
 {post.title}
 </AppText>

 <AppText variant="body"tone="primary"style={{ lineHeight: 24, marginBottom: spacing.md }}>
 {renderContent(post.content)}
 </AppText>

 {/* High-Res Media Photo / Video */}
 {galleryUrls.length > 1 ? (
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden' }}>
 {galleryUrls.slice(0, 4).map((url, index) => (
 <Pressable
 key={url + index}
 onPress={() => {
 haptics.light();
 setLightboxMedia(url);
 setLightboxCaption(post.title);
 setLightboxOpen(true);
 }}
 accessibilityRole="button"
 accessibilityLabel={`Enlarge post image ${index + 1}`}
 style={{ width: '49.5%', height: galleryUrls.length <= 2 ? 240 : 119 }}
 >
 <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
 </Pressable>
 ))}
 </View>
 ) : postImageSource ? (
 <Pressable
 onPress={() => {
 haptics.light();
 setLightboxMedia(post.imageUrl ?? null);
 setLightboxCaption(post.title);
 setLightboxOpen(true);
 }}
 accessibilityRole="button"
 accessibilityLabel="Enlarge post image"
 style={{ width: '100%', height: 240, borderRadius: 20, overflow: 'hidden', marginBottom: spacing.md, position: 'relative' }}
 >
 <Image source={postImageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
 </Pressable>
 ) : null}

 {/* Interactive Poll */}
 {poll ? (
 <View
 style={{
 backgroundColor: colors.surface,
 borderRadius: radius.lg,
 padding: spacing.md,
 marginBottom: spacing.md,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
 <Ionicons name="bar-chart"size={18} color={colors.textSecondary} />
 <AppText weight="bold"variant="bodySmall">
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
 paddingVertical: 12,
 paddingHorizontal: spacing.md,
 marginBottom: 8,
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
 backgroundColor: opt.isVotedByMe ? `${colors.brandPrimary}30` : `${colors.border}40`,
 }}
 />
 ) : null}

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 }}>
 <Ionicons
 name={opt.isVotedByMe ? 'checkmark-circle' : 'ellipse-outline'}
 size={18}
 color={opt.isVotedByMe ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText weight={opt.isVotedByMe ? 'bold' : 'medium'} variant="bodySmall"tone={opt.isVotedByMe ? 'brand' : 'primary'}>
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
 </View>
 ) : null}

 {/* Tags */}
 {post.courseTags ? (
 <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md }}>
 <View style={{ backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
 <AppText variant="caption"weight="bold"tone="secondary">{post.courseTags}</AppText>
 </View>
 </View>
 ) : null}

 {/* Engagement Metrics Stats Row */}
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider }}>
 <AppText variant="bodySmall"weight="bold">
 {likesCount} <AppText tone="secondary"variant="caption">Helpful marks</AppText>
 </AppText>
 <AppText variant="bodySmall"weight="bold">
 {comments?.length ?? 0} <AppText tone="secondary"variant="caption">Replies</AppText>
 </AppText>
 </View>

 {/* Action Buttons Bar */}
 <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: spacing.sm }}>
 <Pressable
 onPress={handleToggleLike}
 accessibilityRole="button"
 accessibilityLabel={liked ? 'Remove helpful mark' : 'Mark discussion as helpful'}
 accessibilityState={{ selected: liked }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}
 >
 <Ionicons name={liked ? 'bulb' : 'bulb-outline'} size={20} color={liked ? colors.brandPrimary : colors.textSecondary} />
 <AppText variant="caption"weight="bold"style={{ color: liked ? colors.brandPrimary : colors.textSecondary }}>
 {liked ? 'Helpful' : 'Mark helpful'}
 </AppText>
 </Pressable>

 <Pressable
 onPress={handleToggleBookmark}
 disabled={savingBookmark}
 accessibilityRole="button"
 accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark thread'}
 accessibilityState={{ selected: bookmarked }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}
 >
 <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? colors.brandPrimary : colors.textSecondary} />
 <AppText variant="caption"weight="bold"tone={bookmarked ? 'brand' : 'secondary'}>
 {bookmarked ? 'Saved' : 'Save'}
 </AppText>
 </Pressable>

 <Pressable
 onPress={handleCopyLink}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}
 >
 <Ionicons name="link-outline"size={20} color={colors.textSecondary} />
 <AppText variant="caption"weight="bold"tone="secondary">
 Copy link
 </AppText>
 </Pressable>
 </View>
 </SolidCard>

        {/* Replies count and header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.xs }}>
          <AppText variant="h3" weight="bold">
            Discussion ({comments?.length ?? post.commentsCount})
          </AppText>
          <AppText variant="caption" tone="brand" weight="bold">
            {isRestrictedGuest ? 'Preview Locked' : 'Live Thread'}
          </AppText>
        </View>

        {/* Conversation Replies Tree or Verification Gate */}
        {isRestrictedGuest ? (
          <VerificationRequiredGate
            campusCode={post.institutionCode}
            featureName="comments"
          />
        ) : commentsLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs }}>
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <AppText variant="caption" tone="secondary">
              Loading discussion replies...
            </AppText>
          </View>
        ) : comments && comments.length > 0 ? (
          <View style={{ position: 'relative', marginBottom: spacing.md }}>
 {comments.map((c, index) => {
 const isCommentLiked = commentLikedByMe[c.id] ?? !!c.isLikedByMe;
 const cLikes = commentLikes[c.id] ?? c.likesCount;
 const commentImage = c.imageUrl ? (STOCK_IMAGES[c.imageUrl] ?? { uri: c.imageUrl }) : null;
 const isOwnComment = c.authorId === user?.id || canModerate;
 const isEditing = editingCommentId === c.id;
 const parentComment = c.parentCommentId ? commentById.get(c.parentCommentId) : undefined;

 return (
 <View
 key={c.id}
 ref={(node) => { commentRefs.current[c.id] = node; }}
 style={{ flexDirection: 'row', marginBottom: spacing.md, position: 'relative' }}
 >
 {/* Vertical Connector Line */}
 {index < comments.length - 1 ? (
 <View
 style={{
 position: 'absolute',
 left: 17,
 top: 36,
 bottom: -spacing.md,
 width: 2,
 backgroundColor: colors.divider,
 zIndex: 1,
 }}
 />
 ) : null}

 {/* Comment Author Avatar (Tap to View User Profile) */}
 <Pressable accessibilityRole="button" accessibilityLabel={`View ${c.authorName}'s profile`}
 onPress={() => {
 haptics.light();
 setInspectUser({ id: c.authorId || `author-${c.id}`, name: c.authorName, role: c.authorRole, avatarUrl: c.authorAvatarUrl });
 }}
 style={{ zIndex: 2, marginRight: spacing.sm }}
 >
 <Avatar name={c.authorName} uri={c.authorAvatarUrl} size={36} role={c.authorRole} />
 </Pressable>

 {/* Comment Bubble */}
 <View style={{
 flex: 1,
 backgroundColor: highlightedCommentId === c.id
 ? `${colors.brandPrimary}20`
 : isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.85)',
 borderRadius: 16,
 padding: spacing.md,
 borderWidth: 1,
 borderColor: highlightedCommentId === c.id ? colors.brandPrimary : colors.border,
 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
 <AppText weight="bold" variant="bodySmall">{c.authorName}</AppText>
 <UserTypeBadge role={c.authorRole} />
 {c.authorDepartment ? (
 <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>{c.authorDepartment}</AppText>
 ) : null}
 </View>
 <AppText tone="secondary" variant="caption" style={{ fontSize: 11, flexShrink: 0 }}>
 {timeAgo(c.createdAt)}
 </AppText>
 {isOwnComment && !isEditing && (
 <Pressable
 accessibilityRole="button"
 accessibilityLabel="Edit comment"
 onPress={() => startEditComment(c)}
 hitSlop={8}
 style={{ marginLeft: 6 }}
 >
 <Ionicons name="create-outline" size={13} color={colors.textSecondary} />
 </Pressable>
 )}
 {isOwnComment && !isEditing && (
 <Pressable
 accessibilityRole="button"
 accessibilityLabel="Delete comment"
 onPress={() => confirmDeleteComment(c.id)}
 hitSlop={8}
 style={{ marginLeft: 6 }}
 >
 <Ionicons name="trash-outline" size={13} color={colors.critical} />
 </Pressable>
 )}
 </View>

 {/* "Replying to" back-reference chip - tappable to scroll to/highlight the original comment */}
 {parentComment ? (
 <Pressable
 accessibilityRole="button"
 accessibilityLabel={`Jump to ${parentComment.authorName}'s comment`}
 onPress={() => handleJumpToComment(parentComment.id)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 backgroundColor: colors.divider,
 borderRadius: radius.sm,
 paddingHorizontal: 8,
 paddingVertical: 3,
 marginTop: 4,
 alignSelf: 'flex-start',
 maxWidth: '100%',
 }}
 >
 <Ionicons name="arrow-undo-outline" size={11} color={colors.textSecondary} />
 <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>
 Replying to {parentComment.authorName}: {parentComment.content.slice(0, 40)}{parentComment.content.length > 40 ? '…' : ''}
 </AppText>
 </Pressable>
 ) : null}

 {isEditing ? (
 <View style={{ marginTop: spacing.xs }}>
 <TextInput
 accessibilityLabel="Edit comment"
 value={editingCommentText}
 onChangeText={setEditingCommentText}
 multiline
 style={{
 color: colors.textPrimary,
 fontSize: 13,
 lineHeight: 20,
 borderWidth: 1,
 borderColor: colors.border,
 borderRadius: radius.sm,
 padding: 8,
 minHeight: 44,
 }}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 6 }}>
 <Pressable accessibilityRole="button" onPress={cancelEditComment} disabled={savingCommentEdit}>
 <AppText variant="caption" weight="semiBold" tone="secondary">Cancel</AppText>
 </Pressable>
 <Pressable accessibilityRole="button" onPress={() => handleSaveCommentEdit(c.id)} disabled={savingCommentEdit || !editingCommentText.trim()}>
 <AppText variant="caption" weight="bold" tone="brand">{savingCommentEdit ? 'Saving…' : 'Save'}</AppText>
 </Pressable>
 </View>
 </View>
 ) : (
 <AppText variant="bodySmall" tone="primary" style={{ marginTop: 4, lineHeight: 20 }}>
 {c.content}
 </AppText>
 )}

 {commentImage ? (
 <Pressable accessibilityRole="button" accessibilityLabel="View attached image full screen"
 onPress={() => {
 haptics.light();
 setLightboxMedia(c.imageUrl ?? null);
 setLightboxCaption(`Shared by ${c.authorName}`);
 setLightboxOpen(true);
 }}
 style={{ marginTop: spacing.xs, height: 140, borderRadius: 12, overflow: 'hidden' }}
 >
 <Image source={commentImage} style={{ width: '100%', height: '100%' }} contentFit="cover" />
 </Pressable>
 ) : null}

 {/* Helpful & Reply action footer */}
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
 <Pressable
 onPress={() => handleToggleCommentLikeAction(c.id, c.likesCount)}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
 >
 <Ionicons name={isCommentLiked ? 'bulb' : 'bulb-outline'} size={14} color={isCommentLiked ? colors.brandPrimary : colors.textSecondary} />
 <AppText variant="caption" weight={isCommentLiked ? 'bold' : 'regular'} style={{ color: isCommentLiked ? colors.brandPrimary : colors.textSecondary }}>
 {cLikes > 0 ? `${cLikes} helpful` : 'Helpful'}
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 haptics.light();
 setReplyingToComment({ id: c.id, authorName: c.authorName });
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
 >
 <Ionicons name="arrow-undo-outline" size={13} color={colors.brandPrimary} />
 <AppText variant="caption" weight="semiBold" tone="brand">
 Reply
 </AppText>
 </Pressable>
 </View>
 </View>
 </View>
 );
 })}
 </View>
 ) : (
 <SolidCard frosted style={{ alignItems: 'center', padding: spacing.lg }}>
 <AppText tone="secondary" variant="bodySmall">No replies yet. Join the conversation below!</AppText>
 </SolidCard>
 )}
 </ScrollView>

      {/* Sticky Bottom Reply Composer Bar (Hidden for unverified personal guests) */}
      {!isRestrictedGuest && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: isDark ? 'rgba(10, 19, 38, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            borderTopWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            zIndex: 20,
            alignItems: 'center',
          }}
        >
          <View style={{ width: '100%', maxWidth: isDesktop ? 800 : undefined }}>
            {replyingToComment ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: `${colors.brandPrimary}15`, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, marginBottom: 4 }}>
                <AppText variant="caption" tone="brand" weight="bold">Replying to @{replyingToComment.authorName}</AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setReplyingToComment(null)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={colors.brandPrimary} />
                </Pressable>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
              <Avatar name={user?.fullName ?? 'You'} size={32} role={user?.role} />

              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 }}>
                <TextInput accessibilityLabel="Write a reply"
                  placeholder={replyingToComment ? `Reply to @${replyingToComment.authorName}...` : "Write a reply..."}
                  placeholderTextColor={colors.textSecondary}
                  value={newReply}
                  onChangeText={setNewReply}
                  multiline
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, maxHeight: 72, paddingVertical: 2 }}
                />

                <Pressable accessibilityRole="button" accessibilityLabel={attachedReplyMedia ? 'Remove attached image' : 'Attach an image'}
                  onPress={() => {
                    haptics.light();
                    setAttachedReplyMedia(attachedReplyMedia ? null : COMMENT_MEDIA_PRESETS[0].id);
                  }}
                  hitSlop={6}
                  style={{ padding: 4 }}
                >
                  <Ionicons name={attachedReplyMedia ? "image" : "image-outline"} size={18} color={attachedReplyMedia ? colors.brandPrimary : colors.textSecondary} />
                </Pressable>
              </View>

              <Pressable
                onPress={handleAddReply}
                disabled={submittingReply || (!newReply.trim() && !attachedReplyMedia)}
                style={{
                  backgroundColor: (!newReply.trim() && !attachedReplyMedia) ? colors.border : colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: 14,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppText variant="caption" weight="bold" tone={(!newReply.trim() && !attachedReplyMedia) ? 'secondary' : 'inverse'}>
                  {submittingReply ? '...' : 'Reply'}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      )}

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

 {/* Author Edit Post Modal */}
 {editOpen && (
 <EditPostModal
 visible={editOpen}
 post={post}
 onClose={() => setEditOpen(false)}
 onSaved={async () => {
 setEditOpen(false);
 await queryClient.invalidateQueries({ queryKey: ['feed'] });
 await queryClient.invalidateQueries({ queryKey: ['post', post.id] });
 haptics.success();
 Alert.alert('Post Updated', 'Your changes have been saved.');
 }}
 />
 )}

 {/* Lightbox Modal */}
 <ImageViewerModal
 visible={lightboxOpen}
 onClose={() => setLightboxOpen(false)}
 imageSource={lightboxMedia}
 caption={lightboxCaption}
 />

 {/* Options Menu Action Sheet */}
 <ActionSheetModal visible={menuOpen} onClose={() => setMenuOpen(false)}>
 <Pressable
 onPress={handleCopyLink}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
 >
 <Ionicons name="link-outline"size={18} color={colors.textPrimary} />
 <AppText weight="medium">Copy Discussion Link</AppText>
 </Pressable>

 {/* Author Edit / Delete Thread Controls */}
 {isAuthor && !canModerate && (
 <>
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
 <Pressable
 onPress={() => {
 setMenuOpen(false);
 setEditOpen(true);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
 >
 <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
 <AppText weight="medium">Edit Post</AppText>
 </Pressable>
 <Pressable
 onPress={() => {
 setMenuOpen(false);
 Alert.alert(
 'Delete Your Post',
 'Are you sure you want to permanently delete this thread? This cannot be undone.',
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Delete Post',
 style: 'destructive',
 onPress: async () => {
 try {
 await deletePost(post.id);
 await queryClient.invalidateQueries({ queryKey: ['feed'] });
 haptics.medium();
 Alert.alert('Post Deleted', 'Your thread has been deleted.');
 handleGoBack();
 } catch (err: any) {
 Alert.alert('Error', getFriendlyErrorMessage(err, 'Could not delete post.'));
 }
 },
 },
 ],
 );
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
 >
 <Ionicons name="trash-outline" size={18} color={colors.critical} />
 <AppText style={{ color: colors.critical }} weight="bold">Delete My Post</AppText>
 </Pressable>
 </>
 )}

 {/* Moderation controls: platform admin/staff everywhere, or this post's own community's creator/moderator */}
 {canModerate && (
 <>
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.5, marginVertical: 2 }}>
 {isPlatformModerator ? 'MODERATOR CONTROLS' : 'COMMUNITY MANAGER CONTROLS'}
 </AppText>

 <Pressable
 onPress={async () => {
 setMenuOpen(false);
 try {
 await updatePost(post.id, { isPinned: !post.isPinned });
 await queryClient.invalidateQueries({ queryKey: ['feed'] });
 await queryClient.invalidateQueries({ queryKey: ['post', post.id] });
 Alert.alert('Moderation Action', post.isPinned ? 'Thread unpinned.' : 'Thread pinned as an official announcement.');
 } catch (err: any) {
 haptics.error();
 Alert.alert('Action failed', getFriendlyErrorMessage(err, 'Could not update this thread. Please try again.'));
 }
 }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
 >
 <Ionicons name="pin-outline"size={18} color={colors.textPrimary} />
 <AppText weight="medium">{post.isPinned ? 'Unpin Announcement' : 'Pin as Announcement'}</AppText>
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
 handleGoBack();
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
 <Ionicons name="flag-outline"size={18} color={colors.critical} />
 <AppText style={{ color: colors.critical }} weight="medium">Report Thread</AppText>
 </Pressable>
 </ActionSheetModal>
 </ScreenContainer>
 );
}
