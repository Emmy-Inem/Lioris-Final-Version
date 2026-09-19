import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { getCampusVerificationInfo } from '@/utils/verificationGate';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

interface VerificationRequiredGateProps {
  campusCode?: string;
  featureName?: 'comments' | 'venue' | 'chat' | 'posting';
  customTitle?: string;
  customMessage?: string;
  inline?: boolean;
  onContinueBrowsing?: () => void;
  onStartVerification?: () => void;
}

export function VerificationRequiredGate({
  campusCode,
  featureName = 'comments',
  customTitle,
  customMessage,
  inline = true,
  onContinueBrowsing,
  onStartVerification,
}: VerificationRequiredGateProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const effectiveCampus = campusCode || profile?.institutionCode || 'CAMPUS';
  const info = getCampusVerificationInfo(effectiveCampus);

  let message = customMessage;
  if (!message) {
    if (featureName === 'comments') message = info.commentsGateMessage;
    else if (featureName === 'venue') message = info.venueGateMessage;
    else if (featureName === 'chat') message = info.chatGateMessage;
    else if (featureName === 'posting') message = info.postGateMessage;
    else message = info.commentsGateMessage;
  }

  const title = customTitle || info.lockTitle;
  const isPending = profile?.verificationStatus === 'pending';

  async function handleSubmitVerification(data: {
    institutionClaimed: string;
    documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: profile?.fullName ?? user.fullName,
        documentType: data.documentType,
        documentReference: data.documentReference,
        institutionClaimed: data.institutionClaimed,
        documentPhotoUri: data.documentPhotoUri,
        photoBlob: data.photoBlob,
      });
      markVerificationPending(user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setModalOpen(false);
      toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit verification request. Please try again.');
    }
  }

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(248, 250, 252, 0.95)',
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.lg,
          },
          !inline && styles.fullOverlay,
        ]}
      >
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: colors.pastelPrimaryBg,
            },
          ]}
        >
          <Ionicons
            name={isPending ? 'hourglass-outline' : 'shield-checkmark'}
            size={28}
            color={colors.brandPrimary}
          />
        </View>

        <AppText variant="h3" weight="bold" style={styles.title}>
          {isPending ? 'Verification Under Review' : title}
        </AppText>

        <AppText
          variant="bodySmall"
          tone="secondary"
          style={styles.description}
        >
          {isPending
            ? `Your student verification application for ${info.institutionName} is currently being reviewed by campus moderators. Full access will unlock once approved.`
            : message}
        </AppText>

        <View style={styles.buttonRow}>
          {!isPending ? (
            <AppButton
              label="Upload Student ID / Verify"
              variant="primary"
              onPress={() => {
                haptics.light();
                if (onStartVerification) {
                  onStartVerification();
                } else {
                  setModalOpen(true);
                }
              }}
              fullWidth
            />
          ) : (
            <AppButton
              label="Check Verification Status"
              variant="secondary"
              onPress={() => {
                haptics.light();
                toast.info('Your verification is pending admin review.');
              }}
              fullWidth
            />
          )}

          {onContinueBrowsing && (
            <Pressable
              onPress={() => {
                haptics.light();
                onContinueBrowsing();
              }}
              style={styles.continueLink}
            >
              <AppText variant="caption" tone="secondary" weight="semiBold">
                Continue in Preview Mode
              </AppText>
            </Pressable>
          )}
        </View>
      </View>

      <ApplyForVerificationModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitVerification}
        defaultInstitution={effectiveCampus}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginVertical: 12,
  },
  fullOverlay: {
    marginVertical: 0,
    minHeight: 220,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    maxWidth: 420,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  buttonRow: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
  },
  continueLink: {
    paddingVertical: 6,
  },
});
