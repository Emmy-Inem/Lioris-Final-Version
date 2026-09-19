import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';

import { supabase } from '@/api/supabase';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_AGE, MIN_AGE_WITH_CONSENT, TERMS_VERSION } from '@/constants/legal';
import { AppText } from './AppText';
import { AppButton } from './AppButton';

/** Routes where the gate never shows: sign-in flow and the legal pages the user needs to read. */
const EXEMPT_ROOT_SEGMENTS = new Set(['(auth)', 'terms', 'privacy', 'community-rules']);

const CONSENT_TYPE = 'terms_and_privacy';

/**
 * Blocking re-consent prompt shown when the user's newest recorded consent is not
 * for the current TERMS_VERSION (or there is none). Mounted once in
 * app/_layout.tsx inside the providers so it applies to every role.
 *
 * Fail-open by design: a network / RPC error (including the RPC not existing yet)
 * never blocks the app. It renders nothing for signed-out users, during
 * onboarding, while an admin is impersonating (consent must never be recorded on
 * someone else's behalf) and on auth/legal routes.
 */
export function ReConsentGate() {
  const { user, logout, impersonation } = useAuth();
  const segments = useSegments();
  const { colors, spacing, radius } = useTheme();

  const [needsConsent, setNeedsConsent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const eligible = Boolean(userId) && user?.onboardingComplete === true && !impersonation.active;

  useEffect(() => {
    setNeedsConsent(false);
    setAccepted(false);
    setAgeConfirmed(false);
    setError(null);
    if (!eligible) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('latest_consent', { p_type: CONSENT_TYPE });
        if (cancelled || rpcError) return; // fail open on any error
        if (data !== TERMS_VERSION) setNeedsConsent(true);
      } catch {
        // fail open
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, userId]);

  const handleAccept = useCallback(async () => {
    if (saving || !accepted || !ageConfirmed) return;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('record_consent', {
        p_version: TERMS_VERSION,
        p_age_confirmed: true,
      });
      if (rpcError) throw rpcError;
      setNeedsConsent(false);
    } catch {
      setError('We could not save your acceptance. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [saving, accepted, ageConfirmed]);

  const handleSignOut = useCallback(async () => {
    if (saving) return;
    try {
      await logout();
    } catch {
      // logout is designed not to throw; nothing further to do
    }
  }, [logout, saving]);

  const rootSegment = segments[0] as string | undefined;
  if (!eligible || !needsConsent) return null;
  if (rootSegment && EXEMPT_ROOT_SEGMENTS.has(rootSegment)) return null;

  const link = (label: string, path: '/terms' | '/privacy') => (
    <AppText
      variant="bodySmall"
      tone="brand"
      weight="semiBold"
      accessibilityRole="link"
      onPress={() => router.push(path)}
    >
      {label}
    </AppText>
  );

  const checkbox = (checked: boolean, toggle: () => void, label: string, children: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        hitSlop={8}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? colors.brandPrimary : colors.textSecondary}
        />
      </Pressable>
      <AppText variant="bodySmall" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '90%',
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <Ionicons name="document-text-outline" size={28} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold" accessibilityRole="header">
                We updated our Terms & Privacy Policy
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                To keep using Lioris, please review and accept the updated documents (version {TERMS_VERSION}).
              </AppText>
            </View>

            <View style={{ gap: spacing.sm }}>
              <AppText variant="bodySmall" tone="secondary">
                Read them here:
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                {link('Terms of Service', '/terms')}
                {link('Privacy Policy', '/privacy')}
              </View>
            </View>

            {checkbox(
              accepted,
              () => setAccepted((v) => !v),
              'I have read and accept the updated Terms of Service and Privacy Policy',
              'I have read and accept the updated Terms of Service and Privacy Policy.',
            )}
            {checkbox(
              ageConfirmed,
              () => setAgeConfirmed((v) => !v),
              `I confirm that I am ${MIN_AGE} years old or older, or an admitted student aged ${MIN_AGE_WITH_CONSENT} to 17 using Lioris with parent or guardian consent`,
              `I confirm that I am ${MIN_AGE} years old or older, OR an admitted university student aged ${MIN_AGE_WITH_CONSENT}–17 using Lioris with parent/guardian consent.`,
            )}

            {error ? (
              <AppText variant="bodySmall" tone="critical" accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <AppButton
                label="Accept & Continue"
                fullWidth
                loading={saving}
                disabled={!accepted || !ageConfirmed}
                onPress={handleAccept}
              />
              <AppButton label="Sign out" variant="ghost" fullWidth disabled={saving} onPress={handleSignOut} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
