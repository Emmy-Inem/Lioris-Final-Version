import React, { useState } from 'react';
import { View, ScrollView, Alert, Pressable, Platform, Modal } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { PasswordChecklist } from '@/components/PasswordChecklist';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { UserRole } from '@/api/types';
import { isPasswordValid, passwordStrength, isValidEmailFormat, isValidUsername } from '@/utils/validation';
import { seedProfileUsername } from '@/api/profile';
import { isEmailConfirmationRequired, checkUsernameAvailable } from '@/api/auth';
import { getInstitutionForEmail, LAUNCH_INSTITUTIONS, getInstitutionByCode, joinWaitlist } from '@/api/institutions';
import { institutionThemeOverrides } from '@/theme/colors';
import { Image } from 'expo-image';
import { LiorisLogo } from '@/components/LiorisLogo';
import { INDEPENDENT_AGE, MIN_AGE, TERMS_VERSION } from '@/constants/legal';
import { TurnstileWidget, TurnstileWidgetRef } from '@/components/TurnstileWidget';
import { persistCampus } from '@/hooks/useViewScope';
import { getFriendlyErrorMessage } from '@/utils/errors';

const SUPPORTED_INSTITUTIONS = LAUNCH_INSTITUTIONS.filter((i) => i.code !== 'GLOBAL');

const PORTALS: Array<{ value: Extract<UserRole, 'student' | 'alumni'>; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
 { value: 'student', label: 'Student Portal', icon: 'school' },
 { value: 'alumni', label: 'Alumni Circle', icon: 'star' },
];

