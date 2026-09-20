import React, { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { WaveCard } from '@/components/WaveCard';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { joinWaitlist } from '@/api/institutions';
import { isEmailConfirmationRequired } from '@/api/auth';
import {
 sendPasswordResetEmail,
 verifyPasswordResetOtpAndSetPassword,
} from '@/api/auth';
import { TurnstileWidget, TurnstileWidgetRef } from '@/components/TurnstileWidget';
import { haptics } from '@/utils/haptics';
import { getFriendlyErrorMessage, isCredentialError, isNetworkError } from '@/utils/errors';

const SLIDES = [
 {
 icon: 'school' as const,
 title: 'Verified Campus Spaces',
 description: 'Securely access school-verified events, schedules, forums, and academic directories with colleagues.',
 },
 {
 icon: 'people' as const,
 title: 'Connect With Your Cohort',
 description: 'Find classmates, join study groups, and build your campus network from day one.',
 },
 {
 icon: 'shield-checkmark' as const,
 title: 'Privacy by Design',
 description: 'Your academic identity stays verified and private - visible only within your campus community.',
 },
];

// Development-only shortcut that pre-fills seeded demo credentials. It renders nothing in
// production builds (`__DEV__` is false there), so neither the buttons nor the shared demo
// password ship in the public bundle. Real accounts must never rely on this password.
function DemoAccountPicker({
 onPick,
 style,
}: {
 onPick: (email: string, password: string) => void;
 style?: { marginTop?: number };
}) {
 const { colors, spacing, radius } = useTheme();
 if (!__DEV__) return null;
 const demos = [
 { label: 'Student', email: 'diana.prince@ui.edu.ng' },
 { label: 'Staff', email: 'dr.adeyemi@ui.edu.ng' },
 { label: 'Admin', email: 'admin@ui.edu.ng' },
 { label: 'Alumni', email: 'alumni.adeola@ui.edu.ng' },
 ];
 return (
 <SolidCard style={{ padding: spacing.md, ...style }}>
 <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs, letterSpacing: 1 }}>
 DEV ONLY: DEMO ACCOUNTS
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
 {demos.map((demo) => (
 <Pressable
 key={demo.label}
 accessibilityRole="button"
 accessibilityLabel={`Fill in the ${demo.label} demo account`}
 onPress={() => onPick(demo.email, 'password123')}
 style={{
 backgroundColor: colors.pastelPrimaryBg,
 paddingHorizontal: 10,
 paddingVertical: 5,
 borderRadius: radius.pill,
 }}
 >
 <AppText variant="caption" weight="bold" tone="brand">
 {demo.label}
 </AppText>
 </Pressable>
 ))}
 </View>
 </SolidCard>
 );
}

