import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { StarRating } from './common/StarRating';
import { MentorDetailSheet } from './mentorship/MentorDetailSheet';
import { RequestMentorshipModal } from './RequestMentorshipModal';
import { useTheme } from '@/theme/ThemeProvider';
import { MentorProfile } from '@/api/types';
import { SESSION_MODES, describeAvailability, matchLabel } from '@/utils/mentorship';

/** Why a student cannot ask this mentor right now (null = they can). */
export function mentorRequestBlock(mentor: MentorProfile): string | null {
  if (mentor.myRequestStatus === 'active') return 'Your mentor';
  if (mentor.myRequestStatus === 'pending') return 'Request sent';
  if (!mentor.isAccepting) return 'Not taking requests';
  if (mentor.openSlots <= 0) return 'No free slots';
  return null;
}

export function MentorCard({ mentor, onRequested }: { mentor: MentorProfile; onRequested?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const [detailOpen, setDetailOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const block = mentorRequestBlock(mentor);
  const availability = describeAvailability(mentor.availability);
  const match = matchLabel(mentor.matchScore);
  const role = [mentor.jobTitle, mentor.company].filter(Boolean).join(' at ');

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <Pressable
        onPress={() => setDetailOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`View ${mentor.fullName}'s mentor profile`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Avatar name={mentor.fullName} uri={mentor.avatarUrl} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <AppText variant="h3" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                {mentor.fullName}
              </AppText>
              {match ? <Badge label={match} tone="success" /> : null}
            </View>
            {mentor.headline ? (
              <AppText variant="bodySmall" numberOfLines={2} style={{ marginTop: 1 }}>
                {mentor.headline}
              </AppText>
            ) : null}
            <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>
              {[role, mentor.department, mentor.campusCode && mentor.campusCode !== 'GLOBAL' ? mentor.campusCode : null]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            <View style={{ marginTop: 4 }}>
              {mentor.ratingCount > 0 && mentor.avgRating != null ? (
                <StarRating value={mentor.avgRating} size={13} showValue count={mentor.ratingCount} />
              ) : (
                <AppText tone="secondary" variant="caption">
                  New mentor - no reviews yet
                </AppText>
              )}
            </View>
          </View>
        </View>

        {mentor.expertiseTags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {mentor.expertiseTags.slice(0, 5).map((tag) => (
              <View
                key={tag}
                style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.pastelPrimaryBg }}
              >
                <AppText variant="caption" weight="semiBold" tone="brand">
                  {tag}
                </AppText>
              </View>
            ))}
            {mentor.expertiseTags.length > 5 ? (
              <AppText variant="caption" tone="secondary" style={{ alignSelf: 'center' }}>
                +{mentor.expertiseTags.length - 5}
              </AppText>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}>
          {availability ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary">
                {availability}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {SESSION_MODES.filter((m) => mentor.sessionModes.includes(m.key)).map((m) => (
              <Ionicons key={m.key} name={m.icon} size={14} color={colors.textSecondary} accessibilityLabel={m.label} />
            ))}
          </View>
          {mentor.completedCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="ribbon-outline" size={13} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary">
                {mentor.completedCount} mentored
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.md,
          paddingTop: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        <AppText
          tone="secondary"
          variant="caption"
          weight="semiBold"
          style={{ flexShrink: 1, minWidth: 110, ...(mentor.openSlots > 0 && mentor.isAccepting ? { color: colors.success } : {}) }}
        >
          {!mentor.isAccepting
            ? 'Paused - not taking requests'
            : `${mentor.openSlots} of ${mentor.maxMentees} slot${mentor.maxMentees === 1 ? '' : 's'} open`}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <AppButton label="Profile" variant="ghost" size="sm" onPress={() => setDetailOpen(true)} />
          <AppButton
            label={block ?? 'Request mentorship'}
            size="sm"
            disabled={!!block}
            onPress={() => setRequestOpen(true)}
          />
        </View>
      </View>

      <MentorDetailSheet
        mentor={mentor}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        blockedReason={block}
        onRequest={() => {
          setDetailOpen(false);
          setRequestOpen(true);
        }}
      />
      <RequestMentorshipModal
        visible={requestOpen}
        mentor={mentor}
        onClose={() => setRequestOpen(false)}
        onSuccess={() => onRequested?.()}
      />
    </SolidCard>
  );
}
