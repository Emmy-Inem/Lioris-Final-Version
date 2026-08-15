import React, { useState } from'react';
import { FlatList, Pressable, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { StudyGroupCard } from'@/components/StudyGroupCard';
import { EmptyState } from'@/components/EmptyState';
import { CreateStudyGroupModal } from'@/components/CreateStudyGroupModal';
import { useTheme } from'@/theme/ThemeProvider';
import { listStudyGroups, createStudyGroup } from'@/api/studyGroups';

export default function StudyGroupsScreen() {
  const { colors, spacing, radius } = useTheme();
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1"weight="bold">
            Study Pods 
          </AppText>
          <AppText tone="secondary"variant="bodySmall">
            Exam revision circles & course squads
          </AppText>
        </View>
        <Pressable
          onPress={() => setCreateModalOpen(true)}
          accessibilityRole="button"accessibilityLabel="Create a study group"style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.brandPrimary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
          }}
        >
          <Ionicons name="add"size={18} color="#FFFFFF" />
          <AppText weight="bold"tone="inverse"variant="caption">
            New Pod
          </AppText>
        </Pressable>
      </View>
      <FlatList
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 130 }}
        renderItem={({ item }) => (
          <StudyGroupCard group={item} onJoined={() => queryClient.invalidateQueries({ queryKey: ['study-groups'] })} />
        )}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!isLoading ? <EmptyState title="No study groups yet"description="Create the first study circle for your course." /> : null}
      />
      <CreateStudyGroupModal visible={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreate={handleCreate} />
    </ScreenContainer>
  );
}
