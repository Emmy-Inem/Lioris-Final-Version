import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { Resource } from '@/api/types';
import { trackResourceDownload } from '@/api/resources';
import { useResourceBookmarks } from '@/utils/resourceBookmarks';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { ReportResourceForm } from './ReportResourceModal';

interface ResourceReaderModalProps {
  visible: boolean;
  resource: Resource | null;
  onClose: () => void;
}

export function ResourceReaderModal({
  visible,
  resource,
  onClose,
}: ResourceReaderModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { isBookmarked, toggleBookmark } = useResourceBookmarks();

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'notes'>('preview');
  const [reportOpen, setReportOpen] = useState(false);

  if (!resource) return null;

  const bookmarked = isBookmarked(resource.id);

  async function handleToggleBookmark() {
    haptics.medium();
    const added = await toggleBookmark(resource!.id);
    if (added) {
      toast.success(`Bookmarked "${resource!.title}" for quick revision.`);
    } else {
      toast.info(`Removed "${resource!.title}" from bookmarks.`);
    }
  }

  async function handleDownload() {
    if (!resource) return;
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
        toast.success(`Download started for ${resource.title}.`);
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

  // Google Docs Viewer API URL - only for direct PDF/document files
  const isDirectPdf =
    !!resource.fileUrl &&
    isSafeHttpUrl(resource.fileUrl) &&
    resource.fileUrl.toLowerCase().includes('.pdf');

  const viewerUrl = isDirectPdf
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(resource.fileUrl!)}&embedded=true`
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
        {/*
          Modal Top Navigation Bar.

          This used to be a single row holding the close button, a two-label pill tab switcher,
          a bookmark icon and a Download button. At 375px that row needed roughly 430px, so the
          Download button was clipped off the right edge. It is now two rows: icon actions on the
          first, a full-width segmented tab control on the second. Every control is at least 44px
          and nothing is truncated.
        */}
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingTop: Math.max(insets.top, spacing.sm),
            paddingBottom: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
            gap: spacing.sm,
          }}
        >
          {/* Row 1: close, spacer, bookmark, download */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close reader"
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              }}
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>

            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="caption" tone="secondary" weight="bold">
                {activeTab === 'preview' ? 'Document reader' : 'Study notes & info'}
              </AppText>
            </View>

            <Pressable
              onPress={() => {
                haptics.light();
                setReportOpen(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Report this resource or request its removal"
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
              }}
            >
              <Ionicons name="flag-outline" size={20} color={colors.textPrimary} />
            </Pressable>

            <Pressable
              onPress={handleToggleBookmark}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: bookmarked }}
              accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark this lecture note'}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: bookmarked ? colors.pastelPrimaryBg : 'transparent',
              }}
            >
              <Ionicons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={bookmarked ? colors.brandPrimary : colors.textPrimary}
              />
            </Pressable>

            <View style={{ flexShrink: 0 }}>
              <AppButton
                label={downloaded ? 'Saved' : 'Download'}
                variant={downloaded ? 'secondary' : 'primary'}
                size="sm"
                loading={downloading}
                onPress={handleDownload}
              />
            </View>
          </View>

          {/* Row 2: full-width segmented tabs - each half is tappable edge to edge */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              borderRadius: radius.pill,
              padding: 3,
              gap: 3,
            }}
          >
            {([
              { key: 'preview' as const, label: 'Document Reader' },
              { key: 'notes' as const, label: 'Study Notes & Info' },
            ]).map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.key }}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  borderRadius: radius.pill,
                  backgroundColor: activeTab === tab.key ? colors.brandPrimary : 'transparent',
                }}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  style={{
                    color: activeTab === tab.key ? '#FFFFFF' : colors.textSecondary,
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Document Header Metadata Bar */}
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(241, 245, 249, 0.6)',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <View style={{ flex: 1, minWidth: 180 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <Badge label={resource.courseCode} tone="neutral" />
              <Badge label={resource.category} tone="neutral" />
              {resource.fileSize && (
                <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5 }}>
                  {resource.fileSize}
                </AppText>
              )}
            </View>
            <AppText weight="bold" style={{ fontSize: 13, color: colors.textPrimary }}>
              {resource.title}
            </AppText>
          </View>
        </View>

        {/* Main Content Area */}
        {activeTab === 'preview' ? (
          <View style={{ flex: 1, width: '100%', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
            {Platform.OS === 'web' && viewerUrl ? (
              <iframe
                src={viewerUrl}
                title={resource.title}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                }}
              />
            ) : viewerUrl ? (
              // Native fallback: Web link button or direct preview
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
                <Ionicons name="document-text-outline" size={56} color={colors.textSecondary} style={{ marginBottom: spacing.md }} />
                <AppText variant="h2" weight="bold" style={{ textAlign: 'center', marginBottom: spacing.xs }}>
                  {resource.title}
                </AppText>
                <AppText tone="secondary" style={{ textAlign: 'center', marginBottom: spacing.lg, maxWidth: 360 }}>
                  Ready to read online without downloading. Tap below to launch the document viewer.
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <AppButton
                    label="Open In Browser Viewer ↗"
                    onPress={() => { void openExternalUrl(viewerUrl); }}
                    variant="primary"
                  />
                  <AppButton
                    label="Download To Device"
                    onPress={handleDownload}
                    variant="secondary"
                  />
                </View>
              </View>
            ) : (
              // No inline preview: either a non-PDF upload or no file at all. Show only what the
              // uploader actually provided; nothing is generated here.
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
                    <Ionicons name="document-outline" size={24} color={colors.textSecondary} />
                    <AppText variant="h2" weight="bold" style={{ flex: 1 }}>
                      {resource.title}
                    </AppText>
                  </View>

                  {resource.description ? (
                    <AppText tone="secondary" style={{ lineHeight: 22, fontSize: 14, marginBottom: spacing.lg }}>
                      {resource.description}
                    </AppText>
                  ) : null}

                  {resource.fileUrl && !isDirectPdf ? (
                    <AppButton
                      label="Open file ↗"
                      onPress={() => { void openExternalUrl(resource.fileUrl!); }}
                      variant="primary"
                    />
                  ) : (
                    <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 20 }}>
                      No file is attached to this resource, so there is nothing to preview or download.
                    </AppText>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        ) : (
          /* Notes & Info Tab */
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.xl), gap: spacing.md }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: spacing.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                Document Information
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                Details for this study material.
              </AppText>

              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <AppText tone="secondary" variant="caption">Course Code</AppText>
                  <AppText weight="bold" variant="caption">{resource.courseCode}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <AppText tone="secondary" variant="caption">Department</AppText>
                  <AppText weight="semiBold" variant="caption">{resource.department}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <AppText tone="secondary" variant="caption">Category</AppText>
                  <AppText weight="semiBold" variant="caption">{resource.category}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <AppText tone="secondary" variant="caption">Uploaded By</AppText>
                  <AppText weight="semiBold" variant="caption">{resource.authorName}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <AppText tone="secondary" variant="caption">Total Downloads</AppText>
                  <AppText weight="bold" variant="caption">{resource.downloadsCount + (downloaded ? 1 : 0)}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText tone="secondary" variant="caption">File Size</AppText>
                  <AppText weight="semiBold" variant="caption">{resource.fileSize || 'Unknown'}</AppText>
                </View>
              </View>
            </View>

            {resource.description ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 16,
                  padding: spacing.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                  Description
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 20 }}>
                  {resource.description}
                </AppText>
              </View>
            ) : null}

            {/* Bottom Actions */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={bookmarked ? 'Bookmark Saved ★' : 'Bookmark Lecture Note'}
                  variant={bookmarked ? 'secondary' : 'ghost'}
                  onPress={handleToggleBookmark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={downloaded ? 'Downloaded ✓' : 'Download File'}
                  variant="primary"
                  loading={downloading}
                  onPress={handleDownload}
                />
              </View>
            </View>
          </ScrollView>
        )}

        {/* Report / takedown form. An in-place overlay: a second native Modal on top of this one
            misbehaves on phones. */}
        {reportOpen ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              justifyContent: 'flex-end',
              alignItems: 'center',
              zIndex: 50,
            }}
          >
            <Pressable
              accessible={false}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => setReportOpen(false)}
            />
            <View
              style={{
                width: '100%',
                maxWidth: 560,
                maxHeight: '92%',
                backgroundColor: colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) }}
              >
                <ReportResourceForm
                  resource={resource}
                  onClose={() => setReportOpen(false)}
                  onSubmitted={({ autoHidden }) => {
                    if (autoHidden) onClose();
                  }}
                />
              </ScrollView>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
