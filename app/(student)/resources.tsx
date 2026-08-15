import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { ResourceCard } from '@/components/ResourceCard';
import { ShareAcademicFileModal } from '@/components/ShareAcademicFileModal';
import { LibraryFilterModal, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from '@/components/LibraryFilterModal';
import { useTheme } from '@/theme/ThemeProvider';
import { listResources, createResource } from '@/api/resources';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const PORTAL_SHORTCUTS = [
  { icon: 'open-outline' as const, label: 'UI Portal login' },
  { icon: 'trending-up-outline' as const, label: 'TIMETABLE 2026' },
  { icon: 'desktop-outline' as const, label: 'E-Portal Console' },
];

const RESOURCE_TYPE_MAP: Record<string, 'Notes' | 'Past Questions' | 'Projects' | undefined> = {
  Notes: 'Notes',
  'Past Questions': 'Past Questions',
  Projects: 'Projects',
};

export default function ResourcesScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);

  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources', debouncedQuery, filters],
    queryFn: () =>
      listResources({
        q: debouncedQuery || undefined,
        category: RESOURCE_TYPE_MAP[filters.resourceType],
        department: filters.department === 'All Depts' ? undefined : filters.department,
      }),
  });

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== DEFAULT_LIBRARY_FILTERS[key as keyof LibraryFilters]).length;

  async function handleUpload(payload: { title: string; courseCode: string; description: string; category: 'Notes' | 'Past Questions' | 'Projects' }) {
    await createResource(payload);
    queryClient.invalidateQueries({ queryKey: ['resources'] });
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      <AppText variant="h2" weight="bold" style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
        Portal Shortcuts 🌐
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, marginBottom: spacing.xl }}>
        {PORTAL_SHORTCUTS.map((shortcut) => (
          <SolidCard key={shortcut.label} backgroundColor={colors.pastelPrimaryBg} radius={16} style={{ width: 130 }}>
            <Ionicons name={shortcut.icon} size={20} color={colors.brandPrimary} style={{ marginBottom: spacing.md }} />
            <AppText weight="semiBold" variant="bodySmall">
              {shortcut.label}
            </AppText>
          </SolidCard>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <AppText variant="h2" weight="bold">
          Academic Resources 📚
        </AppText>
        <Pressable
          onPress={() => setUploadModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Upload resource"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.brandPrimary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
          <AppText weight="bold" tone="inverse" variant="bodySmall">
            Upload
          </AppText>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
        <Ionicons name="search" size={14} color={colors.brandPrimary} />
        <AppText variant="bodySmall" weight="semiBold" tone="secondary">
          Specific Library Keyword Search
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1.5,
            borderColor: colors.brandPrimary,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            justifyContent: 'center',
            height: 56,
          }}
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by keywords... (e.g. Calculus, CSC 301)"
            placeholderTextColor={colors.textSecondary}
            style={{ color: colors.textPrimary, fontSize: 13 }}
          />
        </View>
        <Pressable
          onPress={() => setFilterModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: colors.lavenderBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="options-outline" size={20} color={colors.lavenderText} />
          {activeFilterCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.critical,
              }}
            />
          ) : null}
        </Pressable>
      </View>

      <FlatList
        data={resources ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ResourceCard resource={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.mintBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="book" size={28} color={colors.brandPrimary} />
              </View>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                No educational files matched
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                Clear search parameters or help classmates by uploading your own notes.
              </AppText>
            </View>
          ) : null
        }
      />
      <ShareAcademicFileModal visible={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={handleUpload} />
      <LibraryFilterModal visible={filterModalOpen} onClose={() => setFilterModalOpen(false)} filters={filters} onApply={setFilters} />
    </ScreenContainer>
  );
}
