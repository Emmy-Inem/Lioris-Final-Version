import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

interface ResourceReaderModalProps {
  visible: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSendToCopilot?: (prompt: string) => void;
}

export function ResourceReaderModal({
  visible,
  resource,
  onClose,
  onSendToCopilot,
}: ResourceReaderModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const { isBookmarked, toggleBookmark } = useResourceBookmarks();

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'notes'>('preview');

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
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.open(resource.fileUrl, '_blank');
        } else {
          await Linking.openURL(resource.fileUrl);
        }
        setDownloaded(true);
        trackResourceDownload(resource.id).catch(() => {});
        toast.success(`Download started for ${resource.title}.`);
      } else {
        Alert.alert(
          'Sample Curriculum Material',
          `"${resource.title}" is a curriculum reference document. The in-app reader provides full access to its study notes.`,
        );
      }
    } catch {
      if (resource.fileUrl) {
        Linking.openURL(resource.fileUrl).catch(() => {});
      }
    } finally {
      setDownloading(false);
    }
  }

  // Google Docs Viewer API URL (Free, Zero-Auth, embeds any PDF, DOC, DOCX, PPT, XLS)
  const viewerUrl = resource.fileUrl
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(resource.fileUrl)}&embedded=true`
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Modal Top Navigation Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close Reader"
            style={{
              padding: 6,
              borderRadius: radius.pill,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            }}
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>

          {/* Center Tabs: In-App Document Preview vs Study Notes */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              borderRadius: radius.pill,
              padding: 2,
            }}
          >
            <Pressable
              onPress={() => setActiveTab('preview')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: activeTab === 'preview' ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color: activeTab === 'preview' ? '#FFFFFF' : colors.textSecondary,
                  fontSize: 11,
                }}
              >
                Document Reader
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('notes')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: activeTab === 'notes' ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color: activeTab === 'notes' ? '#FFFFFF' : colors.textSecondary,
                  fontSize: 11,
                }}
              >
                Study Notes & Info
              </AppText>
            </Pressable>
          </View>

          {/* Right Action Icons: Bookmark & Download */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable
              onPress={handleToggleBookmark}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? 'Remove Bookmark' : 'Bookmark Lecture Note'}
              style={{
                padding: 6,
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

            <AppButton
              label={downloaded ? 'Saved' : 'Download'}
              variant={downloaded ? 'secondary' : 'primary'}
              size="sm"
              loading={downloading}
              onPress={handleDownload}
            />
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Badge label={resource.courseCode} tone="neutral" />
              <Badge label={resource.category} tone="neutral" />
              {resource.fileSize && (
                <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5 }}>
                  {resource.fileSize}
                </AppText>
              )}
            </View>
            <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13, color: colors.textPrimary }}>
              {resource.title}
            </AppText>
          </View>

          {onSendToCopilot && (
            <Pressable
              onPress={() => {
                onClose();
                onSendToCopilot(
                  `Please analyze and generate step-by-step revision flashcards and practice problems for the following course material:\nCourse: ${resource.courseCode} (${resource.department})\nTitle: ${resource.title}\nDescription: ${resource.description || 'General course notes'}`,
                );
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.pastelPrimaryBg,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: `${colors.brandPrimary}40`,
              }}
            >
              <Ionicons name="sparkles" size={13} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10.5 }}>
                AI Study Copilot
              </AppText>
            </Pressable>
          )}
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
                    onPress={() => Linking.openURL(viewerUrl)}
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
              // In-app note view when no external file URL is present
              <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
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
                    <Ionicons name="book-outline" size={24} color={colors.textSecondary} />
                    <AppText variant="h2" weight="bold">
                      {resource.title}
                    </AppText>
                  </View>

                  <AppText tone="secondary" style={{ lineHeight: 22, fontSize: 14, marginBottom: spacing.lg }}>
                    {resource.description || 'Comprehensive departmental lecture notes and curriculum summary.'}
                  </AppText>

                  <View
                    style={{
                      backgroundColor: colors.divider,
                      borderRadius: 12,
                      padding: spacing.md,
                      borderLeftWidth: 4,
                      borderLeftColor: colors.border,
                      marginBottom: spacing.lg,
                    }}
                  >
                    <AppText weight="bold" variant="bodySmall" style={{ marginBottom: 4 }}>
                      Verified Academic Material
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ lineHeight: 18 }}>
                      Course: {resource.courseCode} • Department: {resource.department}
                      {'\n'}Author: {resource.authorName} • Category: {resource.category}
                    </AppText>
                  </View>

                  <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
                    Key Examination Takeaways:
                  </AppText>
                  <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 20 }}>
                    • Review past exam trends and recommended problem sets associated with {resource.courseCode}.
                    {'\n'}• Verify prerequisite formulas and lecture slide references.
                    {'\n'}• Bookmark this resource for quick offline reference before finals.
                  </AppText>
                </View>
              </ScrollView>
            )}
          </View>
        ) : (
          /* Notes & Info Tab */
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
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
                Detailed breakdown and verified metadata for this campus study material.
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
                  <AppText weight="semiBold" variant="caption">{resource.fileSize || 'Standard PDF (~1.5 MB)'}</AppText>
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
                  Description & Syllabus Topics
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
      </View>
    </Modal>
  );
}
