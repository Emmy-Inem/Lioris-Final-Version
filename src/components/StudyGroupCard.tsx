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
 {group.memberCount} members
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {['Ad', 'Ch', 'Em'].slice(0, Math.min(3, group.memberCount || 1)).map((initials, idx) => (
            <View
              key={idx}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.pastelPrimaryBg,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: idx === 0 ? 0 : -6,
                borderWidth: 1.5,
                borderColor: colors.surface,
              }}
            >
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 9 }}>
                {initials}
              </AppText>
            </View>
          ))}
          {group.memberCount > 3 ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: radius.pill,
                backgroundColor: colors.background,
                marginLeft: 4,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <AppText variant="caption" tone="secondary" style={{ fontSize: 9 }}>
                +{group.memberCount - 3} more
              </AppText>
            </View>
          ) : null}
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
