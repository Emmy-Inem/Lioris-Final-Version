import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
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
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import {
  ResearchPaper,
  searchResearchPapers,
  formatApaCitation,
  formatBibtexCitation,
} from '@/api/academicResearch';

interface ResearchPapersModalProps {
  visible: boolean;
  onClose: () => void;
  initialTopic?: string;
}

const RESEARCH_TOPICS = [
  'All',
  'Artificial Intelligence',
  'Distributed Systems',
  'Medicine & Health',
  'Renewable Energy',
  'African Economics',
  'Law & Governance',
];

export function ResearchPapersModal({
  visible,
  onClose,
  initialTopic = '',
}: ResearchPapersModalProps) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [query, setQuery] = useState(initialTopic);
  const [activeTopic, setActiveTopic] = useState('All');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      handleSearch(initialTopic || (activeTopic === 'All' ? 'machine learning' : activeTopic));
    }
  }, [visible]);

  async function handleSearch(term: string) {
    const q = term.trim();
    setLoading(true);
    try {
      const results = await searchResearchPapers(q || 'computer science', 12);
      setPapers(results);
    } catch {
      toast.warning('Unable to fetch live papers; using benchmark catalog');
    } finally {
      setLoading(false);
    }
  }

  function handleTopicSelect(topic: string) {
    setActiveTopic(topic);
    const q = topic === 'All' ? query || 'computer science' : topic;
    handleSearch(q);
  }

  async function handleCopyCitation(paper: ResearchPaper) {
    haptics.light();
    const apa = formatApaCitation(paper);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(apa);
        toast.success('Copied APA 7th citation to clipboard!');
        return;
      } catch {
        // fallback
      }
    }
    toast.success('APA Citation: ' + apa.slice(0, 60) + '...');
  }

  function handleOpenPaper(paper: ResearchPaper) {
    const targetUrl = paper.openAccessPdfUrl || paper.semanticScholarUrl;
    if (targetUrl) {
      openExternalUrl(targetUrl).then((opened) => {
        if (!opened) toast.warning('Unable to open publication URL');
      });
    } else {
      toast.info('Direct PDF not available for this venue');
    }
  }


  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.overlay,
          {
            paddingTop: isDesktop ? 12 : Math.max(insets.top, 12),
            paddingBottom: isDesktop ? 12 : Math.max(insets.bottom, 12),
            paddingHorizontal: isDesktop ? 12 : 8,
          },
        ]}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 760 : '100%',
              maxWidth: 760,
              maxHeight: isDesktop ? '90%' : '96%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="school" size={20} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold">
                  Research & Thesis Hub
                </AppText>
                <Badge label="250M+ Papers" tone="neutral" />
              </View>
              <AppText variant="caption" tone="secondary">
                Semantic Scholar & OpenAlex peer-reviewed academic papers & APA citation engine
              </AppText>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: `${colors.textSecondary}15` }]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput accessibilityLabel="Search topics, author, DOI, or thesis keywords"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleSearch(query)}
                placeholder="Search topics, author, DOI, or thesis keywords..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.textPrimary }]}
              />
              {query.length > 0 && (
                <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={12}
                onPress={() => setQuery('')}
              >
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              )}
              <Pressable
                onPress={() => handleSearch(query)}
                disabled={loading}
                style={[styles.searchBtn, { backgroundColor: colors.brandPrimary }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <AppText variant="caption" weight="bold" style={{ color: '#ffffff' }}>
                    Search
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>

          {/* Topics Carousel */}
          <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {RESEARCH_TOPICS.map((topic) => {
                const isSelected = activeTopic === topic;
                return (
                  <Pressable
                    key={topic}
                    onPress={() => handleTopicSelect(topic)}
                    style={[
                      styles.filterChip,
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
                      {topic}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Papers ScrollView */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
            {loading && papers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator size="large" color={colors.brandPrimary} />
                <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 8 }}>
                  Querying Semantic Scholar & OpenAlex academic graphs...
                </AppText>
              </View>
            ) : papers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="document-text-outline" size={36} color={colors.textSecondary} />
                <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 8 }}>
                  No research papers found for "{query}".
                </AppText>
              </View>
            ) : (
              papers.map((paper) => {
                const isExpanded = expandedId === paper.id;
                const authorDisplay =
                  paper.authors.length > 2
                    ? `${paper.authors.slice(0, 2).join(', ')} et al.`
                    : paper.authors.join(', ');

                return (
                  <SolidCard
                    key={paper.id}
                    radius={14}
                    style={{
                      padding: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    {/* Title & Citations */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="bodySmall" weight="bold" style={{ fontSize: 14, lineHeight: 20 }}>
                          {paper.title}
                        </AppText>
                      </View>
                      {paper.citationCount > 0 && (
                        <Badge
                          label={`${paper.citationCount >= 1000 ? (paper.citationCount / 1000).toFixed(1) + 'k' : paper.citationCount} citations`}
                          tone="neutral"
                        />
                      )}
                    </View>

                    {/* Metadata Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <AppText variant="caption" tone="secondary" weight="medium">
                        {authorDisplay} • {paper.year}
                      </AppText>
                      {paper.venue && (
                        <AppText variant="caption" tone="secondary" style={{ fontStyle: 'italic' }}>
                          ({paper.venue})
                        </AppText>
                      )}
                      {paper.openAccessPdfUrl && (
                        <Badge label="Open Access PDF" tone="success" />
                      )}
                    </View>

                    {/* Abstract Preview */}
                    <Pressable
                      onPress={() => setExpandedId(isExpanded ? null : paper.id)}
                      style={{ marginTop: 6 }}
                    >
                      {/* The only clamp kept in this file: a long abstract in a dense list row.
                          The full text is one tap away on this same Pressable. */}
                      <AppText
                        variant="caption"
                        tone="secondary"
                        numberOfLines={isExpanded ? undefined : 3}
                        style={{ lineHeight: 18 }}
                      >
                        {paper.abstract}
                      </AppText>
                      <AppText variant="caption" tone="primary" weight="bold" style={{ marginTop: 4, fontSize: 11 }}>
                        {isExpanded ? 'Show less' : 'Read the full abstract'}
                      </AppText>
                    </Pressable>

                    {/* Action Buttons Bar */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: colors.divider,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Pressable
                        onPress={() => handleCopyCitation(paper)}
                        style={[styles.smallActionBtn, { backgroundColor: colors.divider }]}
                      >
                        <Ionicons name="copy-outline" size={13} color={colors.textSecondary} />
                        <AppText variant="caption" weight="bold" style={{ color: colors.textPrimary, fontSize: 11 }}>
                          Copy APA
                        </AppText>
                      </Pressable>


                      <Pressable
                        onPress={() => handleOpenPaper(paper)}
                        style={[styles.smallActionBtn, { backgroundColor: colors.brandPrimary }]}
                      >
                        <Ionicons name="open-outline" size={13} color="#ffffff" />
                        <AppText variant="caption" weight="bold" style={{ color: '#ffffff', fontSize: 11 }}>
                          {paper.openAccessPdfUrl ? 'Open PDF ↗' : 'View Paper ↗'}
                        </AppText>
                      </Pressable>
                    </View>
                  </SolidCard>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  modalContainer: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 4,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  searchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
});
