import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { isUnverifiedPersonalUser, getCampusVerificationInfo } from '@/utils/verificationGate';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

export function GuestTeaserBanner() {
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

  // Only unverified personal accounts see this banner
  if (!isUnverifiedPersonalUser(profile)) {
    return null;
  }

  const isPending = profile?.verificationStatus === 'pending';
  const info = getCampusVerificationInfo(profile?.institutionCode);

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
          styles.banner,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : colors.pastelPrimaryBg,
            borderColor: colors.brandPrimary,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginBottom: spacing.md,
          },
        ]}
      >
        <View style={styles.contentRow}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.brandPrimary },
            ]}
          >
            <Ionicons
              name={isPending ? 'hourglass-outline' : 'shield-outline'}
              size={16}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.textColumn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="caption" weight="bold" tone="brand">
                {isPending ? 'VERIFICATION IN REVIEW' : 'PREVIEW MODE'}
              </AppText>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 6,
                  backgroundColor: isPending ? '#D97706' : colors.brandPrimary,
                }}
              >
                <AppText style={{ fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' }}>
                  {info.campusCode}
                </AppText>
              </View>
            </View>

            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {isPending
                ? 'Your student ID submission is pending moderator approval.'
                : `You are previewing ${info.institutionName}. Verify student status to unlock comments, venues, and chat.`}
            </AppText>
          </View>

          {!isPending && (
            <Pressable
              onPress={() => {
                haptics.light();
                setModalOpen(true);
              }}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.brandPrimary, borderRadius: radius.sm },
              ]}
            >
              <AppText variant="caption" weight="bold" tone="inverse">
                Verify ID
              </AppText>
            </Pressable>
          )}
        </View>
      </View>

      <ApplyForVerificationModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitVerification}
        defaultInstitution={profile?.institutionCode}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderLeftWidth: 4,
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
