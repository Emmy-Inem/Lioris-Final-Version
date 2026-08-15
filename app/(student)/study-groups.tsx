import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { StudyGroupCard } from '@/components/StudyGroupCard';
import { EmptyState } from '@/components/EmptyState';
import { CreateStudyGroupModal } from '@/components/CreateStudyGroupModal';
import { useTheme } from '@/theme/ThemeProvider';
import { listStudyGroups, createStudyGroup } from '@/api/studyGroups';

export default function StudyGroupsScreen() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: groups, isLoading } = useQuery({ queryKey: ['study-groups'], queryFn: listStudyGroups });

  async function handleCreate(payload: Parameters<typeof createStudyGroup>[0]) {
    await createStudyGroup(payload);
    queryClient.invalidateQueries({ queryKey: ['study-groups'] });
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, marginBottom: spacing.md }}>
        <AppText variant="h1" weight="bold">
          Study Groups
        </AppText>
        <Pressable
          onPress={() => setCreateModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Create a study group"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.brandPrimary,
            borderRadius: 999,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Ionicons name="add-circle" size={16} color="#FFFFFF" />
          <AppText weight="bold" tone="inverse" variant="bodySmall">
            New Group
          </AppText>
        </Pressable>
      </View>
      <FlatList
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StudyGroupCard group={item} onJoined={() => queryClient.invalidateQueries({ queryKey: ['study-groups'] })} />
        )}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!isLoading ? <EmptyState title="No study groups yet" /> : null}
      />
      <CreateStudyGroupModal visible={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreate={handleCreate} />
    </ScreenContainer>
  );
}
