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
 <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30 }}>
 {/* Left Column: Filters & CTA */}
 <View style={{ width: 260, gap: spacing.md }}>
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
 placeholder="Search jobs, company..."
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
 />
 </View>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
 Job Type
 </AppText>
 <View style={{ gap: 4 }}>
 {JOB_FILTERS.map((f) => {
 const isSelected = selectedFilter === f.id;
 return (
 <Pressable
 key={f.id}
 onPress={() => setSelectedFilter(f.id)}
 style={({ hovered }: any) => [
 {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 10,
 paddingHorizontal: 12,
 paddingVertical: 8,
 borderRadius: radius.md,
 backgroundColor: isSelected
 ? colors.brandPrimary
 : hovered
 ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons
 name={f.icon}
 size={16}
 color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
 />
 <AppText
 variant="bodySmall"
 weight={isSelected ? 'bold' : 'medium'}
 style={{ color: isSelected ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B', flex: 1 }}
 >
 {f.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </SolidCard>

 <Pressable
 onPress={() => {
 haptics.light();
 setCreateModalOpen(true);
 }}
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
 <Ionicons name="add-circle" size={18} color="#FFFFFF" />
 <AppText variant="bodySmall" weight="bold" tone="inverse">
 Post an Opportunity
 </AppText>
 </Pressable>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
 <Ionicons name="people" size={16} color={colors.brandPrimary} />
 <AppText variant="bodySmall" weight="bold">Alumni Referrals</AppText>
 </View>
 <AppText variant="caption" tone="secondary">
 Connect with verified alumni mentors for internal job referrals and interview prep.
 </AppText>
 </SolidCard>
 </View>

 {/* Right Column: Multi-Column Jobs Grid */}
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h2" weight="bold">
 Career Openings ({filteredJobs.length})
 </AppText>
 </View>

 <FlatList
 data={filteredJobs}
 keyExtractor={(item) => item.id}
 numColumns={2}
 columnWrapperStyle={{ gap: spacing.md }}
 contentContainerStyle={{ gap: spacing.md, paddingBottom: 40 }}
 renderItem={({ item }) => (
 <View style={{ flex: 1, minWidth: 0, marginBottom: spacing.md }}>
 <JobCard job={item} />
 </View>
 )}
 showsVerticalScrollIndicator={true}
 ListEmptyComponent={!isLoading ? <EmptyState title="No jobs found" description="Try a different search or filter." /> : null}
 />
 </View>
 </View>
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
