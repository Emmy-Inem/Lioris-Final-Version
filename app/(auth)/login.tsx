import React, { useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
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
import { joinWaitlist } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { sendPasswordResetEmail, verifyPasswordResetOtpAndSetPassword } from '@/api/auth';
import { haptics } from '@/utils/haptics';

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
    description: 'Your academic identity stays verified and private — visible only within your campus community.',
  },
];

export default function LoginScreen() {
  const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
  const { login } = useAuth();
  const [portal, setPortal] = useState<'student' | 'alumni'>('student');
  const [slide, setSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSchool, setWaitlistSchool] = useState('');
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'sent'>('request');
  const [submittingForgot, setSubmittingForgot] = useState(false);

  async function handleSendRecoveryCode() {
    if (!forgotEmail.trim()) {
      Alert.alert('Missing Email', 'Please enter your registered campus email.');
      return;
    }
    setSubmittingForgot(true);
    try {
      await sendPasswordResetEmail(forgotEmail.trim());
      setForgotStep('sent');
      haptics.success();
    } catch (err: any) {
      Alert.alert('Recovery Error', err?.message || 'Could not send recovery code. Please verify your email.');
    } finally {
      setSubmittingForgot(false);
    }
  }

  async function handleResetPasswordSubmit() {
    if (!forgotOtp.trim() || !forgotNewPassword) {
      Alert.alert('Missing Details', 'Please enter the 6-digit recovery code and your new password.');
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
      Alert.alert('Reset Failed', err?.message || 'Invalid or expired recovery code. Please try again.');
    } finally {
      setSubmittingForgot(false);
    }
  }

  async function handleJoinWaitlist() {
    setSubmittingWaitlist(true);
    try {
      await joinWaitlist({ email: waitlistEmail.trim(), universityName: waitlistSchool.trim() });
      setWaitlistSubmitted(true);
    } finally {
      setSubmittingWaitlist(false);
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing Details', 'Please enter both your email address and password.');
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Login Notice', err?.message || 'Unable to authenticate with these credentials. Please check and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    haptics.medium();
    setGoogleSubmitting(true);
    try {
      const redirectUrl =
        Platform.OS === 'web'
          ? typeof window !== 'undefined'
            ? `${window.location.origin}/`
            : 'https://lioris-final-version.vercel.app/'
          : 'lioris://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        if (error.message?.includes('Unsupported provider') || (error as any).error_code === 'validation_failed') {
          Alert.alert(
            'Google Sign-In Notice',
            'Google OAuth is not enabled in your Supabase dashboard yet.\n\nTo activate it, enable Google in Supabase under Authentication → Providers. In the meantime, you can log in directly with your email and password below.',
            [{ text: 'Got It', style: 'default' }]
          );
        } else {
          Alert.alert('Google Sign-In', error.message);
        }
      } else if (data?.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          Linking.openURL(data.url);
        }
      }
    } catch (err: any) {
      Alert.alert(
        'Google Sign-In',
        err?.message || 'Unable to connect to Google Auth. Please check your network or sign in with your email.'
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ height: 230, position: 'relative', overflow: 'hidden' }}>
          <Image
            source={require('../../assets/images/campus_students_photo.jpg')}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.48)' }} />
          <View style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
            <Pressable
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
              <LiorisLogo size={32} variant="wordmark" />
            </View>
          </View>
        </View>

        <WaveCard>
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
            placeholder="School Email (.edu / .edu.ng)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <AppTextField
            label=""
            placeholder="Password (Min 6 Characters)"
            secureTextEntry
            showPasswordToggle
            value={password}
            onChangeText={setPassword}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md, marginTop: -spacing.xs }}>
            <Pressable onPress={() => { setForgotStep('request'); setForgotModalOpen(true); }}>
              <AppText variant="caption" tone="brand" weight="semiBold">
                Forgot Password?
              </AppText>
            </Pressable>
          </View>

          <AppButton label="Secure Login" onPress={handleLogin} loading={submitting} disabled={!email || !password} fullWidth />

          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <Link href="/(auth)/register">
              <AppText tone="brand" weight="semiBold">
                Don't see your account? Sign Up
              </AppText>
            </Link>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
            <AppText variant="caption" tone="secondary" weight="semiBold">
              OR CONTINUE WITH
            </AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          </View>

          <Pressable
            onPress={handleGoogleSignIn}
            disabled={googleSubmitting}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              backgroundColor: colors.surface,
              opacity: googleSubmitting ? 0.7 : 1,
            }}
          >
            <Ionicons name="logo-google" size={18} color="#EA4335" />
            <AppText variant="bodySmall" weight="bold">
              {googleSubmitting ? 'Connecting Google...' : 'Continue with Google'}
            </AppText>
          </Pressable>
        </WaveCard>

        <View style={{ paddingHorizontal: spacing.lg }}>
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
              We're live at UNILAG, UI, and FUNAAB at launch. Join the waitlist to fast-track your campus!
            </AppText>
            {waitlistSubmitted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText weight="semiBold" style={{ color: colors.success }}>
                  You're on the list — we'll email you when your campus goes live.
                </AppText>
              </View>
            ) : (
              <>
                <AppTextField label="" placeholder="Email Address" value={waitlistEmail} onChangeText={setWaitlistEmail} autoCapitalize="none" keyboardType="email-address" />
                <AppTextField label="" placeholder="University Name" value={waitlistSchool} onChangeText={setWaitlistSchool} />
                <AppButton
                  label="Join Waitlist"
                  variant="accent"
                  onPress={handleJoinWaitlist}
                  loading={submittingWaitlist}
                  disabled={!waitlistEmail.trim() || !waitlistSchool.trim()}
                  fullWidth
                />
              </>
            )}
          </SolidCard>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={forgotModalOpen} transparent animationType="fade" onRequestClose={() => setForgotModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 420 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <AppText variant="h3" weight="bold">
                Reset Password
              </AppText>
              <Pressable onPress={() => setForgotModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {forgotStep === 'request' ? (
              <>
                <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                  Enter your registered campus email address and we'll send you a password recovery code.
                </AppText>
                <AppTextField
                  label="Campus Email"
                  placeholder="name@student.unilag.edu.ng"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
                  <AppButton label="Cancel" variant="ghost" onPress={() => setForgotModalOpen(false)} />
                  <AppButton
                    label="Send Code"
                    disabled={!forgotEmail.trim() || submittingForgot}
                    loading={submittingForgot}
                    onPress={handleSendRecoveryCode}
                  />
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
                    We sent a 6-digit recovery code to {forgotEmail}.
                  </AppText>
                </View>

                <AppTextField
                  label="6-Digit Recovery Code"
                  placeholder="123456"
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <AppTextField
                  label="New Password"
                  placeholder="At least 8 characters"
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
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
              </>
            )}
          </SolidCard>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
