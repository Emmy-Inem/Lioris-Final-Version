import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
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

// Only the first slide's copy was confirmed from a screenshot; the
// other two are invented in the same spirit to fill out the carousel.
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
  const { colors, spacing, radius } = useTheme();
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
      // Alert kept minimal here; mock login rarely fails.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <AuthHeroBackground height={200}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <LiorisLogo size={44} />
              <AppText variant="display" weight="bold" tone="inverse">
                Lioris
              </AppText>
            </View>
            <AppText tone="inverse" style={{ marginTop: 2, opacity: 0.85 }}>
              Where your campus lives.
            </AppText>
          </View>
        </AuthHeroBackground>

        <WaveCard>
          <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
            {(['student', 'alumni'] as const).map((p) => {
              const selected = portal === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPortal(p)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
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
          <AppText tone="secondary" variant="caption" style={{ marginTop: -spacing.sm, marginBottom: spacing.sm }}>
            Preview build: include "admin", "staff", or "alumni" anywhere in your email to see
            that role's experience — otherwise you'll see the student view.
          </AppText>
          <View>
            <AppTextField
              label=""
              placeholder="Password (Min 6 Characters)"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: spacing.md, top: 16 }}
              hitSlop={8}
            >
              <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
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
              OR SIGN IN WITH SSO
            </AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <SSOButton icon="school" label="Google Workspace" />
            <SSOButton icon="school" label="Microsoft 365" />
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
              Don't see your school yet? 🌍
            </AppText>
            <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
              We're live at UNILAG, UI, and FUNAAB at launch. Join the waitlist to fast-track your
              campus!
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
    </ScreenContainer>
  );
}

function SSOButton({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={() => Alert.alert('Not available yet', `${label} sign-in isn\u2019t available in this preview build \u2014 use email and password instead.`)}
      accessibilityRole="button"
      accessibilityLabel={`Sign in with ${label} (not yet available)`}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="bodySmall" weight="semiBold">
        {label}
      </AppText>
    </Pressable>
  );
}
