import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { CreateJobModal } from '@/components/CreateJobModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listJobs } from '@/api/jobs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { haptics } from '@/utils/haptics';

const JOB_FILTERS = [
 { id: 'all', label: 'All Openings', icon: 'briefcase-outline' as const },
 { id: 'internship', label: 'Internships', icon: 'school-outline' as const },
 { id: 'remote', label: 'Remote Only', icon: 'globe-outline' as const },
 { id: 'full-time', label: 'Graduate Roles', icon: 'ribbon-outline' as const },
];

export default function JobsScreen() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const queryClient = useQueryClient();
 const [query, setQuery] = useState('');
 const [selectedFilter, setSelectedFilter] = useState('all');
 const [createModalOpen, setCreateModalOpen] = useState(false);
 const debouncedQuery = useDebouncedValue(query);

 const { data: jobs, isLoading } = useQuery({
 queryKey: ['jobs', debouncedQuery],
 queryFn: () => listJobs({ q: debouncedQuery || undefined }),
 });

 const filteredJobs = (jobs ?? []).filter((j) => {
 if (selectedFilter === 'internship') return j.type === 'Internship';
 if (selectedFilter === 'remote') return j.remote;
 if (selectedFilter === 'full-time') return j.type === 'Full-time';
 return true;
 });

  return (
    <ScreenContainer glow={false}>
      {isDesktop ? (
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 60 }}
        >
          {/* Top Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h1" weight="bold">
                Career & Internships
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Verified student internships, alumni referrals, and graduate associate roles
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pastelPrimaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
                <Ionicons name="shield-checkmark" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">Alumni Verified Roles</AppText>
              </View>

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
                  placeholder="Search by job title, company, skills..."
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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

          {/* Multi-Column Responsive Grid with Non-Stretching Cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {filteredJobs.map((item) => (
              <View key={item.id} style={{ width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 560 }}>
                <JobCard job={item} />
              </View>
            ))}
          </View>

          {filteredJobs.length === 0 && !isLoading ? (
            <EmptyState title="No positions found" description="Try adjusting your search keywords or filter category." />
          ) : null}
        </ScrollView>
      ) : (
 /* Mobile Layout */
 <>
 <AppHeader />
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText variant="h1" weight="bold">
 Career & Internships
 </AppText>
 <AppText tone="secondary" variant="bodySmall">
 Verified student roles, alumni referrals & industry gigs
 </AppText>
 </View>
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
 paddingVertical: 8,
 }}
 >
 <Ionicons name="add" size={18} color="#FFFFFF" />
 <AppText weight="bold" tone="inverse" variant="caption">
 Post Job
 </AppText>
 </Pressable>
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
 placeholder="Search jobs, company, keywords..."
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
 />
 </View>

 {/* Category Filter Chips */}
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
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
 renderItem={({ item }) => <JobCard job={item} />}
 showsVerticalScrollIndicator={true}
 ListEmptyComponent={!isLoading ? <EmptyState title="No jobs found" description="Try a different search or filter." /> : null}
 />
 </>
 )}

 <CreateJobModal
 visible={createModalOpen}
 onClose={() => setCreateModalOpen(false)}
 onCreated={() => queryClient.invalidateQueries({ queryKey: ['jobs'] })}
 />
 </ScreenContainer>
 );
}
