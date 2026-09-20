import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  AppState,
  AppStateStatus,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Avatar } from '@/components/Avatar';
import { TurnstileWidget, TurnstileWidgetRef } from '@/components/TurnstileWidget';
import { haptics } from '@/utils/haptics';
import {
  BIOMETRICS_ENABLED_KEY,
  getStoredPref,
  isBiometricsAvailable,
  authenticateWithBiometrics,
  reEnrollBiometrics,
  verifyPasswordFallback,
  subscribeToShield,
  getBiometricMethodLabel,
} from '@/utils/biometrics';
import type { PasswordCheckFailure } from '@/utils/webauthnEncoding';

const PASSWORD_FAILURE_MESSAGES: Record<PasswordCheckFailure, string> = {
  invalid_credentials: 'Incorrect password. Please try again.',
  captcha: 'Please complete the security check below, then try again.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  network: 'Could not reach Lioris. Check your connection and try again.',
  unknown: 'We could not verify your password right now. Please try again.',
};

type AuthMethod = 'biometric' | 'password' | null;

export function AppLockOverlay() {
  const { user, logout } = useAuth();
  const { colors, spacing, radius, isDark } = useTheme();

  const [isShieldEnabled, setIsShieldEnabled] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [hasCheckedPref, setHasCheckedPref] = useState<boolean>(false);
  const [bioAvailable, setBioAvailable] = useState<boolean>(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [password, setPassword] = useState<string>('');
  const [showPasswordInput, setShowPasswordInput] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [biometricFailed, setBiometricFailed] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const authenticating = authMethod !== null;
  const bioLabel = getBiometricMethodLabel();
  const needsCaptcha = Platform.OS === 'web';

  // Check initial preference & biometric availability
  const checkSecurityShield = useCallback(async () => {
    if (!user) {
      setIsLocked(false);
      setIsShieldEnabled(false);
      setHasCheckedPref(true);
      return;
    }

    try {
      const bioPref = await getStoredPref(BIOMETRICS_ENABLED_KEY);
      const enabled = bioPref === 'true';
      setIsShieldEnabled(enabled);

      if (enabled) {
        setIsLocked(true);
      }

      const bioStatus = await isBiometricsAvailable();
      setBioAvailable(bioStatus.available);
      // With no biometric option the password is the only way in, so show it straight away.
      if (!bioStatus.available) setShowPasswordInput(true);
    } catch {
      setIsShieldEnabled(false);
    } finally {
      setHasCheckedPref(true);
    }
  }, [user]);

  useEffect(() => {
    checkSecurityShield();
  }, [checkSecurityShield]);

  // Settings turning the shield on or off must take effect now, not after the next reload.
  useEffect(
    () =>
      subscribeToShield((enabled) => {
        setIsShieldEnabled(enabled);
        // Turning it ON from Settings must not immediately lock the person who just did it,
        // and turning it OFF must release any lock that is showing.
        if (!enabled) {
          setIsLocked(false);
          setPassword('');
          setErrorMsg(null);
        }
      }),
    [],
  );

  // Listen for app coming from background to active
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' && isShieldEnabled && user) {
        setIsLocked(true);
        setPassword('');
        setErrorMsg(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isShieldEnabled, user]);

  const unlock = () => {
    haptics.success();
    setIsLocked(false);
    setPassword('');
    setErrorMsg(null);
    setBiometricFailed(false);
    setCaptchaToken(null);
  };

  const handleBiometricUnlock = async () => {
    if (!user || authenticating) return;
    setErrorMsg(null);
    setAuthMethod('biometric');
    haptics.light();

    try {
      const result = await authenticateWithBiometrics({
        id: user.id,
        email: user.email,
        fullName: user.fullName || 'User',
      });

      if (result.success) {
        unlock();
      } else {
        haptics.error();
        setErrorMsg(result.error || 'Biometric authentication failed. Please try again or use your password.');
        setBiometricFailed(true);
        setShowPasswordInput(true);
      }
    } catch (err: any) {
      haptics.error();
      setErrorMsg(err?.message || 'Biometric error occurred.');
      setBiometricFailed(true);
      setShowPasswordInput(true);
    } finally {
      setAuthMethod(null);
    }
  };

  /** Recovery for a missing or stale passkey: forget it and create a new one. */
  const handleReEnroll = async () => {
    if (!user || authenticating) return;
    setErrorMsg(null);
    setAuthMethod('biometric');
    haptics.light();
    try {
      const result = await reEnrollBiometrics({ id: user.id, email: user.email, fullName: user.fullName || 'User' });
      if (result.success) {
        unlock();
      } else {
        haptics.error();
        setErrorMsg(result.error || 'Could not set up biometrics. Please use your password.');
      }
    } finally {
      setAuthMethod(null);
    }
  };

  const handlePasswordUnlock = async () => {
    if (!user || authenticating) return;
    if (!password.trim()) {
      setErrorMsg('Please enter your account password.');
      haptics.error();
      return;
    }
    if (!user.email) {
      setErrorMsg('We could not find the email for this account. Please sign out and sign in again.');
      haptics.error();
      return;
    }
    if (needsCaptcha && !captchaToken) {
      setErrorMsg(PASSWORD_FAILURE_MESSAGES.captcha);
      haptics.error();
      return;
    }

    setErrorMsg(null);
    setAuthMethod('password');
    haptics.light();

    try {
      // Not trimmed: a password may legitimately begin or end with a space.
      const result = await verifyPasswordFallback(user.email, password, captchaToken ?? undefined);
      // A captcha token is single-use, whatever the outcome.
      turnstileRef.current?.reset();
      setCaptchaToken(null);

      if (result.success) {
        unlock();
      } else {
        haptics.error();
        setErrorMsg(PASSWORD_FAILURE_MESSAGES[result.failure ?? 'unknown']);
      }
    } catch (err: any) {
      haptics.error();
      setErrorMsg(err?.message || 'Could not verify password.');
    } finally {
      setAuthMethod(null);
    }
  };

  const handleSignOut = async () => {
    haptics.medium();
    setIsLocked(false);
    await logout();
  };

  if (!hasCheckedPref || !isShieldEnabled || !isLocked || !user) {
    return null;
  }

  return (
    <Modal
      visible={isLocked}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      {/* Fully opaque: a translucent lock screen let the account underneath show through it. */}
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 420, maxHeight: '100%' }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <SolidCard
              style={{
                width: '100%',
                padding: spacing.xl,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: isDark ? 0.4 : 0.15,
                shadowRadius: 24,
                elevation: 10,
              }}
            >
              {/* Lock Icon */}
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: radius.pill,
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name="shield-checkmark" size={32} color={colors.brandPrimary} />
              </View>

              <AppText variant="h2" weight="bold" style={{ textAlign: 'center', marginBottom: 4 }}>
                Lioris App Shield
              </AppText>
              <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
                {bioAvailable
                  ? `Unlock with your ${bioLabel} or your account password.`
                  : 'Enter your account password to unlock.'}
              </AppText>

              {/* User Identity Preview */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: radius.md,
                  width: '100%',
                  marginBottom: spacing.lg,
                }}
              >
                <Avatar name={user.fullName || user.email || 'Campus Member'} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                    {user.fullName || 'Campus Member'}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={1}>
                    {user.email || ''}
                  </AppText>
                </View>
              </View>

              {/* Error Message */}
              {errorMsg ? (
                <View
                  accessibilityRole="alert"
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
                    width: '100%',
                  }}
                >
                  <Ionicons name="alert-circle" size={18} color={colors.critical} />
                  <AppText variant="caption" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                    {errorMsg}
                  </AppText>
                </View>
              ) : null}

              {/* Biometric button */}
              {bioAvailable ? (
                <View style={{ width: '100%', marginBottom: spacing.sm }}>
                  <AppButton
                    label="Unlock with biometrics"
                    variant="primary"
                    icon="finger-print"
                    fullWidth
                    loading={authMethod === 'biometric'}
                    disabled={authenticating}
                    onPress={handleBiometricUnlock}
                  />
                </View>
              ) : null}

              {/* Password input when shown */}
              {showPasswordInput ? (
                <View style={{ width: '100%', gap: spacing.sm, marginBottom: spacing.md }}>
                  <AppTextField
                    label=""
                    placeholder="Enter your account password"
                    secureTextEntry
                    showPasswordToggle
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    onSubmitEditing={handlePasswordUnlock}
                    autoFocus={!bioAvailable}
                  />
                  {/* The server rejects password sign-ins without this check, so the lock needs it too. */}
                  {needsCaptcha ? (
                    <TurnstileWidget
                      ref={turnstileRef}
                      onVerify={(token) => setCaptchaToken(token)}
                      onExpire={() => setCaptchaToken(null)}
                    />
                  ) : null}
                  <AppButton
                    label="Unlock with password"
                    variant={bioAvailable ? 'secondary' : 'primary'}
                    fullWidth
                    loading={authMethod === 'password'}
                    disabled={!password || authenticating}
                    onPress={handlePasswordUnlock}
                  />
                </View>
              ) : null}

              {/* Recovery when the saved passkey is missing or stale */}
              {bioAvailable && biometricFailed ? (
                <Pressable onPress={handleReEnroll} hitSlop={8} disabled={authenticating} style={{ marginBottom: spacing.sm }}>
                  <AppText tone="brand" variant="caption" weight="semiBold">
                    Set up {bioLabel} again
                  </AppText>
                </Pressable>
              ) : null}

              {/* Toggle between Biometrics & Password */}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: spacing.xs, alignItems: 'center' }}>
                {bioAvailable ? (
                  <>
                    <Pressable
                      onPress={() => {
                        setShowPasswordInput(!showPasswordInput);
                        setErrorMsg(null);
                      }}
                      hitSlop={8}
                    >
                      <AppText tone="brand" variant="caption" weight="semiBold">
                        {showPasswordInput ? 'Hide password' : 'Use password instead'}
                      </AppText>
                    </Pressable>
                    <AppText tone="secondary" variant="caption">•</AppText>
                  </>
                ) : null}

                <Pressable onPress={handleSignOut} hitSlop={8}>
                  <AppText tone="secondary" variant="caption" weight="semiBold">
                    Sign Out
                  </AppText>
                </Pressable>
              </View>
            </SolidCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
