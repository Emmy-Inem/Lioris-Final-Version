import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Avatar } from '@/components/Avatar';
import { haptics } from '@/utils/haptics';
import {
  BIOMETRICS_ENABLED_KEY,
  getStoredPref,
  isBiometricsAvailable,
  authenticateWithBiometrics,
  verifyPasswordFallback,
} from '@/utils/biometrics';

export function AppLockOverlay() {
  const { user, logout } = useAuth();
  const { colors, spacing, radius, isDark } = useTheme();

  const [isShieldEnabled, setIsShieldEnabled] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [hasCheckedPref, setHasCheckedPref] = useState<boolean>(false);
  const [bioAvailable, setBioAvailable] = useState<boolean>(false);
  const [bioType, setBioType] = useState<string>('Biometrics');
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [showPasswordInput, setShowPasswordInput] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      if (bioStatus.type === 'platform_biometrics') {
        setBioType('Face ID / Touch ID / Passkey');
      } else {
        setBioType('Device Biometrics');
      }
    } catch {
      setIsShieldEnabled(false);
    } finally {
      setHasCheckedPref(true);
    }
  }, [user]);

  useEffect(() => {
    checkSecurityShield();
  }, [checkSecurityShield]);

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

  const handleBiometricUnlock = async () => {
    if (!user || authenticating) return;
    setErrorMsg(null);
    setAuthenticating(true);
    haptics.light();

    try {
      const result = await authenticateWithBiometrics({
        id: user.id,
        email: user.email,
        fullName: user.fullName || 'User',
      });

      if (result.success) {
        haptics.success();
        setIsLocked(false);
        setPassword('');
        setErrorMsg(null);
      } else {
        haptics.error();
        setErrorMsg(result.error || 'Biometric authentication failed. Please try again or use password.');
        setShowPasswordInput(true);
      }
    } catch (err: any) {
      haptics.error();
      setErrorMsg(err?.message || 'Biometric error occurred.');
      setShowPasswordInput(true);
    } finally {
      setAuthenticating(false);
    }
  };

  const handlePasswordUnlock = async () => {
    if (!user || authenticating) return;
    if (!password.trim()) {
      setErrorMsg('Please enter your account password.');
      haptics.error();
      return;
    }

    setErrorMsg(null);
    setAuthenticating(true);
    haptics.light();

    try {
      const result = await verifyPasswordFallback(user.email, password.trim());
      if (result.success) {
        haptics.success();
        setIsLocked(false);
        setPassword('');
        setErrorMsg(null);
      } else {
        haptics.error();
        setErrorMsg('Incorrect password. Please verify your password and try again.');
      }
    } catch (err: any) {
      haptics.error();
      setErrorMsg(err?.message || 'Could not verify password.');
    } finally {
      setAuthenticating(false);
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
      <View
        style={{
          flex: 1,
          backgroundColor: isDark ? 'rgba(7, 11, 20, 0.95)' : 'rgba(240, 243, 248, 0.96)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 420, alignItems: 'center' }}
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
              This app is locked by your biometric & password security settings.
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
              <Avatar
                name={user.fullName || user.email || 'Campus Member'}
                size={38}
              />
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
                  autoFocus
                />
                <AppButton
                  label="Unlock with Password"
                  variant="primary"
                  fullWidth
                  loading={authenticating}
                  disabled={!password.trim() || authenticating}
                  onPress={handlePasswordUnlock}
                />
              </View>
            ) : null}

            {/* Biometric Button (if available or as primary) */}
            {bioAvailable ? (
              <View style={{ width: '100%', marginBottom: spacing.sm }}>
                <AppButton
                  label={`Unlock with ${bioType}`}
                  variant="primary"
                  fullWidth
                  loading={authenticating}
                  disabled={authenticating}
                  onPress={handleBiometricUnlock}
                />
              </View>
            ) : null}

            {/* Toggle between Biometrics & Password */}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: spacing.xs, alignItems: 'center' }}>
              <Pressable
                onPress={() => {
                  setShowPasswordInput(!showPasswordInput);
                  setErrorMsg(null);
                }}
                hitSlop={8}
              >
                <AppText tone="brand" variant="caption" weight="semiBold">
                  {showPasswordInput
                    ? (bioAvailable ? `Use ${bioType} instead` : 'Hide password input')
                    : 'Unlock with Password →'}
                </AppText>
              </Pressable>

              <AppText tone="secondary" variant="caption">•</AppText>

              <Pressable onPress={handleSignOut} hitSlop={8}>
                <AppText tone="secondary" variant="caption" weight="semiBold">
                  Sign Out
                </AppText>
              </Pressable>
            </View>
          </SolidCard>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
