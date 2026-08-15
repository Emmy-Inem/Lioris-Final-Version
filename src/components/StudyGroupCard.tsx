import React, { useState } from 'react';
import { View } from 'react-native';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { StudyGroup } from '@/api/types';
import { joinStudyGroup } from '@/api/studyGroups';

export function StudyGroupCard({ group, onJoined }: { group: StudyGroup; onJoined?: () => void }) {
  const { spacing } = useTheme();
  const [joined, setJoined] = useState(group.isJoined);
  const [submitting, setSubmitting] = useState(false);

  async function handleJoin() {
    setSubmitting(true);
    try {
      await joinStudyGroup(group.id);
      setJoined(true);
      onJoined?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" weight="bold">
            {group.name}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {group.courseCode} {'\u00b7'} {group.memberCount} members
          </AppText>
        </View>
        <Badge label={group.isPublic ? 'Public' : 'Private'} tone={group.isPublic ? 'brand' : 'neutral'} />
      </View>

      <AppText tone="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
        {group.description}
      </AppText>

      <AppButton label={joined ? 'Open group' : 'Join group'} variant={joined ? 'secondary' : 'primary'} onPress={handleJoin} loading={submitting} />
    </SolidCard>
  );
}
