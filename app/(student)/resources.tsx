import React, { useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { ResourceCard } from '@/components/ResourceCard';
import { EmptyState } from '@/components/EmptyState';
import { ShareAcademicFileModal, UploadAcademicPayload } from '@/components/ShareAcademicFileModal';
import { LibraryFilterModal, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from '@/components/LibraryFilterModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { listResources, createResource } from '@/api/resources';
import { listPortalLinks, PortalLink } from '@/api/portalLinks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCampusScope } from '@/hooks/useCampusScope';
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

 const { campusCode, homeInstitutionCode } = useCampusScope();

 const { data: portalLinks = [] } = useQuery({
 queryKey: ['portalLinks', homeInstitutionCode],
 queryFn: () => listPortalLinks(homeInstitutionCode || 'UNILAG'),
 });

 const { data: resources, isLoading, refetch, isRefetching } = useQuery({
 queryKey: ['resources', debouncedQuery, filters, campusCode],
 queryFn: () =>
 listResources({
 q: debouncedQuery || undefined,
 category: filters.resourceType === 'All Types' ? undefined : (filters.resourceType as any),
 department: filters.department === 'All Depts' ? undefined : filters.department,
 campusCode,
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
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Upload Action in 1 Compact Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: isDesktop ? spacing.xs : spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <AppText variant="h1" weight="bold" numberOfLines={1} style={{ fontSize: isDesktop ? 24 : 20 }}>
            Campus Resources
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ fontSize: 12 }}>
            Past questions, lecture notes & portal directories
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {(user?.role === 'admin' || user?.role === 'staff') && (
            <Pressable
              onPress={() => setAdminManageOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Admin manage library"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.pastelPrimaryBg,
                borderColor: `${colors.brandPrimary}40`,
                borderWidth: 1,
                borderRadius: radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Ionicons name="settings-outline" size={14} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand" variant="caption" style={{ fontSize: 11 }}>
                Manage
              </AppText>
            </Pressable>
          )}

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
              paddingHorizontal: 14,
              paddingVertical: 7,
              shadowColor: colors.brandPrimary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
            <AppText weight="bold" tone="inverse" variant="caption" style={{ fontSize: 11 }}>
              Upload
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Section 1: Compact University Portal Shortcuts */}
      <View style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, fontSize: 10.5 }}>
            PORTAL SHORTCUTS
          </AppText>
          <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5 }}>
            {portalLinks.filter((p) => p.active).length} links
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {portalLinks.filter((p) => p.active).map((portal) => (
            <Pressable
              key={portal.id}
              onPress={() => handleLaunchPortal(portal)}
              accessibilityRole="button"
              accessibilityLabel={`Launch ${portal.title}`}
            >
              <SolidCard
                radius={16}
                padded={false}
                style={{
                  width: isDesktop ? 180 : 150,
                  padding: 10,
                  height: 100,
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.pastelPrimaryBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={portal.icon || 'link-outline'} size={14} color={colors.brandPrimary} />
                  </View>
                  <Badge label={portal.category || 'Portal'} tone="accent" />
                </View>

                <View>
                  <AppText weight="bold" variant="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
                    {portal.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 9.5, marginTop: 1 }}>
                    {portal.url.replace(/^https?:\/\//, '')}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <AppText weight="bold" variant="caption" tone="brand" style={{ fontSize: 10 }}>
                    Launch
                  </AppText>
                  <Ionicons name="open-outline" size={10} color={colors.brandPrimary} />
                </View>
              </SolidCard>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Section 2: Academic Repository Header & Filters */}
      <View style={{ marginBottom: spacing.xs }}>
        <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, marginBottom: 6, fontSize: 10.5 }}>
          ACADEMIC REPOSITORY & STUDY FILES
        </AppText>

        {/* Search Bar Pill & Department Filter Button */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View
            style={[
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.85)',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                paddingHorizontal: 12,
                height: 40,
              },
              Platform.OS === 'web' &&
                ({
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                } as any),
            ]}
          >
            <Ionicons name="search" size={15} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by course code, title, topic..."
              placeholderTextColor={colors.textSecondary}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: 12.5,
                outlineStyle: 'none',
              } as any}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setFilterModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter by Department or Level"
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.85)',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor:
                  filters.department !== 'All Depts' || filters.resourceType !== 'All Types'
                    ? colors.brandPrimary
                    : isDark
                    ? 'rgba(255, 255, 255, 0.15)'
                    : 'rgba(0, 0, 0, 0.08)',
                paddingHorizontal: 12,
                height: 40,
              },
              Platform.OS === 'web' &&
                ({
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                } as any),
            ]}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={
                filters.department !== 'All Depts' || filters.resourceType !== 'All Types'
                  ? colors.brandPrimary
                  : colors.textPrimary
              }
            />
            <AppText
              variant="caption"
              weight="bold"
              style={{
                fontSize: 11.5,
                color:
                  filters.department !== 'All Depts' || filters.resourceType !== 'All Types'
                    ? colors.brandPrimary
                    : colors.textPrimary,
              }}
            >
              Filter
            </AppText>
          </Pressable>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {RESOURCE_CATEGORIES.map((cat) => {
            const isActive = filters.resourceType === cat.filter;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  haptics.light();
                  setFilters((prev) => ({ ...prev, resourceType: cat.filter as any }));
                }}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    backgroundColor: isActive
                      ? colors.brandPrimary
                      : isDark
                      ? 'rgba(15, 23, 42, 0.5)'
                      : 'rgba(255, 255, 255, 0.75)',
                    borderWidth: 1,
                    borderColor: isActive
                      ? colors.brandPrimary
                      : isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(0, 0, 0, 0.06)',
                  },
                  Platform.OS === 'web' &&
                    ({
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    } as any),
                ]}
              >
                <Ionicons
                  name={cat.icon}
                  size={13}
                  color={isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                />
                <AppText
                  variant="caption"
                  weight={isActive ? 'bold' : 'medium'}
                  style={{
                    fontSize: 11,
                    color: isActive ? '#FFFFFF' : isDark ? '#E2E8F0' : '#334155',
                  }}
                >
                  {cat.label}
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
        <ScrollView style={{ flex: 1, width: '100%' }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 60 }}
        >
          {/* Top Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h1" weight="bold">
                Campus Resources & Academic Library
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Official university portal shortcuts, verified departmental past questions & curated study notes
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {(user?.role === 'admin' || user?.role === 'staff') && (
                <Pressable
                  onPress={() => setAdminManageOpen(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: colors.pastelPrimaryBg,
                    borderWidth: 1,
                    borderColor: `${colors.brandPrimary}40`,
                    borderRadius: radius.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Ionicons name="settings-outline" size={16} color={colors.brandPrimary} />
                  <AppText weight="bold" tone="brand" variant="bodySmall">
                    Manage Library
                  </AppText>
                </Pressable>
              )}

              <Pressable
                onPress={() => setUploadModalOpen(true)}
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
                <AppText variant="bodySmall" weight="bold" tone="inverse">
                  Upload Resource
                </AppText>
              </Pressable>
            </View>
          </View>

          {/* Section: University Portal Directories */}
          <View style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="bold" tone="brand" numberOfLines={1} style={{ letterSpacing: 1, flex: 1, minWidth: 0 }}>
                CAMPUS DIRECTORIES & OFFICIAL PORTALS
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ flexShrink: 0 }}>
                {portalLinks.filter((p) => p.active).length} active verified portals
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {portalLinks.filter((p) => p.active).map((portal) => (
                <Pressable
                  key={portal.id}
                  onPress={() => handleLaunchPortal(portal)}
                  style={{ flexGrow: 1, flexBasis: 0, minWidth: 240 }}
                >
                  <SolidCard
                    radius={16}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.pastelPrimaryBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Ionicons name={portal.icon || 'link-outline'} size={20} color={colors.brandPrimary} />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flex: 1 }}>
                          {portal.title}
                        </AppText>
                        <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
                      </View>
                      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 11 }}>
                        {(portal as any).description || portal.category || 'Portal Link'}
                      </AppText>
                    </View>
                  </SolidCard>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Filter & Search Toolbar */}
          <SolidCard radius={18} style={{ padding: spacing.md, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
              {/* Search Input */}
              <View
                style={{
                  flex: 1,
                  minWidth: 260,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.background,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  height: 40,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: spacing.sm,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by course code, title, topic or department..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Resource Type Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8 }}>
                {RESOURCE_CATEGORIES.map((c) => {
                  const selected = filters.resourceType === c.filter;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setFilters((prev) => ({ ...prev, resourceType: c.filter }))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: selected ? colors.brandPrimary : colors.background,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Ionicons
                        name={c.icon}
                        size={14}
                        color={selected ? '#FFFFFF' : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={selected ? 'bold' : 'medium'}
                        style={{ color: selected ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                      >
                        {c.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Filter Modal Trigger */}
              <Pressable
                onPress={() => setFilterModalOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="options-outline" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">
                  {filters.department !== 'All Depts' ? filters.department : 'Filter Department'}
                </AppText>
              </Pressable>
            </View>
          </SolidCard>

          {/* Academic Files Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Academic Files ({(resources ?? []).length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {(resources ?? []).map((res) => (
              <View key={res.id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 560 }}>
                <ResourceCard resource={res} />
              </View>
            ))}
          </View>

          {(resources ?? []).length === 0 && !isLoading ? (
            <EmptyState title="No resources found" description="Try a different search query or upload a file for your department." />
          ) : null}
        </ScrollView>
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
              <EmptyState
                icon="book-outline"
                title="No Academic Resources Found"
                description="Try searching for another course code or upload study materials for your peers."
                actionLabel="Upload Study Material"
                onAction={() => setUploadModalOpen(true)}
              />
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
