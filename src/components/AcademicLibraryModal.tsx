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
  Linking,
} from 'react-native';
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
  'Engineering',
  'Medicine',
  'Law',
  'Mathematics',
  'Economics',
];

export function AcademicLibraryModal({
  visible,
  onClose,
  initialQuery = '',
}: AcademicLibraryModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
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
      handleSearch(initialQuery || (activeFilter === 'All' ? 'computer science' : activeFilter));
    }
  }, [visible, isEnabled]);

  if (!isEnabled) return null;

  async function handleSearch(searchTerm: string) {
    setLoading(true);
    try {
      const results = await searchAcademicLibrary(searchTerm, 15);
      setBooks(results);
    } catch (err: any) {
      toast.warning('Using curated catalog (Open Library network sync offline)');
      setBooks(getCuratedLibraryCatalog());
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSelect(subject: string) {
    setActiveFilter(subject);
    const q = subject === 'All' ? query || 'science' : subject;
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
    if (book.openLibraryUrl) {
      Linking.openURL(book.openLibraryUrl).catch(() => {
        toast.warning('Could not open publication link');
      });
    } else {
      toast.info('No external direct link available for this record');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 680 : '94%',
              maxHeight: isDesktop ? '88%' : '92%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="library" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Global Academic Library
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                Open-access textbooks, research papers & university references
              </AppText>
            </View>
            <Pressable
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
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearch(query)}
              placeholder="Search textbook title, author, or ISBN..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
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

          {/* Results List */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                Querying Open Library global catalog...
              </AppText>
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
                          <Ionicons name="book-outline" size={24} color={colors.textSecondary} />
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
                          <Badge label={book.source} tone="brand" />
                          {book.hasFulltext && <Badge label="FULL TEXT" tone="success" />}
                        </View>

                        {/* Actions */}
                        <View style={styles.actionRow}>
                          {book.openLibraryUrl && (
                            <AppButton
                              label="Read / View"
                              size="sm"
                              variant="ghost"
                              onPress={() => openBookLink(book)}
                            />
                          )}
                          <Pressable
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
      </View>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
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
});
