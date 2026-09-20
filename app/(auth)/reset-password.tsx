import React, { useEffect, useState, useMemo } from 'react';
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

const RESEND_COOLDOWN_SECONDS = 60;

export default function ResetPasswordScreen() {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const params = useLocalSearchParams<{ email?: string; token_hash?: string; type?: string; code?: string }>();

  const [email, setEmail] = useState((typeof params.email === 'string' && params.email.trim()) || user?.email || '');
  const [code, setCode] = useState(params.code || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileWidgetRef>(null);

  // Active session mode: true if the user arrived via a recovery link (PASSWORD_RECOVERY event) or verified token
  const [hasActiveRecoverySession, setHasActiveRecoverySession] = useState(isPasswordRecovery);

  // If no active recovery session, mode can be 'enter_code' or 'request_link'
  const [activeTab, setActiveTab] = useState<'enter_code' | 'request_link'>(
    params.code || params.token_hash ? 'enter_code' : email ? 'enter_code' : 'request_link'
  );

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
      if (type === 'recovery') {
        setHasActiveRecoverySession(true);
      }
    }
  }, []);

  // Handle token_hash auto-verification if provided in link
  useEffect(() => {
    let cancelled = false;
    async function autoVerifyRecoveryHash() {
      if (params.token_hash && (params.type === 'recovery' || !params.type)) {
        setSubmitting(true);
        setErrorMessage(null);
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: 'recovery',
          });
          if (!error && data.session && !cancelled) {
            haptics.success();
            setHasActiveRecoverySession(true);
            setSuccessMessage('Recovery link verified! Please enter your new password below.');
          } else if (error && !cancelled) {
            setErrorMessage(error.message || 'Invalid or expired recovery link.');
          }
        } catch (err: any) {
          if (!cancelled) {
            setErrorMessage(err?.message || 'Failed to verify recovery link.');
          }
        } finally {
          if (!cancelled) setSubmitting(false);
        }
      }
    }
    autoVerifyRecoveryHash();
    return () => {
      cancelled = true;
    };
  }, [params.token_hash, params.type]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const passwordChecks = useMemo(() => checkPassword(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Handler: Request a recovery code/link
  async function handleSendRecovery() {
    setErrorMessage(null);
    setSuccessMessage(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered campus email address.');
      haptics.error();
      return;
    }
    haptics.light();
    setSubmitting(true);
    try {
      await authApi.sendPasswordResetEmail(cleanEmail, captchaToken || undefined);
      haptics.success();
      setSuccessMessage(`Recovery email dispatched to ${cleanEmail}. Check your inbox or spam folder.`);
      setActiveTab('enter_code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      haptics.error();
      if (err?.code === 'captcha_failed' || err?.message?.toLowerCase().includes('captcha')) {
        setErrorMessage('Security verification failed. Please complete the security check.');
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }
      setErrorMessage(err?.message || 'Could not send recovery email. Please check the address and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Handler: Save New Password (active recovery session)
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
      Alert.alert('Password Updated', 'Your password has been changed successfully. You can now log in.', [
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
      setErrorMessage(err?.message || 'Failed to update password. Please request a new recovery link.');
    } finally {
      setSubmitting(false);
    }
  }

  // Handler: Verify 6-digit OTP code & Reset Password
  async function handleVerifyOtpAndResetPassword() {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    const cleanCode = code.trim().replace(/\s+/g, '');

    if (!cleanEmail) {
      setErrorMessage('Please enter your campus email address.');
      haptics.error();
      return;
    }
    if (!cleanCode) {
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
      Alert.alert('Password Updated', 'Your password has been changed successfully. You can now log in.', [
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
      setErrorMessage(err?.message || 'Invalid or expired recovery code. Please request a fresh code.');
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
          {/* Status Banners */}
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

          {/* Mode 1: Active Recovery Session (From Magic Link / Token) */}
          {hasActiveRecoverySession ? (
            <>
              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                Your identity has been verified through your recovery link. Create your new account password below.
              </AppText>

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

              {/* Password Policy Requirements */}
              <SolidCard style={{ padding: spacing.sm, marginBottom: spacing.md, backgroundColor: colors.surface }}>
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
                label="Set New Password"
                onPress={handleUpdateSessionPassword}
                loading={submitting}
                disabled={!isPasswordValid(newPassword) || !passwordsMatch || submitting}
                fullWidth
              />
            </>
          ) : (
            /* Mode 2: Code / Request Tabs */
            <>
              {/* Tab Selector */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.divider,
                  borderRadius: radius.pill,
                  padding: 4,
                  marginBottom: spacing.lg,
                }}
              >
                <Pressable
                  onPress={() => {
                    setActiveTab('enter_code');
                    setErrorMessage(null);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    alignItems: 'center',
                    borderRadius: radius.pill,
                    backgroundColor: activeTab === 'enter_code' ? colors.brandPrimary : 'transparent',
                  }}
                >
                  <AppText
                    variant="bodySmall"
                    weight="bold"
                    tone={activeTab === 'enter_code' ? 'inverse' : 'secondary'}
                  >
                    Enter 6-Digit Code
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setActiveTab('request_link');
                    setErrorMessage(null);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    alignItems: 'center',
                    borderRadius: radius.pill,
                    backgroundColor: activeTab === 'request_link' ? colors.brandPrimary : 'transparent',
                  }}
                >
                  <AppText
                    variant="bodySmall"
                    weight="bold"
                    tone={activeTab === 'request_link' ? 'inverse' : 'secondary'}
                  >
                    Request New Link
                  </AppText>
                </Pressable>
              </View>

              {activeTab === 'request_link' ? (
                /* Tab: Request Recovery Link/Code */
                <>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                    Enter your registered university email. We'll send you a password reset link and a 6-digit recovery code.
                  </AppText>

                  <AppTextField
                    label="Campus Email"
                    placeholder="student@university.edu.ng"
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

                  <View style={{ marginTop: spacing.md }}>
                    <AppButton
                      label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Recovery Email'}
                      onPress={handleSendRecovery}
                      loading={submitting}
                      disabled={!email.trim() || cooldown > 0 || submitting}
                      fullWidth
                    />
                  </View>
                </>
              ) : (
                /* Tab: Enter Code & Set Password */
                <>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                    Enter the 6-digit recovery code sent to your email and your new password.
                  </AppText>

                  <AppTextField
                    label="Campus Email"
                    placeholder="student@university.edu.ng"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />

                  <AppTextField
                    label="6-Digit Recovery Code"
                    placeholder="123456"
                    value={code}
                    onChangeText={(text) => {
                      setCode(text.replace(/\D/g, ''));
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

                  {/* Password Policy Requirements */}
                  <SolidCard style={{ padding: spacing.sm, marginBottom: spacing.md, backgroundColor: colors.surface }}>
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
                    disabled={!email.trim() || !code.trim() || !isPasswordValid(newPassword) || !passwordsMatch || submitting}
                    fullWidth
                  />

                  <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md }}>
                    <Pressable
                      onPress={() => setActiveTab('request_link')}
                      hitSlop={8}
                    >
                      <AppText tone="brand" variant="caption" weight="semiBold">
                        Didn't receive a code? Request a new one →
                      </AppText>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}

          {/* Back to Login */}
          <View
            style={{
              alignItems: 'center',
              marginTop: spacing.xl,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              paddingTop: spacing.md,
            }}
          >
            <Pressable
              onPress={() => {
                clearPasswordRecovery();
                router.replace('/(auth)/login');
              }}
              hitSlop={8}
            >
              <AppText tone="brand" variant="bodySmall" weight="semiBold">
                Back to Sign In
              </AppText>
            </Pressable>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
