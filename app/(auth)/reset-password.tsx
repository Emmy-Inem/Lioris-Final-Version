import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { SolidCard } from '@/components/SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import * as authApi from '@/api/auth';
import { supabase } from '@/api/supabase';
import { checkPassword, isPasswordValid } from '@/utils/validation';
import { haptics } from '@/utils/haptics';
import { TurnstileWidget, TurnstileWidgetRef } from '@/components/TurnstileWidget';
import { getFriendlyErrorMessage } from '@/utils/errors';

const RESEND_COOLDOWN_SECONDS = 60;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ResetPasswordScreen() {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const params = useLocalSearchParams<{
    email?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
    code?: string | string[];
  }>();

  const incomingEmail = firstParam(params.email).trim();
  const incomingCode = firstParam(params.code).trim();
  const incomingTokenHash = firstParam(params.token_hash).trim();
  const incomingType = firstParam(params.type).trim();

  const [email, setEmail] = useState(incomingEmail || user?.email || '');
  const [otp, setOtp] = useState(/^\d{6}$/.test(incomingCode) ? incomingCode : '');
  const [step, setStep] = useState<'request' | 'sent'>(/^\d{6}$/.test(incomingCode) ? 'sent' : 'request');
  const [hasRecoverySession, setHasRecoverySession] = useState(isPasswordRecovery);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);
  const handledIncomingLink = useRef(false);

  useEffect(() => {
    if (isPasswordRecovery) {
      setHasRecoverySession(true);
      setSuccessMessage('Your recovery link is verified. Choose your new password.');
    }
  }, [isPasswordRecovery]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (handledIncomingLink.current) return;

    const isPkceCode = incomingCode.length > 8 && !/^\d{6}$/.test(incomingCode);
    const hasRecoveryHash = Boolean(incomingTokenHash && (incomingType === 'recovery' || !incomingType));
    let accessToken = '';
    let refreshToken = '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      accessToken = hashParams.get('access_token') ?? '';
      refreshToken = hashParams.get('refresh_token') ?? '';
      const linkError = hashParams.get('error_description');
      if (linkError) setErrorMessage(decodeURIComponent(linkError.replace(/\+/g, ' ')));
    }

    if (!isPkceCode && !hasRecoveryHash && !(accessToken && refreshToken)) return;
    handledIncomingLink.current = true;
    let cancelled = false;

    async function verifyIncomingLink() {
      setSubmitting(true);
      setErrorMessage(null);
      try {
        if (isPkceCode) {
          await authApi.exchangeRecoveryAuthCode(incomingCode);
        } else if (hasRecoveryHash) {
          await authApi.verifyRecoveryHash(incomingTokenHash);
        } else {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }
        if (!cancelled) {
          haptics.success();
          setHasRecoverySession(true);
          setSuccessMessage('Your recovery link is verified. Choose your new password.');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/reset-password');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getFriendlyErrorMessage(error, 'This recovery link is invalid, expired, or already used. Request a new email below.'));
          setStep('request');
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    }

    verifyIncomingLink();
    return () => {
      cancelled = true;
    };
  }, [incomingCode, incomingTokenHash, incomingType]);

  const passwordChecks = useMemo(() => checkPassword(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function handleSendRecovery() {
    const cleanEmail = email.trim().toLowerCase();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setErrorMessage('Enter the email address registered to your Lioris account.');
      haptics.error();
      return;
    }
    setSubmitting(true);
    try {
      const result = await authApi.sendPasswordResetEmail(cleanEmail, captchaToken || undefined);
      haptics.success();
      setEmail(cleanEmail);
      setStep('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSuccessMessage(`If an account exists for ${cleanEmail}, a reset email is on its way. Open the secure link or enter the 6-digit code shown in the email.${result.warning ? ` ${result.warning}` : ''}`);
    } catch (error: any) {
      haptics.error();
      if (error?.code === 'captcha_failed' || error?.message?.toLowerCase().includes('captcha')) {
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        setErrorMessage('The security check expired. Complete it again and resend the email.');
      } else {
        setErrorMessage(getFriendlyErrorMessage(error, 'We could not send the reset email. Please try again shortly.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    const cleanOtp = otp.replace(/\D/g, '');
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrorMessage('Enter the same email address that received the recovery code.');
      return;
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Enter the complete 6-digit code from the reset email.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.verifyPasswordResetOtp(email, cleanOtp);
      haptics.success();
      setHasRecoverySession(true);
      setSuccessMessage('Code verified. Choose your new password.');
    } catch (error) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(error, 'That code is invalid or expired. Request a new reset email.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePassword() {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!isPasswordValid(newPassword)) {
      setErrorMessage('Your new password does not yet meet every requirement below.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('The two password entries do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.updateUserPassword(newPassword);
      await supabase.auth.signOut({ scope: 'local' });
      clearPasswordRecovery();
      haptics.success();
      setSuccessMessage('Password changed. You can now sign in with your new password.');
      setTimeout(() => router.replace({ pathname: '/(auth)/login', params: { email: email || undefined } }), 1000);
    } catch (error) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(error, 'We could not save the new password. Request a fresh recovery email and try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  const statusBanner = errorMessage || successMessage;
  const statusIsError = Boolean(errorMessage);

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <AuthHeroBackground height={170}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="key" size={32} color="#FFFFFF" style={{ marginBottom: spacing.sm }} />
            <AppText variant="h1" weight="bold" tone="inverse">Reset Password</AppText>
            <AppText variant="bodySmall" tone="inverse" style={{ opacity: 0.85, marginTop: 4 }}>Recover your account securely</AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          {statusBanner ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: statusIsError ? (isDark ? 'rgba(239,68,68,0.14)' : '#FEE2E2') : (isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5'), borderColor: statusIsError ? colors.critical : colors.success, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md }}>
              <Ionicons name={statusIsError ? 'alert-circle' : 'checkmark-circle'} size={18} color={statusIsError ? colors.critical : colors.success} />
              <AppText variant="bodySmall" weight="semiBold" style={{ color: statusIsError ? colors.critical : colors.success, flex: 1 }}>{statusBanner}</AppText>
            </View>
          ) : null}

          {hasRecoverySession ? (
            <View style={{ gap: spacing.md }}>
              <SolidCard style={{ padding: spacing.md, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Ionicons name="shield-checkmark" size={24} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Identity verified</AppText>
                  <AppText variant="caption" tone="secondary">Set the new password you want to use for this account.</AppText>
                </View>
              </SolidCard>
              <AppTextField label="New Password" placeholder="Enter your new password" autoComplete="new-password" textContentType="newPassword" secureTextEntry showPasswordToggle value={newPassword} onChangeText={setNewPassword} />
              <AppTextField label="Confirm New Password" placeholder="Enter it again" autoComplete="new-password" textContentType="newPassword" secureTextEntry showPasswordToggle value={confirmPassword} onChangeText={setConfirmPassword} />
              <SolidCard style={{ padding: spacing.sm, backgroundColor: colors.surface }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>PASSWORD REQUIREMENTS</AppText>
                <View style={{ gap: 4 }}>
                  {passwordChecks.map((item) => (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={item.met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={item.met ? colors.success : colors.textSecondary} />
                      <AppText variant="caption" tone={item.met ? 'primary' : 'secondary'}>{item.label}</AppText>
                    </View>
                  ))}
                  {confirmPassword ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={passwordsMatch ? 'checkmark-circle' : 'close-circle'} size={14} color={passwordsMatch ? colors.success : colors.critical} />
                      <AppText variant="caption" tone={passwordsMatch ? 'primary' : 'critical'}>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</AppText>
                    </View>
                  ) : null}
                </View>
              </SolidCard>
              <AppButton label="Save New Password" onPress={handleSavePassword} loading={submitting} disabled={submitting || !isPasswordValid(newPassword) || !passwordsMatch} fullWidth />
            </View>
          ) : step === 'request' ? (
            <View style={{ gap: spacing.md }}>
              <AppText tone="secondary" variant="bodySmall">Enter your registered email. We will send one recovery email containing a secure reset link and a 6-digit code.</AppText>
              <AppTextField label="Registered Email" placeholder="name@university.edu.ng" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
              <TurnstileWidget ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
              <AppButton label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Reset Email'} onPress={handleSendRecovery} loading={submitting} disabled={!email.trim() || cooldown > 0 || submitting} fullWidth />
              <Pressable onPress={() => setStep('sent')} style={{ alignSelf: 'center', padding: spacing.xs }}>
                <AppText variant="caption" tone="brand" weight="bold">I already have a recovery code</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Ionicons name="mail-unread" size={30} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">Check your email</AppText>
                <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>Open the secure link for the quickest route, or enter the 6-digit code below. Check Spam or Junk if needed.</AppText>
              </View>
              <AppTextField label="Email" placeholder="name@university.edu.ng" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <AppTextField label="6-Digit Recovery Code" placeholder="123456" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
              <AppButton label="Verify Code" onPress={handleVerifyOtp} loading={submitting} disabled={submitting || otp.length !== 6 || !email.trim()} fullWidth />
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
                <Pressable onPress={() => setStep('request')} style={{ padding: spacing.xs }}><AppText variant="caption" tone="secondary">Use another email</AppText></Pressable>
                <Pressable onPress={handleSendRecovery} disabled={cooldown > 0 || submitting} style={{ padding: spacing.xs }}>
                  <AppText variant="caption" tone="brand" weight="bold">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}</AppText>
                </Pressable>
              </View>
            </View>
          )}
          <Pressable onPress={() => router.replace('/(auth)/login')} style={{ alignSelf: 'center', padding: spacing.sm, marginTop: spacing.md }}>
            <AppText variant="bodySmall" tone="secondary">← Back to Sign In</AppText>
          </Pressable>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
