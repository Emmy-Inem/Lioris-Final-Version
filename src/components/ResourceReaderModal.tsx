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
import { getCourseLectureNotes } from '@/data/courseNotesRepository';
import { downloadResourceFile } from '@/utils/resourceDownloader';

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
  const insets = useSafeAreaInsets();
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
      const res = await downloadResourceFile(resource);
      if (res.success) {
        setDownloaded(true);
        trackResourceDownload(resource.id).catch(() => {});
        haptics.success();
        toast.success(
          res.isNoteHtml
            ? `Downloaded ${resource.courseCode || resource.title} lecture notes (.html)`
            : `Download started for ${resource.title}`,
        );
      } else {
        haptics.error();
        Alert.alert('Download Failed', res.error || 'Could not download this file. Please try again.');
      }
    } catch {
      haptics.error();
      Alert.alert('Download Failed', 'Could not open or download this file. Please try again.');
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

  const courseNotes = getCourseLectureNotes(resource);

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
                label={downloaded ? 'Downloaded ✓' : 'Download'}
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

          {onSendToCopilot && (
            <Pressable
              onPress={() => {
                onClose();
                onSendToCopilot(
                  `Please analyze and generate step-by-step revision flashcards and practice problems for the following course material:\nCourse: ${resource.courseCode} (${resource.department})\nTitle: ${resource.title}\nDescription: ${resource.description || 'General course notes'}`,
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Analyse this material with the AI study copilot"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: colors.pastelPrimaryBg,
                paddingHorizontal: 14,
                minHeight: 44,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: `${colors.brandPrimary}40`,
              }}
            >
              <Ionicons name="sparkles" size={15} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 12 }}>
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
              // Comprehensive In-App Lecture Notes & Curriculum View
              <ScrollView
                contentContainerStyle={{
                  padding: spacing.lg,
                  paddingBottom: Math.max(insets.bottom, spacing.xl),
                  gap: spacing.lg,
                }}
              >
                {/* 1. Course Header & Metadata Card */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: spacing.sm }}>
                    <Badge label={courseNotes.courseCode} tone="brand" />
                    <Badge label={`${courseNotes.creditUnits} Units`} tone="neutral" />
                    <Badge label={courseNotes.level} tone="neutral" />
                    <Badge label={courseNotes.semester} tone="neutral" />
                  </View>

                  <AppText variant="h2" weight="bold" style={{ marginBottom: 4 }}>
                    {courseNotes.courseTitle}
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                    {courseNotes.facultyOrCollege} • {courseNotes.department}
                  </AppText>

                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 180 }}>
                      <AppButton
                        label={downloaded ? 'Downloaded ✓' : 'Download Complete Notes (.html / PDF)'}
                        variant="primary"
                        size="sm"
                        loading={downloading}
                        onPress={handleDownload}
                      />
                    </View>
                    {resource.fileUrl && !isDirectPdf && (
                      <View style={{ flex: 1, minWidth: 180 }}>
                        <AppButton
                          label="Open University Portal / Repo ↗"
                          onPress={() => { void openExternalUrl(resource.fileUrl!); }}
                          variant="secondary"
                          size="sm"
                        />
                      </View>
                    )}
                  </View>
                </View>

                {/* 2. Course Overview & Learning Outcomes */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.brandPrimary} />
                    <AppText variant="h3" weight="bold">
                      Course Overview & Objectives
                    </AppText>
                  </View>
                  <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 22, marginBottom: spacing.md }}>
                    {courseNotes.overview}
                  </AppText>

                  <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
                    Intended Learning Outcomes:
                  </AppText>
                  <View style={{ gap: 8 }}>
                    {courseNotes.learningOutcomes.map((lo, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={colors.brandPrimary} style={{ marginTop: 2 }} />
                        <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 20 }}>
                          {lo}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 3. Multi-Module Detailed Lecture Notes */}
                {courseNotes.modules.map((mod) => (
                  <View
                    key={mod.number}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 16,
                      padding: spacing.lg,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                      <View
                        style={{
                          backgroundColor: colors.pastelPrimaryBg,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <AppText weight="bold" tone="brand" variant="caption">
                          Module {mod.number}
                        </AppText>
                      </View>
                      <AppText variant="h3" weight="bold" style={{ flex: 1 }}>
                        {mod.title}
                      </AppText>
                    </View>

                    <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md, lineHeight: 20 }}>
                      {mod.summary}
                    </AppText>

                    {/* Topics */}
                    <View style={{ gap: spacing.md }}>
                      {mod.topics.map((topic, tIdx) => (
                        <View
                          key={tIdx}
                          style={{
                            paddingTop: tIdx > 0 ? spacing.md : 0,
                            borderTopWidth: tIdx > 0 ? 1 : 0,
                            borderTopColor: colors.divider,
                          }}
                        >
                          <AppText weight="bold" style={{ fontSize: 15, marginBottom: 6, color: colors.textPrimary }}>
                            {topic.heading}
                          </AppText>
                          <AppText style={{ lineHeight: 22, fontSize: 13.5, color: colors.textSecondary, marginBottom: spacing.xs }}>
                            {topic.content}
                          </AppText>

                          {/* Formula callout */}
                          {topic.formula ? (
                            <View
                              style={{
                                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#F1F5F9',
                                borderRadius: 8,
                                padding: spacing.sm,
                                borderLeftWidth: 3,
                                borderLeftColor: colors.brandPrimary,
                                marginVertical: spacing.xs,
                              }}
                            >
                              <AppText weight="bold" variant="caption" tone="brand" style={{ marginBottom: 2 }}>
                                Mathematical Formulation:
                              </AppText>
                              <AppText
                                style={{
                                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                  fontSize: 12.5,
                                  lineHeight: 18,
                                  color: colors.textPrimary,
                                }}
                              >
                                {topic.formula}
                              </AppText>
                            </View>
                          ) : null}

                          {/* Code Snippet */}
                          {topic.codeSnippet ? (
                            <View
                              style={{
                                backgroundColor: '#0F172A',
                                borderRadius: 8,
                                padding: spacing.sm,
                                marginVertical: spacing.xs,
                              }}
                            >
                              <AppText weight="bold" variant="caption" style={{ color: '#94A3B8', marginBottom: 4 }}>
                                Algorithm / Code Implementation:
                              </AppText>
                              <AppText
                                style={{
                                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                  fontSize: 12,
                                  lineHeight: 18,
                                  color: '#38BDF8',
                                }}
                              >
                                {topic.codeSnippet}
                              </AppText>
                            </View>
                          ) : null}

                          {/* Key Points */}
                          {topic.keyPoints && topic.keyPoints.length > 0 ? (
                            <View
                              style={{
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                                borderRadius: 8,
                                padding: spacing.sm,
                                marginTop: spacing.xs,
                              }}
                            >
                              <AppText weight="bold" variant="caption" tone="secondary" style={{ marginBottom: 4 }}>
                                Key Takeaways:
                              </AppText>
                              {topic.keyPoints.map((kp, kIdx) => (
                                <View key={kIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 3 }}>
                                  <AppText tone="secondary" style={{ fontSize: 12 }}>•</AppText>
                                  <AppText variant="caption" tone="secondary" style={{ flex: 1, lineHeight: 17 }}>
                                    {kp}
                                  </AppText>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {/* 4. High-Yield Examination Takeaways */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderLeftWidth: 4,
                    borderLeftColor: '#F59E0B',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                    <Ionicons name="sparkles" size={20} color="#D97706" />
                    <AppText variant="h3" weight="bold" style={{ color: '#D97706' }}>
                      High-Yield Examination Takeaways
                    </AppText>
                  </View>
                  <View style={{ gap: 8, marginTop: spacing.xs }}>
                    {courseNotes.highYieldTakeaways.map((takeaway, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <AppText style={{ color: '#D97706', fontWeight: 'bold' }}>•</AppText>
                        <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 20 }}>
                          {takeaway}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 5. Past Examination Questions & Model Solutions */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Ionicons name="school-outline" size={20} color={colors.brandPrimary} />
                    <AppText variant="h3" weight="bold">
                      Past Examination Questions & Model Solutions
                    </AppText>
                  </View>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                    Curated past university examination problems with step-by-step model solutions and marking rubrics.
                  </AppText>

                  <View style={{ gap: spacing.md }}>
                    {courseNotes.pastQuestions.map((pq, pIdx) => (
                      <View
                        key={pIdx}
                        style={{
                          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
                          borderRadius: 12,
                          padding: spacing.md,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Badge label={`Question ${pq.questionNumber}`} tone="brand" />
                          <Badge label={pq.type} tone="neutral" />
                        </View>
                        <AppText weight="bold" style={{ fontSize: 13.5, lineHeight: 20, marginBottom: spacing.xs, color: colors.textPrimary }}>
                          {pq.question}
                        </AppText>

                        {pq.options && pq.options.length > 0 ? (
                          <View style={{ marginVertical: spacing.xs, gap: 4 }}>
                            {pq.options.map((opt, oIdx) => (
                              <View
                                key={oIdx}
                                style={{
                                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 6,
                                }}
                              >
                                <AppText variant="caption" tone="secondary" style={{ lineHeight: 16 }}>
                                  {opt}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        <View
                          style={{
                            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
                            borderRadius: 8,
                            padding: spacing.sm,
                            marginTop: spacing.xs,
                            borderLeftWidth: 3,
                            borderLeftColor: '#10B981',
                          }}
                        >
                          <AppText weight="bold" variant="caption" style={{ color: '#059669', marginBottom: 2 }}>
                            Model Solution & Marking Guide:
                          </AppText>
                          <AppText style={{ fontSize: 12.5, lineHeight: 18, color: isDark ? '#A7F3D0' : '#065F46' }}>
                            {pq.modelSolution}
                          </AppText>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 6. Recommended Textbooks & References */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
                    <Ionicons name="library-outline" size={20} color={colors.textSecondary} />
                    <AppText variant="h3" weight="bold">
                      Recommended Textbooks & References
                    </AppText>
                  </View>
                  <View style={{ gap: 6 }}>
                    {courseNotes.recommendedTextbooks.map((tb, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <Ionicons name="book-outline" size={14} color={colors.textSecondary} style={{ marginTop: 3 }} />
                        <AppText variant="bodySmall" tone="secondary" style={{ flex: 1, lineHeight: 20 }}>
                          {tb}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 7. Bottom Download Card */}
                <View
                  style={{
                    backgroundColor: colors.pastelPrimaryBg,
                    borderRadius: 16,
                    padding: spacing.lg,
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Ionicons name="cloud-download-outline" size={32} color={colors.brandPrimary} />
                  <AppText weight="bold" style={{ fontSize: 16, textAlign: 'center' }}>
                    Take These Lecture Notes Anywhere
                  </AppText>
                  <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', maxWidth: 360, lineHeight: 18 }}>
                    Download the complete formatted notes as an offline-readable file (.html / PDF) to study anytime without internet.
                  </AppText>
                  <View style={{ width: '100%', maxWidth: 280, marginTop: spacing.xs }}>
                    <AppButton
                      label={downloaded ? 'Downloaded To Device ✓' : 'Download Complete Notes'}
                      variant="primary"
                      loading={downloading}
                      onPress={handleDownload}
                    />
                  </View>
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
