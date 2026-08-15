import React, { useEffect, useState } from'react';
import { View, ScrollView, Alert } from'react-native';
import { router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { AuthHeroBackground } from'@/components/AuthHeroBackground';
import { WaveCard } from'@/components/WaveCard';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import * as authApi from'@/api/auth';
import { haptics } from'@/utils/haptics';

const RESEND_COOLDOWN_SECONDS = 30;

// PRD Section 11 — staff/admin accounts must clear an MFA challenge at
// every sign-in. There's no real backend/authenticator/SMS provider yet
// (see README's"Mock data fallback"section), so authApi.verifyMfaCode
// and resendMfaCode fabricate success the same way the rest of auth
// does — this screen is the real, wired UI half of that requirement,
// not a decorative placeholder.
export default function VerifyMfaScreen() {
  const { spacing } = useTheme();
  const { user, verifyMfa, logout } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleVerify() {
    setSubmitting(true);
    try {
      await verifyMfa(code.trim());
      haptics.success();
      router.replace('/');
    } catch {
      haptics.error();
      Alert.alert('Invalid code', 'That verification code didn\u2019t work — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await authApi.resendMfaCode();
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await logout();
    router.replace('/(auth)/login');
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <AuthHeroBackground height={160}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="shield-checkmark"size={26} color="#FFFFFF" />
            </View>
            <AppText variant="h1"weight="bold"tone="inverse">
              Verify it's you
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <AppText tone="secondary"style={{ marginBottom: spacing.md }}>
            {user?.role === 'admin' ? 'Admin' : 'Staff'} accounts require an extra verification step
            at every sign-in. We sent a 6-digit code to your registered email — enter it below to
            continue.
          </AppText>
          <AppText tone="brand"variant="caption"weight="semiBold"style={{ marginBottom: spacing.lg }}>
            Preview build: any 4+ digit code works — there's no real code being sent yet.
          </AppText>

          <AppTextField
            label="Verification code"keyboardType="number-pad"value={code}
            onChangeText={setCode}
            placeholder="123456"maxLength={6}
          />

          <AppButton
            label="Verify & Continue"onPress={handleVerify}
            loading={submitting}
            disabled={code.trim().length < 4}
            fullWidth
          />

          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            {cooldown > 0 ? (
              <AppText tone="secondary"variant="bodySmall">
                Didn't get a code? Resend in {cooldown}s.
              </AppText>
            ) : (
              <AppText
                tone="brand"weight="semiBold"variant="bodySmall"onPress={resending ? undefined : handleResend}
              >
                {resending ? 'Sending…' : "Didn't get a code? Resend it"}
              </AppText>
            )}
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
            <AppText tone="secondary"variant="bodySmall"onPress={handleSignOut}>
              Not you? Sign out
            </AppText>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
