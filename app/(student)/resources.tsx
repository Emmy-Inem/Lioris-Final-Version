import React, { useState, useRef, useEffect } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { ResourceCard } from '@/components/ResourceCard';
import { ResourceCardSkeletonGrid } from '@/components/Skeleton';
import { ErrorStateView } from '@/components/ErrorStateView';
import { EmptyState } from '@/components/EmptyState';
import { ShareAcademicFileModal, UploadAcademicPayload } from '@/components/ShareAcademicFileModal';
import { LibraryFilterModal, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from '@/components/LibraryFilterModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { recordPortalLinkVisit } from '@/utils/portalVisits';
import { listResources, createResource, getResource, listMyResources } from '@/api/resources';
import { listPortalLinks, PortalLink } from '@/api/portalLinks';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { getInstitutionByCode, listCampuses } from '@/api/institutions';
import { useToast } from '@/context/ToastContext';
import { resolveActivePortalTarget } from '@/utils/campusPortalScope';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCampusScope } from '@/hooks/useCampusScope';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { ApplyForVerificationModal } from '@/components/ApplyForVerificationModal';
import { submitVerificationRequest } from '@/api/verification';
import { ManageResourcesModal } from '@/components/admin/ManageResourcesModal';
import { AcademicLibraryModal } from '@/components/AcademicLibraryModal';
import { ResearchPapersModal } from '@/components/ResearchPapersModal';
import { ResourceReaderModal } from '@/components/ResourceReaderModal';
import { ReportResourceModal } from '@/components/ReportResourceModal';
import { AICopilotModal } from '@/components/AICopilotModal';
import { useResourceBookmarks } from '@/utils/resourceBookmarks';
import { Resource } from '@/api/types';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

const RESOURCE_CATEGORIES = [
  { id: 'all', label: 'All Files', filter: 'All Types', icon: 'document-text-outline' as const },
  { id: 'past_questions', label: 'Past Questions', filter: 'Past Questions', icon: 'help-circle-outline' as const },
  { id: 'notes', label: 'Course Notes', filter: 'Notes', icon: 'book-outline' as const },
  { id: 'projects', label: 'Projects & Code', filter: 'Projects', icon: 'code-slash-outline' as const },
  { id: 'bookmarked', label: 'Bookmarked', filter: 'Bookmarked', icon: 'bookmark' as const },
  { id: 'mine', label: 'My Uploads', filter: 'Mine', icon: 'cloud-upload-outline' as const },
];

/** Badge tone for a resource's own approval status, used only in the "My Uploads" view below. */
const RESOURCE_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'critical'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'critical',
};

/**
 * Status badge + rejection reason shown above a card in "My Uploads" only -
 * ResourceCard itself stays untouched (it's shared with the general browse
 * feed, where approval status is never shown). Closes the gap where a
 * rejected upload wrote a reason nobody - including its own uploader - ever
 * saw.
 */
