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
import { ShareAcademicFileModal, UploadAcademicPayload } from '@/components/ShareAcademicFileModal';
import { LibraryFilterModal, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from '@/components/LibraryFilterModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listResources, createResource } from '@/api/resources';
import { listPortalLinks, PortalLink } from '@/api/portalLinks';
import { getMyProfile } from '@/api/profile';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ManageResourcesModal } from '@/components/admin/ManageResourcesModal';

const RESOURCE_CATEGORIES = [
  { id: 'all', label: 'All Files', filter: 'All Types', icon: 'document-text-outline' as const },
  { id: 'past_questions', label: 'Past Questions', filter: 'Past Questions', icon: 'help-circle-outline' as const },
  { id: 'notes', label: 'Course Notes', filter: 'Notes', icon: 'book-outline' as const },
  { id: 'projects', label: 'Projects & Code', filter: 'Projects', icon: 'code-slash-outline' as const },
];

export default function ResourcesScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [adminManageOpen, setAdminManageOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);

  const { data: profile } = useQuery({
    queryKey: ['myProfile', user?.id],
    queryFn: () => getMyProfile(),
    enabled: !!user?.id,
  });

  const campusCode = profile?.institutionCode || 'UNILAG';

  const { data: portalLinks = [] } = useQuery({
    queryKey: ['portalLinks', campusCode],
    queryFn: () => listPortalLinks(campusCode),
  });

  const { data: resources, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['resources', debouncedQuery, filters],
    queryFn: () =>
      listResources({
        q: debouncedQuery || undefined,
        category: filters.resourceType === 'All Types' ? undefined : (filters.resourceType as any),
        department: filters.department === 'All Depts' ? undefined : filters.department,
      }),
  });

  async function handleUpload(payload: UploadAcademicPayload) {
    const { fileBlob, ...rest } = payload;
    await createResource(rest, fileBlob);
    queryClient.invalidateQueries({ queryKey: ['resources'] });
  }

  function handleLaunchPortal(portal: PortalLink) {
    Alert.alert(
      'Launch Campus Portal',
      `Opening ${portal.title} (${portal.url}). Continue in browser?`,
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
          <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1 }}>
            DIRECTORIES & PORTAL SHORTCUTS ({campusCode})
          </AppText>
          <AppText tone="secondary" variant="caption">
            {portalLinks.filter((p) => p.active).length} active links
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        >
          {portalLinks.filter((p) => p.active).map((portal) => (
            <Pressable
              key={portal.id}
              onPress={() => handleLaunchPortal(portal)}
              accessibilityRole="button"
              accessibilityLabel={`Launch ${portal.title}`}
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
                    <Ionicons name={portal.icon || 'link-outline'} size={18} color={colors.brandPrimary} />
                  </View>
                  <Badge label={portal.category || 'Portal'} tone="accent" />
                </View>

                <View>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                    {portal.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ marginTop: 2, fontSize: 11, lineHeight: 14 }}>
                    {portal.url.replace(/^https?:\/\//, '')}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppText weight="bold" variant="caption" tone="brand" style={{ fontSize: 11 }}>
                    Launch Portal
                  </AppText>
                  <Ionicons name="open-outline" size={12} color={colors.brandPrimary} />
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
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30 }}>
          {/* Left Column: Filters, Portals & Upload */}
          <View style={{ width: 280, gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                gap: spacing.sm,
              }}
            >
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search course code, notes..."
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                Resource Type 📚
              </AppText>
              <View style={{ gap: 4 }}>
                {RESOURCE_CATEGORIES.map((c) => {
                  const selected = filters.resourceType === c.filter;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setFilters((prev) => ({ ...prev, resourceType: c.filter }))}
                      style={({ hovered }: any) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: radius.md,
                          backgroundColor: selected
                            ? colors.brandPrimary
                            : hovered
                              ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
                              : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons
                        name={c.icon}
                        size={16}
                        color={selected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={selected ? 'bold' : 'medium'}
                        style={{ color: selected ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B', flex: 1 }}
                      >
                        {c.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </SolidCard>

            <Pressable
              onPress={() => setUploadModalOpen(true)}
              style={{
                backgroundColor: colors.brandPrimary,
                borderRadius: radius.md,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
              <AppText variant="bodySmall" weight="bold" tone="inverse">
                Share Course Notes / PQ
              </AppText>
            </Pressable>

            {/* Official Portals Quick Card */}
            {portalLinks.length > 0 && (
              <SolidCard radius={18} style={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Official Portals 🏛️
                </AppText>
                <View style={{ gap: 8 }}>
                  {portalLinks.slice(0, 4).map((portal) => (
                    <Pressable
                      key={portal.id}
                      onPress={() => handleLaunchPortal(portal)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 4,
                      }}
                    >
                      <AppText variant="bodySmall" weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                        {portal.title}
                      </AppText>
                      <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
                    </Pressable>
                  ))}
                </View>
              </SolidCard>
            )}
          </View>

          {/* Right Column: Multi-Column Resources Grid */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <AppText variant="h2" weight="bold">
                Available Resources ({(resources ?? []).length})
              </AppText>
              <Pressable
                onPress={() => setFilterModalOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.pastelPrimaryBg,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.brandPrimary,
                }}
              >
                <Ionicons name="options" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">
                  Filter Department
                </AppText>
              </Pressable>
            </View>

            <FlatList
              data={resources ?? []}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md }}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <View style={{ flex: 1, minWidth: 0, marginBottom: spacing.md }}>
                  <ResourceCard resource={item} />
                </View>
              )}
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
                      <Ionicons name="book-outline" size={32} color={colors.brandPrimary} />
                    </View>
                    <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                      No Academic Resources Found
                    </AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                      Try searching for another course code or upload study materials for your peers.
                    </AppText>
                  </View>
                ) : null
              }
            />
          </View>
        </View>
      ) : (
        /* Mobile Single Column FlatList */
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
                  <Ionicons name="book-outline" size={32} color={colors.brandPrimary} />
                </View>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
                  No Academic Resources Found
                </AppText>
                <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
                  Try searching for another course code or upload study materials for your peers.
                </AppText>
              </View>
            ) : null
          }
        />
      )}

      <ShareAcademicFileModal visible={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={handleUpload} />
      <LibraryFilterModal visible={filterModalOpen} onClose={() => setFilterModalOpen(false)} filters={filters} onApply={setFilters} />
      <ManageResourcesModal visible={adminManageOpen} onClose={() => setAdminManageOpen(false)} />
    </ScreenContainer>
  );
}
