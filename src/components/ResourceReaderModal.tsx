import React, { useMemo, useState } from 'react';
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
import { getCourseLectureNotes, generateCourseSlides } from '@/data/courseNotesRepository';
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
  const [viewMode, setViewMode] = useState<'document' | 'slides'>('document');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

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
  const slides = useMemo(() => generateCourseSlides(courseNotes), [courseNotes]);

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
              // Dual-Mode Reader: Paginated A4 Course Compendium & Lecture Slide Deck
              <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }}>
                {/* View Mode Format Switcher Bar */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 8,
                    paddingHorizontal: spacing.md,
                    backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={() => setViewMode('document')}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: viewMode === 'document' }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: viewMode === 'document' ? colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={15}
                      color={viewMode === 'document' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: viewMode === 'document' ? '#FFFFFF' : colors.textSecondary }}
                    >
                      A4 Course Compendium
                    </AppText>
                  </Pressable>

                  <Pressable
                    onPress={() => setViewMode('slides')}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: viewMode === 'slides' }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: viewMode === 'slides' ? colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Ionicons
                      name="easel-outline"
                      size={15}
                      color={viewMode === 'slides' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: viewMode === 'slides' ? '#FFFFFF' : colors.textSecondary }}
                    >
                      Lecture Slide Deck ({slides.length})
                    </AppText>
                  </Pressable>
                </View>

                {viewMode === 'slides' ? (
                  /* =========================================================================
                     MODE 1: INTERACTIVE 16:9 LECTURE SLIDE DECK (PowerPoint / Keynote Format)
                     ========================================================================= */
                  <View style={{ flex: 1, padding: spacing.md }}>
                    {/* Slide Navigation Top Controls */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Badge label={`Slide ${currentSlideIndex + 1} of ${slides.length}`} tone="brand" />
                        <Badge label={slides[currentSlideIndex]?.category || 'Lecture'} tone="neutral" />
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Pressable
                          onPress={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                          disabled={currentSlideIndex === 0}
                          accessibilityRole="button"
                          accessibilityLabel="Previous slide"
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              currentSlideIndex === 0 ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : colors.surface,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <AppText
                            variant="caption"
                            weight="bold"
                            style={{ color: currentSlideIndex === 0 ? colors.textSecondary : colors.textPrimary }}
                          >
                            ◀ Prev
                          </AppText>
                        </Pressable>

                        <Pressable
                          onPress={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                          disabled={currentSlideIndex === slides.length - 1}
                          accessibilityRole="button"
                          accessibilityLabel="Next slide"
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              currentSlideIndex === slides.length - 1 ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : colors.brandPrimary,
                          }}
                        >
                          <AppText
                            variant="caption"
                            weight="bold"
                            style={{ color: currentSlideIndex === slides.length - 1 ? colors.textSecondary : '#FFFFFF' }}
                          >
                            Next ▶
                          </AppText>
                        </Pressable>
                      </View>
                    </View>

                    {/* 16:9 Presentation Slide Canvas */}
                    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
                      <View
                        style={{
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          borderRadius: 16,
                          padding: spacing.xl,
                          borderWidth: 1,
                          borderColor: colors.border,
                          minHeight: 400,
                          justifyContent: 'space-between',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.15,
                          shadowRadius: 12,
                          elevation: 6,
                        }}
                      >
                        {/* Slide Top Metadata */}
                        <View>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottomWidth: 1,
                              borderBottomColor: colors.divider,
                              paddingBottom: 8,
                              marginBottom: spacing.md,
                            }}
                          >
                            <AppText
                              tone="secondary"
                              variant="caption"
                              weight="bold"
                              style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                            >
                              {resource.campusCode || 'UNIVERSITY'} • {courseNotes.courseCode}
                            </AppText>
                            <AppText tone="secondary" variant="caption">
                              {slides[currentSlideIndex]?.category}
                            </AppText>
                          </View>

                          {/* Slide Title */}
                          <AppText
                            variant={slides[currentSlideIndex]?.isTitleSlide ? 'h1' : 'h2'}
                            weight="bold"
                            style={{
                              marginBottom: spacing.xs,
                              color: colors.textPrimary,
                              textAlign: slides[currentSlideIndex]?.isTitleSlide ? 'center' : 'left',
                            }}
                          >
                            {slides[currentSlideIndex]?.title}
                          </AppText>

                          {/* Slide Subtitle (for title slide) */}
                          {slides[currentSlideIndex]?.subtitle ? (
                            <AppText
                              tone="secondary"
                              style={{
                                textAlign: 'center',
                                lineHeight: 22,
                                fontSize: 14,
                                marginTop: spacing.md,
                                marginBottom: spacing.lg,
                              }}
                            >
                              {slides[currentSlideIndex]?.subtitle}
                            </AppText>
                          ) : null}

                          {/* Slide Paragraph Content */}
                          {slides[currentSlideIndex]?.paragraph ? (
                            <AppText
                              style={{
                                lineHeight: 24,
                                fontSize: 14.5,
                                color: colors.textPrimary,
                                marginBottom: spacing.md,
                              }}
                            >
                              {slides[currentSlideIndex]?.paragraph}
                            </AppText>
                          ) : null}

                          {/* Slide Formula Callout */}
                          {slides[currentSlideIndex]?.formula ? (
                            <View
                              style={{
                                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : '#EFF6FF',
                                borderRadius: 8,
                                padding: spacing.md,
                                borderLeftWidth: 4,
                                borderLeftColor: colors.brandPrimary,
                                marginVertical: spacing.sm,
                              }}
                            >
                              <AppText weight="bold" variant="caption" tone="brand" style={{ marginBottom: 4 }}>
                                Mathematical Formulation / Governing Principle:
                              </AppText>
                              <AppText
                                style={{
                                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                  fontSize: 13,
                                  lineHeight: 20,
                                  color: colors.textPrimary,
                                }}
                              >
                                {slides[currentSlideIndex]?.formula}
                              </AppText>
                            </View>
                          ) : null}

                          {/* Slide Code Snippet */}
                          {slides[currentSlideIndex]?.codeSnippet ? (
                            <View
                              style={{
                                backgroundColor: '#0F172A',
                                borderRadius: 8,
                                padding: spacing.md,
                                marginVertical: spacing.sm,
                              }}
                            >
                              <AppText weight="bold" variant="caption" style={{ color: '#94A3B8', marginBottom: 6 }}>
                                Code / Algorithm Implementation:
                              </AppText>
                              <AppText
                                style={{
                                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                  fontSize: 12.5,
                                  lineHeight: 18,
                                  color: '#38BDF8',
                                }}
                              >
                                {slides[currentSlideIndex]?.codeSnippet}
                              </AppText>
                            </View>
                          ) : null}

                          {/* Slide Bullets */}
                          {slides[currentSlideIndex]?.bullets && slides[currentSlideIndex]?.bullets!.length > 0 ? (
                            <View style={{ gap: 8, marginVertical: spacing.xs }}>
                              {slides[currentSlideIndex]?.bullets!.map((b, bIdx) => (
                                <View key={bIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                  <View
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: 4,
                                      backgroundColor: colors.brandPrimary,
                                      marginTop: 7,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <AppText style={{ flex: 1, lineHeight: 22, fontSize: 14, color: colors.textPrimary }}>
                                    {b}
                                  </AppText>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>

                        {/* Slide Footer */}
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: colors.divider,
                            paddingTop: 10,
                            marginTop: spacing.lg,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <AppText tone="secondary" variant="caption">
                            {courseNotes.department} • {courseNotes.semester}
                          </AppText>
                          <AppText weight="bold" variant="caption" tone="brand">
                            Slide {currentSlideIndex + 1} of {slides.length}
                          </AppText>
                        </View>
                      </View>

                      {/* Speaker Notes / Exam Focus Callout */}
                      {slides[currentSlideIndex]?.speakerNotes ? (
                        <View
                          style={{
                            marginTop: spacing.md,
                            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                            borderRadius: 12,
                            padding: spacing.md,
                            borderLeftWidth: 3,
                            borderLeftColor: '#F59E0B',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="mic-outline" size={15} color="#D97706" />
                            <AppText weight="bold" variant="caption" style={{ color: '#D97706' }}>
                              Lecturer Speaker Notes / Exam Focus:
                            </AppText>
                          </View>
                          <AppText tone="secondary" variant="caption" style={{ lineHeight: 18 }}>
                            {slides[currentSlideIndex]?.speakerNotes}
                          </AppText>
                        </View>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : (
                  /* =========================================================================
                     MODE 2: PAGINATED A4 COURSE COMPENDIUM (Official Academic PDF Sheet Format)
                     ========================================================================= */
                  <ScrollView
                    contentContainerStyle={{
                      padding: spacing.md,
                      paddingBottom: Math.max(insets.bottom, spacing.xl),
                      alignItems: 'center',
                      gap: spacing.lg,
                    }}
                  >
                    {/* A4 Document Page Sheet */}
                    <View
                      style={{
                        width: '100%',
                        maxWidth: 820,
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                        borderRadius: 8,
                        padding: spacing.xl,
                        borderWidth: 1,
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 10,
                        elevation: 4,
                        gap: spacing.xl,
                      }}
                    >
                      {/* PAGE 1: OFFICIAL INSTITUTIONAL LETTERHEAD & TITLE BANNER */}
                      <View style={{ borderBottomWidth: 2, borderBottomColor: colors.brandPrimary, paddingBottom: spacing.lg }}>
                        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                          <AppText
                            weight="bold"
                            style={{
                              fontSize: 15,
                              letterSpacing: 1.2,
                              textTransform: 'uppercase',
                              textAlign: 'center',
                              color: colors.brandPrimary,
                            }}
                          >
                            {resource.campusCode === 'UNILAG'
                              ? 'UNIVERSITY OF LAGOS, AKOKA'
                              : resource.campusCode === 'UI'
                              ? 'UNIVERSITY OF IBADAN, IBADAN'
                              : 'FEDERAL UNIVERSITY OF AGRICULTURE, ABEOKUTA'}
                          </AppText>
                          <AppText
                            tone="secondary"
                            variant="caption"
                            weight="bold"
                            style={{ textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', marginTop: 2 }}
                          >
                            {courseNotes.facultyOrCollege} • DEPARTMENT OF {courseNotes.department.toUpperCase()}
                          </AppText>
                        </View>

                        <View
                          style={{
                            backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
                            borderRadius: 10,
                            padding: spacing.md,
                            borderWidth: 1,
                            borderColor: `${colors.brandPrimary}30`,
                            marginBottom: spacing.md,
                          }}
                        >
                          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                            <Badge label={courseNotes.courseCode} tone="brand" />
                            <Badge label={`${courseNotes.creditUnits} Units`} tone="neutral" />
                            <Badge label={courseNotes.level} tone="neutral" />
                            <Badge label={courseNotes.semester} tone="neutral" />
                          </View>
                          <AppText variant="h2" weight="bold" style={{ color: colors.textPrimary, marginBottom: 4 }}>
                            {courseNotes.courseTitle}
                          </AppText>
                          <AppText tone="secondary" variant="caption">
                            Curriculum Academic Compendium & Comprehensive Course Pack • 2025/2026 Session
                          </AppText>
                        </View>

                        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                          <View style={{ flex: 1, minWidth: 160 }}>
                            <AppButton
                              label={downloaded ? 'Downloaded ✓' : 'Download Complete Notes (.html / PDF)'}
                              variant="primary"
                              size="sm"
                              loading={downloading}
                              onPress={handleDownload}
                            />
                          </View>
                          {resource.fileUrl && !isDirectPdf && (
                            <View style={{ flex: 1, minWidth: 160 }}>
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

                      {/* SECTION 1.0: COURSE SYLLABUS & INTENDED LEARNING OUTCOMES */}
                      <View>
                        <AppText
                          weight="bold"
                          style={{
                            fontSize: 16,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            color: colors.brandPrimary,
                            marginBottom: spacing.sm,
                          }}
                        >
                          Section 1.0: Course Syllabus & Intended Learning Outcomes
                        </AppText>
                        <AppText style={{ lineHeight: 24, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.md }}>
                          {courseNotes.overview}
                        </AppText>

                        <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
                          Intended Learning Outcomes (NUC BMAS / CCMAS Benchmark):
                        </AppText>
                        <View style={{ gap: 8 }}>
                          {courseNotes.learningOutcomes.map((lo, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                              <AppText weight="bold" tone="brand" variant="bodySmall" style={{ marginTop: 1 }}>
                                1.{i + 1}
                              </AppText>
                              <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 20, color: colors.textPrimary }}>
                                {lo}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      </View>

                      {/* SECTIONS 2.0 TO 5.0: MULTI-MODULE COMPREHENSIVE LECTURE CHAPTERS */}
                      {courseNotes.modules.map((mod, mIdx) => (
                        <View
                          key={mod.number}
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: colors.divider,
                            paddingTop: spacing.lg,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                            <AppText
                              weight="bold"
                              style={{
                                fontSize: 16,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                color: colors.brandPrimary,
                              }}
                            >
                              Section {mIdx + 2}.0: Module {mod.number} — {mod.title}
                            </AppText>
                          </View>
                          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md, lineHeight: 22 }}>
                            {mod.summary}
                          </AppText>

                          {/* Module Topics */}
                          <View style={{ gap: spacing.lg }}>
                            {mod.topics.map((topic, tIdx) => (
                              <View key={tIdx} style={{ gap: 6 }}>
                                <AppText weight="bold" style={{ fontSize: 15, color: colors.textPrimary }}>
                                  {mIdx + 2}.{tIdx + 1} {topic.heading}
                                </AppText>
                                <AppText style={{ lineHeight: 24, fontSize: 14, color: colors.textPrimary }}>
                                  {topic.content}
                                </AppText>

                                {/* Formula block */}
                                {topic.formula ? (
                                  <View
                                    style={{
                                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#F1F5F9',
                                      borderRadius: 8,
                                      padding: spacing.md,
                                      borderLeftWidth: 3,
                                      borderLeftColor: colors.brandPrimary,
                                      marginVertical: spacing.xs,
                                    }}
                                  >
                                    <AppText weight="bold" variant="caption" tone="brand" style={{ marginBottom: 2 }}>
                                      Equation ({mIdx + 2}.{tIdx + 1}):
                                    </AppText>
                                    <AppText
                                      style={{
                                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                        fontSize: 13,
                                        lineHeight: 20,
                                        color: colors.textPrimary,
                                      }}
                                    >
                                      {topic.formula}
                                    </AppText>
                                  </View>
                                ) : null}

                                {/* Code Implementation */}
                                {topic.codeSnippet ? (
                                  <View
                                    style={{
                                      backgroundColor: '#0F172A',
                                      borderRadius: 8,
                                      padding: spacing.md,
                                      marginVertical: spacing.xs,
                                    }}
                                  >
                                    <AppText weight="bold" variant="caption" style={{ color: '#94A3B8', marginBottom: 4 }}>
                                      Listing {mIdx + 2}.{tIdx + 1}: Algorithm Implementation
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

                                {/* Key Takeaways */}
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
                                      Core Principles:
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

                      {/* SECTION 6.0: HIGH-YIELD EXAMINATION REVISION DIGEST */}
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.divider,
                          paddingTop: spacing.lg,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
                          <Ionicons name="sparkles" size={18} color="#D97706" />
                          <AppText
                            weight="bold"
                            style={{
                              fontSize: 16,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              color: '#D97706',
                            }}
                          >
                            Section 6.0: High-Yield Examination Revision Digest
                          </AppText>
                        </View>
                        <View style={{ gap: 8, marginTop: spacing.xs }}>
                          {courseNotes.highYieldTakeaways.map((takeaway, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                              <AppText style={{ color: '#D97706', fontWeight: 'bold' }}>•</AppText>
                              <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 22, color: colors.textPrimary }}>
                                {takeaway}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      </View>

                      {/* SECTION 7.0: PAST EXAMINATION PAPERS & MODEL MARKING SCHEMES */}
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.divider,
                          paddingTop: spacing.lg,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Ionicons name="school-outline" size={18} color={colors.brandPrimary} />
                          <AppText
                            weight="bold"
                            style={{
                              fontSize: 16,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              color: colors.brandPrimary,
                            }}
                          >
                            Section 7.0: Past Examination Questions & Model Solutions
                          </AppText>
                        </View>
                        <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                          Authentic past university examination problems with step-by-step model solutions and marking rubrics.
                        </AppText>

                        <View style={{ gap: spacing.md }}>
                          {courseNotes.pastQuestions.map((pq, pIdx) => (
                            <View
                              key={pIdx}
                              style={{
                                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
                                borderRadius: 10,
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

                      {/* SECTION 8.0: PRESCRIBED TEXTBOOKS & REFERENCES */}
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.divider,
                          paddingTop: spacing.lg,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
                          <Ionicons name="library-outline" size={18} color={colors.textSecondary} />
                          <AppText
                            weight="bold"
                            style={{
                              fontSize: 16,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              color: colors.textPrimary,
                            }}
                          >
                            Section 8.0: Recommended Textbooks & Literature
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

                      {/* DOCUMENT RUNNING FOOTER */}
                      <View
                        style={{
                          borderTopWidth: 2,
                          borderTopColor: colors.border,
                          paddingTop: spacing.md,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 6,
                        }}
                      >
                        <AppText tone="secondary" variant="caption">
                          Lioris Campus Academic Engine • Verified for FUNAAB, UNILAG, and UI
                        </AppText>
                        <AppText weight="bold" variant="caption" tone="brand">
                          NUC BMAS/CCMAS Curriculum Compliant
                        </AppText>
                      </View>
                    </View>

                    {/* Bottom Action Card */}
                    <View
                      style={{
                        width: '100%',
                        maxWidth: 820,
                        backgroundColor: colors.pastelPrimaryBg,
                        borderRadius: 16,
                        padding: spacing.lg,
                        alignItems: 'center',
                        gap: spacing.sm,
                      }}
                    >
                      <Ionicons name="cloud-download-outline" size={32} color={colors.brandPrimary} />
                      <AppText weight="bold" style={{ fontSize: 16, textAlign: 'center' }}>
                        Take This Course Compendium Anywhere
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