export default function LoginScreen() {
 const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
 const { isDesktop } = useResponsive();
 const { login } = useAuth();
 const [portal, setPortal] = useState<'student' | 'alumni'>('student');
 const [slide, setSlide] = useState(0);
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);
 const [captchaToken, setCaptchaToken] = useState<string | null>(null);
 const turnstileRef = React.useRef<TurnstileWidgetRef>(null);
 const [waitlistName, setWaitlistName] = useState('');
 const [waitlistEmail, setWaitlistEmail] = useState('');
 const [waitlistSchool, setWaitlistSchool] = useState('');
 const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
 const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

 // Forgot password modal state
 const [forgotModalOpen, setForgotModalOpen] = useState(false);
 const [forgotEmail, setForgotEmail] = useState('');
 const [forgotOtp, setForgotOtp] = useState('');
 const [forgotNewPassword, setForgotNewPassword] = useState('');
 const [forgotError, setForgotError] = useState<string | null>(null);
 const [forgotStep, setForgotStep] = useState<'request' | 'sent'>('request');
 const [submittingForgot, setSubmittingForgot] = useState(false);

 async function handleSendRecoveryCode() {
 setForgotError(null);
 if (!forgotEmail.trim()) {
 setForgotError('Please enter your registered email address.');
 haptics.error();
 return;
 }
 setSubmittingForgot(true);
 try {
 await sendPasswordResetEmail(forgotEmail.trim(), captchaToken || undefined);
 setForgotStep('sent');
 haptics.success();
 } catch (err: any) {
 haptics.error();
 if (err?.code === 'captcha_failed' || err?.message?.toLowerCase().includes('captcha')) {
 setForgotError('Security verification failed. Please complete the security check.');
 return;
 }
 setForgotError(getFriendlyErrorMessage(err, 'Could not send recovery code. Please verify your email.'));
 } finally {
 setSubmittingForgot(false);
 }
 }

 async function handleResetPasswordSubmit() {
 setForgotError(null);
 if (!forgotOtp.trim()) {
 setForgotError('Please enter the 6-digit recovery code.');
 haptics.error();
 return;
 }
 if (!forgotNewPassword || forgotNewPassword.length < 8) {
 setForgotError('New password must be at least 8 characters long.');
 haptics.error();
 return;
 }
 setSubmittingForgot(true);
 try {
 await verifyPasswordResetOtpAndSetPassword(forgotEmail.trim(), forgotOtp.trim(), forgotNewPassword);
 haptics.success();
 Alert.alert('Password Updated', 'Your password has been successfully reset. You can now log in.');
 setPassword(forgotNewPassword);
 setEmail(forgotEmail.trim());
 setForgotModalOpen(false);
 setForgotStep('request');
 setForgotOtp('');
 setForgotNewPassword('');
 } catch (err: any) {
 haptics.error();
 setForgotError(getFriendlyErrorMessage(err, 'Invalid or expired recovery code. Please try again.'));
 } finally {
 setSubmittingForgot(false);
 }
 }

 async function handleJoinWaitlist() {
 setSubmittingWaitlist(true);
 try {
 await joinWaitlist({ name: waitlistName.trim(), email: waitlistEmail.trim(), universityName: waitlistSchool.trim() });
 setWaitlistSubmitted(true);
 } finally {
 setSubmittingWaitlist(false);
 }
 }

 async function handleLogin() {
 setErrorMessage(null);
 if (!email.trim()) {
 setErrorMessage('Please enter your email or username.');
 haptics.error();
 return;
 }
 if (!password) {
 setErrorMessage('Please enter your password.');
 haptics.error();
 return;
 }
 if (password.length < 6) {
 setErrorMessage('Password must be at least 6 characters.');
 haptics.error();
 return;
 }
 haptics.medium();
 setSubmitting(true);
 try {
 await login(email.trim(), password, captchaToken || undefined);
 router.replace('/');
 } catch (err: any) {
 turnstileRef.current?.reset();
 setCaptchaToken(null);
 if (isEmailConfirmationRequired(err)) {
 router.replace({ pathname: '/(auth)/verify-email', params: { email: err.email || (email.includes('@') ? email.trim() : undefined) } });
 return;
 }
 haptics.error();
 if (err?.code === 'captcha_failed' || err?.message?.toLowerCase().includes('captcha')) {
 setErrorMessage('Security verification required. Please complete the security check below and try again.');
 return;
 }
 const friendlyMsg = getFriendlyErrorMessage(
 err,
 'Incorrect password. Please verify your password and try again, or reset it if forgotten.',
 );
 setErrorMessage(friendlyMsg);
 } finally {
 setSubmitting(false);
 }
 }

 const formContent = (
 <>
 <View
 style={{
 flexDirection: 'row',
 backgroundColor: colors.divider,
 borderRadius: radius.pill,
 padding: 4,
 marginBottom: spacing.lg,
 }}
 >
 {(['student', 'alumni'] as const).map((p) => {
 const selected = portal === p;
 return (
 <Pressable
 key={p}
 onPress={() => setPortal(p)}
 accessibilityRole="tab"
 accessibilityState={{ selected }}
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
 <Ionicons
 name={p === 'student' ? 'school' : 'star'}
 size={14}
 color={selected ? '#FFFFFF' : colors.textSecondary}
 />
 <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
 {p === 'student' ? 'Student Portal' : 'Alumni Circle'}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppText variant="h2" weight="bold" style={{ marginBottom: spacing.xs }}>
 {portal === 'student' ? "Verify & Let's Study!" : 'Welcome Back, Graduate!'}
 </AppText>
 <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
 {portal === 'student'
 ? 'Log into your secure, verified student space and connect with complete privacy.'
 : 'Sign in to reconnect with classmates and give back to your campus community.'}
 </AppText>

  <AppTextField
    label=""
    placeholder="Email or Username (@handle)"
    autoCapitalize="none"
    autoComplete="email"
    textContentType="emailAddress"
    value={email}
    onChangeText={(text) => {
      setEmail(text);
      if (errorMessage) setErrorMessage(null);
    }}
  />
  <AppTextField
    label=""
    placeholder="Password"
    autoComplete="current-password"
    textContentType="password"
    secureTextEntry
    showPasswordToggle
    value={password}
    onChangeText={(text) => {
      setPassword(text);
      if (errorMessage) setErrorMessage(null);
    }}
  />

  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md, marginTop: -spacing.xs }}>
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(auth)/reset-password' as any,
          params: { email: email.includes('@') ? email.trim() : undefined },
        })
      }
      hitSlop={8}
    >
      <AppText variant="caption" tone="brand" weight="semiBold">
        Forgot Password?
      </AppText>
    </Pressable>
  </View>

  {errorMessage ? (
    <View
      style={{
        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
        borderColor: colors.critical,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Ionicons
          name={
            isNetworkError(errorMessage)
              ? 'cloud-offline'
              : isCredentialError(errorMessage)
              ? 'lock-closed'
              : 'alert-circle'
          }
          size={18}
          color={colors.critical}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1 }}>
          {isCredentialError(errorMessage) ? (
            <AppText variant="bodySmall" weight="bold" style={{ color: colors.critical, marginBottom: 2 }}>
              Incorrect Password
            </AppText>
          ) : isNetworkError(errorMessage) ? (
            <AppText variant="bodySmall" weight="bold" style={{ color: colors.critical, marginBottom: 2 }}>
              Network Unavailable
            </AppText>
          ) : null}
          <AppText variant="caption" weight="medium" style={{ color: colors.critical, lineHeight: 18 }}>
            {errorMessage}
          </AppText>
        </View>
      </View>

      {isCredentialError(errorMessage) ? (
        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA', gap: 6 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(auth)/reset-password' as any,
                params: { email: email.includes('@') ? email.trim() : undefined },
              })
            }
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <AppText variant="caption" tone="brand" weight="bold">
              Forgot your password? Reset it here →
            </AppText>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(auth)/verify-email',
                params: { email: email.includes('@') ? email.trim() : undefined },
              })
            }
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <AppText variant="caption" tone="brand" weight="semiBold" style={{ opacity: 0.9 }}>
              Unconfirmed email? Enter your 6-digit code →
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={{ marginTop: 8, gap: 6 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(auth)/verify-email',
                params: { email: email.includes('@') ? email.trim() : undefined },
              })
            }
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <AppText variant="caption" tone="brand" weight="bold">
              Need to confirm your email? Enter your 6-digit code →
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  ) : null}

 <TurnstileWidget
   ref={turnstileRef}
   onVerify={(token) => setCaptchaToken(token)}
   onExpire={() => setCaptchaToken(null)}
 />

 <AppButton label="Secure Login" onPress={handleLogin} loading={submitting} disabled={!email || !password} fullWidth />

 <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
 <Link href="/(auth)/register">
 <AppText tone="brand" weight="semiBold">
 Don't have an account? Sign Up
 </AppText>
 </Link>
 </View>
 </>
 );

 return (
 <ScreenContainer noPadding glow={false}>
 {isDesktop ? (
 <View style={{ flexDirection: 'row', flex: 1, minHeight: '100vh' as any }}>
 {/* Left Hero Pane */}
 <View style={{ flex: 1.1, position: 'relative', overflow: 'hidden', backgroundColor: '#0F172A', padding: spacing.xxl, justifyContent: 'space-between' }}>
 <Image
 source={require('../../assets/images/campus_students_photo.jpg')}
 alt=""
 accessible={false}
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
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
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

 {/* Hero Value Props */}
 <View style={{ zIndex: 10, maxWidth: 540, gap: spacing.lg }}>
 <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
 <AppText variant="caption" weight="bold" tone="inverse">
 The Super-App for University Life
 </AppText>
 </View>
 <AppText variant="h1" weight="bold" tone="inverse" style={{ fontSize: 36, lineHeight: 44 }}>
 Connect, study, and thrive within your verified campus community.
 </AppText>
 <AppText tone="inverse" variant="body" style={{ opacity: 0.85, fontSize: 16 }}>
 Real-time lecture schedules, verified past questions library, student escrow marketplace, and faculty mentorship in one unified hub.
 </AppText>

 {/* Badges */}
 <View style={{ flexDirection: 'row', gap: 16, marginTop: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
 <Ionicons name="shield-checkmark" size={20} color="#48BB78" />
 <AppText variant="caption" weight="bold" tone="inverse">100% Verified Campus ID</AppText>
 </View>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
 <Ionicons name="lock-closed" size={20} color="#48BB78" />
 <AppText variant="caption" weight="bold" tone="inverse">Encrypted Privacy</AppText>
 </View>
 </View>
 </View>

 {/* Footer */}
 <View style={{ zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <AppText variant="caption" tone="inverse" style={{ opacity: 0.7 }}>
 © 2026 Lioris Campus Inc. All rights reserved.
 </AppText>
 <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
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

 {/* Right Form Pane */}
 <View style={{ width: 540, backgroundColor: colors.background, overflow: 'scroll' as any, padding: spacing.xxl, justifyContent: 'center' }}>
 <View style={{ maxWidth: 440, width: '100%', alignSelf: 'center' }}>
 {formContent}

 {/* Dev-only demo accounts: never rendered (nor bundled with a password) in production builds. */}
 <DemoAccountPicker style={{ marginTop: spacing.xl }} onPick={(demoEmail, demoPassword) => { setEmail(demoEmail); setPassword(demoPassword); }} />
 </View>
 </View>
 </View>
 ) : (
 /* Mobile View */
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
 <View style={{ height: 230, position: 'relative', overflow: 'hidden' }}>
 <Image
 source={require('../../assets/images/campus_students_photo.jpg')}
 alt=""
 accessible={false}
 style={{ width: '100%', height: '100%' }}
 contentFit="cover"
 />
 <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.48)' }} />
 <View style={{ position: 'absolute', top: 20, left: 16, zIndex: 10 }}>
 <Pressable
 onPress={() => router.push('/')}
 hitSlop={8}
 style={{
 height: 38,
 paddingHorizontal: 12,
 borderRadius: 19,
 backgroundColor: 'rgba(0,0,0,0.4)',
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
 <View style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
 <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
 onPress={toggleTheme}
 hitSlop={8}
 style={{
 width: 38,
 height: 38,
 borderRadius: 19,
 backgroundColor: 'rgba(0,0,0,0.4)',
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name={isDark ? 'sunny' : 'moon'} size={18} color="#FFFFFF" />
 </Pressable>
 </View>
 <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
 <LiorisLogo size={56} variant="symbol" />
 <View style={{ marginTop: 8 }}>
 <LiorisLogo size={32} variant="wordmark" tintColor="#FFFFFF" />
 </View>
 </View>
 </View>

 <WaveCard>
 {formContent}
 </WaveCard>

 <View style={{ paddingHorizontal: spacing.lg }}>
 <DemoAccountPicker onPick={(demoEmail, demoPassword) => { setEmail(demoEmail); setPassword(demoPassword); }} />

 <SolidCard style={{ alignItems: 'center', marginTop: spacing.lg }}>
 <View
 style={{
 width: 56,
 height: 56,
 borderRadius: radius.md,
 backgroundColor: colors.divider,
 alignItems: 'center',
 justifyContent: 'center',
 marginBottom: spacing.md,
 }}
 >
 <Ionicons name={SLIDES[slide].icon} size={24} color={colors.textSecondary} />
 </View>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
 {SLIDES[slide].title}
 </AppText>
 <AppText tone="secondary" style={{ textAlign: 'center', marginBottom: spacing.md }}>
 {SLIDES[slide].description}
 </AppText>
 <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm }}>
 {SLIDES.map((_, i) => (
 <View
 key={i}
 style={{
 width: i === slide ? 18 : 6,
 height: 6,
 borderRadius: 3,
 backgroundColor: i === slide ? colors.brandPrimary : colors.border,
 }}
 />
 ))}
 </View>
 <AppText weight="semiBold" tone="brand" onPress={() => setSlide((s) => (s + 1) % SLIDES.length)}>
 Next Slide
 </AppText>
 </SolidCard>

 <SolidCard style={{ marginTop: spacing.lg }}>
 <AppText weight="bold" style={{ marginBottom: spacing.xs }}>
 Don't see your school yet?
 </AppText>
 <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
 Join the campus waitlist to fast-track Lioris launching at your university!
 </AppText>
 {waitlistSubmitted ? (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
 <Ionicons name="checkmark-circle" size={18} color={colors.success} />
 <AppText weight="semiBold" style={{ color: colors.success }}>
 You're on the list - we'll email you when your campus goes live.
 </AppText>
 </View>
 ) : (
 <>
 <AppTextField label="" placeholder="Full Name" value={waitlistName} onChangeText={setWaitlistName} />
 <AppTextField label="" placeholder="Email Address" value={waitlistEmail} onChangeText={setWaitlistEmail} autoCapitalize="none" keyboardType="email-address" />
 <AppTextField label="" placeholder="University Name" value={waitlistSchool} onChangeText={setWaitlistSchool} />
 <AppButton
 label="Join Waitlist"
 variant="accent"
 onPress={handleJoinWaitlist}
 loading={submittingWaitlist}
 disabled={!waitlistName.trim() || !waitlistEmail.trim() || !waitlistSchool.trim()}
 fullWidth
 />
 </>
 )}
 </SolidCard>
 </View>
 </ScrollView>
 )}

 {/* Forgot Password Modal */}
 <Modal visible={forgotModalOpen} transparent animationType="fade" onRequestClose={() => setForgotModalOpen(false)}>
 <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <SolidCard style={{ width: '100%', maxWidth: 420 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
 <AppText variant="h3" weight="bold">
 Reset Password
 </AppText>
 <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setForgotModalOpen(false)} hitSlop={8}>
 <Ionicons name="close" size={20} color={colors.textSecondary} />
 </Pressable>
 </View>

 {forgotError ? (
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
 {forgotError}
 </AppText>
 </View>
 ) : null}

      {forgotStep === 'request' ? (
        <>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            Enter your registered email address and we'll send you a password recovery link and code.
          </AppText>
          <AppTextField
            label="Email"
            placeholder="you@example.com"
            value={forgotEmail}
            onChangeText={(text) => {
              setForgotEmail(text);
              if (forgotError) setForgotError(null);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : '#FEF9C3',
              borderColor: isDark ? 'rgba(234, 179, 8, 0.3)' : '#FDE047',
              borderWidth: 1,
              borderRadius: radius.md,
              padding: spacing.sm,
              marginTop: spacing.sm,
              marginBottom: spacing.xs,
            }}
          >
            <Ionicons name="information-circle" size={18} color={isDark ? '#FACC15' : '#CA8A04'} style={{ marginTop: 1, flexShrink: 0 }} />
            <AppText variant="caption" style={{ color: isDark ? '#FEF08A' : '#854D0E', flex: 1, lineHeight: 16 }}>
              <AppText weight="bold" style={{ color: isDark ? '#FEF08A' : '#854D0E' }}>Spam / Junk Folder Notice: </AppText>
              Password recovery emails may be filtered to your Spam or Junk folder. If not received in 1-2 minutes, check Spam and search for "Lioris".
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
            <AppButton label="Cancel" variant="ghost" onPress={() => setForgotModalOpen(false)} />
            <AppButton
              label="Send Link & Code"
              disabled={!forgotEmail.trim() || submittingForgot}
              loading={submittingForgot}
              onPress={handleSendRecoveryCode}
            />
          </View>
          <View style={{ alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Pressable
              onPress={() => {
                setForgotModalOpen(false);
                router.push({
                  pathname: '/(auth)/reset-password' as any,
                  params: { email: forgotEmail.trim() || undefined },
                });
              }}
              hitSlop={8}
            >
              <AppText tone="brand" variant="caption" weight="semiBold">
                Open Full Reset Password Screen →
              </AppText>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <Ionicons name="shield-checkmark" size={36} color={colors.brandPrimary} />
            <AppText weight="bold" variant="h3" style={{ marginTop: spacing.xs }}>
              Enter Recovery Code
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2 }}>
              We sent a recovery link and 6-digit code to {forgotEmail}. Click the email link or enter your code below.
            </AppText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : '#FEF9C3',
              borderColor: isDark ? 'rgba(234, 179, 8, 0.3)' : '#FDE047',
              borderWidth: 1,
              borderRadius: radius.md,
              padding: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            <Ionicons name="mail-unread" size={18} color={isDark ? '#FACC15' : '#CA8A04'} style={{ marginTop: 1, flexShrink: 0 }} />
            <AppText variant="caption" style={{ color: isDark ? '#FEF08A' : '#854D0E', flex: 1, lineHeight: 16 }}>
              <AppText weight="bold" style={{ color: isDark ? '#FEF08A' : '#854D0E' }}>Can't find the email? </AppText>
              Please check your <AppText weight="bold" style={{ color: isDark ? '#FEF08A' : '#854D0E' }}>Spam / Junk folder</AppText>. Mark the email as "Not Spam" or add Lioris to your safe sender list.
            </AppText>
          </View>

          <AppTextField
            label="6-Digit Recovery Code"
            placeholder="123456"
            value={forgotOtp}
            onChangeText={(text) => {
              setForgotOtp(text);
              if (forgotError) setForgotError(null);
            }}
            keyboardType="number-pad"
            maxLength={6}
          />

          <AppTextField
            label="New Password"
            placeholder="At least 8 characters"
            value={forgotNewPassword}
            onChangeText={(text) => {
              setForgotNewPassword(text);
              if (forgotError) setForgotError(null);
            }}
            secureTextEntry
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
            <AppButton label="Back" variant="ghost" onPress={() => setForgotStep('request')} />
            <AppButton
              label="Update Password"
              disabled={!forgotOtp.trim() || !forgotNewPassword || submittingForgot}
              loading={submittingForgot}
              onPress={handleResetPasswordSubmit}
            />
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Pressable
              onPress={() => {
                setForgotModalOpen(false);
                router.push({
                  pathname: '/(auth)/reset-password' as any,
                  params: { email: forgotEmail.trim() || undefined, code: forgotOtp.trim() || undefined },
                });
              }}
              hitSlop={8}
            >
              <AppText tone="brand" variant="caption" weight="semiBold">
                Open Full Reset Password Screen →
              </AppText>
            </Pressable>
          </View>
        </>
      )}
 </SolidCard>
 </View>
 </Modal>
 </ScreenContainer>
 );
}
