import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { ChipSelect } from '@/components/ChipSelect';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { MentorCard } from '@/components/MentorCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listMentorships, searchMentors } from '@/api/mentorship';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const EXPERTISE_CATEGORIES = ['All Fields', 'Software', 'Resume Prep', 'Finance', 'Research', 'Design'];

const STATUS_TONE = {
  pending: 'warning',
  active: 'success',
  completed: 'neutral',
  declined: 'critical',
} as const;

export default function StudentMentorshipScreen() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [expertise, setExpertise] = useState('All Fields');

  const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });
  const { data: mentors, isLoading } = useQuery({
    queryKey: ['mentors', debouncedQuery, expertise],
    queryFn: () => searchMentors({ q: debouncedQuery || undefined, focusArea: expertise }),
  });

  const myApplications = mentorships?.filter((m) => m.studentId === 'me') ?? [];

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg }}>
          Mentorship Hub
        </AppText>
        <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
          Lioris Mentors & Advisors 🎯
        </AppText>

        <AppTextField
          label=""
          placeholder="Search mentors by name, company, or skills..."
          value={query}
          onChangeText={setQuery}
        />

        <View style={{ marginBottom: spacing.lg }}>
          <ChipSelect
            options={EXPERTISE_CATEGORIES}
            selected={[expertise]}
            onToggle={(value) => setExpertise(value)}
          />
        </View>

        {myApplications.length > 0 ? (
          <SolidCard style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText weight="bold" tone="brand">
                My Sent Applications 🤝
              </AppText>
              <Badge label={`${myApplications.length} pending`} tone="brand" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {myApplications.map((app) => (
                <SolidCard key={app.id} radius={12} style={{ width: 200 }}>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                    {app.mentorName}
                  </AppText>
                  {app.focusArea ? (
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                      Focus: {app.focusArea}
                    </AppText>
                  ) : null}
                  <View style={{ marginTop: spacing.sm }}>
                    <Badge label={app.status} tone={STATUS_TONE[app.status]} />
                  </View>
                </SolidCard>
              ))}
            </ScrollView>
          </SolidCard>
        ) : null}

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Find a mentor
        </AppText>
        {mentors?.map((mentor) => (
          <MentorCard
            key={mentor.id}
            mentor={mentor}
            onRequested={() => queryClient.invalidateQueries({ queryKey: ['mentorships'] })}
          />
        ))}
        {!isLoading && (mentors?.length ?? 0) === 0 ? (
          <EmptyState title="No mentors found" description="Try a different search term or category." />
        ) : null}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}
