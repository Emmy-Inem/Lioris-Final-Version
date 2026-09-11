import React, { useState, useRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { SolidCard } from '@/components/SolidCard';
import { LiorisLogo } from '@/components/LiorisLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

export default function VerifyMfaScreen() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { user, verifyMfa, logout } = useAuth();
 const [code, setCode] = useState('');
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);
 const inputRef = useRef<TextInput>(null);

 async function handleVerify() {
 setErrorMessage(null);
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

 async function handleSignOut() {
 haptics.light();
 await logout();
 router.replace('/(auth)/login');
 }

 return (
 <ScreenContainer noPadding glow={false}>
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
 <AuthHeroBackground height={180}>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
 <View style={{ marginBottom: spacing.xs }}>
 <LiorisLogo size={52} variant="symbol" />
 </View>
 <AppText variant="h1" weight="bold" tone="inverse" style={{ marginTop: 4 }}>
 Verify It's You
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
 {user?.role === 'admin' ? 'Admin' : 'Staff'} accounts can add 2-step verification as an extra layer of protection.
 </AppText>
 </View>
 </View>

 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, or similar):
 </AppText>

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
 autoFocus
 style={{ position: 'absolute', opacity: 0, width: '100%', height: 50 }}
 />
 </Pressable>

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
 label="Authorize & Continue →"
 onPress={handleVerify}
 loading={submitting}
 disabled={code.trim().length < 6}
 fullWidth
 />

 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg }}>
 <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
 <AppText tone="secondary" variant="caption">
 Codes refresh automatically in your authenticator app
 </AppText>
 </View>

 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
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
