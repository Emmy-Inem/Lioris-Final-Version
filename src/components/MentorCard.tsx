import React, { useState } from 'react';
import { View } from 'react-native';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { MentorProfile } from '@/api/types';
import { RequestMentorshipModal } from './RequestMentorshipModal';

export function MentorCard({ mentor, onRequested }: { mentor: MentorProfile; onRequested?: () => void }) {
  const { spacing } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Avatar name={mentor.fullName} uri={mentor.avatarUrl} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="h3" weight="bold">
            {mentor.fullName}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {[mentor.company, mentor.department].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>

      <AppText tone="secondary" style={{ marginTop: spacing.sm }}>
        {mentor.bio}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        {mentor.expertiseTags.map((tag) => (
          <Badge key={tag} label={tag} tone="neutral" />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
        <AppText tone="secondary" variant="caption">
          {typeof mentor.availableSlots === 'number'
            ? `${mentor.availableSlots} slot${mentor.availableSlots === 1 ? '' : 's'} available`
            : 'Open to mentorship requests'}
        </AppText>
        <AppButton
          label={requested ? 'Requested' : 'Request mentorship'}
          disabled={requested}
          onPress={() => setModalOpen(true)}
        />
      </View>

      <RequestMentorshipModal
        visible={modalOpen}
        mentor={mentor}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setRequested(true);
          onRequested?.();
        }}
      />
    </SolidCard>
  );
}
