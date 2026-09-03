import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { MentorCard } from'@/components/MentorCard';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listMentorships, searchMentors } from '@/api/mentorship';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const EXPERTISE_CATEGORIES = ['All Fields', 'Software', 'Resume Prep', 'Finance', 'Research', 'Design'];

export default function StudentMentorshipScreen() {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [expertise, setExpertise] = useState('All Fields');
  const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });
  const { data: mentors, isLoading } = useQuery({
    queryKey: ['mentors', debouncedQuery, expertise],
    queryFn: () => searchMentors({ q: debouncedQuery || undefined, focusArea: expertise }),
  });

  const myApplications = mentorships?.filter((m) => !!user?.id && m.studentId === user.id) ?? [];

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Top Header & Intro */}
        <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
          <AppText variant="h1" weight="bold">
            Alumni Mentorship
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            Connect with verified alumni and faculty mentors for career advice, technical coaching, and professional growth.
          </AppText>
        </View>

        {myApplications.length > 0 && (
          <SolidCard style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText weight="bold" tone="brand">
                My Mentorship Applications
              </AppText>
              <Badge label={`${myApplications.length} submitted`} tone="brand" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {myApplications.map((app) => (
                <SolidCard key={app.id} radius={12} style={{ width: 220 }}>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                    {app.mentorName}
                  </AppText>
                  {app.focusArea ? (
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                      Focus: {app.focusArea}
                    </AppText>
                  ) : null}
                  <View style={{ marginTop: 6 }}>
                    <Badge
                      label={app.status.toUpperCase()}
                      tone={app.status === 'active' ? 'success' : app.status === 'declined' ? 'critical' : 'warning'}
                    />
                  </View>
                </SolidCard>
              ))}
            </ScrollView>
          </SolidCard>
        )}

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

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
          Verified Alumni Mentors ({mentors?.length ?? 0})
        </AppText>

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
          {mentors?.map((mentor) => (
            <View key={mentor.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 300 } : undefined}>
              <MentorCard
                mentor={mentor}
                onRequested={() => queryClient.invalidateQueries({ queryKey: ['mentorships'] })}
              />
            </View>
          ))}
        </View>

        {!isLoading && (mentors?.length ?? 0) === 0 ? (
          <EmptyState title="No mentors found" description="Try a different search term or category." />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
