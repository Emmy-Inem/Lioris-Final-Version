import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { MentorProfile } from '@/api/types';
import { requestMentorship } from '@/api/mentorship';

export function MentorCard({ mentor, onRequested }: { mentor: MentorProfile; onRequested?: () => void }) {
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
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
    toast.success('Mentorship session requested with ' + mentor.fullName + '!');
 } catch (err: any) {
 toast.error(err?.message || 'Could not send this mentorship request. Please try again.');
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
 <Badge key={tag} label={tag} tone="neutral" />
 ))}
 </View>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
 {/* Only shown when the mentor has actually published a capacity.
 Every mentor used to read "4 slots available" regardless. */}
 <AppText tone="secondary"variant="caption">
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

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isDesktop ? spacing.xl : spacing.md,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />
          <Animated.View style={[{ width: '100%', maxWidth: 480 }, animatedStyle]}>
            <SolidCard radius={20} style={{ width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                <AppText variant="h3" weight="bold" style={{ flex: 1 }}>
                  Pitch to {mentor.fullName}
                </AppText>
                <Pressable onPress={() => setModalOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                  <AppText tone="secondary" variant="bodySmall">✕</AppText>
                </Pressable>
              </View>
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                A short note on what you're hoping to get out of mentorship.
              </AppText>
              <AppTextField
                label=""
                placeholder="e.g. Looking for guidance breaking into fintech PM roles..."
                value={pitch}
                onChangeText={setPitch}
                multiline
                numberOfLines={3}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setModalOpen(false)} />
                <AppButton label="Send request" onPress={handleSubmit} loading={submitting} />
              </View>
            </SolidCard>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
 </SolidCard>
 );
}
