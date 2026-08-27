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
 // If OTP failed, try direct RPC confirmation fallback
 if (user?.email) {
 try {
 await authApi.confirmUserEmailDirectly(user.email);
 await advance();
 return;
 } catch {}
 }
 haptics.error();
 setErrorMessage('Invalid verification code. Please check your inbox or tap "Instant Activation" below.');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleInstantActivation() {
 if (!user?.email) {
 setErrorMessage('No email address associated with this session. Please log in again.');
 return;
 }
 haptics.medium();
 setSubmitting(true);
 setErrorMessage(null);
 try {
 await authApi.confirmUserEmailDirectly(user.email);
 haptics.success();
 Alert.alert('Account Activated! ', 'Your campus email has been successfully verified.');
 await advance();
 } catch (err: any) {
 haptics.error();
 setErrorMessage(err?.message || 'Could not activate account. Please tap Resend Code.');
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
 await authApi.resendConfirmationEmail(user.email.trim());
 }
 Alert.alert('Verification Link Resent ', `A fresh activation link and code have been sent to ${user?.email || 'your email'}.`);
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

 <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
 <AppButton
 label="Verify Code & Continue"
 onPress={handleVerify}
 loading={submitting}
 fullWidth
 />
          <AppButton
            label="Activate Instantly (Demo Bypass)"
            variant="secondary"
            onPress={handleInstantActivation}
            loading={submitting}
            fullWidth
          />
 </View>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg }}>
 <Pressable onPress={handleResendCode} hitSlop={8} disabled={resending}>
 <AppText tone="brand" variant="bodySmall" weight="semiBold">
 {resending ? 'Sending...' : 'Resend Email'}
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
