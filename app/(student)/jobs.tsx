import React, { useState } from 'react';
import { FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listJobs } from '@/api/jobs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function JobsScreen() {
  const { spacing } = useTheme();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', debouncedQuery],
    queryFn: () => listJobs({ q: debouncedQuery || undefined }),
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg, marginBottom: spacing.md }}>
        Jobs & Internships
      </AppText>
      <AppTextField label="" placeholder="Search jobs, companies..." value={query} onChangeText={setQuery} />
      <FlatList
        data={jobs ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <JobCard job={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!isLoading ? <EmptyState title="No jobs found" /> : null}
      />
    </ScreenContainer>
  );
}
