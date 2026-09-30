import React, { useState, useEffect } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { StarRating } from './common/StarRating';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { Resource } from '@/api/types';
import {
  trackResourceDownload,
  toggleResourceUpvote,
  getResourceRatingSummary,
  submitResourceRating,
  ResourceRatingSummary,
} from '@/api/resources';
import { isResourceBookmarked, toggleResourceBookmark } from '@/utils/resourceBookmarks';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { ReportResourceModal } from './ReportResourceModal';

export interface ResourceCardProps {
  resource: Resource;
  onPreview?: (resource: Resource) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onReport?: (resource: Resource) => void;
}

export const ResourceCard = React.memo(function ResourceCard({
  resource,
  onPreview,
  isBookmarked: externalBookmarked,
  onToggleBookmark: externalToggleBookmark,
  onReport,
}: ResourceCardProps) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();

  const [internalBookmarked, setInternalBookmarked] = useState(() => isResourceBookmarked(resource.id));
  const bookmarked = externalBookmarked !== undefined ? externalBookmarked : internalBookmarked;

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [upvoted, setUpvoted] = useState(false);
  const [upvotes, setUpvotes] = useState(resource.likesCount);
  const [upvoting, setUpvoting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [ratingSummary, setRatingSummary] = useState<ResourceRatingSummary>({ avgRating: 0, ratingCount: 0 });
  const [rateOpen, setRateOpen] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    if (externalBookmarked === undefined) {
      setInternalBookmarked(isResourceBookmarked(resource.id));
    }
  }, [resource.id, externalBookmarked]);

  useEffect(() => {
    let cancelled = false;
    getResourceRatingSummary(resource.id)
      .then((summary) => {
        if (!cancelled) setRatingSummary(summary);
      })
      .catch(() => {
        // Read-only display; a failed fetch just leaves the 0/0 placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, [resource.id]);

  async function handleToggleBookmark() {
    haptics.medium();
    if (externalToggleBookmark) {
      externalToggleBookmark();
      return;
    }
    const added = await toggleResourceBookmark(resource.id);
    setInternalBookmarked(added);
    if (added) {
      toast.success(`Bookmarked "${resource.title}"`);
    } else {
      toast.info(`Removed "${resource.title}" from bookmarks`);
    }
  }

  async function handleDownload() {
    if (downloading) return;
    haptics.light();
    setDownloading(true);
    try {
      if (resource.fileUrl) {
        if (!isSafeHttpUrl(resource.fileUrl) || !(await openExternalUrl(resource.fileUrl))) {
          Alert.alert('Download Unavailable', 'This resource has an invalid or unsafe file link.');
          return;
        }
        setDownloaded(true);
        trackResourceDownload(resource.id).catch(() => {});
        toast.success(`Download started for ${resource.title}`);
      } else {
        // Nothing to download. Say so rather than pretending a note was saved.
        Alert.alert('No file attached', 'The person who shared this did not attach a file, so there is nothing to download.');
      }
    } catch {
      Alert.alert('Download Failed', 'Could not open this file. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  function handleToggleUpvote() {
    if (upvoting) return;
    setUpvoting(true);
    haptics.light();
    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setUpvotes((prev) => prev + (nextUpvoted ? 1 : -1));
    toggleResourceUpvote(resource.id, nextUpvoted)
      .catch(() => {})
      .finally(() => {
        setUpvoting(false);
      });
  }

  function handleOpenReport() {
    haptics.light();
    if (onReport) {
      onReport(resource);
    } else {
      setReportOpen(true);
    }
  }

  function handleOpenRate() {
    haptics.light();
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to rate this resource.');
      return;
    }
    setRateOpen(true);
  }

  async function handleSaveRating() {
    if (myRating < 1) {
      toast.error('Choose a star rating first.');
      return;
    }
    haptics.medium();
    setSavingRating(true);
    try {
      await submitResourceRating(resource.id, myRating, myReview);
      const next = await getResourceRatingSummary(resource.id);
      setRatingSummary(next);
      toast.success('Thanks for rating this resource.');
      setRateOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save your rating. Please try again.');
    } finally {
      setSavingRating(false);
    }
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
      <Pressable onPress={() => onPreview?.(resource)} style={{ width: '100%' }}>
        {/* Top Badges & Bookmark Action Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            <Badge label={resource.courseCode || 'GEN'} tone="neutral" />
            <Badge label={resource.category} tone="neutral" />
            {resource.fileSize ? (
              <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5 }}>
                {resource.fileSize}
              </AppText>
            ) : null}
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleToggleBookmark();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark lecture note'}
            style={{
              padding: 6,
              borderRadius: radius.pill,
              backgroundColor: bookmarked ? colors.pastelPrimaryBg : 'transparent',
              flexShrink: 0,
            }}
          >
            <Ionicons
              name={bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={bookmarked ? colors.brandPrimary : colors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Title & Department - Full Width */}
        <AppText weight="bold" style={{ fontSize: 15, lineHeight: 20, marginTop: 2 }}>
          {resource.title}
        </AppText>
        <AppText tone="secondary" variant="caption" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>
          {resource.department} • By {resource.authorName || 'Campus Student'}
        </AppText>

        {resource.description ? (
          <AppText tone="secondary" style={{ marginTop: spacing.xs, lineHeight: 17, fontSize: 12 }}>
            {resource.description}
          </AppText>
        ) : null}
      </Pressable>

      {/* Two rows so nothing collides on a phone: stats + report on top, the two actions below at equal width. */}
      <View
        style={{
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="download-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
              {resource.downloadsCount + (downloaded ? 1 : 0)}
            </AppText>
          </View>
          <Pressable
 onPress={handleToggleUpvote}
 hitSlop={8}
 accessibilityRole="button"
 accessibilityLabel={`${upvoted ? 'Remove upvote' : 'Upvote'}, ${upvotes} upvotes`}
 accessibilityState={{ selected: upvoted }}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons
              name={upvoted ? 'thumbs-up' : 'thumbs-up-outline'}
              size={14}
              color={upvoted ? colors.brandPrimary : colors.textSecondary}
            />
            <AppText tone={upvoted ? 'brand' : 'secondary'} variant="caption" weight={upvoted ? 'bold' : 'regular'} style={{ fontSize: 11 }}>
              {upvotes}
            </AppText>
          </Pressable>
          <Pressable
            onPress={handleOpenRate}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Rate this resource. Average ${ratingSummary.avgRating.toFixed(1)} out of 5 from ${ratingSummary.ratingCount} rating${ratingSummary.ratingCount === 1 ? '' : 's'}`}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <StarRating value={ratingSummary.avgRating} size={13} showValue count={ratingSummary.ratingCount} />
          </Pressable>
          <Pressable
            onPress={handleOpenReport}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report this resource or request its removal"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingVertical: 4 }}
          >
            <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
              Report
            </AppText>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppButton label="Read Online" variant="secondary" size="sm" onPress={() => onPreview?.(resource)} fullWidth />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppButton
              label={downloaded ? 'Saved' : 'Download'}
              variant={downloaded ? 'secondary' : 'primary'}
              onPress={handleDownload}
              loading={downloading}
              size="sm"
              fullWidth
            />
          </View>
        </View>
      </View>
      {!onReport && reportOpen && (
        <ReportResourceModal visible={reportOpen} resource={resource} onClose={() => setReportOpen(false)} />
      )}
      {rateOpen && (
        <Modal visible={rateOpen} transparent animationType="fade" onRequestClose={() => setRateOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.6)',
              justifyContent: isDesktop ? 'center' : 'flex-end',
              alignItems: 'center',
            }}
          >
            <Pressable
              accessible={false}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => setRateOpen(false)}
            />
            <View
              style={{
                width: '100%',
                maxWidth: 480,
                backgroundColor: colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderBottomLeftRadius: isDesktop ? 24 : 0,
                borderBottomRightRadius: isDesktop ? 24 : 0,
                padding: spacing.lg,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                gap: spacing.sm,
              }}
            >
              <AppText weight="bold" style={{ fontSize: 15 }}>
                Rate "{resource.title}"
              </AppText>
              <AppText tone="secondary" variant="caption">
                Your rating helps other students judge quality at a glance.
              </AppText>
              <StarRating value={myRating} onChange={setMyRating} size={28} />
              <AppTextField
                label=""
                value={myReview}
                onChangeText={(v) => setMyReview(v.slice(0, 1000))}
                placeholder="What did you think? (optional)"
                multiline
                numberOfLines={3}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Cancel" variant="secondary" onPress={() => setRateOpen(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton label="Submit rating" variant="primary" loading={savingRating} onPress={handleSaveRating} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SolidCard>
  );
});
