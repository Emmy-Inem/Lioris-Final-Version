import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { ApplyForVerificationModal } from '@/components/ApplyForVerificationModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { supabase } from '@/api/supabase';
import { submitVerificationRequest } from '@/api/verification';

type VerificationState = 'loading' | 'verified' | 'pending' | 'needs_documents';

interface OnboardingVerificationStepProps {
  /** Route of the screen using this step, e.g. '/(auth)/verify-school'. */
  currentPath: string;
  mode: 'student' | 'alumni';
}

/**
 * First onboarding step for students and alumni.
 *
 * Whether someone is verified is decided on the server, never here: an address on a
 * launched institution's domain is verified automatically once the user has proved they
 * own the inbox (see supabase_email_confirmation_2026.sql). Everyone else - personal
 * gmail/yahoo addresses and so on - applies with a document that a moderator reviews.
 */
export function OnboardingVerificationStep({ currentPath, mode }: OnboardingVerificationStepProps) {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user } = useAuth();
  const advance = useAdvanceOnboarding(currentPath);
  const [state, setState] = useState<VerificationState>('loading');
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.id) return;
      const { data } = await supabase.from('profiles').select('verification_status').eq('id', user.id).maybeSingle();
      if (!active) return;
      const status = data?.verification_status;
      setState(status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : 'needs_documents');
    }
    load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleSubmit(payload: {
    institutionClaimed: string;
    documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    setErrorMessage(null);
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: user.fullName,
        documentType: payload.documentType,
        documentReference: payload.documentReference,
        institutionClaimed: payload.institutionClaimed,
        documentPhotoUri: payload.documentPhotoUri,
        photoBlob: payload.photoBlob,
      });
      setState('pending');
    } catch (err: any) {
      setErrorMessage(err?.message || 'We could not submit your documents. Please try again.');
    }
  }

  const heading =
    state === 'verified' ? "You're verified" : state === 'pending' ? 'Application received' : mode === 'alumni' ? 'Verify your alumni status' : 'Verify your school';

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <AuthHeroBackground height={160}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={mode === 'alumni' ? 'ribbon' : 'school'} size={30} color="#FFFFFF" style={{ marginBottom: spacing.sm }} />
            <AppText variant="h1" weight="bold" tone="inverse">
              {heading}
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          {state === 'loading' ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : null}

          {state === 'verified' ? (
            <>
              <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
                Your school email is confirmed, so your account is already verified. No documents are needed.
              </AppText>
              <AppButton label="Continue" onPress={() => advance()} fullWidth />
            </>
          ) : null}

          {state === 'pending' ? (
            <>
              <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
                A campus moderator is reviewing your documents. You can keep setting up your profile now - some features stay
                limited until you are approved, and you will get a notification when it is done.
              </AppText>
              <AppButton label="Continue" onPress={() => advance()} fullWidth />
            </>
          ) : null}

          {state === 'needs_documents' ? (
            <>
              <AppText tone="secondary" style={{ marginBottom: spacing.sm }}>
                {user?.email ? (
                  <>
                    <AppText weight="bold">{user.email}</AppText> is not a university email address, so we cannot confirm your
                    enrollment automatically.
                  </>
                ) : (
                  'We cannot confirm your enrollment automatically.'
                )}
              </AppText>
              <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
                {mode === 'alumni'
                  ? 'Upload a photo of your certificate, transcript or alumni ID and a moderator will review it. Signing up with your university email skips this step.'
                  : 'Upload a photo of your student ID or admission letter and a moderator will review it. Signing up with your university email skips this step.'}
              </AppText>

              {errorMessage ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                    borderColor: colors.critical,
                    borderWidth: 1,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    marginBottom: spacing.md,
                  }}
                >
                  <Ionicons name="alert-circle" size={18} color={colors.critical} />
                  <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                    {errorMessage}
                  </AppText>
                </View>
              ) : null}

              <AppButton label="Upload verification documents" onPress={() => setModalOpen(true)} fullWidth />
              <View style={{ marginTop: spacing.md }}>
                <AppButton label="Skip for now" variant="secondary" onPress={() => advance()} fullWidth />
              </View>
            </>
          ) : null}
        </WaveCard>
      </ScrollView>

      <ApplyForVerificationModal visible={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
    </ScreenContainer>
  );
}
