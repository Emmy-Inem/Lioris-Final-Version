import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listJobs } from '@/api/jobs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const JOB_FILTERS = [
  { id: 'all', label: 'All Openings 💼' },
  { id: 'internship', label: 'Internships 🎓' },
  { id: 'remote', label: 'Remote 🌐' },
  { id: 'full-time', label: 'Graduate Roles 🚀' },
];

export default function JobsScreen() {
  const { colors, spacing, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
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
      <AppHeader />
      <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
        <AppText variant="h1" weight="bold">
          Career & Internships 💼
        </AppText>
        <AppText tone="secondary" variant="bodySmall">
          Verified student roles, alumni referrals & industry gigs
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
          placeholder="Search jobs, company, keywords..."
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.sm }}
        style={{ marginBottom: spacing.sm }}
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
              <AppText
                variant="caption"
                weight={selected ? 'bold' : 'medium'}
                tone={selected ? 'inverse' : 'secondary'}
              >
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filteredJobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 130 }}
        renderItem={({ item }) => <JobCard job={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!isLoading ? <EmptyState title="No jobs found" description="Try clearing search or check back soon." /> : null}
      />
    </ScreenContainer>
  );
}
