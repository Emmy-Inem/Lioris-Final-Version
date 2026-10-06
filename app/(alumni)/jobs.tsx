import React, { useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Modal,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { JobCardSkeletonList } from '@/components/Skeleton';
import { CreateJobModal } from '@/components/CreateJobModal';
import { JobAlertsModal } from '@/components/JobAlertsModal';
import { JobApplyModal } from '@/components/JobApplyModal';
import { JobApplicantsModal } from '@/components/JobApplicantsModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listJobs, listMyJobs, closeJob, reopenJob, deleteJob, JobsQuery } from '@/api/jobs';
import { toggleSavedItem, SAVED_ITEMS_KEY } from '@/api/bookmarks';
import { hasAppliedToJob } from '@/api/jobApplications';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { JobListing } from '@/api/types';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

const WORKPLACE_OPTIONS = ['All', 'Remote', 'Hybrid', 'On-site'] as const;
const JOB_TYPE_OPTIONS = ['All', 'Full-time', 'Contract', 'Internship', 'Part-time'] as const;
const EXPERIENCE_OPTIONS = ['All', 'Entry level', 'Mid-Senior level', 'Executive'] as const;
const DATE_POSTED_OPTIONS = [
  { id: 'all', label: 'Any time' },
  { id: 'past24h', label: 'Past 24h' },
  { id: 'pastWeek', label: 'Past week' },
  { id: 'pastMonth', label: 'Past month' },
] as const;

export default function AlumniJobsScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { campusCode } = useCampusScope();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(searchQuery);

  const [selectedWorkplace, setSelectedWorkplace] = useState<(typeof WORKPLACE_OPTIONS)[number]>('All');
  const [selectedJobType, setSelectedJobType] = useState<(typeof JOB_TYPE_OPTIONS)[number]>('All');
  const [selectedExperience, setSelectedExperience] = useState<(typeof EXPERIENCE_OPTIONS)[number]>('All');
  const [selectedDatePosted, setSelectedDatePosted] = useState<string>('all');
  const [savedOnly, setSavedOnly] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<JobListing | null>(null);
  const [applicantsJob, setApplicantsJob] = useState<JobListing | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Record<string, boolean>>({});
  const [checkingApplied, setCheckingApplied] = useState(false);
  const [messagingPosterId, setMessagingPosterId] = useState<string | null>(null);
  const [myPostingsOpen, setMyPostingsOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobListing | null>(null);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedWorkplace !== 'All' ||
    selectedJobType !== 'All' ||
    selectedExperience !== 'All' ||
    selectedDatePosted !== 'all' ||
    savedOnly;

  function resetFilters() {
    haptics.light();
    setSearchQuery('');
    setSelectedWorkplace('All');
    setSelectedJobType('All');
    setSelectedExperience('All');
    setSelectedDatePosted('all');
    setSavedOnly(false);
  }

  const queryParams: JobsQuery = useMemo(() => {
    return {
      q: debouncedQuery || undefined,
      campusCode,
      workplaceType: selectedWorkplace !== 'All' ? selectedWorkplace : undefined,
      type: selectedJobType !== 'All' ? (selectedJobType as any) : undefined,
      experienceLevel: selectedExperience !== 'All' ? selectedExperience : undefined,
      datePosted: selectedDatePosted as any,
      savedOnly: savedOnly ? true : undefined,
    };
  }, [debouncedQuery, campusCode, selectedWorkplace, selectedJobType, selectedExperience, selectedDatePosted, savedOnly]);

  const { data: jobs = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['jobs', 'alumni-portal', queryParams],
    queryFn: () => listJobs(queryParams),
  });

  async function handleToggleSave(job: JobListing, e?: any) {
    if (e?.stopPropagation) e.stopPropagation();
    haptics.medium();
    setSavingJobId(job.id);
    const willBeSaved = !job.isSaved;

    // Optimistically update query data
    queryClient.setQueryData<JobListing[]>(['jobs', 'alumni-portal', queryParams], (old) => {
      if (!old) return old;
      return old.map((j) => (j.id === job.id ? { ...j, isSaved: willBeSaved } : j));
    });

    try {
      await toggleSavedItem('job', job.id, willBeSaved, {
        title: job.title,
        subtitle: `${job.company} • ${job.location}`,
      });
      void queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY('job') });
      toast.show({
        message: willBeSaved ? 'Job saved to your bookmarks' : 'Job removed from saved items',
        tone: 'success',
      });
    } catch {
      // Revert on error
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'alumni-portal'] });
      toast.show({ message: 'Could not update bookmark', tone: 'error' });
    } finally {
      setSavingJobId(null);
    }
  }

  function handleApply(job: JobListing) {
    haptics.light();
    if (isSafeHttpUrl(job.applyUrl)) {
      void openExternalUrl(job.applyUrl);
    } else {
      toast.show({ message: 'No direct external link provided for this posting', tone: 'warning' });
    }
  }

  async function handleMessagePoster(job: JobListing) {
    if (!job.posterId || messagingPosterId) return;
    haptics.light();
    setMessagingPosterId(job.posterId);
    try {
      const conv = await getOrCreateConversationWithUser(job.posterId, job.postedByName);
      setSelectedJob(null);
      router.push(`/(alumni)/messages/${conv.id}` as any);
    } catch (err: any) {
      haptics.error();
      toast.show({ message: err?.message || 'Could not open this conversation. Please try again.', tone: 'error' });
    } finally {
      setMessagingPosterId(null);
    }
  }

  function handleOpenJobDetail(job: JobListing) {
    haptics.light();
    setSelectedJob(job);
    if (job.acceptsInAppApplications) {
      setCheckingApplied(true);
      hasAppliedToJob(job.id)
        .then((applied) => setAppliedJobIds((prev) => ({ ...prev, [job.id]: applied })))
        .finally(() => setCheckingApplied(false));
    }
  }

  function formatTimeAgo(isoDate?: string): string {
    if (!isoDate) return 'Recently';
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      {/* Main Container */}
      <View style={{ flex: 1, width: '100%' }}>
        {/* Top Header Section */}
        <View
          style={{
            paddingTop: isDesktop ? spacing.md : spacing.xs,
            paddingBottom: spacing.sm,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.md,
            flexWrap: 'wrap',
          }}
        >
          <View style={{ flex: 1, minWidth: 240 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
                Alumni Career Portal
              </AppText>
              <Badge label="Exclusive" tone="brand" />
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Executive roles, alumni-led hiring, startup ventures, and student talent referrals
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppButton
              label="My Postings"
              icon="briefcase-outline"
              variant="secondary"
              size="sm"
              onPress={() => {
                haptics.light();
                setMyPostingsOpen(true);
              }}
            />
            <AppButton
              label="Job Alerts"
              icon="notifications-outline"
              variant="secondary"
              size="sm"
              onPress={() => {
                haptics.light();
                setAlertsModalOpen(true);
              }}
            />
            <AppButton
              label="Post Opportunity"
              icon="add"
              variant="primary"
              size="sm"
              onPress={() => {
                haptics.light();
                setCreateModalOpen(true);
              }}
            />
          </View>
        </View>

        {/* Search Bar */}
        <SolidCard
          radius={18}
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: spacing.xs,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by job title, skill, company, or keywords..."
            placeholderTextColor={colors.textSecondary}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: 14,
              padding: 0,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </SolidCard>

        {/* LinkedIn-Style Horizontal Filter Chips Bar */}
        <View style={{ marginBottom: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {/* Saved Jobs Toggle Pill */}
            <Pressable
              onPress={() => {
                haptics.light();
                setSavedOnly(!savedOnly);
              }}
              style={[
                styles.filterPill,
                {
                  backgroundColor: savedOnly ? colors.brandPrimary : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                  borderColor: savedOnly ? colors.brandPrimary : colors.border,
                },
              ]}
            >
              <Ionicons
                name={savedOnly ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={savedOnly ? '#FFFFFF' : colors.textPrimary}
              />
              <AppText
                variant="caption"
                weight={savedOnly ? 'bold' : 'regular'}
                style={{ color: savedOnly ? '#FFFFFF' : colors.textPrimary, fontSize: 11.5 }}
              >
                Saved Jobs
              </AppText>
            </Pressable>

            {/* Workplace Filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {WORKPLACE_OPTIONS.map((wp) => {
                const active = selectedWorkplace === wp;
                return (
                  <Pressable
                    key={wp}
                    onPress={() => {
                      haptics.light();
                      setSelectedWorkplace(wp);
                    }}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? (isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.12)') : colors.surface,
                        borderColor: active ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={active ? 'bold' : 'regular'}
                      style={{ color: active ? colors.brandPrimary : colors.textSecondary, fontSize: 11.5 }}
                    >
                      {wp === 'All' ? 'Any Workplace' : wp}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Job Type Filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {JOB_TYPE_OPTIONS.map((jt) => {
                const active = selectedJobType === jt;
                return (
                  <Pressable
                    key={jt}
                    onPress={() => {
                      haptics.light();
                      setSelectedJobType(jt);
                    }}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? (isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.12)') : colors.surface,
                        borderColor: active ? '#10B981' : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={active ? 'bold' : 'regular'}
                      style={{ color: active ? '#10B981' : colors.textSecondary, fontSize: 11.5 }}
                    >
                      {jt === 'All' ? 'All Types' : jt}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Experience Level Filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {EXPERIENCE_OPTIONS.map((exp) => {
                const active = selectedExperience === exp;
                return (
                  <Pressable
                    key={exp}
                    onPress={() => {
                      haptics.light();
                      setSelectedExperience(exp);
                    }}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? (isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.12)') : colors.surface,
                        borderColor: active ? '#8B5CF6' : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={active ? 'bold' : 'regular'}
                      style={{ color: active ? '#8B5CF6' : colors.textSecondary, fontSize: 11.5 }}
                    >
                      {exp === 'All' ? 'Any Experience' : exp}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Date Posted Filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {DATE_POSTED_OPTIONS.map((dp) => {
                const active = selectedDatePosted === dp.id;
                return (
                  <Pressable
                    key={dp.id}
                    onPress={() => {
                      haptics.light();
                      setSelectedDatePosted(dp.id);
                    }}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? (isDark ? 'rgba(236, 72, 153, 0.25)' : 'rgba(236, 72, 153, 0.12)') : colors.surface,
                        borderColor: active ? '#EC4899' : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={active ? 'bold' : 'regular'}
                      style={{ color: active ? '#EC4899' : colors.textSecondary, fontSize: 11.5 }}
                    >
                      {dp.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Reset Filter Button */}
            {hasActiveFilters && (
              <Pressable
                onPress={resetFilters}
                style={[styles.filterPill, { backgroundColor: (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'), borderColor: colors.border }]}
              >
                <Ionicons name="refresh" size={13} color={colors.critical} />
                <AppText variant="caption" weight="bold" style={{ color: colors.critical, fontSize: 11.5 }}>
                  Reset Filters
                </AppText>
              </Pressable>
            )}
          </ScrollView>
        </View>

        {/* Job Listings List */}
        {isLoading || (isFetching && jobs.length === 0) ? (
          <JobCardSkeletonList count={4} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="briefcase-outline"
            title="No Opportunities Match Your Filters"
            description="Try adjusting your workplace, experience level, or date posted settings to see more listings."
            actionLabel={hasActiveFilters ? 'Clear All Filters' : 'Post an Opportunity'}
            onAction={hasActiveFilters ? resetFilters : () => setCreateModalOpen(true)}
          />
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleOpenJobDetail(item)}
              >
                <SolidCard
                  radius={18}
                  style={{
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          backgroundColor: colors.pastelPrimaryBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name="business-outline" size={22} color={colors.brandPrimary} />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="h3" weight="bold" numberOfLines={1}>
                          {item.title}
                        </AppText>
                        <AppText tone="secondary" style={{ fontSize: 12.5, marginTop: 1 }} numberOfLines={1}>
                          {item.company} • {item.location}
                        </AppText>

                        {/* Tag Pills */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          <Badge
                            label={item.workplaceType || (item.remote ? 'Remote' : 'On-site')}
                            tone={item.workplaceType === 'Remote' || item.remote ? 'success' : 'neutral'}
                          />
                          <Badge label={item.type} tone="brand" />
                          {item.experienceLevel && <Badge label={item.experienceLevel} tone="neutral" />}
                          {item.salary && (
                            <Badge label={item.salary} tone="accent" />
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Bookmark / Save Action Button */}
                    <Pressable
                      onPress={(e) => handleToggleSave(item, e)}
                      hitSlop={10}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        backgroundColor: item.isSaved ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF') : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                      }}
                      accessibilityLabel={item.isSaved ? 'Remove from saved jobs' : 'Save job'}
                    >
                      <Ionicons
                        name={item.isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={19}
                        color={item.isSaved ? colors.brandPrimary : colors.textSecondary}
                      />
                    </Pressable>
                  </View>

                  {/* Card Footer */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: spacing.sm,
                      paddingTop: spacing.xs,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      Posted by {item.postedByName} • {formatTimeAgo(item.createdAt)}
                    </AppText>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isSafeHttpUrl(item.applyUrl) && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleApply(item);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                          }}
                        >
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                            Apply ↗
                          </AppText>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => handleOpenJobDetail(item)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          backgroundColor: colors.pastelPrimaryBg,
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                          View Details
                        </AppText>
                      </Pressable>
                    </View>
                  </View>

                  {item.posterId === user?.id && (
                    <Pressable
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        haptics.light();
                        setApplicantsJob(item);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        marginTop: spacing.xs,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: colors.pastelPrimaryBg,
                      }}
                    >
                      <Ionicons name="people-outline" size={14} color={colors.brandPrimary} />
                      <AppText variant="caption" weight="bold" tone="brand">
                        View Applicants{item.applicationsCount ? ` (${item.applicationsCount})` : ''}
                      </AppText>
                    </Pressable>
                  )}
                </SolidCard>
              </Pressable>
            )}
          />
        )}
      </View>

      {/* Detailed Job Inspection Modal */}
      {selectedJob && (
        <Modal
          visible={!!selectedJob}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedJob(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedJob(null)} />
            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  width: isDesktop ? 600 : '92%',
                  maxHeight: isDesktop ? '82%' : '88%',
                },
              ]}
            >
              {/* Modal Header */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
                  <AppText variant="h2" weight="bold">
                    {selectedJob.title}
                  </AppText>
                  <AppText tone="secondary" style={{ fontSize: 13, marginTop: 2 }}>
                    {selectedJob.company} • {selectedJob.location}
                  </AppText>
                </View>

                <Pressable onPress={() => setSelectedJob(null)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
                showsVerticalScrollIndicator={false}
              >
                {/* Badges bar */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Badge
                    label={selectedJob.workplaceType || (selectedJob.remote ? 'Remote' : 'On-site')}
                    tone={selectedJob.workplaceType === 'Remote' || selectedJob.remote ? 'success' : 'neutral'}
                  />
                  <Badge label={selectedJob.type} tone="brand" />
                  {selectedJob.experienceLevel && <Badge label={selectedJob.experienceLevel} tone="neutral" />}
                  {selectedJob.salary && <Badge label={selectedJob.salary} tone="accent" />}
                  <Badge label={`Posted ${formatTimeAgo(selectedJob.createdAt)}`} tone="neutral" />
                </View>

                {/* Poster Info Card */}
                <SolidCard radius={14} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={selectedJob.postedByName} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" style={{ fontSize: 13 }}>
                      Posted by {selectedJob.postedByName}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      Alumni Network Recruiter
                    </AppText>
                  </View>
                  {selectedJob.posterId && selectedJob.posterId !== user?.id && (
                    <AppButton
                      label="Message"
                      size="sm"
                      variant="secondary"
                      icon="chatbubble-outline"
                      loading={messagingPosterId === selectedJob.posterId}
                      disabled={!!messagingPosterId}
                      onPress={() => handleMessagePoster(selectedJob)}
                    />
                  )}
                </SolidCard>

                {/* Job Description */}
                <View style={{ gap: 6 }}>
                  <AppText weight="bold" style={{ fontSize: 14 }}>
                    Role Overview & Requirements
                  </AppText>
                  <AppText tone="secondary" style={{ lineHeight: 22, fontSize: 13.5 }}>
                    {selectedJob.description && selectedJob.description.trim().length > 0
                      ? selectedJob.description
                      : 'The employer has provided this career opening for the university network. Referrals and direct applications are welcomed through the official link below.'}
                  </AppText>
                </View>

                {/* Salary Info if available */}
                {selectedJob.salary && (
                  <View style={{ gap: 4 }}>
                    <AppText weight="bold" style={{ fontSize: 13 }}>
                      Compensation Package
                    </AppText>
                    <AppText tone="brand" weight="bold" style={{ fontSize: 14 }}>
                      {selectedJob.salary}
                    </AppText>
                  </View>
                )}
              </ScrollView>

              {/* Modal Action Bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={selectedJob.isSaved ? 'Saved' : 'Save Job'}
                    icon={selectedJob.isSaved ? 'bookmark' : 'bookmark-outline'}
                    variant="secondary"
                    size="md"
                    fullWidth
                    onPress={() => handleToggleSave(selectedJob)}
                  />
                </View>

                {isSafeHttpUrl(selectedJob.applyUrl) && (
                  <View style={{ flex: selectedJob.acceptsInAppApplications ? 1 : 2 }}>
                    <AppButton
                      label={selectedJob.acceptsInAppApplications ? 'Company Site ↗' : 'Apply on Company Site ↗'}
                      variant={selectedJob.acceptsInAppApplications ? 'secondary' : 'primary'}
                      size="md"
                      fullWidth
                      onPress={() => handleApply(selectedJob)}
                    />
                  </View>
                )}

                {selectedJob.acceptsInAppApplications && (
                  <View style={{ flex: 2 }}>
                    <AppButton
                      label={appliedJobIds[selectedJob.id] ? 'Applied ✓' : 'Apply in Lioris'}
                      variant={appliedJobIds[selectedJob.id] ? 'secondary' : 'primary'}
                      size="md"
                      fullWidth
                      disabled={appliedJobIds[selectedJob.id] || checkingApplied}
                      onPress={() => setApplyModalJob(selectedJob)}
                    />
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      <JobAlertsModal
        visible={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        initialKeywords={searchQuery}
      />

      {/* Post Opportunity / Edit Posting Modal */}
      <CreateJobModal
        visible={createModalOpen || !!editingJob}
        job={editingJob}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingJob(null);
        }}
        onCreated={() => {
          const wasEdit = !!editingJob;
          setCreateModalOpen(false);
          setEditingJob(null);
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
          if (!wasEdit) {
            const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff';
            toast.show({
              message: isStaffOrAdmin
                ? 'Opportunity successfully posted to the Alumni Career Portal'
                : 'Opportunity submitted for review - it will appear once approved.',
              tone: 'success',
            });
          }
        }}
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

      {applyModalJob && (
        <JobApplyModal
          visible={!!applyModalJob}
          job={applyModalJob}
          onClose={() => setApplyModalJob(null)}
          onApplied={() => {
            setAppliedJobIds((prev) => ({ ...prev, [applyModalJob.id]: true }));
            setApplyModalJob(null);
          }}
        />
      )}

      <JobApplicantsModal
        visible={!!applicantsJob}
        job={applicantsJob}
        onClose={() => setApplicantsJob(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
  },
});

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
    // A rejection_reason distinguishes "actively turned down" from merely
    // "not reviewed yet" - both previously showed as the same "Pending
    // Review" chip, leaving a rejected poster with no idea anything had
    // actually happened to their posting.
    if (!job.isApproved && job.rejectionReason) return { label: 'Rejected', tone: 'critical' };
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
      <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 640 : '92%',
              maxHeight: isDesktop ? '85%' : '88%',
              marginBottom: Math.max(insets.bottom, 12),
            },
          ]}
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
              <JobCardSkeletonList count={2} />
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
                    {status.label === 'Rejected' && job.rejectionReason ? (
                      <View style={{ backgroundColor: `${colors.critical}15`, padding: spacing.sm, borderRadius: radius.sm }}>
                        <AppText variant="caption" weight="bold" tone="critical" style={{ marginBottom: 2 }}>
                          Why this was rejected:
                        </AppText>
                        <AppText variant="caption" tone="secondary">
                          {job.rejectionReason}
                        </AppText>
                      </View>
                    ) : null}
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
