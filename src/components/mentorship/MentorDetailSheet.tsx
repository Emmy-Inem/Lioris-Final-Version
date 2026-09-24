import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppButton } from '../AppButton';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { FormSheet } from '../common/FormSheet';
import { StarRating } from '../common/StarRating';
import { useTheme } from '@/theme/ThemeProvider';
import { MentorProfile } from '@/api/types';
import { SESSION_MODES, describeAvailability } from '@/utils/mentorship';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isSafeHttpUrl } from '@/utils/safeUrl';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** A mentor's full profile: what they offer, when they are free, how they mentor and how past mentees rated them. */
export function MentorDetailSheet({
  mentor,
  visible,
  onClose,
  onRequest,
  blockedReason,
}: {
  mentor: MentorProfile;
  visible: boolean;
  onClose: () => void;
  onRequest?: () => void;
  blockedReason?: string | null;
}) {
  const { colors, spacing, radius } = useTheme();
  const availability = describeAvailability(mentor.availability);
  const modes = SESSION_MODES.filter((m) => mentor.sessionModes.includes(m.key));

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Mentor profile"
      footer={
        onRequest ? (
          <AppButton label={blockedReason ?? 'Request mentorship'} disabled={!!blockedReason} onPress={onRequest} fullWidth />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <Avatar name={mentor.fullName} uri={mentor.avatarUrl} size={64} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <AppText variant="h3" weight="bold">
              {mentor.fullName}
            </AppText>
            <Badge label="Verified" tone="brand" />
          </View>
          {mentor.headline ? <AppText variant="bodySmall">{mentor.headline}</AppText> : null}
          <AppText tone="secondary" variant="caption">
            {[
              [mentor.jobTitle, mentor.company].filter(Boolean).join(' at '),
              mentor.yearsExperience != null ? `${mentor.yearsExperience} yr${mentor.yearsExperience === 1 ? '' : 's'} experience` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {[mentor.department, mentor.campusCode && mentor.campusCode !== 'GLOBAL' ? mentor.campusCode : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider, alignItems: 'center', gap: 2 }}>
          {mentor.ratingCount > 0 && mentor.avgRating != null ? (
            <StarRating value={mentor.avgRating} size={13} />
          ) : (
            <Ionicons name="star-outline" size={16} color={colors.textSecondary} />
          )}
          <AppText weight="bold">{mentor.ratingCount > 0 && mentor.avgRating != null ? mentor.avgRating.toFixed(1) : 'New'}</AppText>
          <AppText tone="secondary" variant="caption">
            {mentor.ratingCount > 0 ? `${mentor.ratingCount} review${mentor.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}
          </AppText>
        </View>
        <View style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider, alignItems: 'center', gap: 2 }}>
          <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
          <AppText weight="bold">{mentor.completedCount}</AppText>
          <AppText tone="secondary" variant="caption">
            mentored so far
          </AppText>
        </View>
        <View style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider, alignItems: 'center', gap: 2 }}>
          <Ionicons name="hourglass-outline" size={16} color={colors.textSecondary} />
          <AppText weight="bold">{mentor.isAccepting ? mentor.openSlots : 0}</AppText>
          <AppText tone="secondary" variant="caption">
            free slot{mentor.openSlots === 1 ? '' : 's'}
          </AppText>
        </View>
      </View>

      {mentor.about ? (
        <Section title="About">
          <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
            {mentor.about}
          </AppText>
        </Section>
      ) : null}

      {mentor.expertiseTags.length > 0 ? (
        <Section title="Can help with">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {mentor.expertiseTags.map((t) => (
              <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.pastelPrimaryBg }}>
                <AppText variant="caption" weight="semiBold" tone="brand">
                  {t}
                </AppText>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {mentor.industries.length > 0 ? (
        <Section title="Industries">
          <AppText variant="bodySmall">{mentor.industries.join(' · ')}</AppText>
        </Section>
      ) : null}

      <Section title="How they mentor">
        <View style={{ gap: 6 }}>
          {availability ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
              <AppText variant="bodySmall">Usually free: {availability}</AppText>
            </View>
          ) : null}
          {mentor.availability?.notes ? (
            <AppText tone="secondary" variant="caption">
              {mentor.availability.notes}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {modes.map((m) => (
              <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={m.icon} size={15} color={colors.textSecondary} />
                <AppText variant="bodySmall">{m.label}</AppText>
              </View>
            ))}
          </View>
        </View>
      </Section>

      {mentor.linkedinUrl && isSafeHttpUrl(mentor.linkedinUrl) ? (
        <Pressable
          onPress={() => void openExternalUrl(mentor.linkedinUrl as string)}
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Ionicons name="logo-linkedin" size={18} color={colors.brandPrimary} />
          <AppText variant="bodySmall" tone="brand" weight="semiBold">
            View LinkedIn profile
          </AppText>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}
