import React, { useState } from'react';
import { View, ScrollView, Alert } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { AuthHeroBackground } from'@/components/AuthHeroBackground';
import { WaveCard } from'@/components/WaveCard';
import { useTheme } from'@/theme/ThemeProvider';
import * as authApi from'@/api/auth';
import { useAdvanceOnboarding } from'@/auth/useAdvanceOnboarding';

export default function VerifyAlumniScreen() {
  const { spacing } = useTheme();
  const advance = useAdvanceOnboarding('/(auth)/verify-alumni');
  const [graduationYear, setGraduationYear] = useState('');
  const [studentId, setStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    setSubmitting(true);
    try {
      const result = await authApi.verifyAlumniStatus({
        graduationYear: Number(graduationYear),
        studentId: studentId.trim() || undefined,
      });
      if (result.status === 'pending') {
        // PRD Edge Cases: "Failed alumni verification: keep user in
        // verification pending state, show next steps, restrict
        // privileged actions" — e.g. messaging/directory visibility.
        Alert.alert(
          'Verification pending',
          'We couldn\u2019t confirm your alumni status against our records yet. Our team will review your account — some features will stay limited until then.',
        );
      }
      await advance();
    } catch {
      Alert.alert('Verification failed', 'Please double check your graduation year and try again.');
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
              <Ionicons name="ribbon"size={26} color="#FFFFFF" />
            </View>
            <AppText variant="h1"weight="bold"tone="inverse">
              Verify your alumni status
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <AppText tone="secondary"style={{ marginBottom: spacing.lg }}>
            This confirms your graduation record so you can access the alumni directory
            and mentorship tools.
          </AppText>

          <AppTextField
            label="Graduation year"keyboardType="number-pad"value={graduationYear}
            onChangeText={setGraduationYear}
            placeholder="2019"maxLength={4}
          />
          <AppTextField
            label="Former student ID (optional)"value={studentId}
            onChangeText={setStudentId}
            placeholder="e.g. S00123456"autoCapitalize="characters"
          />

          <AppButton
            label="Verify alumni status"
            onPress={handleVerify}
            loading={submitting}
            fullWidth
          />

          <View style={{ marginTop: spacing.md }}>
            <AppButton
              label="Skip & Enter Workspace →"
              variant="secondary"
              onPress={async () => {
                await advance();
              }}
              fullWidth
            />
          </View>
        </WaveCard>
      </ScrollView>
    </ScreenContainer>
  );
}
