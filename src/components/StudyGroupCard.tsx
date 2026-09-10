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
 <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
 <View
 style={{
 width: 44,
 height: 44,
 borderRadius: radius.md,
 backgroundColor: colors.pastelPrimaryBg,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="people-outline"size={22} color={colors.brandPrimary} />
 </View>
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <Badge label={group.isPublic ? 'Public Pod' : 'Private Pod'} tone={group.isPublic ? 'brand' : 'neutral'} />
 <AppText tone="secondary"variant="caption">
 {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
 </AppText>
 </View>
 <AppText variant="h3"weight="bold"style={{ marginTop: 2 }}>
 {group.name}
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold">
 {group.courseCode}
 </AppText>
 </View>
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 18 }}>
 {group.description}
 </AppText>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
        {/* Member count only. This used to render an avatar stack from the
            hardcoded initials ['Ad', 'Ch', 'Em'], so a pod with one member
            showed a face for two people who don't exist. StudyGroup carries
            no member list, so the honest thing to show is the number. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: colors.pastelPrimaryBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          >
            <Ionicons name="people" size={13} color={colors.brandPrimary} />
          </View>
          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
            {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
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
