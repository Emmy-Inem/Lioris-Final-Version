import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { Resource } from '@/api/types';
import { trackResourceDownload, toggleResourceUpvote } from '@/api/resources';
import { useResourceBookmarks } from '@/utils/resourceBookmarks';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { ReportResourceModal } from './ReportResourceModal';

export function ResourceCard({
  resource,
  onPreview,
}: {
  resource: Resource;
  onPreview?: (resource: Resource) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const { isBookmarked, toggleBookmark } = useResourceBookmarks();
  const bookmarked = isBookmarked(resource.id);

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [upvoted, setUpvoted] = useState(false);
  const [upvotes, setUpvotes] = useState(resource.likesCount);
  const [reportOpen, setReportOpen] = useState(false);

  async function handleToggleBookmark() {
    haptics.medium();
    const added = await toggleBookmark(resource.id);
    if (added) {
      toast.success(`Bookmarked "${resource.title}"`);
    } else {
      toast.info(`Removed "${resource.title}" from bookmarks`);
    }
  }

  async function handleDownload() {
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
    haptics.light();
    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setUpvotes(upvotes + (nextUpvoted ? 1 : -1));
    toggleResourceUpvote(resource.id, nextUpvoted).catch(() => {});
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
            onPress={() => {
              haptics.light();
              setReportOpen(true);
            }}
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
      <ReportResourceModal visible={reportOpen} resource={resource} onClose={() => setReportOpen(false)} />
    </SolidCard>
  );
}
