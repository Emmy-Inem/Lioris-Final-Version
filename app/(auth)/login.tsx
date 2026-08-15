import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import { Link, router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { SolidCard } from'@/components/SolidCard';
import { LiorisLogo } from'@/components/LiorisLogo';
import { AuthHeroBackground } from'@/components/AuthHeroBackground';
import { WaveCard } from'@/components/WaveCard';
import { useAuth } from'@/auth/AuthContext';
import { useTheme } from'@/theme/ThemeProvider';
import { joinWaitlist } from'@/api/institutions';

const SLIDES = [
  {
    icon: 'school'as const,
    title: 'Verified Campus Spaces',
    description: 'Securely access school-verified events, schedules, forums, and academic directories with colleagues.',
  },
  {
    icon: 'people'as const,
    title: 'Connect With Your Cohort',
    description: 'Find classmates, join study groups, and build your campus network from day one.',
  },
  {
    icon: 'shield-checkmark'as const,
    title: 'Privacy by Design',
    description: 'Your academic identity stays verified and private — visible only within your campus community.',
  },
];

const PRESET_SSO_ACCOUNTS = [
  { name: 'Inem Emmanuel', email: 'inememmanuel@gmail.com', school: 'Lioris Root Operations (Admin)', role: 'admin' },
  { name: 'Chioma Okonkwo', email: 'c.okonkwo@ui.edu.ng', school: 'University of Ibadan (UI)', role: 'student' },
  { name: 'Adekunle Gold', email: 'a.gold@student.unilag.edu.ng', school: 'University of Lagos (UNILAG)', role: 'student' },
  { name: 'Dr. Babatunde Lawal', email: 'b.lawal@funaab.edu.ng', school: 'Federal Univ. of Agric. (FUNAAB)', role: 'staff' },
];

export default function LoginScreen() {
  const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
  const { login } = useAuth();
  const [portal, setPortal] = useState<'student' | 'alumni'>('student');
  const [slide, setSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSchool, setWaitlistSchool] = useState('');
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  // SSO Modal state
  const [ssoModalOpen, setSsoModalOpen] = useState(false);
  const [ssoProvider, setSsoProvider] = useState<'Google Workspace' | 'Microsoft 365'>('Google Workspace');
  const [customSsoEmail, setCustomSsoEmail] = useState('');

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'sent'>('request');

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
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch {
      // Login fallback
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSsoLogin(selectedEmail: string) {
    setSubmitting(true);
    setSsoModalOpen(false);
    try {
      await login(selectedEmail, 'sso-authenticated-pass');
      router.replace('/');
    } catch {
      // fallback
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenSso(provider: 'Google Workspace' | 'Microsoft 365') {
    setSsoProvider(provider);
    setSsoModalOpen(true);
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView keyboardShouldPersistTaps="handled"contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ height: 230, position: 'relative', overflow: 'hidden' }}>
          <Image
            source={require('@/../assets/images/campus_students_photo.jpg')}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          {/* Subtle Dark/Teal Gradient Overlay */}
          <View
            style={{
              ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
              backgroundColor: 'rgba(11, 122, 117, 0.72)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: spacing.md,
            }}
          >
            <Pressable
              onPress={toggleTheme}
              accessibilityRole="button"accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              hitSlop={8}
              style={{
                position: 'absolute',
                top: spacing.md,
                right: spacing.md,
                zIndex: 10,
                backgroundColor: 'rgba(255,255,255,0.25)',
                borderRadius: radius.pill,
                padding: 8,
              }}
            >
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color="#FFFFFF" />
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
              <LiorisLogo size={44} />
              <AppText variant="display"weight="bold"tone="inverse">
                Lioris
              </AppText>
            </View>
            <AppText tone="inverse"weight="medium"style={{ marginTop: 4, opacity: 0.95, textAlign: 'center' }}>
              Your all-in-one campus companion 
            </AppText>
          </View>
        </View>

        <WaveCard>
          <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
            {(['student', 'alumni'] as const).map((p) => {
              const selected = portal === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPortal(p)}
                  accessibilityRole="tab"accessibilityState={{ selected }}
                  accessibilityLabel={p === 'student' ? 'Student Portal' : 'Alumni Circle'}
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
                  <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                    {p === 'student' ? 'Student Portal' : 'Alumni Circle'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText variant="h2"weight="bold"style={{ marginBottom: spacing.xs }}>
            {portal === 'student' ? "Verify & Let's Study!" : 'Welcome Back, Graduate!'}
          </AppText>
          <AppText tone="secondary"style={{ marginBottom: spacing.lg }}>
            {portal === 'student'
              ? 'Log into your secure, verified student space and connect with complete privacy.'
              : 'Sign in to reconnect with classmates and give back to your campus community.'}
          </AppText>

          <AppTextField
            label=""placeholder="School Email (.edu / .edu.ng)"autoCapitalize="none"keyboardType="email-address"value={email}
            onChangeText={setEmail}
          />
          <AppText tone="secondary"variant="caption"style={{ marginTop: -spacing.sm, marginBottom: spacing.sm }}>
            Preview build: include"admin", "staff", or"alumni"anywhere in your email to see
            that role's experience — otherwise you'll see the student view.
          </AppText>
          <View>
            <AppTextField
              label=""placeholder="Password (Min 6 Characters)"secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: spacing.md, top: 16 }}
              hitSlop={8}
            >
              <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md, marginTop: -spacing.xs }}>
            <Pressable onPress={() => { setForgotStep('request'); setForgotModalOpen(true); }}>
              <AppText variant="caption"tone="brand"weight="semiBold">
                Forgot Password?
              </AppText>
            </Pressable>
          </View>

          <AppButton label="Secure Login"onPress={handleLogin} loading={submitting} disabled={!email || !password} fullWidth />

          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <Link href="/(auth)/register">
              <AppText tone="brand"weight="semiBold">
                Don't see your account? Sign Up
              </AppText>
            </Link>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
            <AppText variant="caption"tone="secondary"weight="semiBold">
              OR SIGN IN WITH SSO
            </AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => handleOpenSso('Google Workspace')}
              accessibilityRole="button"style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                paddingVertical: spacing.md,
                backgroundColor: colors.surface,
              }}
            >
              <Ionicons name="logo-google"size={16} color={colors.textPrimary} />
              <AppText variant="bodySmall"weight="semiBold">
                Google Workspace
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => handleOpenSso('Microsoft 365')}
              accessibilityRole="button"style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                paddingVertical: spacing.md,
                backgroundColor: colors.surface,
              }}
            >
              <Ionicons name="logo-windows"size={16} color={colors.textPrimary} />
              <AppText variant="bodySmall"weight="semiBold">
                Microsoft 365
              </AppText>
            </Pressable>
          </View>
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
            <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.xs }}>
              {SLIDES[slide].title}
            </AppText>
            <AppText tone="secondary"style={{ textAlign: 'center', marginBottom: spacing.md }}>
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
            <AppText weight="semiBold"tone="brand"onPress={() => setSlide((s) => (s + 1) % SLIDES.length)}>
              Next Slide
            </AppText>
          </SolidCard>

          <SolidCard style={{ marginTop: spacing.lg }}>
            <AppText weight="bold"style={{ marginBottom: spacing.xs }}>
              Don't see your school yet? 🌍
            </AppText>
            <AppText tone="secondary"style={{ marginBottom: spacing.lg }}>
              We're live at UNILAG, UI, and FUNAAB at launch. Join the waitlist to fast-track your
              campus!
            </AppText>
            {waitlistSubmitted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="checkmark-circle"size={18} color={colors.success} />
                <AppText weight="semiBold"style={{ color: colors.success }}>
                  You're on the list — we'll email you when your campus goes live.
                </AppText>
              </View>
            ) : (
              <>
                <AppTextField label=""placeholder="Email Address"value={waitlistEmail} onChangeText={setWaitlistEmail} autoCapitalize="none"keyboardType="email-address" />
                <AppTextField label=""placeholder="University Name"value={waitlistSchool} onChangeText={setWaitlistSchool} />
                <AppButton
                  label="Join Waitlist"variant="accent"onPress={handleJoinWaitlist}
                  loading={submittingWaitlist}
                  disabled={!waitlistEmail.trim() || !waitlistSchool.trim()}
                  fullWidth
                />
              </>
            )}
          </SolidCard>
        </View>
      </ScrollView>

      {/* Institutional SSO Modal */}
      <Modal visible={ssoModalOpen} transparent animationType="fade"onRequestClose={() => setSsoModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 420 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name={ssoProvider === 'Google Workspace' ? 'logo-google' : 'logo-windows'} size={22} color={colors.brandPrimary} />
                <AppText variant="h3"weight="bold">
                  {ssoProvider} SSO
                </AppText>
              </View>
              <Pressable onPress={() => setSsoModalOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
              Select a verified institutional account to sign in securely:
            </AppText>

            {PRESET_SSO_ACCOUNTS.map((acc) => (
              <Pressable
                key={acc.email}
                onPress={() => handleSsoLogin(acc.email)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  marginBottom: spacing.xs,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="school"size={16} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold"variant="bodySmall">
                    {acc.name}
                  </AppText>
                  <AppText tone="secondary"variant="caption">
                    {acc.email}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward"size={16} color={colors.textSecondary} />
              </Pressable>
            ))}

            <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />

            <AppText variant="caption"tone="secondary"style={{ marginBottom: spacing.xs }}>
              Or sign in with another campus email:
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppTextField label=""placeholder="e.g. matric@school.edu.ng"value={customSsoEmail} onChangeText={setCustomSsoEmail} autoCapitalize="none" />
              </View>
              <AppButton
                label="Sign In"variant="primary"disabled={!customSsoEmail.trim()}
                onPress={() => handleSsoLogin(customSsoEmail.trim())}
              />
            </View>
          </SolidCard>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <Modal visible={forgotModalOpen} transparent animationType="fade"onRequestClose={() => setForgotModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 420 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <AppText variant="h3"weight="bold">
                Reset Password 
              </AppText>
              <Pressable onPress={() => setForgotModalOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {forgotStep === 'request' ? (
              <>
                <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
                  Enter your registered campus email address and we'll send you a password recovery code.
                </AppText>
                <AppTextField
                  label=""placeholder="name@student.unilag.edu.ng"value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"keyboardType="email-address"
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
                  <AppButton label="Cancel"variant="ghost"onPress={() => setForgotModalOpen(false)} />
                  <AppButton
                    label="Send Code"disabled={!forgotEmail.trim()}
                    onPress={() => setForgotStep('sent')}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
                  <Ionicons name="mail-unread"size={44} color={colors.brandPrimary} />
                  <AppText weight="bold"variant="h3"style={{ marginTop: spacing.sm }}>
                    Code Dispatched!
                  </AppText>
                  <AppText tone="secondary"variant="bodySmall"style={{ textAlign: 'center', marginTop: 4 }}>
                    We sent a 6-digit recovery code to {forgotEmail}. Check your inbox.
                  </AppText>
                </View>
                <AppButton label="Back to Login"fullWidth onPress={() => setForgotModalOpen(false)} />
              </>
            )}
          </SolidCard>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
