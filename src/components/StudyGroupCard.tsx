import React, { useState } from'react';
import { View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { AppButton } from'./AppButton';
import { StudyGroup } from '@/api/types';
import { joinStudyGroup, leaveStudyGroup } from '@/api/studyGroups';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export function StudyGroupCard({ group, onJoined }: { group: StudyGroup; onJoined?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const [joined, setJoined] = useState(group.isJoined);
  const [submitting, setSubmitting] = useState(false);

  async function handleToggleJoin() {
    setSubmitting(true);
    try {
      if (joined) {
        await leaveStudyGroup(group.id);
        setJoined(false);
      } else {
        await joinStudyGroup(group.id);
        setJoined(true);
      }
      onJoined?.();
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenDiscussion() {
    router.push({
      pathname: '/(student)/feed',
      params: { category: group.courseCode || 'Academics' },
    } as any);
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ionicons name="people-outline" size={26} color={colors.textSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <Badge label={group.isPublic ? 'Public Pod' : 'Private Pod'} tone="neutral" />
            <AppText tone="secondary" variant="caption">
              {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
            </AppText>
          </View>
          <AppText variant="h3" weight="bold" style={{ marginTop: 2 }}>
            {group.name}
          </AppText>
          <AppText tone="secondary" variant="caption" weight="bold">
            {group.courseCode}
          </AppText>
        </View>
      </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 18 }}>
 {group.description}
 </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', rowGap: spacing.sm, marginTop: spacing.xs }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center', justifyContent: 'flex-end', flexShrink: 1 }}>
          {joined && (
            <AppButton
              label="Discussion"
              variant="ghost"
              onPress={handleOpenDiscussion}
            />
          )}
          <AppButton
            label={joined ? 'Joined ✓' : 'Join Pod'}
            variant={joined ? 'secondary' : 'primary'}
            onPress={handleToggleJoin}
            loading={submitting}
          />
        </View>
      </View>
    </SolidCard>
  );
}
