import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useMinorStatus } from '@/hooks/useMinorStatus';
import { consentStatusLabel, relationshipLabel, restrictionText, type ConsentStatus } from '@/api/minors';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { GuardianDetailsForm } from './GuardianDetailsForm';

/** Routes where the banner never shows: sign-in flow (onboarding has its own guardian step) and the legal pages. */
const EXEMPT_ROOT_SEGMENTS = new Set(['(auth)', 'terms', 'privacy', 'community-rules', 'copyright']);

function bannerCopy(status: ConsentStatus): { text: string; action: string } {
  switch (status) {
    case 'missing':
      return { text: "Your account is limited until a parent or guardian's consent is confirmed.", action: 'Add their details' };
    case 'pending':
      return { text: 'Waiting for your parent or guardian\'s consent to be confirmed. Some features are limited until then.', action: 'View' };
    case 'declined':
      return { text: "Your parent or guardian's consent was declined, so your account stays limited.", action: 'Update details' };
    case 'revoked':
      return { text: "Your parent or guardian withdrew their consent, so your account is limited again.", action: 'Update details' };
    default:
      return { text: '', action: '' };
  }
}

/**
 * Slim banner for a 13-17 member whose guardian consent is not confirmed ("limited" account). It states the
 * current consent status, opens a sheet listing exactly what is limited, and lets the member record or correct their
 * guardian's details. It cannot confirm consent: an administrator does that. Renders nothing for adults, for members
 * with confirmed consent, for members who have not given a date of birth, and while an administrator is viewing as
 * the member.
 */
export function MinorConsentBanner() {
  const { user, impersonation } = useAuth();
  const segments = useSegments();
  const { colors, spacing, radius } = useTheme();
  const { status, refresh } = useMinorStatus();
  const [open, setOpen] = useState(false);

  const rootSegment = segments[0] as string | undefined;
  if (!user || impersonation.active || user.onboardingComplete !== true) return null;
  if (rootSegment && EXEMPT_ROOT_SEGMENTS.has(rootSegment)) return null;
  if (!status || !status.isMinor || status.isUnder13 || !status.isLimited) return null;

  const copy = bannerCopy(status.consentStatus);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${consentStatusLabel(status.consentStatus)}. ${copy.action}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.pastelPrimaryBg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          minHeight: 36,
        }}
      >
        <Ionicons name="shield-half-outline" size={16} color={colors.brandPrimary} />
        <AppText variant="caption" style={{ flex: 1, fontSize: 11.5 }}>
          {copy.text}
        </AppText>
        <AppText variant="caption" weight="bold" tone="brand">
          {copy.action}
        </AppText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View
            role="dialog"
            accessibilityViewIsModal
            accessibilityLabel="Parent or guardian consent"
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '92%',
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: spacing.xs, paddingRight: spacing.sm }}>
                  <AppText variant="h3" weight="bold" accessibilityRole="header">
                    {consentStatusLabel(status.consentStatus)}
                  </AppText>
                  <AppText variant="bodySmall" tone="secondary">
                    {status.guardian
                      ? `${relationshipLabel(status.guardian.relationship)}: ${status.guardian.name}`
                      : 'No parent or guardian on file yet.'}
                  </AppText>
                </View>
                <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.xs }}>
                <AppText variant="bodySmall" weight="bold">
                  What is limited right now
                </AppText>
                {status.restrictions.map((r) => (
                  <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
                    <Ionicons name="remove-circle-outline" size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
                      {restrictionText(r)}
                    </AppText>
                  </View>
                ))}
                <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                  Once a campus administrator records your parent or guardian's consent, everything except marketplace
                  listings and giving unlocks. You cannot confirm consent yourself.
                </AppText>
              </View>

              <View>
                <AppText variant="bodySmall" weight="bold" style={{ marginBottom: spacing.sm }}>
                  {status.guardian ? 'Change their details' : 'Their details'}
                </AppText>
                {status.guardian && status.consentStatus !== 'missing' ? (
                  <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
                    Saving different details starts the consent check again.
                  </AppText>
                ) : null}
                <GuardianDetailsForm
                  initial={status.guardian}
                  submitLabel={status.guardian ? 'Update guardian details' : 'Save guardian details'}
                  onSaved={async (next) => {
                    await refresh(next);
                    setOpen(false);
                  }}
                />
              </View>

              <AppButton label="Close" variant="ghost" fullWidth onPress={() => setOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
