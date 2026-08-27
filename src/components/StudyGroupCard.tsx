import React, { useState } from'react';
import { View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { StudyGroup } from'@/api/types';
import { joinStudyGroup } from'@/api/studyGroups';

export function StudyGroupCard({ group, onJoined }: { group: StudyGroup; onJoined?: () => void }) {
 const { colors, spacing, radius } = useTheme();
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

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <AppButton
          label={joined ? 'Member' : 'Join Pod'}
          variant={joined ? 'secondary' : 'primary'}
          onPress={handleJoin}
          loading={submitting}
        />
      </View>
 </SolidCard>
 );
}
