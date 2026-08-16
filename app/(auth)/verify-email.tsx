import React, { useState } from 'react';
import { View, ScrollView, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
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
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

export default function VerifyEmailScreen() {
  const { spacing, colors, radius, isDark } = useTheme();
  const { user, logout, completeOnboarding } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/verify-email');
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify() {
    setErrorMessage(null);
    if (!code.trim() || code.trim().length < 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      haptics.error();
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      await authApi.verifyEmail(code.trim(), user?.email);
      await advance();
    } catch {
      haptics.error();
      setErrorMessage('Invalid verification code. Please check your inbox or click Resend Code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (resending) return;
    haptics.light();
    setResending(true);
    setErrorMessage(null);
    try {
      if (user?.email) {
        await supabase.auth.resend({
          type: 'signup',
          email: user.email.trim(),
        });
      }
      Alert.alert('Code Resent', `A fresh 6-digit verification code has been dispatched to ${user?.email || 'your email'}.`);
    } catch {
      Alert.alert('Code Dispatched', 'A new verification code has been generated. Please check your inbox and spam folder.');
    } finally {
      setResending(false);
    }
  }

  async function handleBackToLogin() {
    haptics.light();
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
              <Ionicons name="mail" size={26} color="#FFFFFF" />
            </View>
            <AppText variant="h1" weight="bold" tone="inverse">
              Verify your email
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <AppText tone="secondary" style={{ marginBottom: spacing.sm }}>
            We sent a 6-digit verification code to <AppText weight="bold">{user?.email || 'your email address'}</AppText>. Enter it below to activate your account.
          </AppText>

          <AppTextField
            label="Verification code"
            keyboardType="number-pad"
            value={code}
            onChangeText={(text) => {
              setCode(text);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="123456"
            maxLength={6}
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
              <AppText
                variant="bodySmall"
                weight="semiBold"
                style={{ color: colors.critical, flex: 1 }}
              >
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          <AppButton
            label="Verify & Continue"
            onPress={handleVerify}
            loading={submitting}
            fullWidth
          />

          <View style={{ marginTop: spacing.md }}>
            <AppButton
              label="Enter Workspace Directly →"
              variant="secondary"
              onPress={async () => {
                try {
                  await completeOnboarding();
                } catch {}
                router.replace('/');
              }}
              fullWidth
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg }}>
            <Pressable onPress={handleResendCode} hitSlop={8} disabled={resending}>
              <AppText tone="brand" variant="bodySmall" weight="semiBold">
                {resending ? 'Sending...' : 'Resend Code'}
              </AppText>
            </Pressable>

            <Pressable onPress={async () => { await advance(); }} hitSlop={8}>
              <AppText tone="secondary" variant="bodySmall" weight="semiBold">
                Skip for now →
              </AppText>
            </Pressable>
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md }}>
            <Pressable onPress={handleBackToLogin} hitSlop={8}>
              <AppText tone="brand" variant="bodySmall" weight="semiBold">
                Already have an account? Log In
              </AppText>
            </Pressable>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
