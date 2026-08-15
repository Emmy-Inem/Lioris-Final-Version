import React, { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { useTheme } from '@/theme/ThemeProvider';
import * as authApi from '@/api/auth';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';

export default function VerifyEmailScreen() {
  const { spacing } = useTheme();
  const advance = useAdvanceOnboarding('/(auth)/verify-email');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    setSubmitting(true);
    try {
      await authApi.verifyEmail(code.trim());
      await advance();
    } catch {
      Alert.alert('Invalid code', 'That verification code didn\u2019t work — please try again.');
    } finally {
      setSubmitting(false);
    }
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
          <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
            We sent a 6-digit code to your email address. Enter it below to continue.
          </AppText>

          <AppTextField
            label="Verification code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            maxLength={6}
          />

          <AppButton
            label="Verify"
            onPress={handleVerify}
            loading={submitting}
            disabled={code.length < 4}
            fullWidth
          />

          <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <AppText tone="secondary" variant="bodySmall">
              Didn't get a code? Check spam, or resend in 60s.
            </AppText>
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
