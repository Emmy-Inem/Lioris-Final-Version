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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1" weight="bold">
            Study Pods 📚
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

      <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start', flex: 1 } : undefined}>
        {/* Left Filter Rail (Desktop) / Horizontal Scroll (Mobile) */}
        {isDesktop ? (
          <View style={{ width: 260 }}>
            <SolidCard radius={20} style={{ padding: spacing.md, gap: spacing.sm }}>
              <AppText variant="bodySmall" weight="bold">Search Pods</AppText>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: spacing.sm,
                  height: 38,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter course or topic..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
              </View>

              <AppText variant="caption" tone="secondary" weight="bold" style={{ textTransform: 'uppercase', marginTop: spacing.xs, fontSize: 10 }}>
                Course Cohorts
              </AppText>
              {COURSE_FILTERS.map((f) => {
                const isSelected = selectedFilter === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setSelectedFilter(f)}
                    style={({ hovered }: any) => [
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radius.md,
                        backgroundColor: isSelected
                          ? colors.brandPrimary
                          : hovered
                            ? colors.pastelPrimaryBg
                            : 'transparent',
                      },
                    ]}
                  >
                    <AppText
                      variant="bodySmall"
                      weight={isSelected ? 'bold' : 'medium'}
                      tone={isSelected ? 'inverse' : 'primary'}
                    >
                      {f}
                    </AppText>
                  </Pressable>
                );
              })}
            </SolidCard>
          </View>
        ) : (
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
        )}

        {/* Right Pods Grid */}
        <View style={{ flex: 1 }}>
          {filteredGroups.length === 0 && !isLoading ? (
            <EmptyState
              title="No study groups found"
              description="Start a collaborative pod for your course and invite classmates to join."
            />
          ) : (
            <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
              {filteredGroups.map((item) => (
                <View key={item.id} style={isDesktop ? { width: '48.5%' } : { marginBottom: spacing.sm }}>
                  <StudyGroupCard
                    group={item}
                    onJoined={() => queryClient.invalidateQueries({ queryKey: ['study-groups'] })}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <CreateStudyGroupModal
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreate}
      />
    </ScreenContainer>
  );
}
