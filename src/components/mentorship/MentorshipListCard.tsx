import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from '../SolidCard';
import { AppText } from '../AppText';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { Mentorship } from '@/api/types';
import { mentorshipStatusLabel, mentorshipStatusTone } from '@/utils/mentorship';
import { relativeTime } from '@/utils/dateTime';

/** One row in a student's "My mentorships" or a mentor's pipeline. Tapping opens the mentorship space. */
export function MentorshipListCard({
  mentorship,
  viewerIsMentor,
  onPress,
  footer,
}: {
  mentorship: Mentorship;
  viewerIsMentor: boolean;
  onPress: () => void;
  footer?: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const name = viewerIsMentor ? mentorship.studentName || 'Student' : mentorship.mentorName;
  const avatar = viewerIsMentor ? mentorship.studentAvatarUrl : mentorship.mentorAvatarUrl;
  const sub = viewerIsMentor ? mentorship.studentDepartment || 'Student mentee' : mentorship.mentorHeadline || 'Alumni mentor';
  const preview = mentorship.status === 'pending' ? mentorship.pitch : mentorship.status === 'declined' ? mentorship.declineReason : null;
  const activity = mentorship.lastActivityAt ?? mentorship.createdAt;

  return (
    <SolidCard radius={18} style={{ gap: spacing.sm }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open mentorship with ${name}`} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Avatar name={name} uri={avatar} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText weight="bold" numberOfLines={1}>
              {name}
            </AppText>
            <AppText tone="secondary" variant="caption" numberOfLines={1}>
              {sub}
            </AppText>
          </View>
          <Badge label={mentorshipStatusLabel(mentorship.status)} tone={mentorshipStatusTone(mentorship.status)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {mentorship.focusArea ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.pastelPrimaryBg }}>
              <AppText variant="caption" weight="semiBold" tone="brand">
                {mentorship.focusArea}
              </AppText>
            </View>
          ) : null}
          {mentorship.academicLevel ? (
            <AppText variant="caption" tone="secondary">
              {mentorship.academicLevel}
            </AppText>
          ) : null}
          {activity ? (
            <AppText variant="caption" tone="secondary" style={{ marginLeft: 'auto' }}>
              {relativeTime(activity)}
            </AppText>
          ) : null}
        </View>
        {preview ? (
          <AppText variant="bodySmall" tone="secondary" numberOfLines={3} style={{ lineHeight: 18 }}>
            {preview}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
          <AppText variant="caption" weight="semiBold" tone="brand">
            Open
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.brandPrimary} />
        </View>
      </Pressable>
      {footer}
    </SolidCard>
  );
}
