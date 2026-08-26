import React, { useState } from'react';
import { View, ScrollView, Alert, Pressable } from'react-native';
import { Link, router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { PasswordChecklist } from'@/components/PasswordChecklist';
import { AuthHeroBackground } from'@/components/AuthHeroBackground';
import { WaveCard } from'@/components/WaveCard';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { UserRole } from '@/api/types';
import { isPasswordValid, passwordStrength, isValidEmailFormat, isValidUsername } from '@/utils/validation';
import { seedProfileUsername } from '@/api/profile';
import { getInstitutionForEmail } from '@/api/institutions';
import { institutionThemeOverrides } from '@/theme/colors';
import { Image } from 'expo-image';
import { LiorisLogo } from '@/components/LiorisLogo';

const PORTALS: Array<{ value: Extract<UserRole, 'student' | 'alumni'>; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
 { value: 'student', label: 'Student Portal', icon: 'school' },
 { value: 'alumni', label: 'Alumni Circle', icon: 'star' },
];

export default function RegisterScreen() {
 const { colors, radius, spacing, isDark, toggleTheme } = useTheme();
 const { isDesktop } = useResponsive();
 const { register } = useAuth();
 const [portal, setPortal] = useState<Extract<UserRole, 'student' | 'alumni'>>('student');
 const [fullName, setFullName] = useState('');
 const [username, setUsername] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [botField, setBotField] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [acceptedTerms, setAcceptedTerms] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 const passwordValid = isPasswordValid(password);
 const strength = passwordStrength(password);
 const emailTouched = email.length > 0;
 const emailFormatValid = isValidEmailFormat(email);
 const matchedInstitution = getInstitutionForEmail(email);
 const usernameTouched = username.length > 0;
 const usernameValid = isValidUsername(username);

 const institutionOverride = matchedInstitution ? institutionThemeOverrides[matchedInstitution.code] : undefined;
 const heroFromColor = institutionOverride ? (isDark ? institutionOverride.dark.brandPrimaryPressed : institutionOverride.light.brandPrimaryPressed) : undefined;
 const heroToColor = institutionOverride ? (isDark ? institutionOverride.dark.brandPrimary : institutionOverride.light.brandPrimary) : undefined;

 async function handleRegister() {
 setErrorMessage(null);
 if (fullName.trim().length < 2) {
 setErrorMessage('Please enter your full display name.');
 return;
 }
 if (!emailFormatValid) {
 setErrorMessage('Please enter a valid email address.');
 return;
 }
 if (!passwordValid) {
 setErrorMessage('Password must meet all security criteria (12+ characters with uppercase, lowercase, numbers, and symbols).');
 return;
 }
 if (!usernameValid) {
 setErrorMessage('Username must be 3-24 characters (letters, numbers, dots, underscores).');
 return;
 }
 if (!acceptedTerms) {
 setErrorMessage('Please accept the Terms of Service & Privacy Policy to continue.');
 return;
 }

 setSubmitting(true);
 try {
 const createdUser = await register({
 fullName: fullName.trim(),
 username,
 email: email.trim(),
 password,
 userType: portal,
 botField,
 });
 seedProfileUsername(createdUser, username, matchedInstitution ?? undefined);
 router.replace('/');
 } catch (err: any) {
 setErrorMessage(err?.message || 'Registration failed. Please check your details and try again.');
 } finally {
 setSubmitting(false);
 }
 }

 const formContent = (
 <>
 <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
 {PORTALS.map((p) => {
 const selected = portal === p.value;
 return (
 <Pressable
 key={p.value}
 onPress={() => setPortal(p.value)}
 accessibilityRole="tab"
 accessibilityState={{ selected }}
 accessibilityLabel={p.label}
 style={{
 flex: 1,
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 gap: 6,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 }}
 >
 <Ionicons name={p.icon} size={14} color={selected ? '#FFFFFF' : colors.textSecondary} />
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
 {p.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppText variant="h1" weight="bold" style={{ marginBottom: spacing.xs }}>
 {portal === 'student' ? 'Create Student Workspace' : 'Create Alumni Workspace'}
 </AppText>
 <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
 UNILAG, UI, and FUNAAB emails are verified automatically. Any other email still works - 
 you can apply for the verified tick afterward.
 </AppText>

 <AppTextField
 label="School Email"
 autoCapitalize="none"
 keyboardType="email-address"
 value={email}
 onChangeText={setEmail}
 placeholder="you@unilag.edu.ng or any email"
 error={emailTouched && !emailFormatValid ? 'Enter a valid email address' : undefined}
 />
 {emailTouched && emailFormatValid && matchedInstitution ? (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm, marginBottom: spacing.lg }}>
 <Ionicons name="checkmark-circle" size={14} color={colors.success} />
 <AppText variant="bodySmall" style={{ color: colors.success }}>
 Registering at {matchedInstitution.name} - you'll be verified automatically.
 </AppText>
 </View>
 ) : null}

 <View>
 <AppTextField
 label="Password (Min 12 characters)"
 secureTextEntry={!showPassword}
 value={password}
 onChangeText={setPassword}
 placeholder="••••••••••••"
 />
 <Pressable
 onPress={() => setShowPassword((v) => !v)}
 accessibilityRole="button"
 accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
 style={{ position: 'absolute', right: spacing.md, top: 40 }}
 hitSlop={8}
 >
 <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
 </Pressable>
 </View>

 {password.length > 0 ? (
 <View style={{ marginTop: -spacing.sm, marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
 <AppText
 variant="caption"
 weight="bold"
 style={{
 color:
 strength.color === 'critical'
 ? colors.critical
 : strength.color === 'warning'
 ? colors.warning
 : strength.color === 'success'
 ? colors.success
 : colors.brandPrimary,
 }}
 >
 {strength.label} strength
 </AppText>
 <AppText variant="caption" tone="secondary">
 {password.length} chars
 </AppText>
 </View>
 <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.divider }}>
 <View
 style={{
 height: 4,
 borderRadius: 2,
 width: `${strength.score}%`,
 backgroundColor:
 strength.color === 'critical'
 ? colors.critical
 : strength.color === 'warning'
 ? colors.warning
 : strength.color === 'success'
 ? colors.success
 : colors.brandPrimary,
 }}
 />
 </View>
 </View>
 ) : null}
 {password.length > 0 ? <PasswordChecklist password={password} /> : null}

 <AppTextField
 label="Choose Username (@handle)"
 autoCapitalize="none"
 value={username}
 onChangeText={setUsername}
 placeholder="e.g. ineme.17"
 error={usernameTouched && !usernameValid ? '3-24 characters: letters, numbers, dots, underscores' : undefined}
 />

 <AppTextField label="Display Full Name" value={fullName} onChangeText={setFullName} placeholder="Inem Light" />

 {/* Anti-Bot Honeypot Field */}
 <View style={{ position: 'absolute', left: -9999, top: -9999, width: 0, height: 0, opacity: 0, overflow: 'hidden' }} aria-hidden={true}>
 <AppTextField
 label="Website URL"
 value={botField}
 onChangeText={setBotField}
 placeholder="Do not fill this field"
 autoCapitalize="none"
 autoComplete="off"
 />
 </View>

 <Pressable
 onPress={() => setAcceptedTerms((v) => !v)}
 accessibilityRole="checkbox"
 accessibilityState={{ checked: acceptedTerms }}
 accessibilityLabel="I accept the Privacy Policy, Terms of Service, and Community Rules"
 style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, marginTop: spacing.sm }}
 >
 <Ionicons
 name={acceptedTerms ? 'checkbox' : 'square-outline'}
 size={20}
 color={acceptedTerms ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText variant="bodySmall" style={{ flex: 1 }}>
 I accept the Privacy Policy, Terms of Service, and Community Rules.
 </AppText>
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

 <AppButton label="Configure & Join" onPress={handleRegister} loading={submitting} fullWidth />

 <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
 <Link href="/(auth)/login">
 <AppText tone="brand" weight="semiBold">
 Already have an account? Log In
 </AppText>
 </Link>
 </View>
 </>
 );

 return (
 <ScreenContainer noPadding glow={false}>
 {isDesktop ? (
 <View style={{ flexDirection: 'row', flex: 1, minHeight: '100vh' as any }}>
 {/* Left Hero Branding */}
 <View style={{ flex: 1.1, position: 'relative', overflow: 'hidden', backgroundColor: '#0F172A', padding: spacing.xxl, justifyContent: 'space-between' }}>
 <Image
 source={require('../../assets/images/campus_students_photo.jpg')}
 style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }}
 contentFit="cover"
 />
 <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)' }} />

 <View style={{ zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
 <LiorisLogo size={44} variant="symbol" />
 <LiorisLogo size={28} variant="wordmark" />
 </View>

 <View style={{ zIndex: 10, maxWidth: 540, gap: spacing.lg }}>
 <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
 <AppText variant="caption" weight="bold" tone="inverse">
 Fast & Verified Student Onboarding
 </AppText>
 </View>
 <AppText variant="h1" weight="bold" tone="inverse" style={{ fontSize: 36, lineHeight: 44 }}>
 Join your university community in under 60 seconds.
 </AppText>
 <AppText tone="inverse" variant="body" style={{ opacity: 0.85, fontSize: 16 }}>
 Direct access to departmental past questions, verified peer discussions, internship pipelines, and campus trade.
 </AppText>
 </View>

 <View style={{ zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <AppText variant="caption" tone="inverse" style={{ opacity: 0.7 }}>
 © 2026 Lioris Campus Inc. All rights reserved.
 </AppText>
 <Pressable
 onPress={toggleTheme}
 style={{
 width: 36,
 height: 36,
 borderRadius: 18,
 backgroundColor: 'rgba(255,255,255,0.15)',
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name={isDark ? 'sunny' : 'moon'} size={18} color="#FFFFFF" />
 </Pressable>
 </View>
 </View>

 {/* Right Form */}
 <View style={{ width: 560, backgroundColor: colors.background, overflow: 'scroll' as any, padding: spacing.xxl, justifyContent: 'center' }}>
 <View style={{ maxWidth: 440, width: '100%', alignSelf: 'center' }}>
 {formContent}
 </View>
 </View>
 </View>
 ) : (
 /* Mobile Layout */
 <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
 <AuthHeroBackground height={140} fromColor={heroFromColor} toColor={heroToColor}>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.lg }}>
 <AppText variant="h1" weight="bold" tone="inverse">
 Join Lioris
 </AppText>
 {matchedInstitution ? (
 <AppText tone="inverse" weight="semiBold" style={{ opacity: 0.9, marginTop: 2 }}>
 at {matchedInstitution.name}
 </AppText>
 ) : null}
 </View>
 </AuthHeroBackground>

 <WaveCard>
 {formContent}
 </WaveCard>
 </ScrollView>
 )}
 </ScreenContainer>
 );
}
