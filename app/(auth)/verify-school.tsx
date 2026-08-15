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

export default function VerifySchoolScreen() {
  const { spacing } = useTheme();
  const advance = useAdvanceOnboarding('/(auth)/verify-school');
  const [schoolId, setSchoolId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    setSubmitting(true);
    try {
      const result = await authApi.verifySchool(schoolId.trim());
      if (result.status === 'pending') {
        // PRD Edge Cases: failed/incomplete verification keeps the user
        // in a pending state with restricted privileged actions.
        Alert.alert(
          'Verification pending',
          'We couldn\u2019t confirm your school ID automatically. Your account is under manual review — you can continue with limited access in the meantime.',
        );
      }
      await advance();
    } catch {
      Alert.alert('Verification failed', 'Please check your school ID and try again.');
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
              <Ionicons name="school" size={26} color="#FFFFFF" />
            </View>
            <AppText variant="h1" weight="bold" tone="inverse">
              Verify your school
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
            Enter your student ID so we can confirm your enrollment and unlock the full
            student experience.
          </AppText>

          <AppTextField
            label="Student ID"
            value={schoolId}
            onChangeText={setSchoolId}
            placeholder="e.g. S00123456"
            autoCapitalize="characters"
          />

          <AppButton
            label="Verify enrollment"
            onPress={handleVerify}
            loading={submitting}
            disabled={!schoolId}
            fullWidth
          />
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
