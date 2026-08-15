import React, { useEffect, useState } from'react';
import { Modal, View } from'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { Badge } from'./Badge';
import { AppButton } from'./AppButton';
import { AppTextField } from'./AppTextField';
import { useTheme } from'@/theme/ThemeProvider';
import { MentorProfile } from'@/api/types';
import { requestMentorship } from'@/api/mentorship';

export function MentorCard({ mentor, onRequested }: { mentor: MentorProfile; onRequested?: () => void }) {
  const { spacing } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [pitch, setPitch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    if (modalOpen) {
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      scale.value = withSpring(1, { damping: 16, stiffness: 220 });
    } else {
      opacity.value = 0;
      scale.value = 0.92;
    }
  }, [modalOpen, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await requestMentorship(mentor.id, pitch.trim() || undefined);
      setRequested(true);
      setModalOpen(false);
      onRequested?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Avatar name={mentor.fullName} uri={mentor.avatarUrl} size={52} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3"weight="bold">
            {mentor.fullName}
          </AppText>
          <AppText tone="secondary"variant="bodySmall">
            {[mentor.company, mentor.department].filter(Boolean).join(' \u00b7 ')}
          </AppText>
        </View>
      </View>

      <AppText tone="secondary"style={{ marginTop: spacing.sm }}>
        {mentor.bio}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        {mentor.expertiseTags.map((tag) => (
          <Badge key={tag} label={tag} tone="brand" />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
        <AppText tone="secondary"variant="caption">
          {mentor.availableSlots} slot{mentor.availableSlots === 1 ? '' : 's'} available
        </AppText>
        <AppButton
          label={requested ? 'Requested' : 'Request mentorship'}
          disabled={requested}
          onPress={() => setModalOpen(true)}
        />
      </View>

      <Modal visible={modalOpen} transparent animationType="fade"onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Animated.View style={[{ width: '100%' }, animatedStyle]}>
          <SolidCard radius={20} style={{ width: '100%' }}>
            <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.xs }}>
              Pitch to {mentor.fullName}
            </AppText>
            <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
              A short note on what you're hoping to get out of mentorship.
            </AppText>
            <AppTextField
              label=""placeholder="e.g. Looking for guidance breaking into fintech PM roles..."value={pitch}
              onChangeText={setPitch}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
              <AppButton label="Cancel"variant="ghost"onPress={() => setModalOpen(false)} />
              <AppButton label="Send request"onPress={handleSubmit} loading={submitting} />
            </View>
          </SolidCard>
          </Animated.View>
        </View>
      </Modal>
    </SolidCard>
  );
}
