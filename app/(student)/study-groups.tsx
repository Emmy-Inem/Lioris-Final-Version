import React, { useState } from 'react';
import { FlatList, Pressable, TextInput, View, ScrollView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AppButton } from '@/components/AppButton';
import { StudyGroupCard } from '@/components/StudyGroupCard';
import { EmptyState } from '@/components/EmptyState';
import { CreateStudyGroupModal } from '@/components/CreateStudyGroupModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listStudyGroups, createStudyGroup } from '@/api/studyGroups';

const COURSE_FILTERS = ['All Pods', 'CSC 401', 'CSC 412', 'MAT 201', 'EEE 301', 'Public Circles'];

export default function StudyGroupsScreen() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();
 const [createModalOpen, setCreateModalOpen] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedFilter, setSelectedFilter] = useState('All Pods');

 const { data: groups, isLoading } = useQuery({ queryKey: ['study-groups'], queryFn: () => listStudyGroups() });

 async function handleCreate(payload: Parameters<typeof createStudyGroup>[0]) {
 await createStudyGroup(payload);
 queryClient.invalidateQueries({ queryKey: ['study-groups'] });
 }

 const filteredGroups = (groups ?? []).filter((g) => {
 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase();
 if (!g.name.toLowerCase().includes(q) && !(g.courseCode ?? '').toLowerCase().includes(q) && !(g.description ?? '').toLowerCase().includes(q)) {
 return false;
 }
 }
 if (selectedFilter !== 'All Pods' && selectedFilter !== 'Public Circles') {
 if (g.courseCode !== selectedFilter) return false;
 }
 return true;
 });

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      
      {/* Top Title & Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1" weight="bold">
            Study Pods
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            Collaborative course squads, exam revision circles, and weekly peer sprints
          </AppText>
        </View>
        <AppButton
          label="+ Create Pod"
          variant="primary"
          onPress={() => setCreateModalOpen(true)}
        />
      </View>

      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}
      >
        {isDesktop ? (
          <>
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
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search by course code, topic, or study pod..."
                    placeholderTextColor={colors.textSecondary}
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Course Cohort Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {COURSE_FILTERS.map((f) => {
                    const isSelected = selectedFilter === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setSelectedFilter(f)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: radius.pill,
                          backgroundColor: isSelected ? colors.brandPrimary : colors.background,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText
                          variant="bodySmall"
                          weight={isSelected ? 'bold' : 'medium'}
                          style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                        >
                          {f}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </SolidCard>

            {/* Pods Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {filteredGroups.map((item) => (
                <View key={item.id} style={{ width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 560 }}>
                  <StudyGroupCard
                    group={item}
                    onJoined={() => queryClient.invalidateQueries({ queryKey: ['study-groups'] })}
                  />
                </View>
              ))}
            </View>

            {filteredGroups.length === 0 && !isLoading ? (
              <EmptyState
                title="No study groups found"
                description="Start a collaborative pod for your course and invite classmates to join."
              />
            ) : null}
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
              {COURSE_FILTERS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setSelectedFilter(f)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: selectedFilter === f ? colors.brandPrimary : colors.surface,
                    borderWidth: 1,
                    borderColor: selectedFilter === f ? colors.brandPrimary : colors.border,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={selectedFilter === f ? 'inverse' : 'secondary'}>
                    {f}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>

            <View>
              {filteredGroups.length === 0 && !isLoading ? (
                <EmptyState
                  title="No study groups found"
                  description="Start a collaborative pod for your course and invite classmates to join."
                />
              ) : (
                filteredGroups.map((item) => (
                  <View key={item.id} style={{ marginBottom: spacing.sm }}>
                    <StudyGroupCard
                      group={item}
                      onJoined={() => queryClient.invalidateQueries({ queryKey: ['study-groups'] })}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CreateStudyGroupModal
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreate}
      />
    </ScreenContainer>
  );
}
