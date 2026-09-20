import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { supabase } from '@/api/supabase';
import { getInstitutionByCode } from '@/api/institutions';
import { markVerificationPending } from '@/api/profile';
import { submitVerificationRequest, SubmitVerificationPayload } from '@/api/verification';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { pickImageFromLibrary } from '@/utils/pickImage';
import { haptics } from '@/utils/haptics';

type VerificationState = 'loading' | 'verified' | 'pending' | 'needs_documents';
type DocumentType = SubmitVerificationPayload['documentType'];

const DOCUMENT_CHOICES: Record<'student' | 'alumni', DocumentType[]> = {
  student: ['Student ID', 'Admission Letter'],
  alumni: ['Alumni Certificate', 'Student ID'],
};

const BENEFITS: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { icon: 'chatbubbles-outline', text: 'Post, comment and join campus chats' },
  { icon: 'people-outline', text: 'Join study groups and see campus-only content' },
  { icon: 'shield-checkmark-outline', text: 'Get the verified badge on your profile' },
];

interface OnboardingVerificationStepProps {
  /** Route of the screen using this step, e.g. '/(auth)/onboarding/verify'. */
  currentPath: string;
}

/**
 * Onboarding step that lets a student or alumnus prove their campus membership. It is always
 * skippable: everything here is also reachable later from the profile and the home-screen notice.
 *
 * Whether someone is verified is decided on the server, never here: an address on a launched
 * institution's domain is verified automatically once the inbox is confirmed (see
 * supabase_email_confirmation_2026.sql). Everyone else applies with one photo that a moderator
 * reviews. The step deliberately asks for as little as possible - the school is already known from
 * the previous step, so it is one photo and one button.
 */
export function OnboardingVerificationStep({ currentPath }: OnboardingVerificationStepProps) {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const advance = useAdvanceOnboarding(currentPath);

  const mode: 'student' | 'alumni' = user?.role === 'alumni' ? 'alumni' : 'student';
  const choices = DOCUMENT_CHOICES[mode];

  const [state, setState] = useState<VerificationState>('loading');
  const [campusCode, setCampusCode] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(choices[0]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('verification_status, campus_code')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      const status = data?.verification_status;
      setCampusCode(data?.campus_code ?? null);
      setState(status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : 'needs_documents');
    }
    load().catch(() => {
      // Could not read the profile: fall back to the form rather than trapping the user on a spinner.
      if (active) setState('needs_documents');
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function choosePhoto() {
    haptics.light();
    const uri = await pickImageFromLibrary();
    if (uri) {
      setPhotoUri(uri);
      setErrorMessage(null);
    }
  }

  async function handleSubmit() {
    if (!user) return;
    if (!photoUri) {
      setErrorMessage(`Add a clear photo of your ${documentType.toLowerCase()} first.`);
      haptics.error();
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      let photoBlob: Blob | undefined;
      try {
        photoBlob = await (await fetch(photoUri)).blob();
      } catch {
        // submitVerificationRequest retries the read and reports a friendly error if it still fails
      }
      const institution = campusCode && campusCode !== 'GLOBAL' ? getInstitutionByCode(campusCode) : undefined;
      await submitVerificationRequest({
        userId: user.id,
        applicantName: user.fullName,
        documentType,
        institutionClaimed: institution?.name ?? campusCode ?? 'My university',
        documentPhotoUri: photoUri,
        photoBlob,
      });
      markVerificationPending(user.id);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      haptics.success();
      setState('pending');
    } catch (err: any) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(err, 'We could not submit your document. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    state === 'verified'
      ? "You're verified"
      : state === 'pending'
      ? 'Application received'
      : mode === 'alumni'
      ? 'Verify your alumni status'
      : 'Get verified';

  const subtitle =
    state === 'needs_documents'
      ? 'Takes about a minute. You can also skip this and do it later from your profile.'
      : undefined;

  const footer =
    state === 'needs_documents' ? (
      <View style={{ gap: spacing.sm }}>
        <AppButton
          label="Submit for review"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!photoUri}
          fullWidth
        />
        <AppButton label="I'll do this later" variant="ghost" onPress={() => advance()} disabled={submitting} fullWidth />
      </View>
    ) : (
      <AppButton label="Continue" onPress={() => advance()} disabled={state === 'loading'} fullWidth />
    );

  return (
    <OnboardingShell currentPath={currentPath} title={title} subtitle={subtitle} footer={footer}>
      {state === 'loading' ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}

      {state === 'verified' ? (
        <StatusCard
          icon="checkmark-circle"
          tone="success"
          heading="Your account is verified"
          body="We confirmed you belong to your campus, so there is nothing else to do here. Your full campus access is unlocked."
        />
      ) : null}

      {state === 'pending' ? (
        <StatusCard
          icon="time-outline"
          tone="brand"
          heading="A moderator is reviewing it"
          body="You can keep going while you wait. Some features stay limited until you are approved, and we will notify you the moment it is done."
        />
      ) : null}

      {state === 'needs_documents' ? (
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            {BENEFITS.map((b) => (
              <View key={b.text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.pastelPrimaryBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={b.icon} size={16} color={colors.brandPrimary} />
                </View>
                <AppText variant="bodySmall" style={{ flex: 1 }}>
                  {b.text}
                </AppText>
              </View>
            ))}
          </View>

          <View>
            <AppText variant="bodySmall" weight="semiBold" style={{ marginBottom: spacing.sm }}>
              What will you upload?
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {choices.map((type) => {
                const selected = documentType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => {
                      haptics.light();
                      setDocumentType(type);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={type}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                      backgroundColor: selected ? colors.pastelPrimaryBg : colors.surface,
                    }}
                  >
                    <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} tone={selected ? 'brand' : 'secondary'}>
                      {type}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={choosePhoto}
            accessibilityRole="button"
            accessibilityLabel={photoUri ? `Change photo of your ${documentType}` : `Add a photo of your ${documentType}`}
            style={{
              borderWidth: 1.5,
              borderColor: photoUri ? colors.brandPrimary : colors.border,
              borderStyle: photoUri ? 'solid' : 'dashed',
              borderRadius: radius.lg,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 132,
              backgroundColor: colors.surface,
            }}
          >
            {photoUri ? (
              <>
                <Image source={{ uri: photoUri }} style={{ width: '100%', height: 170 }} contentFit="cover" transition={200} />
                <View style={{ paddingVertical: spacing.sm }}>
                  <AppText variant="caption" tone="brand" weight="semiBold">
                    Tap to change photo
                  </AppText>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md, gap: spacing.xs }}>
                <Ionicons name="camera-outline" size={26} color={colors.brandPrimary} />
                <AppText weight="semiBold">Add a photo of your {documentType.toLowerCase()}</AppText>
                <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                  Make sure your name and school are readable.
                </AppText>
              </View>
            )}
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              Only campus moderators can see your document, and it is deleted automatically after 30 days.
            </AppText>
          </View>

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
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.critical} />
              <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                {errorMessage}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </OnboardingShell>
  );
}

function StatusCard({
  icon,
  tone,
  heading,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'success' | 'brand';
  heading: string;
  body: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const accent = tone === 'success' ? colors.success : colors.brandPrimary;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        padding: spacing.md,
      }}
    >
      <Ionicons name={icon} size={28} color={accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{heading}</AppText>
        <AppText variant="bodySmall" tone="secondary">
          {body}
        </AppText>
      </View>
    </View>
  );
}