function MyUploadStatusBanner({ resource }: { resource: Resource }) {
  const { colors, spacing, radius } = useTheme();
  const status = resource.approvalStatus || 'pending';
  const label = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending Review';
  return (
    <View style={{ marginBottom: 6, gap: 4 }}>
      <Badge label={label} tone={RESOURCE_STATUS_TONE[status] || 'neutral'} />
      {status === 'rejected' && resource.rejectionReason ? (
        <View style={{ backgroundColor: `${colors.critical}15`, padding: spacing.sm, borderRadius: radius.sm }}>
          <AppText variant="caption" weight="bold" tone="critical" style={{ marginBottom: 2 }}>
            Why this was rejected:
          </AppText>
          <AppText variant="caption" tone="secondary">
            {resource.rejectionReason}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export default function ResourcesScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { resourceId } = useLocalSearchParams<{ resourceId?: string }>();
  const [selectedPortalFilter, setSelectedPortalFilter] = useState<string>('CURRENT');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [adminManageOpen, setAdminManageOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [researchModalOpen, setResearchModalOpen] = useState(false);
  const [copilotModalOpen, setCopilotModalOpen] = useState(false);
  const [readingResource, setReadingResource] = useState<Resource | null>(null);
  const [reportingResource, setReportingResource] = useState<Resource | null>(null);
  const { isFeatureEnabled } = useFeatureFlags();
  const { bookmarkedIds, toggleBookmark } = useResourceBookmarks();

  const linkedResource = useQuery({
    queryKey: ['resources', 'deep-link', resourceId],
    queryFn: () => getResource(resourceId!),
    enabled: typeof resourceId === 'string' && /^[0-9a-f-]{36}$/i.test(resourceId),
    retry: false,
  });

  useEffect(() => {
    if (linkedResource.data) setReadingResource(linkedResource.data);
  }, [linkedResource.data]);

  useEffect(() => {
    if (linkedResource.error) toast.error((linkedResource.error as Error).message);
  }, [linkedResource.error, toast]);

  // Desktop horizontal scroll refs
  const portalsScrollRef = useRef<ScrollView>(null);
  const categoriesScrollRef = useRef<ScrollView>(null);

  const scrollPortals = (direction: 'left' | 'right') => {
    const node = (portalsScrollRef.current as any)?.getScrollableNode?.() || (portalsScrollRef.current as any);
    if (node?.scrollBy) {
      node.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' });
    }
  };

  const { campusCode, homeInstitutionCode } = useCampusScope();
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const isSuperAdmin = user?.actualRole === 'admin' && user?.isSuperAdmin === true;
  const { data: campuses = [] } = useQuery({ queryKey: ['campuses'], queryFn: listCampuses });
  const universityPortalFilters = React.useMemo(
    () => [
      { code: 'CURRENT', label: 'My Campus' },
      { code: 'ALL', label: 'All Universities' },
      ...campuses
        .filter((campus) => campus.code !== 'GLOBAL' && campus.isActive !== false)
        .map((campus) => ({ code: campus.code, label: campus.shortName || campus.name })),
      { code: 'GLOBAL', label: 'National Portals' },
    ],
    [campuses],
  );

  // Determine user's effective campus (e.g. UNILAG, UI, FUNAAB)
  const effectiveCampus = isSuperAdmin
    ? (campusCode && campusCode !== 'GLOBAL' ? campusCode : 'ALL')
    : (profile?.institutionCode && profile.institutionCode !== 'GLOBAL')
      ? profile.institutionCode
      : (campusCode && campusCode !== 'GLOBAL')
      ? campusCode
      : (homeInstitutionCode && homeInstitutionCode !== 'GLOBAL')
      ? homeInstitutionCode
      : 'GLOBAL';
  const uploadCampus = effectiveCampus === 'ALL' ? 'GLOBAL' : effectiveCampus;

  const institutionInfo = effectiveCampus !== 'GLOBAL' ? getInstitutionByCode(effectiveCampus) : null;
  const campusDisplayName = effectiveCampus === 'ALL'
    ? 'All Campuses'
    : institutionInfo?.shortName || (effectiveCampus !== 'GLOBAL' ? effectiveCampus : 'Campus');

  // Only Super Admin can see all campuses' portals; others are strictly isolated to their own campus or National Portals
  const activePortalCampus = resolveActivePortalTarget(isSuperAdmin ? 'admin' : 'student', selectedPortalFilter, effectiveCampus);

  const { data: portalLinks = [] } = useQuery({
    queryKey: ['portalLinks', activePortalCampus],
    queryFn: () => listPortalLinks(activePortalCampus),
  });

  // Pagination: listResources used to hardcode .limit(100) with no way to see
  // anything older. page/pageSize follow the same accumulate-pages-then-"Load
  // More" pattern as the audit log screen (app/(admin)/audit-logs.tsx).
  const RESOURCES_PAGE_SIZE = 20;
  const [resourcesPage, setResourcesPage] = useState(0);
  const [accumulatedResources, setAccumulatedResources] = useState<Resource[]>([]);
  const resourcesFilterKey = `${debouncedQuery}|${filters.resourceType}|${filters.department}|${filters.studyLevel}|${filters.minRating}|${filters.sortBy}|${effectiveCampus}`;

  // Mirrors LibraryFilterModal's RATINGS options ('All Ratings' | '3.0+ Stars' | ...) -
  // parsed to the plain number listResources()'s minRating expects.
  const minRatingValue = filters.minRating === 'All Ratings' ? undefined : parseFloat(filters.minRating);

  // A new search/filter/campus starts a fresh result set at page 0 - it isn't
  // "more of" whatever was already loaded for the previous filters.
  useEffect(() => {
    setResourcesPage(0);
  }, [resourcesFilterKey]);

  const { data: resourcesPageData, isLoading, isError, error, refetch, isRefetching, isFetching } = useQuery({
    queryKey: ['resources', debouncedQuery, filters, effectiveCampus, resourcesPage],
    queryFn: () =>
      listResources({
        q: debouncedQuery || undefined,
        category:
          filters.resourceType === 'All Types' || filters.resourceType === 'Bookmarked'
            ? undefined
            : (filters.resourceType as any),
        department: filters.department === 'All Depts' ? undefined : filters.department,
        academicLevel: filters.studyLevel === 'All Levels' ? undefined : filters.studyLevel,
        minRating: minRatingValue,
        sortBy: filters.sortBy,
        campusCode: effectiveCampus,
        page: resourcesPage,
        pageSize: RESOURCES_PAGE_SIZE,
      }),
  });

  useEffect(() => {
    if (!resourcesPageData) return;
    setAccumulatedResources((prev) => (resourcesPage === 0 ? resourcesPageData : [...prev, ...resourcesPageData]));
  }, [resourcesPageData, resourcesPage]);

  // A full page came back, so there may be more past it - an exact total
  // would need a count() round trip the way audit-logs.tsx does; this
  // heuristic is enough to show/hide "Load More" without one.
  const hasMoreResources = (resourcesPageData?.length ?? 0) === RESOURCES_PAGE_SIZE;

  function handleLoadMoreResources() {
    if (isFetching || !hasMoreResources) return;
    setResourcesPage((p) => p + 1);
  }

  function handleRefreshResources() {
    setResourcesPage(0);
    setAccumulatedResources([]);
    refetch();
  }

  // "My Uploads" needs the uploader's own rejected/pending resources too,
  // which the general browse feed above deliberately hides from everyone
  // (listResources excludes 'rejected' by default, and pagination here is
  // keyed to filters that don't include status) - so it reads from a
  // dedicated, unpaginated, status-agnostic query instead of the campus feed.
  const { data: myResources = [], isLoading: isMyResourcesLoading, isError: isMyResourcesError, error: myResourcesError, refetch: refetchMyResources } = useQuery({
    queryKey: ['resources', 'mine', user?.id],
    queryFn: listMyResources,
    enabled: !!user,
  });

  const isMineView = filters.resourceType === 'Mine';

  const displayedResources = isMineView
    ? myResources
    : accumulatedResources.filter((r) => {
        if (filters.resourceType === 'Bookmarked') {
          return bookmarkedIds.includes(r.id);
        }
        return true;
      });

  // One set of loading/error/retry/pagination signals the render below reads,
  // regardless of which of the two queries is actually backing this view.
  const showResourcesSkeleton = isMineView ? isMyResourcesLoading : isLoading && resourcesPage === 0;
  const resourcesLoadError = isMineView ? (isMyResourcesError ? myResourcesError : null) : isError ? error : null;
  const retryResources = isMineView ? refetchMyResources : refetch;
  const canLoadMoreResources = !isMineView && hasMoreResources;

  function handlePressUpload() {
    if (isUnverifiedPersonalUser(profile)) {
      toast.error('Student verification is required to upload academic resources.');
      haptics.error();
      setVerificationModalOpen(true);
      return;
    }
    setUploadModalOpen(true);
  }

  async function handleUpload(payload: UploadAcademicPayload) {
    if (isUnverifiedPersonalUser(profile)) {
      toast.error('Student verification is required to upload academic resources.');
      haptics.error();
      setVerificationModalOpen(true);
      return;
    }
    try {
      const { fileBlob, ...rest } = payload;
      await createResource({ ...rest, campusCode: uploadCampus }, fileBlob);
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      toast.success('Resource uploaded successfully! Pending moderation review.');
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Could not upload resource. Please try again.'));
    }
  }

 function handleLaunchPortal(portal: PortalLink) {
 Alert.alert(
 'Open Campus Portal',
 `Opening ${portal.title} (${portal.url}). Continue in browser?`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Open Portal ↗',
 onPress: () => {
 openExternalUrl(portal.url).then((opened: boolean) => {
 if (!opened) {
 Alert.alert('Link Blocked', 'This portal link is not a valid http(s) address and was not opened.');
 } else {
 void recordPortalLinkVisit(portal.id, portal.url, user?.id);
 }
 });
 },
 },
 ],
 );
 }

    const renderHeader = () => (
    <View style={{ marginBottom: spacing.md }}>
      {!isDesktop && <AppHeader />}

      {/* Screen Title & Upload Action - Responsive Layout */}
      <View
        style={{
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'center' : 'stretch',
          justifyContent: 'space-between',
          gap: isDesktop ? spacing.sm : 10,
          marginTop: isDesktop ? spacing.xs : spacing.sm,
          marginBottom: spacing.sm,
        }}
      >
        <View style={{ flex: isDesktop ? 1 : undefined, minWidth: 0 }}>
          <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
            Campus Resources
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ fontSize: isDesktop ? 12 : 11.5, lineHeight: 16, marginTop: 2 }}>
            Past questions, lecture notes & portal directories
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: isDesktop ? 'center' : 'flex-start', flexWrap: 'wrap' }}>
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
                paddingHorizontal: 8,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="settings-outline" size={13} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand" variant="caption" style={{ fontSize: 10.5 }}>
                Manage
              </AppText>
            </Pressable>
          )}

          {isFeatureEnabled('global_library') && (
            <Pressable
              onPress={() => setLibraryModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Search Global Academic Library"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.brandPrimary,
                borderRadius: radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="library" size={13} color="#ffffff" />
              <AppText weight="bold" variant="caption" style={{ color: '#ffffff', fontSize: 11 }}>
                Global Library
              </AppText>
            </Pressable>
          )}

          <Pressable
            onPress={() => setResearchModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Search Research Papers & Thesis"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.brandPrimary,
              borderRadius: radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Ionicons name="school" size={13} color="#ffffff" />
            <AppText weight="bold" variant="caption" style={{ color: '#ffffff', fontSize: 11 }}>
              Research Hub
            </AppText>
          </Pressable>

          <Pressable
            onPress={handlePressUpload}
            accessibilityRole="button"
            accessibilityLabel="Upload resource"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.brandPrimary,
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              shadowColor: colors.brandPrimary,
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.15,
              shadowRadius: 3,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" />
            <AppText weight="bold" tone="inverse" variant="caption" style={{ fontSize: 11 }}>
              Upload
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* AI Campus Study Copilot (Feature Flagged) */}
      {isFeatureEnabled('ai_study_copilot') && (
        <Pressable
          onPress={() => {
            haptics.light();
            setCopilotModalOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open the AI Study Copilot"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.pastelPrimaryBg,
            borderWidth: 1,
            borderColor: `${colors.brandPrimary}40`,
            borderRadius: radius.lg,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: spacing.md,
          }}
        >
          <Ionicons name="sparkles" size={18} color={colors.brandPrimary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText weight="bold" variant="bodySmall">
              AI Study Copilot
            </AppText>
            <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 10.5 }}>
              Explain concepts, solve past questions, build flashcards
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      )}

      {/* Section 1: Compact University Portal Shortcuts */}
      <View style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.8, fontSize: 10.5 }}>
              {isSuperAdmin && selectedPortalFilter === 'ALL'
                ? 'ALL PORTAL DIRECTORIES'
                : `${campusDisplayName.toUpperCase()} DIRECTORY`}
            </AppText>
            {isSuperAdmin && selectedPortalFilter !== 'CURRENT' && selectedPortalFilter !== 'ALL' && (
              <View
                style={{
                  backgroundColor: `${colors.brandPrimary}20`,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: radius.pill,
                }}
              >
                <AppText weight="bold" tone="brand" variant="caption" style={{ fontSize: 11 }}>
                  {selectedPortalFilter}
                </AppText>
              </View>
            )}
          </View>
          <AppText tone="secondary" variant="caption" style={{ fontSize: 10.5 }}>
            {portalLinks.filter((p) => p.active).length} links
          </AppText>
        </View>

        {/* University Selector Filter: Super Admin gets all campuses, others only get their campus + national portals */}
        {isSuperAdmin ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 8 }}
            contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingRight: 16 }}
          >
            {universityPortalFilters.map((item) => {
              const isSelected = selectedPortalFilter === item.code;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    haptics.light();
                    setSelectedPortalFilter(item.code);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter portals for ${item.label}`}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: isSelected ? colors.brandPrimary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText
                    weight={isSelected ? 'bold' : 'regular'}
                    variant="caption"
                    style={{
                      fontSize: 10.5,
                      color: isSelected ? colors.textInverse : colors.textSecondary,
                    }}
                  >
                    {item.code === 'CURRENT' ? `My Campus (${effectiveCampus})` : item.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {[
              { code: 'CURRENT', label: `${campusDisplayName} Portals` },
              { code: 'GLOBAL', label: 'National Portals' },
            ].map((item) => {
              const isSelected = (selectedPortalFilter === 'GLOBAL' ? 'GLOBAL' : 'CURRENT') === item.code;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    haptics.light();
                    setSelectedPortalFilter(item.code);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${item.label}`}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: isSelected ? colors.brandPrimary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText
                    weight={isSelected ? 'bold' : 'regular'}
                    variant="caption"
                    style={{
                      fontSize: 10.5,
                      color: isSelected ? colors.textInverse : colors.textSecondary,
                    }}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}

        <ScrollView
          ref={portalsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          {...({ 'data-horizontal-scroll': 'true' } as any)}
          style={{ width: '100%', flexGrow: 0 }}
          contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 16 }}
        >
          {portalLinks.filter((p) => p.active).map((portal) => (
            <Pressable
              key={portal.id}
              onPress={() => handleLaunchPortal(portal)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${portal.title}`}
            >
              <SolidCard
                radius={14}
                padded={false}
                style={{
                  width: isDesktop ? 150 : 128,
                  height: 82,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  gap: 3,
                }}
              >
                <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 9.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {portal.campusCode && portal.campusCode !== 'GLOBAL' && isSuperAdmin && selectedPortalFilter === 'ALL' ? `${portal.campusCode} · ` : ''}{portal.category || 'Portal'}
                </AppText>
                <AppText weight="bold" variant="caption" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 15, minHeight: 30 }}>
                  {portal.title}
                </AppText>
                <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 10 }}>
                  {portal.url.replace(/^https?:\/\//, '')}
                </AppText>
              </SolidCard>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Section 2: Academic Repository Header & Filters */}
      <View style={{ marginBottom: spacing.xs }}>
        <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.8, marginBottom: 6, fontSize: 10.5 }}>
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
                Official university portal shortcuts, plus past questions and study notes shared by students on your campus
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

              {isFeatureEnabled('global_library') && (
                <Pressable
                  onPress={() => setLibraryModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Search Global Academic Library"
                  style={{
                    backgroundColor: colors.brandPrimary,
                    borderRadius: radius.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <Ionicons name="library" size={16} color="#FFFFFF" />
                  <AppText variant="bodySmall" weight="bold" tone="inverse">
                    Global Library
                  </AppText>
                </Pressable>
              )}

              <Pressable
                onPress={() => setResearchModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Search Research Papers & Thesis"
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <Ionicons name="school" size={16} color="#FFFFFF" />
                <AppText variant="bodySmall" weight="bold" tone="inverse">
                  Research Hub
                </AppText>
              </Pressable>

              {isFeatureEnabled('ai_study_copilot') && (
                <Pressable
                  onPress={() => setCopilotModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open the AI Study Copilot"
                  style={{
                    backgroundColor: colors.brandPrimary,
                    borderRadius: radius.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                  <AppText variant="bodySmall" weight="bold" tone="inverse">
                    AI Study Copilot
                  </AppText>
                </Pressable>
              )}

              <Pressable
                onPress={handlePressUpload}
                accessibilityRole="button"
                accessibilityLabel="Upload resource"
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <AppText variant="caption" weight="bold" tone="secondary" numberOfLines={1} style={{ letterSpacing: 1 }}>
                  {isSuperAdmin && selectedPortalFilter === 'ALL'
                    ? 'CAMPUS DIRECTORIES & OFFICIAL PORTALS'
                    : `${(institutionInfo?.name || campusDisplayName).toUpperCase()} OFFICIAL PORTALS`}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <AppText tone="secondary" variant="caption">
                  {portalLinks.filter((p) => p.active).length} active portals
                </AppText>
                {/* Desktop Left / Right Scroll Chevrons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Pressable
                    onPress={() => scrollPortals('left')}
                    accessibilityRole="button"
                    accessibilityLabel="Scroll directories left"
                    style={({ hovered }: any) => [
                      {
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: hovered ? 1 : 0.75,
                      },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                  >
                    <Ionicons name="chevron-back" size={14} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => scrollPortals('right')}
                    accessibilityRole="button"
                    accessibilityLabel="Scroll directories right"
                    style={({ hovered }: any) => [
                      {
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: hovered ? 1 : 0.75,
                      },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={14} color={colors.textPrimary} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Desktop Portal Filter Selector */}
            {isSuperAdmin ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 10 }}
                contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingRight: 16 }}
              >
                {universityPortalFilters.map((item) => {
                  const isSelected = selectedPortalFilter === item.code;
                  return (
                    <Pressable
                      key={item.code}
                      onPress={() => {
                        haptics.light();
                        setSelectedPortalFilter(item.code);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter portals for ${item.label}`}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        borderWidth: 1,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText
                        weight={isSelected ? 'bold' : 'regular'}
                        variant="caption"
                        style={{
                          fontSize: 11,
                          color: isSelected ? colors.textInverse : colors.textSecondary,
                        }}
                      >
                        {item.code === 'CURRENT' ? `My Campus (${effectiveCampus})` : item.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {[
                  { code: 'CURRENT', label: `${campusDisplayName} Official Portals` },
                  { code: 'GLOBAL', label: 'National Portals' },
                ].map((item) => {
                  const isSelected = (selectedPortalFilter === 'GLOBAL' ? 'GLOBAL' : 'CURRENT') === item.code;
                  return (
                    <Pressable
                      key={item.code}
                      onPress={() => {
                        haptics.light();
                        setSelectedPortalFilter(item.code);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${item.label}`}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        borderWidth: 1,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText
                        weight={isSelected ? 'bold' : 'regular'}
                        variant="caption"
                        style={{
                          fontSize: 11,
                          color: isSelected ? colors.textInverse : colors.textSecondary,
                        }}
                      >
                        {item.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <ScrollView
              ref={portalsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[
                { flexGrow: 0 },
                Platform.OS === 'web' && ({ overflowX: 'auto', scrollbarWidth: 'none' } as any),
              ]}
              contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingBottom: 6 }}
            >
              {portalLinks.filter((p) => p.active).map((portal) => (
                <Pressable
                  key={portal.id}
                  onPress={() => handleLaunchPortal(portal)}
                  style={({ hovered }: any) => [
                    { width: 200, flexShrink: 0, opacity: hovered ? 0.92 : 1 },
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  ]}
                >
                  <SolidCard
                    radius={14}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      height: 74,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      gap: 2,
                    }}
                  >
                    <AppText weight="bold" variant="bodySmall" numberOfLines={2} style={{ lineHeight: 17, minHeight: 34 }}>
                      {portal.title}
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
                      {(portal as any).description || portal.category || 'Portal Link'}
                    </AppText>
                  </SolidCard>
                </Pressable>
              ))}
            </ScrollView>
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
              <ScrollView
                ref={categoriesScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[
                  { flex: 1, minWidth: 0 },
                  Platform.OS === 'web' && ({ overflowX: 'auto', scrollbarWidth: 'none' } as any),
                ]}
                contentContainerStyle={{ gap: 8 }}
              >
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
                <Ionicons name="options-outline" size={16} color={colors.textPrimary} />
                <AppText variant="caption" weight="bold">
                  {filters.department !== 'All Depts' ? filters.department : 'Filter Department'}
                </AppText>
              </Pressable>
            </View>
          </SolidCard>

          {/* Academic Files Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              {isMineView ? 'My Uploads' : filters.resourceType === 'Bookmarked' ? 'Bookmarked Notes' : 'Academic Files'} ({displayedResources.length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Cards & Skeleton / Error States */}
          {showResourcesSkeleton ? (
            <ResourceCardSkeletonGrid count={6} />
          ) : resourcesLoadError ? (
            <ErrorStateView
              title="Could not load campus resources"
              error={resourcesLoadError}
              onRetry={retryResources}
            />
          ) : displayedResources.length === 0 ? (
            <EmptyState
              title={isMineView ? 'No uploads yet' : filters.resourceType === 'Bookmarked' ? 'No Bookmarked Notes' : 'No resources found'}
              description={
                isMineView
                  ? 'Files you share with the campus show up here, along with their review status.'
                  : filters.resourceType === 'Bookmarked'
                  ? 'Tap the bookmark icon on any course note or paper to save it here for fast revision.'
                  : 'Try a different search query or upload a file for your department.'
              }
            />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {displayedResources.map((res) => (
                <View key={res.id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 560 }}>
                  {isMineView ? <MyUploadStatusBanner resource={res} /> : null}
                  <ResourceCard
                    resource={res}
                    showCampusTag={isSuperAdmin && effectiveCampus === 'ALL'}
                    onPreview={setReadingResource}
                    isBookmarked={bookmarkedIds.includes(res.id)}
                    onToggleBookmark={async () => {
                      const cleanTitle = res.courseTitle || res.title || res.courseCode;
                      const added = await toggleBookmark(res.id, {
                        title: cleanTitle,
                        subtitle: res.courseCode || 'Course Material',
                      });
                      if (added) {
                        toast.success(`Bookmarked "${res.title}"`);
                      } else {
                        toast.info(`Removed "${res.title}" from bookmarks`);
                      }
                    }}
                    onReport={setReportingResource}
                  />
                </View>
              ))}
            </View>
          )}

          {!showResourcesSkeleton && !resourcesLoadError && canLoadMoreResources && displayedResources.length > 0 && (
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <AppButton
                label="Load More"
                variant="secondary"
                size="sm"
                loading={isFetching && resourcesPage > 0}
                onPress={handleLoadMoreResources}
              />
            </View>
          )}
        </ScrollView>
      ) : (
        /* Mobile Single Column FlatList */
        <FlatList
          data={displayedResources}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          contentContainerStyle={{ paddingBottom: 130 }}
          renderItem={({ item }) => (
            <View>
              {isMineView ? <MyUploadStatusBanner resource={item} /> : null}
              <ResourceCard
                resource={item}
                showCampusTag={isSuperAdmin && effectiveCampus === 'ALL'}
                onPreview={setReadingResource}
                isBookmarked={bookmarkedIds.includes(item.id)}
                onToggleBookmark={async () => {
                  const cleanTitle = item.courseTitle || item.title || item.courseCode;
                  const added = await toggleBookmark(item.id, {
                    title: cleanTitle,
                    subtitle: item.courseCode || 'Course Material',
                  });
                  if (added) {
                    toast.success(`Bookmarked "${item.title}"`);
                  } else {
                    toast.info(`Removed "${item.title}" from bookmarks`);
                  }
                }}
                onReport={setReportingResource}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          onRefresh={() => { if (isMineView) { void retryResources(); } else { handleRefreshResources(); } }}
          refreshing={isMineView ? isMyResourcesLoading : isRefetching && resourcesPage === 0}
          ListEmptyComponent={
            showResourcesSkeleton ? (
              <ResourceCardSkeletonGrid count={4} />
            ) : resourcesLoadError ? (
              <ErrorStateView
                title="Could not load academic resources"
                error={resourcesLoadError}
                onRetry={retryResources}
              />
            ) : (
              <EmptyState
                icon={isMineView ? 'cloud-upload-outline' : filters.resourceType === 'Bookmarked' ? 'bookmark-outline' : 'book-outline'}
                title={isMineView ? 'No uploads yet' : filters.resourceType === 'Bookmarked' ? 'No Bookmarked Notes' : 'No Academic Resources Found'}
                description={
                  isMineView
                    ? 'Files you share with the campus show up here, along with their review status.'
                    : filters.resourceType === 'Bookmarked'
                    ? 'Tap the bookmark icon on any course note to keep it handy for quick reading.'
                    : 'Try searching for another course code or upload study materials for your peers.'
                }
                actionLabel={isMineView || filters.resourceType === 'Bookmarked' ? undefined : 'Upload Study Material'}
                onAction={isMineView || filters.resourceType === 'Bookmarked' ? undefined : handlePressUpload}
              />
            )
          }
          ListFooterComponent={
            !showResourcesSkeleton && !resourcesLoadError && canLoadMoreResources && displayedResources.length > 0 ? (
              <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.md, alignItems: 'center' }}>
                <AppButton
                  label="Load More"
                  variant="secondary"
                  size="sm"
                  loading={isFetching && resourcesPage > 0}
                  onPress={handleLoadMoreResources}
                />
              </View>
            ) : null
          }
        />
      )}

      <ShareAcademicFileModal visible={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={handleUpload} />
      <LibraryFilterModal visible={filterModalOpen} onClose={() => setFilterModalOpen(false)} filters={filters} onApply={setFilters} />
      <ManageResourcesModal visible={adminManageOpen} onClose={() => setAdminManageOpen(false)} />
      <AcademicLibraryModal visible={libraryModalOpen} onClose={() => setLibraryModalOpen(false)} />
      <ResearchPapersModal
        visible={researchModalOpen}
        onClose={() => setResearchModalOpen(false)}
      />
      <AICopilotModal
        visible={copilotModalOpen}
        onClose={() => setCopilotModalOpen(false)}
      />
      <ResourceReaderModal
        visible={!!readingResource}
        resource={readingResource}
        onClose={() => setReadingResource(null)}
      />
      {reportingResource && (
        <ReportResourceModal
          visible={!!reportingResource}
          resource={reportingResource}
          onClose={() => setReportingResource(null)}
        />
      )}
      <ApplyForVerificationModal
        visible={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        defaultInstitution={effectiveCampus}
        onSubmit={async (data) => {
          if (!user) return;
          try {
            await submitVerificationRequest({
              userId: user.id,
              applicantName: profile?.fullName ?? user.fullName,
              documentType: data.documentType,
              documentReference: data.documentReference,
              institutionClaimed: data.institutionClaimed,
              documentPhotoUri: data.documentPhotoUri,
              photoBlob: data.photoBlob,
            });
            markVerificationPending(user.id);
            await queryClient.invalidateQueries({ queryKey: ['profile'] });
            setVerificationModalOpen(false);
            toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
          } catch (err: any) {
            toast.error(err?.message || 'Could not submit verification request. Please try again.');
          }
        }}
      />
    </ScreenContainer>
  );
}
