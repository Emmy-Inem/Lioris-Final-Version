import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { JobCard } from '@/components/JobCard';
import { ListItemSkeletonList } from '@/components/Skeleton';
import { ErrorStateView } from '@/components/ErrorStateView';
import { EmptyState } from '@/components/EmptyState';
import { CreateJobModal } from '@/components/CreateJobModal';
import { JobApplicantsModal } from '@/components/JobApplicantsModal';
import { JobAlertsModal } from '@/components/JobAlertsModal';
import { MyApplicationsModal } from '@/components/MyApplicationsModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { listJobs, listMyJobs, closeJob, reopenJob, deleteJob } from '@/api/jobs';
import { listMyApplications } from '@/api/jobApplications';
import { JobApplicationStatus, JobListing } from '@/api/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCampusScope } from '@/hooks/useCampusScope';
import { haptics } from '@/utils/haptics';

const JOB_FILTERS = [
 { id: 'all', label: 'All Openings', icon: 'briefcase-outline' as const },
 { id: 'internship', label: 'Internships', icon: 'school-outline' as const },
 { id: 'remote', label: 'Remote Only', icon: 'globe-outline' as const },
 { id: 'full-time', label: 'Graduate Roles', icon: 'ribbon-outline' as const },
];

export default function JobsScreen() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const queryClient = useQueryClient();
 const [query, setQuery] = useState('');
 const [selectedFilter, setSelectedFilter] = useState('all');
 const [createModalOpen, setCreateModalOpen] = useState(false);
 const [applicantsJob, setApplicantsJob] = useState<JobListing | null>(null);
 const [alertsModalOpen, setAlertsModalOpen] = useState(false);
 const [myApplicationsOpen, setMyApplicationsOpen] = useState(false);
 const [myPostingsOpen, setMyPostingsOpen] = useState(false);
 const [editingJob, setEditingJob] = useState<JobListing | null>(null);
 const debouncedQuery = useDebouncedValue(query);
 const { campusCode } = useCampusScope();

 const { data: jobs, isLoading, isError, error, refetch } = useQuery({
 queryKey: ['jobs', debouncedQuery, campusCode],
 queryFn: () => listJobs({ q: debouncedQuery || undefined, campusCode }),
 });

 const { data: myApplications } = useQuery({
 queryKey: ['my-applications'],
 queryFn: () => listMyApplications(),
 });
 const myApplicationStatusByJobId = useMemo(() => {
 const map: Record<string, JobApplicationStatus> = {};
 (myApplications ?? []).forEach((app) => {
 map[app.jobId] = app.status;
 });
 return map;
 }, [myApplications]);

 const filteredJobs = (jobs ?? []).filter((j) => {
 if (selectedFilter === 'internship') return j.type === 'Internship';
 if (selectedFilter === 'remote') return j.remote;
 if (selectedFilter === 'full-time') return j.type === 'Full-time';
 return true;
 });

  return (
    <ScreenContainer glow={false}>
      {isDesktop ? (
        <ScrollView style={{ flex: 1, width: '100%' }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 60 }}
        >
          {/* Top Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h1" weight="bold">
                Career & Internships
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Community-posted internships, alumni referrals, and graduate roles
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="shield-checkmark" size={15} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" weight="semiBold">Campus Network Listings</AppText>
              </View>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setMyApplicationsOpen(true);
                }}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: radius.pill,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
                <AppText variant="bodySmall" weight="bold">
                  My Applications
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setMyPostingsOpen(true);
                }}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: radius.pill,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="briefcase-outline" size={16} color={colors.textPrimary} />
                <AppText variant="bodySmall" weight="bold">
                  My Postings
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setAlertsModalOpen(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: radius.pill,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="notifications-outline" size={16} color={colors.textPrimary} />
                <AppText variant="bodySmall" weight="bold">
                  Job Alerts
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setCreateModalOpen(true);
                }}
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
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <AppText variant="bodySmall" weight="bold" tone="inverse">
                  Post Opportunity
                </AppText>
              </Pressable>
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
                  placeholder="Search jobs"
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8 }}>
                {JOB_FILTERS.map((f) => {
                  const isSelected = selectedFilter === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setSelectedFilter(f.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : colors.background,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Ionicons
                        name={f.icon}
                        size={14}
                        color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={isSelected ? 'bold' : 'medium'}
                        style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                      >
                        {f.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </SolidCard>

          {/* Jobs Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Available Positions ({filteredJobs.length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Cards & Skeleton / Error States */}
          {isLoading ? (
            <ListItemSkeletonList count={5} />
          ) : isError ? (
            <ErrorStateView
              title="Could not load career openings"
              error={error}
              onRetry={refetch}
            />
          ) : filteredJobs.length === 0 ? (
            <EmptyState title="No positions found" description="Try adjusting your search keywords or filter category." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {filteredJobs.map((item) => (
                <View key={item.id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 560, gap: 6 }}>
                  <JobCard
                    job={item}
                    myApplicationStatusByJobId={myApplicationStatusByJobId}
                    onApplied={() => queryClient.invalidateQueries({ queryKey: ['my-applications'] })}
                  />
                  {item.posterId === user?.id && (
                    <Pressable
                      onPress={() => setApplicantsJob(item)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        borderRadius: radius.md,
                        backgroundColor: colors.pastelPrimaryBg,
                      }}
                    >
                      <Ionicons name="people-outline" size={14} color={colors.brandPrimary} />
                      <AppText variant="caption" weight="bold" tone="brand">
                        View Applicants{item.applicationsCount ? ` (${item.applicationsCount})` : ''}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
 /* Mobile Layout */
 <>
        <AppHeader />
        <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <AppText weight="bold" style={{ fontSize: isDesktop ? 22 : 18, lineHeight: isDesktop ? 28 : 24 }}>
              Career & Jobs
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setMyApplicationsOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="My Applications"
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setMyPostingsOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="My Postings"
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="briefcase-outline" size={16} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setAlertsModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Job alerts"
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="notifications-outline" size={16} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCreateModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Post a new job opening"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <AppText weight="bold" tone="inverse" variant="caption" style={{ fontSize: 11 }}>
                  Post Job
                </AppText>
              </Pressable>
            </View>
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ fontSize: isDesktop ? 13 : 11.5, lineHeight: 16, marginTop: 2 }}>
            Community-posted roles, alumni referrals & industry gigs
          </AppText>
        </View>

 {/* Search Input Bar */}
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 backgroundColor: colors.surface,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 paddingHorizontal: spacing.md,
 height: 42,
 marginBottom: spacing.sm,
 }}
 >
 <Ionicons name="search" size={16} color={colors.textSecondary} />
 <TextInput
 value={query}
 onChangeText={setQuery}
 placeholder="Search jobs"
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
 />
 </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%', flexGrow: 0, marginBottom: spacing.md }}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: 16 }}
          {...({ 'data-horizontal-scroll': 'true' } as any)}
        >
 {JOB_FILTERS.map((f) => {
 const selected = selectedFilter === f.id;
 return (
 <Pressable
 key={f.id}
 onPress={() => setSelectedFilter(f.id)}
 style={{
 backgroundColor: selected ? colors.brandPrimary : colors.surface,
 borderRadius: radius.pill,
 paddingHorizontal: spacing.md,
 paddingVertical: 7,
 borderWidth: 1,
 borderColor: selected ? colors.brandPrimary : colors.border,
 }}
 >
 <AppText variant="caption" weight={selected ? 'bold' : 'medium'} tone={selected ? 'inverse' : 'secondary'}>
 {f.label}
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>

 <FlatList
 data={filteredJobs}
 keyExtractor={(item) => item.id}
 contentContainerStyle={{ gap: spacing.md, paddingBottom: 130 }}
 renderItem={({ item }) => (
   <View style={{ gap: 6 }}>
     <JobCard
       job={item}
       myApplicationStatusByJobId={myApplicationStatusByJobId}
       onApplied={() => queryClient.invalidateQueries({ queryKey: ['my-applications'] })}
     />
     {item.posterId === user?.id && (
       <Pressable
         onPress={() => setApplicantsJob(item)}
         style={{
           flexDirection: 'row',
           alignItems: 'center',
           justifyContent: 'center',
           gap: 6,
           paddingVertical: 8,
           borderRadius: radius.md,
           backgroundColor: colors.pastelPrimaryBg,
         }}
       >
         <Ionicons name="people-outline" size={14} color={colors.brandPrimary} />
         <AppText variant="caption" weight="bold" tone="brand">
           View Applicants{item.applicationsCount ? ` (${item.applicationsCount})` : ''}
         </AppText>
       </Pressable>
     )}
   </View>
 )}
 showsVerticalScrollIndicator={false}
 ListEmptyComponent={
              isLoading ? (
                <ListItemSkeletonList count={5} />
              ) : isError ? (
                <ErrorStateView
                  title="Could not load career openings"
                  error={error}
                  onRetry={refetch}
                />
              ) : (
                <EmptyState title="No jobs found" description="Try a different search or filter." />
              )
            }
 />
 </>
 )}

 <CreateJobModal
 visible={createModalOpen || !!editingJob}
 job={editingJob}
 onClose={() => {
   setCreateModalOpen(false);
   setEditingJob(null);
 }}
 onCreated={() => {
   queryClient.invalidateQueries({ queryKey: ['jobs'] });
   queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
 }}
 />
 <JobApplicantsModal
   visible={!!applicantsJob}
   job={applicantsJob}
   onClose={() => setApplicantsJob(null)}
 />
 <JobAlertsModal
   visible={alertsModalOpen}
   onClose={() => setAlertsModalOpen(false)}
   initialKeywords={query}
 />
 <MyApplicationsModal
   visible={myApplicationsOpen}
   onClose={() => setMyApplicationsOpen(false)}
 />
 <MyPostingsModal
   visible={myPostingsOpen}
   onClose={() => setMyPostingsOpen(false)}
   onEdit={(job) => {
     setMyPostingsOpen(false);
     setEditingJob(job);
   }}
   onViewApplicants={(job) => {
     setMyPostingsOpen(false);
     setApplicantsJob(job);
   }}
 />
 </ScreenContainer>
 );
}

/** A poster's own postings, any status - edit, close/reopen, or delete. Backed by listMyJobs() (src/api/jobs.ts). */
function MyPostingsModal({
  visible,
  onClose,
  onEdit,
  onViewApplicants,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: (job: JobListing) => void;
  onViewApplicants: (job: JobListing) => void;
}) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: myJobs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: listMyJobs,
    enabled: visible,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  }

  function statusOf(job: JobListing): { label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' } {
    if (job.isClosed) return { label: 'Closed', tone: 'neutral' };
    if (!job.isApproved) return { label: 'Pending Review', tone: 'warning' };
    if (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now()) return { label: 'Expired', tone: 'critical' };
    return { label: 'Live', tone: 'success' };
  }

  async function handleToggleClosed(job: JobListing) {
    haptics.light();
    setActingId(job.id);
    try {
      if (job.isClosed) await reopenJob(job.id);
      else await closeJob(job.id);
      refresh();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could Not Update Posting', err?.message || 'Please try again.');
    } finally {
      setActingId(null);
    }
  }

  function confirmDelete(job: JobListing) {
    haptics.error();
    Alert.alert(
      'Delete this posting?',
      `"${job.title}" and its applications will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActingId(job.id);
            try {
              await deleteJob(job.id);
              refresh();
            } catch (err: any) {
              haptics.error();
              Alert.alert('Could Not Delete Posting', err?.message || 'Please try again.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <View
          style={{
            borderWidth: 1,
            borderRadius: 22,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderColor: colors.border,
            width: isDesktop ? 640 : '92%',
            maxHeight: isDesktop ? '85%' : '88%',
            marginBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                My Postings
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                {myJobs.length} posting{myJobs.length === 1 ? '' : 's'} - edit, close, or delete
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : isError ? (
              <ErrorStateView title="Could not load your postings" error={error} onRetry={refetch} />
            ) : myJobs.length === 0 ? (
              <EmptyState
                icon="briefcase-outline"
                title="No postings yet"
                description="Jobs and internships you post show up here so you can edit, close, or delete them."
              />
            ) : (
              myJobs.map((job) => {
                const status = statusOf(job);
                return (
                  <View key={job.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                          {job.title}
                        </AppText>
                        <AppText tone="secondary" variant="caption" numberOfLines={1}>
                          {job.company} • {job.location}
                        </AppText>
                      </View>
                      <Badge label={status.label} tone={status.tone} />
                    </View>
                    <AppText tone="secondary" variant="caption">
                      {job.applicationsCount} applicant{job.applicationsCount === 1 ? '' : 's'} • Posted{' '}
                      {new Date(job.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <AppButton label="Edit" size="sm" variant="secondary" onPress={() => onEdit(job)} />
                      <AppButton
                        label={`Applicants${job.applicationsCount ? ` (${job.applicationsCount})` : ''}`}
                        size="sm"
                        variant="secondary"
                        onPress={() => onViewApplicants(job)}
                      />
                      <AppButton
                        label={job.isClosed ? 'Reopen' : 'Close'}
                        size="sm"
                        variant="secondary"
                        loading={actingId === job.id}
                        disabled={!!actingId && actingId !== job.id}
                        onPress={() => handleToggleClosed(job)}
                      />
                      <AppButton
                        label="Delete"
                        size="sm"
                        variant="ghost"
                        loading={actingId === job.id}
                        disabled={!!actingId && actingId !== job.id}
                        onPress={() => confirmDelete(job)}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <AppButton label="Close" variant="secondary" fullWidth onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
