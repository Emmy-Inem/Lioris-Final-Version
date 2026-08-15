import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { UserTypeBadge } from './UserTypeBadge';
import { VisibilityBadge } from './VisibilityBadge';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { ActionSheetModal } from './ActionSheetModal';
import { useTheme } from '@/theme/ThemeProvider';
import { Post } from '@/api/types';
import { togglePostLike } from '@/api/posts';
import { submitReport } from '@/api/moderation';
import { haptics } from '@/utils/haptics';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Trust badge: gold/silver/bronze star based on trust level, ported
// from PostCard's shieldIcon logic (DashboardAndProfile.kt).
function trustBadge(level?: number) {
  if (!level) return null;
  if (level >= 10) return { icon: 'trophy' as const, color: '#FFD700' };
  if (level >= 5) return { icon: 'star' as const, color: '#C0C0C0' };
  if (level >= 3) return { icon: 'star-outline' as const, color: '#CD7F32' };
  return null;
}

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { colors, spacing, radius } = useTheme();
  const [liked, setLiked] = useState(!!post.isLikedByMe);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const reportOpacity = useSharedValue(0);
  const reportScale = useSharedValue(0.92);

  useEffect(() => {
    if (reportOpen) {
      reportOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      reportScale.value = withSpring(1, { damping: 16, stiffness: 220 });
    } else {
      reportOpacity.value = 0;
      reportScale.value = 0.92;
    }
  }, [reportOpen, reportOpacity, reportScale]);

  const reportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: reportOpacity.value,
    transform: [{ scale: reportScale.value }],
  }));

  const trust = trustBadge(post.authorTrustLevel);
  const isGlobalPost = post.visibilityScope === 'global' || post.scopeVisibility === 'global';

  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Avatar name={post.authorName} uri={post.authorAvatarUrl} size={44} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flexShrink: 1 }}>
              {post.authorName}
            </AppText>
            {isGlobalPost && <VisibilityBadge visibility="global" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            <UserTypeBadge role={post.authorRole} />
            {post.scopeVisibility && post.scopeVisibility !== 'global' ? (
              <VisibilityBadge visibility={post.scopeVisibility} />
            ) : null}
            {trust ? <Ionicons name={trust.icon} size={16} color={trust.color} /> : null}
            <Badge label={post.category} tone="neutral" />
            {post.sponsored ? <Badge label="🌟 Sponsored" tone="accent" /> : null}
            {post.postFormat === 'Rapid-Fire Conversation' ? <Badge label="⚡ Rapid-Fire" tone="warning" /> : null}
          </View>
          {post.courseTags ? (
            <AppText tone="brand" variant="caption" weight="semiBold" style={{ marginTop: 4 }}>
              🏷️ {post.courseTags}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Post options"
          style={{ padding: 4 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <AppText variant="h3" weight="bold" style={{ marginTop: spacing.md }}>
        {post.title}
      </AppText>
      <AppText tone="secondary" style={{ marginTop: 4 }}>
        {post.content}
      </AppText>

      {post.imageUrl ? (
        <View
          style={{
            marginTop: spacing.sm,
            aspectRatio: 16 / 10,
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: colors.divider,
          }}
        />
      ) : null}

      {post.videoUrl || post.pollQuestion ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          {post.videoUrl ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="play-circle-outline" size={14} color={colors.brandAccent} />
              <AppText variant="caption" weight="bold">
                Video included
              </AppText>
            </View>
          ) : null}
          {post.pollQuestion ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="bar-chart-outline" size={14} color={colors.brandMagenta} />
              <AppText variant="caption" weight="bold">
                Active poll
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
        <Pressable
          onPress={() => {
            haptics.light();
            const next = !liked;
            setLiked(next); // optimistic — flips instantly, rolls back below only if the (real) API call throws
            togglePostLike(post.id, next).catch(() => setLiked(!next));
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Remove upvote' : 'Upvote'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: radius.md,
            backgroundColor: liked ? `${colors.brandPrimary}1F` : 'transparent',
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <Ionicons
            name={liked ? 'thumbs-up' : 'thumbs-up-outline'}
            size={18}
            color={liked ? colors.brandPrimary : colors.textSecondary}
          />
          <AppText variant="bodySmall" weight="semiBold" tone={liked ? 'brand' : 'secondary'}>
            {post.likesCount + (liked && !post.isLikedByMe ? 1 : 0)} upvotes
          </AppText>
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: radius.md,
            backgroundColor: `${colors.brandSky}26`,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color={colors.brandSky} />
          <AppText variant="bodySmall" weight="bold" style={{ color: colors.brandSky }}>
            {post.commentsCount} comments
          </AppText>
        </View>
      </View>

      {/* Options menu: Report / Block — ported from PostCard's DropdownMenu */}
      <ActionSheetModal visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setReportOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Report post"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="flag-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }}>Report Post</AppText>
        </Pressable>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            // Same fix as Report Post — no call site ever provided
            // onBlockAuthor either, so this did nothing before.
            Alert.alert('User blocked', `You won't see posts or events from ${post.authorName} anymore.`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Block @${post.authorName}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Ionicons name="ban-outline" size={18} color={colors.critical} />
          <AppText style={{ color: colors.critical }}>Block @{post.authorName}</AppText>
        </Pressable>
      </ActionSheetModal>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Animated.View style={[{ width: '100%' }, reportAnimatedStyle]}>
            <SolidCard radius={20} style={{ width: '100%' }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                Report Flagged Content
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                Why are you flagging this content?
              </AppText>
              <AppTextField label="" placeholder="Reason (e.g. spam, abuse)" value={reportReason} onChangeText={setReportReason} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setReportOpen(false)} />
                <AppButton
                  label="Submit Report"
                  onPress={async () => {
                    const reason = reportReason.trim();
                    if (!reason) return;
                    setReportOpen(false);
                    setReportReason('');
                    // Previously this called an `onReport` prop that
                    // none of PostCard's 3 call sites ever actually
                    // provided — meaning reporting a post did
                    // absolutely nothing, not even a failed request.
                    await submitReport({ targetType: 'post', targetId: post.id, reason });
                    Alert.alert('Reported', 'Thanks — our moderation team will review this.');
                  }}
                />
              </View>
            </SolidCard>
          </Animated.View>
        </View>
      </Modal>
    </SolidCard>
  );
}
