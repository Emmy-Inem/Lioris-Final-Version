import React, { useState } from'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, TextInput, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { ResourceCard } from'@/components/ResourceCard';
import { ShareAcademicFileModal } from'@/components/ShareAcademicFileModal';
import { LibraryFilterModal, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from'@/components/LibraryFilterModal';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { listResources, createResource } from'@/api/resources';
import { useDebouncedValue } from'@/hooks/useDebouncedValue';
import { ManageResourcesModal } from'@/components/admin/ManageResourcesModal';

const CAMPUS_PORTAL_DIRECTORIES = [
  {
    id: 'portal-1',
    name: 'Student Academic Portal',
    badge: 'Official',
    icon: 'school-outline'as const,
    url: 'https://portal.university.edu/student',
    desc: 'Check course registration, semester GPA, and tuition receipt records.',
  },
  {
    id: 'portal-2',
    name: '2026 Academic Calendar',
    badge: 'Senate',
    icon: 'calendar-outline'as const,
    url: 'https://portal.university.edu/calendar-2026',
    desc: 'Official semester lecture routines, matriculation & Senate exam dates.',
  },
  {
    id: 'portal-3',
    name: 'E-Library & JSTOR Hub',
    badge: 'Research',
    icon: 'library-outline'as const,
    url: 'https://elibrary.university.edu/jstor',
    desc: 'Access verified peer-reviewed academic journals, e-books & past theses.',
  },
  {
    id: 'portal-4',
    name: 'Campus LMS & E-Classroom',
    badge: 'Lectures',
    icon: 'laptop-outline'as const,
    url: 'https://lms.university.edu/courses',
    desc: 'Submit weekly assignments, view faculty slides & join live lecture rooms.',
  },
  {
    id: 'portal-5',
    name: 'Hostel Allocation & Bedspace',
    badge: 'Housing',
    icon: 'home-outline'as const,
    url: 'https://hostels.university.edu/apply',
    desc: 'Apply for on-campus student halls, bedspace ballot & room clearances.',
  },
  {
    id: 'portal-6',
    name: 'University Health Center',
    badge: 'Clinic',
    icon: 'medkit-outline'as const,
    url: 'https://health.university.edu/appointments',
    desc: 'Book campus doctor appointments, medical clearance & clinic passes.',
  },
];

const RESOURCE_CATEGORIES = [
  { id: 'all', label: 'All Files', filter: 'All Types' },
  { id: 'past_questions', label: 'Past Questions', filter: 'Past Questions' },
  { id: 'notes', label: 'Course Notes', filter: 'Notes' },
  { id: 'projects', label: 'Projects & Code', filter: 'Projects' },
];

export default function ResourcesScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [adminManageOpen, setAdminManageOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);

  const { data: resources, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['resources', debouncedQuery, filters],
    queryFn: () =>
      listResources({
        q: debouncedQuery || undefined,
        category: filters.resourceType === 'All Types' ? undefined : (filters.resourceType as any),
        department: filters.department === 'All Depts' ? undefined : filters.department,
      }),
  });

  async function handleUpload(payload: {
    title: string;
    courseCode: string;
    description: string;
    category: 'Notes' | 'Past Questions' | 'Projects';
    fileBlob?: Blob;
    fileSize?: string;
    fileType?: 'PDF' | 'ZIP' | 'EPUB';
  }) {
    const { fileBlob, ...rest } = payload;
    await createResource(rest, fileBlob);
    queryClient.invalidateQueries({ queryKey: ['resources'] });
  }

  function handleLaunchPortal(portal: (typeof CAMPUS_PORTAL_DIRECTORIES)[0]) {
    Alert.alert(
      'Launch Campus Portal',
      `Opening ${portal.name} (${portal.url}). Continue in browser?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Portal ↗',
          onPress: () => {
            Linking.openURL(portal.url).catch(() => {
              Alert.alert('Portal Link Copied', `${portal.url} copied to clipboard.`);
            });
          },
        },
      ],
    );
  }

  const renderHeader = () => (
    <View style={{ marginBottom: spacing.md }}>
      <AppHeader />

      {/* Screen Title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1"weight="bold">
            Campus Resources
          </AppText>
          <AppText tone="secondary"variant="bodySmall">
            University portal directories, past questions & study notes
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
          {(user?.role === 'admin' || user?.role === 'staff') && (
            <Pressable
              onPress={() => setAdminManageOpen(true)}
              accessibilityRole="button"accessibilityLabel="Admin manage library"style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.pastelPrimaryBg,
                borderColor: `${colors.brandPrimary}40`,
                borderWidth: 1,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm,
                paddingVertical: 7,
              }}
            >
              <Ionicons name="settings-outline"size={15} color={colors.brandPrimary} />
              <AppText weight="bold"tone="brand"variant="caption">
                Manage
              </AppText>
            </Pressable>
          )}

          <Pressable
            onPress={() => setUploadModalOpen(true)}
            accessibilityRole="button"accessibilityLabel="Upload resource"style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.brandPrimary,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="cloud-upload-outline"size={16} color="#FFFFFF" />
            <AppText weight="bold"tone="inverse"variant="caption">
              Upload
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Section 1: University Portal Directories */}
      <View style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
          <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1 }}>
            DIRECTORIES & PORTAL SHORTCUTS 
          </AppText>
          <AppText tone="secondary"variant="caption">
            {CAMPUS_PORTAL_DIRECTORIES.length} active links
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        >
          {CAMPUS_PORTAL_DIRECTORIES.map((portal) => (
            <Pressable
              key={portal.id}
              onPress={() => handleLaunchPortal(portal)}
              accessibilityRole="button"accessibilityLabel={`Launch ${portal.name}`}
            >
              <SolidCard
                radius={20}
                backgroundColor={colors.surface}
                style={{
                  width: 220,
                  height: 145,
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.pastelPrimaryBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={portal.icon} size={18} color={colors.brandPrimary} />
                  </View>
                  <Badge label={portal.badge} tone="accent" />
                </View>

                <View>
                  <AppText weight="bold"variant="bodySmall"numberOfLines={1}>
                    {portal.name}
                  </AppText>
                  <AppText tone="secondary"variant="caption"numberOfLines={2} style={{ marginTop: 2, fontSize: 11, lineHeight: 14 }}>
                    {portal.desc}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppText weight="bold"variant="caption"tone="brand"style={{ fontSize: 11 }}>
                    Launch Portal
                  </AppText>
                  <Ionicons name="open-outline"size={12} color={colors.brandPrimary} />
                </View>
              </SolidCard>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Section 2: Academic Repository Header & Filters */}
      <View style={{ marginBottom: spacing.xs }}>
        <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
          ACADEMIC REPOSITORY & STUDY FILES 
        </AppText>

        {/* Search Bar Pill & Department Filter Button */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              height: 42,
            }}
          >
            <Ionicons name="search"size={16} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search course code, notes, topics..."placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle"size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setFilterModalOpen(true)}
            accessibilityRole="button"accessibilityLabel="Filter resources"style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.pastelPrimaryBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.brandPrimary,
            }}
          >
            <Ionicons name="options"size={18} color={colors.brandPrimary} />
          </Pressable>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.xs }}
        >
          {RESOURCE_CATEGORIES.map((c) => {
            const selected = filters.resourceType === c.filter;
            return (
              <Pressable
                key={c.id}
                onPress={() => setFilters((prev) => ({ ...prev, resourceType: c.filter }))}
                style={{
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText
                  variant="caption"weight={selected ? 'bold' : 'medium'}
                  tone={selected ? 'inverse' : 'secondary'}
                >
                  {c.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <ScreenContainer glow={true}>
      {/* Single Unified FlatList for 100% smooth scrolling */}
      <FlatList
        data={resources ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        contentContainerStyle={{ paddingBottom: 130 }}
        renderItem={({ item }) => <ResourceCard resource={item} />}
        showsVerticalScrollIndicator={false}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name="book-outline"size={32} color={colors.brandPrimary} />
              </View>
              <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.xs }}>
                No Academic Resources Found
              </AppText>
              <AppText tone="secondary"variant="bodySmall"style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                Try searching for another course code or upload study materials for your peers.
              </AppText>
            </View>
          ) : null
        }
      />

      <ShareAcademicFileModal visible={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={handleUpload} />
      <LibraryFilterModal visible={filterModalOpen} onClose={() => setFilterModalOpen(false)} filters={filters} onApply={setFilters} />
      <ManageResourcesModal visible={adminManageOpen} onClose={() => setAdminManageOpen(false)} />
    </ScreenContainer>
  );
}