export default function RegisterScreen() {
 const { colors, radius, spacing, isDark, toggleTheme } = useTheme();
 const { isDesktop } = useResponsive();
 const { register } = useAuth();
 const [portal, setPortal] = useState<Extract<UserRole, 'student' | 'alumni'>>('student');
 const [selectedCampusCode, setSelectedCampusCode] = useState<string>('');
 const [showWaitlistModal, setShowWaitlistModal] = useState(false);
 const [waitlistName, setWaitlistName] = useState('');
 const [waitlistUniversity, setWaitlistUniversity] = useState('');
 const [waitlistEmail, setWaitlistEmail] = useState('');
 const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
 const [waitlistSuccess, setWaitlistSuccess] = useState(false);
 const [fullName, setFullName] = useState('');
 const [username, setUsername] = useState('');
 const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [botField, setBotField] = useState('');
 const [acceptedTerms, setAcceptedTerms] = useState(false);
 const [confirmedAge, setConfirmedAge] = useState(false);
 const [captchaToken, setCaptchaToken] = useState<string | null>(null);
 const turnstileRef = React.useRef<TurnstileWidgetRef>(null);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 const passwordValid = isPasswordValid(password);
 const strength = passwordStrength(password);
 const emailTouched = email.length > 0;
 const emailFormatValid = isValidEmailFormat(email);
 const matchedInstitution = getInstitutionForEmail(email);
 const usernameTouched = username.length > 0;
 const usernameValid = isValidUsername(username.trim().replace(/^@/, ''));

 // Live debounced check for username availability
 React.useEffect(() => {
 const clean = username.trim().replace(/^@/, '').toLowerCase();
 if (!clean || clean.length < 3 || !isValidUsername(clean)) {
 setUsernameStatus('idle');
 return;
 }

 let cancelled = false;
 setUsernameStatus('checking');

 const timer = setTimeout(async () => {
 try {
 const available = await checkUsernameAvailable(clean);
 if (!cancelled) {
 setUsernameStatus(available ? 'available' : 'taken');
 }
 } catch {
 if (!cancelled) setUsernameStatus('idle');
 }
 }, 400);

 return () => {
 cancelled = true;
 clearTimeout(timer);
 };
 }, [username]);

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
    setErrorMessage('Password must meet all security criteria (8+ characters with uppercase, lowercase, numbers, and symbols).');
    return;
  }
 if (!usernameValid) {
 setErrorMessage('Username must be 3-24 characters (letters, numbers, dots, underscores).');
 return;
 }
  if (usernameStatus === 'taken') {
    setErrorMessage(`Username @${username.trim().replace(/^@/, '')} is already taken. Please choose another.`);
    return;
  }
  if (!confirmedAge) {
    setErrorMessage(`Confirm that you are ${INDEPENDENT_AGE}+ or an admitted university student aged ${MIN_AGE}–17 with parent or guardian authorisation.`);
    return;
  }
 if (!acceptedTerms) {
 setErrorMessage('Please accept the Terms of Service & Privacy Policy to continue.');
 return;
 }

  if (Platform.OS === 'web' && !captchaToken) {
    setErrorMessage('Please complete the security check above before continuing.');
    return;
  }

  const effectiveCampusCode = matchedInstitution?.code || selectedCampusCode;
  if (!effectiveCampusCode) {
    setErrorMessage('Please select your university from the supported universities list.');
    return;
  }
  persistCampus(effectiveCampusCode);

  setSubmitting(true);
  try {
    const createdUser = await register({
      fullName: fullName.trim(),
      username: username.trim().replace(/^@/, ''),
      email: email.trim(),
      password,
      userType: portal,
      campusCode: effectiveCampusCode,
      botField,
      acceptedTermsVersion: TERMS_VERSION,
      confirmedAgeEligible: true,
      captchaToken: captchaToken || undefined,
    });
    seedProfileUsername(
      createdUser,
      username.trim().replace(/^@/, ''),
      matchedInstitution ?? (effectiveCampusCode ? getInstitutionByCode(effectiveCampusCode) : undefined) ?? undefined
    );
    router.replace('/');
 } catch (err: any) {
 turnstileRef.current?.reset();
 setCaptchaToken(null);
 if (isEmailConfirmationRequired(err)) {
 // Account exists; the address must be confirmed with the emailed code before sign-in.
 router.replace({ pathname: '/(auth)/verify-email', params: { email: err.email || email.trim(), campus_code: effectiveCampusCode } });
 return;
 }
 if (err?.code === 'captcha_failed' || err?.message?.toLowerCase().includes('captcha')) {
 setErrorMessage('Security verification failed or expired. Please complete the security check again.');
 return;
 }
 setErrorMessage(getFriendlyErrorMessage(err, 'Registration failed. Please check your details and try again.'));
 } finally {
 setSubmitting(false);
 }
 }

 async function handleJoinWaitlist() {
   if (!waitlistName.trim() || !waitlistUniversity.trim() || !waitlistEmail.trim()) {
     return;
   }
   setSubmittingWaitlist(true);
   try {
     await joinWaitlist({
       name: waitlistName.trim(),
       universityName: waitlistUniversity.trim(),
       email: waitlistEmail.trim(),
     });
     setWaitlistSuccess(true);
   } catch {
     Alert.alert('Error', 'Failed to join waitlist. Please try again.');
   } finally {
     setSubmittingWaitlist(false);
   }
 }

 const formContent = (
 <>
 <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
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
 <Ionicons name={p.icon} size={14} color={selected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475467'} />
 <AppText
 variant="bodySmall"
 weight="bold"
 tone={selected ? 'inverse' : 'secondary'}
 style={!selected ? { color: isDark ? '#CBD5E1' : '#475467' } : undefined}
 >
 {p.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppText variant="h1" weight="bold" style={{ marginBottom: spacing.xs }}>
 {portal === 'student' ? 'Create Student Workspace' : 'Create Alumni Workspace'}
 </AppText>
 <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
 Select your university below. You can verify that you're a student right after sign-up, or later.
 </AppText>

 {/* Supported University Selector & Waitlist Action */}
 <View style={{ marginBottom: spacing.md }}>
   <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
     SUPPORTED UNIVERSITIES
   </AppText>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
     {SUPPORTED_INSTITUTIONS.map((inst) => {
       const isSelected = selectedCampusCode === inst.code;
       return (
         <Pressable
           key={inst.code}
           onPress={() => {
             setSelectedCampusCode(inst.code);
             persistCampus(inst.code);
           }}
           style={{
             paddingHorizontal: 14,
             paddingVertical: 8,
             borderRadius: radius.pill,
             backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
             borderWidth: 1,
             borderColor: isSelected ? colors.brandPrimary : colors.border,
           }}
         >
           <AppText
             variant="caption"
             weight="bold"
             tone={isSelected ? 'inverse' : 'primary'}
           >
             {inst.shortName || inst.code}
           </AppText>
         </Pressable>
       );
     })}
   </ScrollView>
   <Pressable
     onPress={() => {
       setWaitlistSuccess(false);
       setWaitlistName(fullName);
       setWaitlistEmail(email);
       setWaitlistUniversity('');
       setShowWaitlistModal(true);
     }}
     style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
   >
     <Ionicons name="sparkles" size={14} color={colors.brandPrimary} />
     <AppText variant="caption" tone="brand" weight="bold">
       Don't see your university? Join Waitlist
     </AppText>
   </Pressable>
 </View>

 <AppTextField
 label="Email"
 autoCapitalize="none"
 autoComplete="email"
 textContentType="emailAddress"
 keyboardType="email-address"
 value={email}
 onChangeText={setEmail}
 placeholder="you@example.com"
 error={emailTouched && !emailFormatValid ? 'Enter a valid email address' : undefined}
 />
 {emailTouched && emailFormatValid && matchedInstitution ? (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm, marginBottom: spacing.lg }}>
 <Ionicons name="checkmark-circle" size={14} color={colors.success} />
 <AppText variant="bodySmall" style={{ color: colors.success }}>
 Registering at {matchedInstitution.name} - you'll be verified automatically.
 </AppText>
 </View>
 ) : (
 <AppText variant="caption" tone="secondary" style={{ marginTop: -spacing.sm, marginBottom: spacing.lg }}>
 Use an email you'll keep after graduation. You can change it anytime in Settings.
 </AppText>
 )}

 <AppTextField
   label="Password (Min 8 characters)"
   secureTextEntry
   showPasswordToggle
   autoComplete="new-password"
   textContentType="newPassword"
   value={password}
   onChangeText={setPassword}
   placeholder="••••••••"
 />

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
    onChangeText={(t) => {
      setUsername(t.replace(/^@/, ''));
      if (errorMessage) setErrorMessage(null);
    }}
    placeholder="e.g. starboy"
    error={
      usernameTouched && !usernameValid
        ? '3-24 characters: letters, numbers, dots, underscores'
        : usernameStatus === 'taken'
        ? `@${username.trim().replace(/^@/, '')} is already taken. Please choose another.`
        : undefined
    }
  />
  {usernameStatus === 'available' && usernameValid ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm, marginBottom: spacing.md }}>
      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      <AppText variant="bodySmall" style={{ color: colors.success }}>
        @{username.trim().replace(/^@/, '')} is available
      </AppText>
    </View>
  ) : usernameStatus === 'checking' ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm, marginBottom: spacing.md }}>
      <AppText variant="bodySmall" tone="secondary">
        Checking availability...
      </AppText>
    </View>
  ) : null}

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
  onPress={() => setConfirmedAge((v) => !v)}
  accessibilityRole="checkbox"
  accessibilityState={{ checked: confirmedAge }}
  aria-checked={confirmedAge}
  accessibilityLabel="I am 18 or older, or an admitted university student aged 16 to 17 with parent or guardian authorisation"
  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 44, marginBottom: spacing.md, marginTop: spacing.sm }}
  >
    <View style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'flex-start' }}>
      <Ionicons
        name={confirmedAge ? 'checkbox' : 'square-outline'}
        size={20}
        color={confirmedAge ? colors.brandPrimary : colors.textSecondary}
      />
    </View>
    <AppText variant="bodySmall" style={{ flex: 1 }}>
      I am {INDEPENDENT_AGE}+ or an admitted university student aged {MIN_AGE}–17 with parent or guardian authorisation.
    </AppText>
  </Pressable>

 <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
 <Pressable
 onPress={() => setAcceptedTerms((v) => !v)}
 accessibilityRole="checkbox"
 accessibilityState={{ checked: acceptedTerms }}
 aria-checked={acceptedTerms}
 accessibilityLabel="I accept the Terms of Service, Privacy Policy, and Community Rules"
 style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'flex-start' }}
 >
 <Ionicons
 name={acceptedTerms ? 'checkbox' : 'square-outline'}
 size={20}
 color={acceptedTerms ? colors.brandPrimary : colors.textSecondary}
 />
 </Pressable>
 <AppText variant="bodySmall" style={{ flex: 1 }}>
 I have read and accept the{' '}
 <AppText variant="bodySmall" tone="brand" weight="semiBold" accessibilityRole="link" onPress={() => router.push('/terms')}>
 Terms of Service
 </AppText>
 ,{' '}
 <AppText variant="bodySmall" tone="brand" weight="semiBold" accessibilityRole="link" onPress={() => router.push('/privacy')}>
 Privacy Policy
 </AppText>
 , and{' '}
 <AppText variant="bodySmall" tone="brand" weight="semiBold" accessibilityRole="link" onPress={() => router.push('/community-rules')}>
 Community Rules
 </AppText>
 .
 </AppText>
 </View>

        {errorMessage ? (
          <View
            style={{
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
              borderColor: colors.critical,
              borderWidth: 1,
              borderRadius: radius.md,
              padding: spacing.md,
              marginBottom: spacing.md,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="alert-circle" size={18} color={colors.critical} />
              <AppText
                variant="bodySmall"
                weight="semiBold"
                style={{ color: colors.critical, flex: 1 }}
              >
                {errorMessage}
              </AppText>
            </View>
            {errorMessage.toLowerCase().includes('already exists') ? (
              <Pressable
                onPress={() => router.push('/(auth)/login' as any)}
                style={{ alignSelf: 'flex-start', marginTop: 2, paddingVertical: 2 }}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  Sign in to your account now →
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

  {/* Cloudflare Turnstile CAPTCHA */}
  <TurnstileWidget
    ref={turnstileRef}
    onVerify={(token) => setCaptchaToken(token)}
    onExpire={() => setCaptchaToken(null)}
  />

  <AppButton label="Configure & Join" onPress={handleRegister} loading={submitting} fullWidth />

 <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
 <Link href="/(auth)/login" asChild>
   <Pressable style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
     <AppText tone="brand" weight="semiBold">Already have an account? Log In</AppText>
   </Pressable>
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
 alt="University students studying together"
 style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }}
 contentFit="cover"
 />
 <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)' }} />

 {/* Logo & Back to Overview */}
 <View style={{ zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <Pressable accessibilityRole="button" accessibilityLabel="Lioris home" onPress={() => router.push('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
 <LiorisLogo size={44} variant="symbol" />
 <LiorisLogo size={28} variant="wordmark" tintColor="#FFFFFF" />
 </Pressable>
 <Pressable
 onPress={() => router.push('/')}
 accessibilityRole="button"
 accessibilityLabel="Back to overview"
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 paddingHorizontal: 12,
 minHeight: 44,
 borderRadius: radius.pill,
 backgroundColor: 'rgba(255,255,255,0.15)',
 }}
 >
 <Ionicons name="arrow-back" size={14} color="#FFFFFF" />
 <AppText variant="caption" weight="bold" tone="inverse">
 Overview
 </AppText>
 </Pressable>
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
 <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
 onPress={toggleTheme}
 style={{
 width: 44,
 height: 44,
 borderRadius: 22,
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
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
 <AuthHeroBackground height={140} fromColor={heroFromColor} toColor={heroToColor}>
 <View style={{ position: 'absolute', top: 20, left: 16, zIndex: 10 }}>
 <Pressable
 onPress={() => router.push('/')}
 accessibilityRole="button"
 accessibilityLabel="Back to overview"
 style={{
 height: 44,
 paddingHorizontal: 12,
 borderRadius: 22,
 backgroundColor: 'rgba(0,0,0,0.3)',
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 }}
 >
 <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
 <AppText variant="caption" weight="bold" tone="inverse">
 Overview
 </AppText>
 </Pressable>
 </View>
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

  {/* Campus Waitlist Modal */}
  <Modal
    visible={showWaitlistModal}
    transparent
    animationType="fade"
    onRequestClose={() => setShowWaitlistModal(false)}
  >
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 440,
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.xl,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <AppText variant="h2" weight="bold">
              Join Campus Waitlist
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Tell us your university and we'll prioritize launching Lioris there next!
            </AppText>
          </View>
          <Pressable onPress={() => setShowWaitlistModal(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close waitlist modal">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {waitlistSuccess ? (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <AppText variant="h3" weight="bold" style={{ textAlign: 'center' }}>
              You're on the list!
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', lineHeight: 20 }}>
              We've recorded your interest for {waitlistUniversity || 'your university'}. We'll email you at {waitlistEmail} as soon as Lioris opens for your campus!
            </AppText>
            <AppButton
              label="Back to Sign Up"
              onPress={() => setShowWaitlistModal(false)}
              fullWidth
            />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppTextField
              label="Full Name"
              value={waitlistName}
              onChangeText={setWaitlistName}
              placeholder="e.g. Alex Morgan"
            />
            <AppTextField
              label="University Name"
              value={waitlistUniversity}
              onChangeText={setWaitlistUniversity}
              placeholder="e.g. Lagos State University (LASU)"
            />
            <AppTextField
              label="Email Address"
              value={waitlistEmail}
              onChangeText={setWaitlistEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setShowWaitlistModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={submittingWaitlist ? 'Submitting...' : 'Join Waitlist'}
                  onPress={handleJoinWaitlist}
                  loading={submittingWaitlist}
                  disabled={!waitlistName.trim() || !waitlistUniversity.trim() || !waitlistEmail.trim()}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  </Modal>
 </ScreenContainer>
 );
}
