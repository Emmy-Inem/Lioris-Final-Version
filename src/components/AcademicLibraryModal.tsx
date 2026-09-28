import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
import {
  searchAcademicLibrary,
  getCuratedLibraryCatalog,
  AcademicBook,
} from '@/api/academicLibrary';

interface AcademicLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const SUBJECT_FILTERS = [
  'All',
  'Computer Science',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Medicine & Health',
  'Engineering',
  'Economics & Business',
  'Law',
  'Social Sciences',
];

export function AcademicLibraryModal({
  visible,
  onClose,
  initialQuery = '',
}: AcademicLibraryModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { isFeatureEnabled } = useFeatureFlags();
  const toast = useToast();

  const [query, setQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState('All');
  const [books, setBooks] = useState<AcademicBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedBookIds, setSavedBookIds] = useState<Set<string>>(new Set());

  const isEnabled = isFeatureEnabled('global_library');

  useEffect(() => {
    if (visible && isEnabled) {
      handleSearch(initialQuery || (activeFilter === 'All' ? '' : activeFilter));
    }
  }, [visible, isEnabled]);

  if (!isEnabled) return null;

  async function handleSearch(searchTerm: string) {
    setLoading(true);
    try {
      const results = await searchAcademicLibrary(searchTerm, 20);
      setBooks(results);
    } catch (err: any) {
      toast.warning('Using verified offline catalog (network sync delayed)');
      setBooks(getCuratedLibraryCatalog());
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSelect(subject: string) {
    setActiveFilter(subject);
    const q = subject === 'All' ? query || '' : subject;
    handleSearch(q);
  }

  function toggleSaveBook(book: AcademicBook) {
    setSavedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(book.id)) {
        next.delete(book.id);
        toast.info(`Removed "${book.title}" from your study list`);
      } else {
        next.add(book.id);
        toast.success(`Saved "${book.title}" to your study list!`);
      }
      return next;
    });
  }

  function openBookLink(book: AcademicBook) {
    const targetUrl = book.openAccessUrl || book.openLibraryUrl;
    if (targetUrl) {
      openExternalUrl(targetUrl).then((opened) => {
        if (!opened) toast.warning('Could not open publication link');
      });
    } else {
      toast.info('No external direct link available for this record');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.overlay,
          {
            paddingTop: isDesktop ? 16 : Math.max(insets.top, 12),
            paddingBottom: isDesktop ? 16 : Math.max(insets.bottom, 12),
            paddingHorizontal: isDesktop ? 16 : 8,
          },
        ]}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 680 : '100%',
              maxWidth: 680,
              maxHeight: isDesktop ? '90%' : '96%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Ionicons name="library" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Global Academic Library
                </AppText>
                <Badge label="OPEN ACCESS" tone="success" />
              </View>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Verified open-access college textbooks, monographs & research
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: `${colors.textSecondary}15` }]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Search Input Bar */}
          <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              accessibilityLabel="Search textbook title, author, or subject"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearch(query)}
              placeholder="Search textbook title, author, or subject..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {query.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => {
                  setQuery('');
                  handleSearch('');
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Subject Filter Pills */}
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {SUBJECT_FILTERS.map((filter) => {
                const isSelected = activeFilter === filter;
                return (
                  <Pressable
                    key={filter}
                    onPress={() => handleFilterSelect(filter)}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: isSelected ? colors.brandPrimary : `${colors.border}40`,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={isSelected ? 'bold' : 'regular'}
                      style={{ color: isSelected ? '#ffffff' : colors.textSecondary }}
                    >
                      {filter}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Quality & Access Guarantee Pill */}
          <View style={[styles.guaranteeBanner, { backgroundColor: `${colors.brandPrimary}10`, borderColor: `${colors.brandPrimary}25` }]}>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.brandPrimary} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1, fontSize: 11, lineHeight: 15 }}>
              1,000,000+ verified open-access books & textbooks from Open Library Public Scans, Project Gutenberg, and OpenStax. Zero waitlists, loans, or paywalls.
            </AppText>
          </View>

          {/* Results List */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                Searching Open Library, Project Gutenberg & OpenStax catalogs...
              </AppText>
            </View>
          ) : books.length === 0 ? (
            <View style={styles.centerLoading}>
              <Ionicons name="book-outline" size={40} color={colors.textSecondary} />
              <AppText variant="bodySmall" weight="bold" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                No open-access books found for "{query}"
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ textAlign: 'center', marginTop: 4, paddingHorizontal: 20 }}>
                Try searching with another academic term, or browse our curated college textbooks.
              </AppText>
              <Pressable
                onPress={() => {
                  setQuery('');
                  setActiveFilter('All');
                  handleSearch('');
                }}
                style={[styles.resetSearchBtn, { backgroundColor: colors.brandPrimary }]}
              >
                <AppText variant="caption" weight="bold" style={{ color: '#ffffff' }}>
                  Browse All Curated Textbooks
                </AppText>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 8, gap: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {books.map((book) => {
                const isSaved = savedBookIds.has(book.id);
                return (
                  <SolidCard
                    key={book.id}
                    radius={14}
                    style={[styles.bookCard, { borderColor: colors.border }]}
                  >
                    <View style={styles.bookCardInner}>
                      {/* Cover Thumbnail */}
                      <View style={[styles.coverContainer, { backgroundColor: `${colors.border}40` }]}>
                        {book.coverUrl ? (
                          <Image source={{ uri: book.coverUrl }} style={styles.coverImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.placeholderCover}>
                            <Ionicons name="book-outline" size={24} color={colors.brandPrimary} />
                            <AppText variant="caption" style={{ fontSize: 9, color: colors.textSecondary, textAlign: 'center', marginTop: 2 }} numberOfLines={1}>
                              {book.source}
                            </AppText>
                          </View>
                        )}
                      </View>

                      {/* Details */}
                      <View style={styles.bookInfo}>
                        <AppText variant="bodySmall" weight="bold" numberOfLines={2}>
                          {book.title}
                        </AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
                          {book.authors.join(', ')} {book.firstPublishYear ? `(${book.firstPublishYear})` : ''}
                        </AppText>

                        {/* Badges / Subject Tags */}
                        <View style={styles.tagRow}>
                          <Badge
                            label={book.source}
                            tone={
                              book.source === 'Open Library'
                                ? 'brand'
                                : book.source === 'Project Gutenberg'
                                ? 'accent'
                                : book.source === 'OpenStax'
                                ? 'brand'
                                : 'success'
                            }
                          />
                          {book.pdfUrl && <Badge label="PDF" tone="success" />}
                          {book.epubUrl && <Badge label="EPUB" tone="brand" />}
                          {book.license && <Badge label={book.license} tone="neutral" />}
                        </View>

                        {/* Actions */}
                        <View style={styles.actionRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                            {book.pdfUrl && (
                              <AppButton
                                label="PDF ↗"
                                size="sm"
                                variant="secondary"
                                onPress={() => openExternalUrl(book.pdfUrl!)}
                              />
                            )}
                            {book.epubUrl && (
                              <AppButton
                                label="EPUB ↗"
                                size="sm"
                                variant="secondary"
                                onPress={() => openExternalUrl(book.epubUrl!)}
                              />
                            )}
                            <AppButton
                              label="Read ↗"
                              size="sm"
                              variant={book.pdfUrl || book.epubUrl ? 'ghost' : 'secondary'}
                              onPress={() => openBookLink(book)}
                            />
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={isSaved ? 'Remove from saved books' : 'Save book'}
                            onPress={() => toggleSaveBook(book)}
                            hitSlop={8}
                            style={[
                              styles.saveBtn,
                              { backgroundColor: isSaved ? `${colors.brandPrimary}20` : 'transparent' },
                            ]}
                          >
                            <Ionicons
                              name={isSaved ? 'bookmark' : 'bookmark-outline'}
                              size={18}
                              color={isSaved ? colors.brandPrimary : colors.textSecondary}
                            />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </SolidCard>
                );
              })}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    height: '100%',
  },
  filterRow: {
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  bookCard: {
    padding: 12,
    borderWidth: 1,
  },
  bookCardInner: {
    flexDirection: 'row',
    gap: 12,
  },
  coverContainer: {
    width: 60,
    height: 85,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  bookInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  saveBtn: {
    padding: 6,
    borderRadius: 8,
  },
  guaranteeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  placeholderCover: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  resetSearchBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
