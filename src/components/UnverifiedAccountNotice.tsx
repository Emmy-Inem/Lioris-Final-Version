import React, { useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

export function UnverifiedAccountNotice() {
  const { colors, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isDesktop } = useResponsive();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  // Admin and staff or already verified accounts never see this card
  if (!user || user.role === 'admin' || user.role === 'staff') {
    return null;
  }

  if (profile?.verificationStatus === 'verified' || profile?.isVerified) {
    return null;
  }

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
        accessibilityRole="alert"
        accessibilityLabel={
          isPending
            ? 'Verification under review by campus moderators'
            : 'Account not verified. Tap to verify with your student ID.'
        }
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radius.lg,
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.09)' : 'rgba(254, 243, 199, 0.75)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.32)',
          gap: 10,
        }}
      >
        {/* Left Icon */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.22)',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ionicons
            name={isPending ? 'time-outline' : 'shield-outline'}
            size={18}
            color={isDark ? '#FBBF24' : '#D97706'}
          />
        </View>

        {/* Text Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <AppText
              weight="bold"
              style={{
                fontSize: 13,
                lineHeight: 16,
                color: isDark ? '#FCD34D' : '#92400E',
              }}
            >
              {isPending ? 'Verification Under Review' : 'Account Not Verified'}
            </AppText>
          </View>
          <AppText
            style={{
              fontSize: 11.5,
              lineHeight: 15,
              color: isDark ? 'rgba(253, 230, 138, 0.88)' : '#78350F',
              marginTop: 2,
            }}
          >
            {isPending
              ? 'Your student credentials are being reviewed by moderators.'
              : 'Verify with your student ID or admission letter to get your campus tick.'}
          </AppText>
        </View>

        {/* Action Button / Status Badge */}
        {!isPending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Verify student account now"
            onPress={() => {
              haptics.light();
              setModalOpen(true);
            }}
            style={({ pressed }) => ({
              // White text needs the deeper amber to retain AA contrast.
              backgroundColor: pressed ? '#78350F' : '#92400E',
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              flexShrink: 0,
            })}
          >
            <AppText weight="bold" style={{ fontSize: 12, color: '#FFFFFF' }}>
              Verify Now
            </AppText>
          </Pressable>
        ) : (
          <View
            style={{
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: radius.pill,
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.18)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.25)',
              flexShrink: 0,
            }}
          >
            <AppText weight="semiBold" style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#92400E' }}>
              In Review
            </AppText>
          </View>
        )}
      </View>

      <ApplyForVerificationModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitVerification}
        defaultInstitution={profile?.institutionName}
      />
    </>
  );
}
