import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { LiorisLogo } from '@/components/LiorisLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';
import { confirmMfaEnrollment, enrollMfaFactor, listMfaFactors, unenrollMfaFactor } from '@/api/auth';

type Mode = 'loading' | 'challenge' | 'enroll' | 'error';

interface EnrollmentData {
  factorId: string;
  secret: string;
  qrCodeSvg: string;
}

export default function VerifyMfaScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user, verifyMfa, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('loading');
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const startedRef = useRef(false);

  // Decide between "challenge an existing factor" and "enroll a new one".
  const initialise = useCallback(async () => {
    setMode('loading');
    setErrorMessage(null);
    try {
      const factors = await listMfaFactors();
      const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified');
      if (verified.length > 0) {
        setMode('challenge');
        return;
      }
      // Remove any half-finished enrollments so a fresh secret/QR is issued.
      const stale = (factors?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified');
      for (const factor of stale) {
        await unenrollMfaFactor(factor.id).catch(() => {});
      }
      const fresh = await enrollMfaFactor();
      setEnrollment(fresh);
      setMode('enroll');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not load two-factor authentication. Please try again.');
      setMode('error');
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    initialise();
  }, [initialise]);

  async function handleVerify() {
    setErrorMessage(null);
    setInfoMessage(null);
    if (code.trim().length < 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      haptics.error();
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      await verifyMfa(code.trim());
      haptics.success();
      router.replace('/');
    } catch {
      haptics.error();
      setErrorMessage('Invalid or expired MFA code. Please check and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnroll() {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!enrollment) return;
    if (code.trim().length < 6) {
      setErrorMessage('Please enter the complete 6-digit code from your authenticator app.');
      haptics.error();
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      await confirmMfaEnrollment(enrollment.factorId, code.trim());
    } catch (err: any) {
      haptics.error();
      setErrorMessage(err?.message || 'Invalid code. Please check your authenticator app and try again.');
      setSubmitting(false);
      return;
    }
    // The factor is now verified (and the Supabase session is aal2). Mark the
    // app-level session as MFA-verified using the same path as a normal login
    // challenge. Reusing the identical code may be rejected as a replay, in
    // which case ask for the next code.
    try {
      await verifyMfa(code.trim());
      haptics.success();
      router.replace('/');
    } catch {
      setEnrollment(null);
      setCode('');
      setMode('challenge');
      setInfoMessage('Authenticator added. Enter the next 6-digit code shown in your app to finish signing in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    haptics.light();
    await logout();
    router.replace('/(auth)/login');
  }

  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Staff';
  const isEnroll = mode === 'enroll';

  const pinInput = (
    <>
      {/* 6-Digit Segmented PIN Display */}
      <Pressable onPress={() => inputRef.current?.focus()} style={{ marginBottom: spacing.lg }}>
        <AppText weight="bold" variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>
          ENTER 6-DIGIT CODE
        </AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const char = code[index] || '';
            const isFocused = code.length === index || (index === 5 && code.length === 6);
            return (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: isFocused ? colors.brandPrimary : char ? colors.textSecondary : colors.border,
                  backgroundColor: isFocused ? colors.pastelPrimaryBg : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText variant="h2" weight="bold" tone={char ? 'primary' : 'secondary'}>
                  {char ? char : isFocused ? '|' : '·'}
                </AppText>
              </View>
            );
          })}
        </View>

        {/* Hidden native input for seamless mobile keyboard & paste handling */}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(text) => {
            const numericOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
            setCode(numericOnly);
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus={!isEnroll}
          style={{ position: 'absolute', opacity: 0, width: '100%', height: 50 }}
        />
      </Pressable>
    </>
  );

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <AuthHeroBackground height={180}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ marginBottom: spacing.xs }}>
              <LiorisLogo size={52} variant="symbol" />
            </View>
            <AppText variant="h1" weight="bold" tone="inverse" style={{ marginTop: 4 }}>
              {isEnroll ? 'Set Up 2-Step Verification' : "Verify It's You"}
            </AppText>
            <AppText tone="inverse" variant="caption" style={{ opacity: 0.85, marginTop: 2 }}>
              Two-Factor Authentication (2FA)
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: colors.pastelPrimaryBg,
              borderRadius: radius.md,
              padding: spacing.md,
              marginBottom: spacing.lg,
              borderWidth: 1,
              borderColor: `${colors.brandPrimary}22`,
            }}
          >
            <Ionicons name="shield-checkmark" size={24} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" variant="bodySmall" tone="brand">
                Institutional Security Shield
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                Two-factor authentication is required for {roleLabel} accounts to protect campus data.
              </AppText>
            </View>
          </View>

          {mode === 'loading' ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
              <ActivityIndicator color={colors.brandPrimary} />
              <AppText tone="secondary" variant="caption">
                Checking your security settings…
              </AppText>
            </View>
          ) : null}

          {mode === 'error' ? (
            <View style={{ gap: spacing.md }}>
              <AppText style={{ color: colors.critical }} variant="bodySmall" weight="semiBold">
                {errorMessage}
              </AppText>
              <AppButton label="Try again" onPress={initialise} fullWidth />
            </View>
          ) : null}

          {mode === 'enroll' && enrollment ? (
            <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
              <AppText tone="secondary" variant="bodySmall">
                1. Open an authenticator app (Google Authenticator, Authy, Microsoft Authenticator or similar) and scan
                this QR code.
              </AppText>
              {enrollment.qrCodeSvg ? (
                <View
                  style={{
                    alignSelf: 'center',
                    backgroundColor: '#FFFFFF',
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <SvgXml xml={enrollment.qrCodeSvg} width={192} height={192} />
                </View>
              ) : null}
              <AppText tone="secondary" variant="caption">
                Can't scan? Enter this secret key manually (select and copy it):
              </AppText>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.sm,
                }}
              >
                <TextInput
                  value={enrollment.secret}
                  editable={false}
                  selectTextOnFocus
                  accessibilityLabel="Authenticator secret key"
                  style={{ fontFamily: 'monospace', fontSize: 14, color: colors.textPrimary }}
                />
              </View>
              <AppText tone="secondary" variant="bodySmall">
                2. Enter the 6-digit code your app shows to finish setup:
              </AppText>
            </View>
          ) : null}

          {mode === 'challenge' ? (
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, or similar):
            </AppText>
          ) : null}

          {mode === 'challenge' || mode === 'enroll' ? pinInput : null}

          {infoMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.pastelPrimaryBg,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <AppText variant="bodySmall" weight="semiBold" style={{ flex: 1 }}>
                {infoMessage}
              </AppText>
            </View>
          ) : null}

          {errorMessage && mode !== 'error' ? (
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

          {mode === 'challenge' ? (
            <AppButton
              label="Authorize & Continue →"
              onPress={handleVerify}
              loading={submitting}
              disabled={code.trim().length < 6}
              fullWidth
            />
          ) : null}
          {mode === 'enroll' ? (
            <AppButton
              label="Confirm & Continue →"
              onPress={handleEnroll}
              loading={submitting}
              disabled={code.trim().length < 6}
              fullWidth
            />
          ) : null}

          {mode === 'challenge' || mode === 'enroll' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: spacing.lg,
              }}
            >
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <AppText tone="secondary" variant="caption">
                Codes refresh automatically in your authenticator app
              </AppText>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
              marginTop: spacing.xl,
              paddingTop: spacing.md,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <Pressable onPress={handleSignOut} hitSlop={8}>
              <AppText tone="secondary" variant="caption" weight="medium">
                Not your account? <AppText tone="brand" variant="caption" weight="bold">Sign Out</AppText>
              </AppText>
            </Pressable>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
