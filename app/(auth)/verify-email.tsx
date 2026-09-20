import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import * as authApi from '@/api/auth';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';
import { persistCampus } from '@/hooks/useViewScope';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Confirms ownership of the email address with the 6-digit code that was emailed at signup.
 * The user is not signed in yet when they land here (Supabase only issues a session once the
 * address is confirmed), so the address arrives as a route param. A correct code signs them
 * in; the root resolver then continues into onboarding.
 */
export default function VerifyEmailScreen() {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ email?: string; token_hash?: string; type?: string; code?: string; campus_code?: string }>();
  const knownEmail = (typeof params.email === 'string' && params.email.trim()) || user?.email || '';
  const [emailInput, setEmailInput] = useState('');
  const email = knownEmail || emailInput.trim();

  const [code, setCode] = useState(params.code || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (params.campus_code) {
      persistCampus(params.campus_code);
    }
  }, [params.campus_code]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // If the user is already signed in or becomes signed in via email link session, proceed
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user]);

  // Check URL hash on web for error descriptions (e.g. expired link)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hash) {
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const errorDesc = hashParams.get('error_description');
      if (errorDesc) {
        setErrorMessage(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
      }
    }
  }, []);

  // If a token_hash link was clicked from the email, automatically verify and log in
  useEffect(() => {
    let cancelled = false;
    async function autoVerifyHash() {
      if (params.token_hash) {
        setSubmitting(true);
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: (params.type as any) || 'signup',
          });
          if (!error && !cancelled) {
            haptics.success();
            router.replace('/');
            return;
          }
        } catch {
          // Fall through to manual code entry
        } finally {
          if (!cancelled) setSubmitting(false);
        }
      }
    }
    autoVerifyHash();
    return () => {
      cancelled = true;
    };
  }, [params.token_hash, params.type]);

  async function handleVerify() {
    setErrorMessage(null);
    setNotice(null);
    if (!email) {
      setErrorMessage('Enter the email address you signed up with.');
      return;
    }
    const cleanCode = code.trim().replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(cleanCode)) {
      setErrorMessage('Please enter the full confirmation code from your email.');
      haptics.medium();
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      await authApi.verifyEmail(cleanCode, email);
      haptics.success();
      // The auth listener signs the user in; the resolver then routes into the app.
      router.replace('/');
    } catch {
      haptics.error();
      setErrorMessage('That code is wrong or has expired. Check the latest email, or request a new code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (resending || cooldown > 0) return;
    if (!email) {
      setErrorMessage('Enter the email address you signed up with.');
      return;
    }
    haptics.light();
    setResending(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      await authApi.resendConfirmationEmail(email);
      setNotice(`A new code is on its way to ${email}. Check your spam folder if it does not arrive.`);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setErrorMessage(err?.message || 'We could not send a new code right now.');
    } finally {
      setResending(false);
    }
  }

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
            <Ionicons name="mail" size={30} color="#FFFFFF" style={{ marginBottom: spacing.sm }} />
            <AppText variant="h1" weight="bold" tone="inverse">
              Verify your email
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          {knownEmail ? (
            <AppText tone="secondary" style={{ marginBottom: spacing.sm }}>
              We sent a confirmation code to <AppText weight="bold">{knownEmail}</AppText>. Enter it below to confirm your address
              and access your workspace.
            </AppText>
          ) : (
            <>
              <AppText tone="secondary" style={{ marginBottom: spacing.sm }}>
                Enter the email address you signed up with, then the confirmation code we sent to it.
              </AppText>
              <AppTextField
                label="Email address"
                value={emailInput}
                onChangeText={setEmailInput}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@university.edu.ng"
              />
            </>
          )}

          <AppTextField
            label="Verification code"
            keyboardType="number-pad"
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/\D/g, ''));
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="e.g. 91319799"
            maxLength={10}
          />

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

          {notice ? (
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              {notice}
            </AppText>
          ) : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            <AppButton label="Verify and continue" onPress={handleVerify} loading={submitting} fullWidth />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg }}>
            <Pressable onPress={handleResendCode} hitSlop={8} disabled={resending || cooldown > 0}>
              <AppText tone={cooldown > 0 ? 'secondary' : 'brand'} variant="bodySmall" weight="semiBold">
                {resending ? 'Sending...' : cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              </AppText>
            </Pressable>
          </View>

          <View
            style={{
              alignItems: 'center',
              marginTop: spacing.xl,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              paddingTop: spacing.md,
            }}
          >
            <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
              <AppText tone="brand" variant="bodySmall" weight="semiBold">
                Back to log in
              </AppText>
            </Pressable>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
