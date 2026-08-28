import React, { useState } from'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, TextInput, View } from'react-native';
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
      {!isDesktop && <AppHeader />}

      {/* Screen Title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
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
        <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
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
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search course code, notes, topics..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setFilterModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter resources"
            style={{
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
            <Ionicons name="options" size={18} color={colors.brandPrimary} />
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
                  variant="caption"
                  weight={selected ? 'bold' : 'medium'}
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
        <ScrollView style={{ flex: 1, width: '100%' }}
          showsVerticalScrollIndicator={true}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1 }}>
                CAMPUS DIRECTORIES & OFFICIAL PORTALS ({campusCode})
              </AppText>
              <AppText tone="secondary" variant="caption">
                {portalLinks.filter((p) => p.active).length} active verified portals
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {portalLinks.filter((p) => p.active).map((portal) => (
                <Pressable
                  key={portal.id}
                  onPress={() => handleLaunchPortal(portal)}
                  style={{ width: 'calc(33.333% - 8px)' as any, minWidth: 240 }}
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
              <View key={res.id} style={{ width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 560 }}>
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
 showsVerticalScrollIndicator={true}
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
