import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, ScrollView, Pressable, Platform, Alert } from 'react-native';
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

export default function ResetPasswordScreen() {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const params = useLocalSearchParams<{ email?: string; token_hash?: string; type?: string; code?: string }>();

  const [email, setEmail] = useState((typeof params.email === 'string' && params.email.trim()) || user?.email || '');
  const [code, setCode] = useState(() => {
    // Only prefill code if it looks like a numeric 6-digit OTP
    if (params.code && /^\d{6}$/.test(params.code.trim())) {
      return params.code.trim();
    }
    return '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  // Active recovery session mode (user verified via magic link, hash, or PKCE code exchange)
  const [hasActiveRecoverySession, setHasActiveRecoverySession] = useState(isPasswordRecovery);

  // When not in active recovery session, step 1 is 'request', step 2 is 'verify'
  const [step, setStep] = useState<'request' | 'verify'>(() => {
    if (params.code && /^\d{6}$/.test(params.code.trim())) return 'verify';
    return 'request';
  });

  // Synchronize recovery state from AuthContext
  useEffect(() => {
    if (isPasswordRecovery) {
      setHasActiveRecoverySession(true);
    }
  }, [isPasswordRecovery]);

  // Check URL hash on web if access_token with type=recovery is present
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hash) {
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const type = hashParams.get('type');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (type === 'recovery' && accessToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || accessToken,
        }).then(() => {
          setHasActiveRecoverySession(true);
          setSuccessMessage('Recovery link verified! Please enter your new password below.');
        }).catch(() => {});
      }
    }
  }, []);

  // Handle PKCE code exchange or token_hash verification if arriving via email link
  useEffect(() => {
    let cancelled = false;

    async function handleIncomingUrlVerification() {
      // Case 1: PKCE exchange code (longer string from Supabase email link)
      if (params.code && params.code.length > 8 && !/^\d{6}$/.test(params.code.trim())) {
        setSubmitting(true);
        setErrorMessage(null);
        try {
          await authApi.exchangeRecoveryAuthCode(params.code.trim());
          if (!cancelled) {
            haptics.success();
            setHasActiveRecoverySession(true);
            setSuccessMessage('Recovery link verified! Please choose your new password.');
          }
        } catch (err: any) {
          if (!cancelled) {
            setErrorMessage(getFriendlyErrorMessage(err, 'This recovery link has expired or was already used. Please request a new one.'));
          }
        } finally {
          if (!cancelled) setSubmitting(false);
        }
        return;
      }

      // Case 2: token_hash from email template
      if (params.token_hash && (params.type === 'recovery' || !params.type)) {
        setSubmitting(true);
        setErrorMessage(null);
        try {
          await authApi.verifyRecoveryHash(params.token_hash);
          if (!cancelled) {
            haptics.success();
            setHasActiveRecoverySession(true);
            setSuccessMessage('Recovery link verified! Please choose your new password.');
          }
        } catch (err: any) {
          if (!cancelled) {
            setErrorMessage(getFriendlyErrorMessage(err, 'This recovery link has expired or was already used. Please request a new one.'));
          }
        } finally {
          if (!cancelled) setSubmitting(false);
        }
      }
    }

    handleIncomingUrlVerification();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.token_hash, params.type]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const passwordChecks = useMemo(() => checkPassword(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Step 1: Request Password Reset Link & Code
  async function handleSendRecovery() {
    setErrorMessage(null);
    setSuccessMessage(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered university email address.');
      haptics.error();
      return;
    }
    haptics.light();
    setSubmitting(true);
    try {
      const res = await authApi.sendPasswordResetEmail(cleanEmail, captchaToken || undefined);
      haptics.success();
      const baseMsg = `A recovery email has been sent to ${cleanEmail}. Check your inbox or spam folder.`;
      setSuccessMessage(res?.warning ? `${baseMsg}\n${res.warning}` : baseMsg);
      setStep('verify');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      haptics.error();
      if (err?.code === 'captcha_failed' || err?.message?.toLowerCase().includes('captcha')) {
        setErrorMessage('Security verification failed. Please complete the security check again.');
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
      setErrorMessage(getFriendlyErrorMessage(err, 'Could not send recovery email. Please check your email address and try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2 (Direct): Set password using existing active recovery session (from magic link)
  async function handleUpdateSessionPassword() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isPasswordValid(newPassword)) {
      setErrorMessage('Please ensure your new password satisfies all security criteria below.');
      haptics.error();
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match. Please verify and try again.');
      haptics.error();
      return;
    }

    haptics.medium();
    setSubmitting(true);
    try {
      await authApi.updateUserPassword(newPassword);
      haptics.success();
      clearPasswordRecovery();
      setSuccessMessage('Password reset successfully! Redirecting to login...');
      Alert.alert('Password Updated', 'Your password has been changed successfully. You can now log in with your new password.', [
        {
          text: 'Proceed to Login',
          onPress: () => {
            router.replace('/(auth)/login');
          },
        },
      ]);
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    } catch (err: any) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(err, 'Failed to update password. Please request a fresh recovery link.'));
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2 (Code Entry): Verify 6-digit OTP code & Update Password
  async function handleVerifyOtpAndResetPassword() {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    const cleanCode = code.trim().replace(/\D/g, '');

    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      haptics.error();
      return;
    }
    if (!cleanCode || cleanCode.length !== 6) {
      setErrorMessage('Please enter the 6-digit recovery code from your email.');
      haptics.error();
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setErrorMessage('Please ensure your new password satisfies all security criteria below.');
      haptics.error();
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match. Please verify and try again.');
      haptics.error();
      return;
    }

    haptics.medium();
    setSubmitting(true);
    try {
      await authApi.verifyPasswordResetOtpAndSetPassword(cleanEmail, cleanCode, newPassword);
      haptics.success();
      clearPasswordRecovery();
      setSuccessMessage('Password reset successfully! Redirecting to login...');
      Alert.alert('Password Updated', 'Your password has been changed successfully. You can now log in with your new password.', [
        {
          text: 'Proceed to Login',
          onPress: () => {
            router.replace('/(auth)/login');
          },
        },
      ]);
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    } catch (err: any) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(err, 'Invalid or expired recovery code. Please check the code or request a fresh one.'));
    } finally {
      setSubmitting(false);
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
        <AuthHeroBackground height={170}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="key" size={32} color="#FFFFFF" style={{ marginBottom: spacing.sm }} />
            <AppText variant="h1" weight="bold" tone="inverse">
              Reset Password
            </AppText>
            <AppText variant="bodySmall" tone="inverse" style={{ opacity: 0.85, marginTop: 4 }}>
              Restore secure access to your campus account
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          {/* Status Message Banners */}
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

          {successMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: isDark ? 'rgba(72, 187, 120, 0.14)' : '#DEF7EC',
                borderColor: colors.success,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.success, flex: 1 }}>
                {successMessage}
              </AppText>
            </View>
          ) : null}

          {/* Mode A: Active Recovery Session (Arrived via magic link) */}
          {hasActiveRecoverySession ? (
            <View style={{ gap: spacing.md }}>
              <SolidCard
                radius={14}
                style={{
                  padding: spacing.md,
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                  borderWidth: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#6EE7B7' : '#065F46' }}>
                    Identity Verified
                  </AppText>
                  <AppText variant="caption" style={{ color: isDark ? '#A7F3D0' : '#047857' }}>
                    Your recovery link was verified. Choose a strong new password for your account below.
                  </AppText>
                </View>
              </SolidCard>

              <AppTextField
                label="New Password"
                placeholder="Enter at least 8 characters"
                secureTextEntry
                showPasswordToggle
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
              />

              <AppTextField
                label="Confirm New Password"
                placeholder="Re-enter your new password"
                secureTextEntry
                showPasswordToggle
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
              />

              {/* Password Policy Requirements Checklist */}
              <SolidCard style={{ padding: spacing.sm, backgroundColor: colors.surface }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
                  PASSWORD REQUIREMENTS
                </AppText>
                <View style={{ gap: 4 }}>
                  {passwordChecks.map((item) => (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name={item.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={item.met ? colors.success : colors.textSecondary}
                      />
                      <AppText variant="caption" tone={item.met ? 'primary' : 'secondary'}>
                        {item.label}
                      </AppText>
                    </View>
                  ))}
                  {confirmPassword.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={passwordsMatch ? colors.success : colors.critical}
                      />
                      <AppText variant="caption" tone={passwordsMatch ? 'primary' : 'critical'}>
                        {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </SolidCard>

              <AppButton
                label="Save New Password"
                onPress={handleUpdateSessionPassword}
                loading={submitting}
                disabled={!isPasswordValid(newPassword) || !passwordsMatch || submitting}
                fullWidth
              />

              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                style={{ alignSelf: 'center', paddingVertical: spacing.xs }}
              >
                <AppText variant="bodySmall" tone="secondary">
                  Back to Sign In
                </AppText>
              </Pressable>
            </View>
          ) : step === 'request' ? (
            /* Mode B - Step 1: Request Password Reset Instructions */
            <View style={{ gap: spacing.md }}>
              <AppText tone="secondary" variant="bodySmall">
                Enter your registered university email. We will send you a secure password reset link and a 6-digit recovery code.
              </AppText>

              <AppTextField
                label="Registered Email"
                placeholder="name@university.edu.ng"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TurnstileWidget
                ref={turnstileRef}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
              />

              <AppButton
                label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Reset Instructions'}
                onPress={handleSendRecovery}
                loading={submitting}
                disabled={!email.trim() || cooldown > 0 || submitting}
                fullWidth
              />

              <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                <Pressable
                  onPress={() => {
                    setErrorMessage(null);
                    setStep('verify');
                  }}
                  style={{ paddingVertical: 4 }}
                >
                  <AppText variant="caption" tone="brand" weight="bold">
                    Already have a 6-digit recovery code? Enter it here →
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => router.replace('/(auth)/login')}
                  style={{ paddingVertical: 4 }}
                >
                  <AppText variant="caption" tone="secondary">
                    ← Back to Sign In
                  </AppText>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Mode B - Step 2: Enter 6-Digit Code & Choose New Password */
            <View style={{ gap: spacing.md }}>
              {/* Spam Notice Banner */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : '#FEF9C3',
                  borderColor: isDark ? 'rgba(234, 179, 8, 0.3)' : '#FDE047',
                  borderWidth: 1,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Ionicons
                  name="mail-unread-outline"
                  size={20}
                  color={isDark ? '#FACC15' : '#CA8A04'}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FEF08A' : '#854D0E', marginBottom: 2 }}>
                    Check Your Spam / Junk Folder
                  </AppText>
                  <AppText variant="caption" style={{ color: isDark ? '#FEF08A' : '#854D0E', lineHeight: 16 }}>
                    We sent a 6-digit code to <AppText weight="bold">{email}</AppText>. If you don't see it in 1 minute, check your Spam folder or tap Resend below.
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="caption" tone="secondary">
                  Sending to: <AppText weight="bold" tone="primary">{email}</AppText>
                </AppText>
                <Pressable
                  onPress={() => {
                    setStep('request');
                    setErrorMessage(null);
                  }}
                  hitSlop={8}
                >
                  <AppText variant="caption" tone="brand" weight="bold">
                    Change Email
                  </AppText>
                </Pressable>
              </View>

              <AppTextField
                label="6-Digit Recovery Code"
                placeholder="123456"
                value={code}
                onChangeText={(text) => {
                  setCode(text.replace(/\D/g, '').slice(0, 6));
                  if (errorMessage) setErrorMessage(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
              />

              <AppTextField
                label="New Password"
                placeholder="Enter at least 8 characters"
                secureTextEntry
                showPasswordToggle
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
              />

              <AppTextField
                label="Confirm New Password"
                placeholder="Re-enter your new password"
                secureTextEntry
                showPasswordToggle
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
              />

              {/* Password Requirements Checklist */}
              <SolidCard style={{ padding: spacing.sm, backgroundColor: colors.surface }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
                  PASSWORD REQUIREMENTS
                </AppText>
                <View style={{ gap: 4 }}>
                  {passwordChecks.map((item) => (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name={item.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={item.met ? colors.success : colors.textSecondary}
                      />
                      <AppText variant="caption" tone={item.met ? 'primary' : 'secondary'}>
                        {item.label}
                      </AppText>
                    </View>
                  ))}
                  {confirmPassword.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={passwordsMatch ? colors.success : colors.critical}
                      />
                      <AppText variant="caption" tone={passwordsMatch ? 'primary' : 'critical'}>
                        {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </SolidCard>

              <AppButton
                label="Reset Password & Sign In"
                onPress={handleVerifyOtpAndResetPassword}
                loading={submitting}
                disabled={!email.trim() || code.trim().length !== 6 || !isPasswordValid(newPassword) || !passwordsMatch || submitting}
                fullWidth
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs }}>
                <Pressable
                  onPress={handleSendRecovery}
                  disabled={cooldown > 0 || submitting}
                  hitSlop={8}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={cooldown > 0 ? 'secondary' : 'brand'}
                  >
                    {cooldown > 0 ? `Resend Code (${cooldown}s)` : 'Resend Code'}
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => router.replace('/(auth)/login')}
                  hitSlop={8}
                >
                  <AppText variant="caption" tone="secondary">
                    Cancel & Return to Sign In
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
