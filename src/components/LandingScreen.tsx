import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { joinWaitlist, LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { DATA_CONTROLLER, DPO_EMAIL } from '@/constants/legal';
import { haptics } from '@/utils/haptics';

export function LandingScreen() {
  const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const { isDesktop, isTablet } = useResponsive();
  const { getGlassBorderColor, getBackdropFilterString } = useLiquidGlass();

  // Interactive phone preview: Student and Alumni only
  const [previewRole, setPreviewRole] = useState<'student' | 'alumni'>('student');

  // Waitlist form state
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSchool, setWaitlistSchool] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const scrollToSection = (id: string) => {
    haptics.light();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleJoinWaitlist = async () => {
    if (!waitlistEmail.trim() || !waitlistSchool.trim()) return;
    haptics.medium();
    setWaitlistSubmitting(true);
    try {
      await joinWaitlist({ email: waitlistEmail.trim(), universityName: waitlistSchool.trim() });
      haptics.success();
      setWaitlistSubmitted(true);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Waitlist', err?.message || 'Failed to submit. Please try again.');
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  // Liquid glass container style generator
  const glassStyle = (customRadius = 24, customAlpha?: number) => {
    const alpha = customAlpha ?? (isDark ? 0.45 : 0.65);
    return [
      {
        borderRadius: customRadius,
        borderColor: getGlassBorderColor(isDark),
        borderWidth: 1,
        backgroundColor: isDark
          ? `rgba(15, 23, 42, ${alpha})`
          : `rgba(255, 255, 255, ${alpha})`,
        overflow: 'hidden' as const,
        position: 'relative' as const,
      },
      Platform.OS === 'web' &&
        ({
          backdropFilter: getBackdropFilterString(),
          WebkitBackdropFilter: getBackdropFilterString(),
          boxShadow: isDark
            ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 12px 36px -4px rgba(0, 0, 0, 0.45)'
            : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.85), 0 12px 36px -4px rgba(15, 23, 42, 0.07)',
        } as any),
    ];
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#080E1A' : '#F6F8FB' }}>
      {/* Background Refraction Glow Blobs */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120,
          left: '15%',
          width: Math.min(width * 0.7, 650),
          height: 480,
          borderRadius: 300,
          backgroundColor: isDark ? 'rgba(26, 61, 255, 0.18)' : 'rgba(26, 61, 255, 0.12)',
          ...(Platform.OS === 'web' ? { filter: 'blur(110px)' } : {}),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 300,
          right: '5%',
          width: Math.min(width * 0.6, 500),
          height: 420,
          borderRadius: 250,
          backgroundColor: isDark ? 'rgba(240, 138, 46, 0.14)' : 'rgba(240, 138, 46, 0.10)',
          ...(Platform.OS === 'web' ? { filter: 'blur(100px)' } : {}),
        }}
      />

      {/* Floating Liquid Glass Top Navigation Bar */}
      <View
        style={{
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
          top: Platform.OS === 'web' ? 16 : 40,
          left: 0,
          right: 0,
          zIndex: 999,
          alignItems: 'center',
          paddingHorizontal: 16,
        }}
      >
        <View
          style={[
            glassStyle(radius.pill, isDark ? 0.72 : 0.82),
            {
              width: '100%',
              maxWidth: 1160,
              paddingVertical: 10,
              paddingHorizontal: isDesktop ? 22 : 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          ]}
        >
          {!isDark && (
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.05)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
              pointerEvents="none"
            />
          )}

          {/* Logo */}
          <Pressable accessibilityRole="button" accessibilityLabel="Lioris home"
            onPress={() => scrollToSection('hero')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <LiorisLogo size={32} variant="symbol" />
            {width >= 480 && (
              <LiorisLogo size={20} variant="wordmark" tintColor={isDark ? '#FFFFFF' : colors.textPrimary} />
            )}
          </Pressable>

          {/* Desktop Nav Links */}
          {isDesktop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
              {[
                { label: 'Overview', id: 'hero' },
                { label: 'Device Simulator', id: 'preview' },
                { label: 'Core Pillars', id: 'pillars' },
                { label: 'Campuses', id: 'campuses' },
              ].map((link) => (
                <Pressable
                  key={link.id}
                  onPress={() => scrollToSection(link.id)}
                  style={({ hovered }: any) => [
                    { paddingVertical: 4 },
                    hovered && { opacity: 0.75 },
                  ]}
                >
                  <AppText
                    variant="bodySmall"
                    weight="medium"
                    style={{ color: isDark ? '#E2E8F0' : '#334155' }}
                  >
                    {link.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          {/* Action CTAs & Theme Toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: width < 380 ? 6 : 10 }}>
            <Pressable
              onPress={toggleTheme}
              accessibilityLabel="Toggle Theme"
              style={{
                width: width < 380 ? 32 : 36,
                height: width < 380 ? 32 : 36,
                borderRadius: 18,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={width < 380 ? 15 : 17} color={isDark ? '#F8FAFC' : '#1E293B'} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={{
                paddingHorizontal: width < 380 ? 10 : 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
              }}
            >
              <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFFFFF' : colors.textPrimary, fontSize: width < 380 ? 12 : 13 }}>
                Log In
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/register')}
              style={{
                backgroundColor: colors.brandPrimary,
                paddingHorizontal: width < 380 ? 12 : 16,
                paddingVertical: 8,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                ...(Platform.OS === 'web'
                  ? {
                      boxShadow: '0 4px 14px rgba(26, 61, 255, 0.40)',
                    }
                  : {}),
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone="inverse" style={{ fontSize: width < 380 ? 12 : 13 }}>
                Get Started
              </AppText>
              <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Page Scroll Container */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 100 : 110,
          paddingBottom: 40,
        }}
      >
        <View style={{ width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: 16 }}>
          
          {/* =========================================================================
              1. HERO SECTION: Professional, High-Impact & Clean
             ========================================================================= */}
          <View
            // @ts-ignore
            id="hero"
            style={{
              paddingTop: isDesktop ? 36 : 18,
              paddingBottom: 36,
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Clean Typographic Eyebrow (No pill box) */}
            <AppText
              variant="caption"
              weight="bold"
              style={{
                color: colors.brandAccent,
                letterSpacing: 1.5,
                marginBottom: 12,
                fontSize: 13,
                textAlign: 'center',
                alignSelf: 'center',
                maxWidth: '90%',
              }}
            >
              THE VERIFIED UNIVERSITY COMMUNITY PLATFORM
            </AppText>

            {/* Headline */}
            <AppText
              variant="h1"
              weight="bold"
              style={{
                fontSize: isDesktop ? 54 : width < 380 ? 32 : 38,
                lineHeight: isDesktop ? 62 : width < 380 ? 38 : 46,
                textAlign: 'center',
                maxWidth: 820,
                marginBottom: 16,
                letterSpacing: -0.8,
                color: isDark ? '#FFFFFF' : '#0A1326',
              }}
            >
              Campus Life.{' '}
              <AppText
                variant="h1"
                weight="bold"
                style={{
                  fontSize: isDesktop ? 54 : width < 380 ? 32 : 38,
                  lineHeight: isDesktop ? 62 : width < 380 ? 38 : 46,
                  color: colors.brandPrimary,
                  letterSpacing: -0.8,
                }}
              >
                Unified into One Verified Space.
              </AppText>
            </AppText>

            {/* Sub-headline: Professional & Informative */}
            <AppText
              variant="body"
              tone="secondary"
              style={{
                fontSize: isDesktop ? 18 : 15,
                lineHeight: isDesktop ? 27 : 23,
                textAlign: 'center',
                maxWidth: 680,
                marginBottom: 28,
              }}
            >
              Connect with verified classmates, collaborate in departmental forums, access institutional past question vaults,
              and bridge directly to alumni career mentorship.
            </AppText>

            {/* Primary Hero Actions */}
            <View
              style={{
                flexDirection: width < 520 ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                width: width < 520 ? '100%' : 'auto',
                maxWidth: width < 520 ? 340 : undefined,
                alignSelf: 'center',
                marginBottom: 28,
              }}
            >
              <Pressable
                onPress={() => router.push('/(auth)/register')}
                style={{
                  backgroundColor: colors.brandPrimary,
                  paddingHorizontal: 28,
                  paddingVertical: 14,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  width: width < 520 ? '100%' : 'auto',
                  ...(Platform.OS === 'web'
                    ? {
                        boxShadow: '0 8px 24px -2px rgba(26, 61, 255, 0.45)',
                      }
                    : {}),
                }}
              >
                <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
                <AppText variant="bodySmall" weight="bold" tone="inverse" style={{ fontSize: 15 }}>
                  Join Your Campus Space
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={[
                  glassStyle(radius.pill, isDark ? 0.5 : 0.7),
                  {
                    paddingHorizontal: 24,
                    paddingVertical: 14,
                    borderRadius: radius.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: width < 520 ? '100%' : 'auto',
                  },
                ]}
              >
                <Ionicons name="log-in-outline" size={18} color={isDark ? '#FFFFFF' : colors.textPrimary} />
                <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFFFFF' : colors.textPrimary, fontSize: 15 }}>
                  Sign In to Campus ID
                </AppText>
              </Pressable>
            </View>

            {/* Clean Trust Row (No pill boxes around text) */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 16,
                maxWidth: 780,
              }}
            >
              {[
                '100% .edu Verified IDs',
                'Departmental Forums',
                'Academic Resources Vault',
                'Alumni Mentorship Circle',
              ].map((item, i) => (
                <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <AppText variant="caption" weight="medium" tone="secondary" style={{ fontSize: 13 }}>
                    {item}
                  </AppText>
                  {i < 3 && (
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                      }}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* =========================================================================
              2. INTERACTIVE DEVICE SIMULATOR: Student & Alumni with Floating Nav Bar
             ========================================================================= */}
          <View
            // @ts-ignore
            id="preview"
            style={{
              marginTop: 36,
              marginBottom: 48,
              alignItems: 'center',
            }}
          >
            {/* Clean Section Header (No pill badge) */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1.2, marginBottom: 6 }}>
                INTERACTIVE DEVICE SIMULATOR
              </AppText>
              <AppText variant="h2" weight="bold" style={{ textAlign: 'center', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                Experience Lioris on iPhone
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', marginTop: 4, maxWidth: 520 }}>
                Explore the actual interface and floating navigation used by verified students and alumni.
              </AppText>
            </View>

            {/* Role Switcher: Student & Alumni Only */}
            <View
              style={[
                glassStyle(radius.pill, isDark ? 0.6 : 0.8),
                {
                  flexDirection: 'row',
                  padding: 4,
                  marginBottom: 28,
                  maxWidth: 320,
                  width: '100%',
                },
              ]}
            >
              {[
                { id: 'student', label: 'Student Portal', icon: 'school' as const },
                { id: 'alumni', label: 'Alumni Circle', icon: 'ribbon' as const },
              ].map((tab) => {
                const isSelected = previewRole === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      haptics.light();
                      setPreviewRole(tab.id as any);
                    }}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 9,
                      borderRadius: radius.pill,
                      backgroundColor: isSelected ? colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={15}
                      color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                    />
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{
                        color: isSelected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569',
                      }}
                    >
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* The iPhone Showcase Container */}
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isDesktop ? 36 : 24,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Left Side Highlight (Desktop) - Clean, No Shape Around Emojis */}
              {isDesktop && (
                <View
                  style={[
                    glassStyle(20, isDark ? 0.55 : 0.75),
                    {
                      width: 250,
                      padding: 20,
                      gap: 10,
                      transform: [{ rotate: '-2.5deg' }],
                    },
                  ]}
                >
                  <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                  <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                    Verified Academic Identity
                  </AppText>
                  <AppText variant="caption" tone="secondary" style={{ lineHeight: 18 }}>
                    Student and alumni profiles are cryptographically stamped and restricted to authenticated institutional domains.
                  </AppText>
                </View>
              )}

              {/* iPhone Hardware Outer Frame */}
              <View
                style={{
                  width: Math.min(width - 32, 340),
                  height: width < 480 ? 560 : 660,
                  borderRadius: width < 480 ? 44 : 50,
                  backgroundColor: isDark ? '#020617' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)',
                  borderWidth: 4,
                  padding: 8,
                  position: 'relative',
                  overflow: 'hidden',
                  ...(Platform.OS === 'web'
                    ? {
                        boxShadow: isDark
                          ? '0 25px 60px -12px rgba(0, 0, 0, 0.8), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
                          : '0 25px 60px -12px rgba(15, 23, 42, 0.22), inset 0 1px 2px rgba(255, 255, 255, 0.8)',
                      }
                    : {}),
                }}
              >
                {/* Dynamic Screen Interior */}
                <View
                  style={{
                    flex: 1,
                    borderRadius: width < 480 ? 36 : 42,
                    backgroundColor: isDark ? '#0B132B' : '#F1F5F9',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Dynamic Island */}
                  <View
                    style={{
                      position: 'absolute',
                      top: 10,
                      alignSelf: 'center',
                      width: 96,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: '#000000',
                      zIndex: 99,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 10,
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A3DFF' }} />
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E293B' }} />
                  </View>

                  {/* Screen Content ScrollView */}
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 46, paddingBottom: 80, paddingHorizontal: 12 }}
                  >
                    {/* Mini App Header */}
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 14,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <LiorisLogo size={22} variant="symbol" />
                        <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                          LIORIS
                        </AppText>
                      </View>
                      <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                        {previewRole === 'student' ? 'STUDENT' : 'ALUMNI'}
                      </AppText>
                    </View>

                    {/* STUDENT PREVIEW CONTENT */}
                    {previewRole === 'student' && (
                      <View style={{ gap: 10 }}>
                        {/* Student Greeting */}
                        <View style={{ marginBottom: 4 }}>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Hello, Diana 👋
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            University of Ibadan • Computer Science (400L)
                          </AppText>
                        </View>

                        {/* Forum Discussion Card */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                              CAMPUS FORUM
                            </AppText>
                            <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                              12m ago
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            CSC 401: Best preparation tips for Friday's lab exam?
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            24 classmates responding in #computer-science
                          </AppText>
                        </View>

                        {/* Academic Resources Vault */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            ACADEMIC RESOURCES VAULT
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            CSC 401 Past Exam & Marking Scheme
                          </AppText>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <Ionicons name="folder-outline" size={13} color={colors.brandPrimary} />
                            <AppText variant="caption" tone="brand" weight="semiBold" style={{ fontSize: 10 }}>
                              Verified Department Repository (312 Downloads)
                            </AppText>
                          </View>
                        </View>

                        {/* Campus Event Card */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            CAMPUS CALENDAR
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Annual Technology & Innovation Symposium
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Faculty Large Lecture Theatre • Tomorrow at 10:00 AM
                          </AppText>
                        </View>
                      </View>
                    )}

                    {/* ALUMNI PREVIEW CONTENT */}
                    {previewRole === 'alumni' && (
                      <View style={{ gap: 10 }}>
                        {/* Alumni Greeting */}
                        <View style={{ marginBottom: 4 }}>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Welcome back, Adeola 🎓
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            UI Alum '22 • Software Engineer at Paystack
                          </AppText>
                        </View>

                        {/* Career & Hiring Board */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                              CAREER PIPELINE
                            </AppText>
                            <AppText variant="caption" style={{ color: '#10B981', fontSize: 10, fontWeight: 'bold' }}>
                              Active Hiring
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Software Engineering Intern • Paystack
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Direct alumni referral pipeline for graduating cohort
                          </AppText>
                        </View>

                        {/* 1-on-1 Mentorship Session */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            MENTORSHIP CIRCLE
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            1-on-1 Session: Breaking into Cloud Engineering
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Mentee: Chinedu E. (300L CS) • Thursday 4:00 PM
                          </AppText>
                        </View>

                        {/* Alumni Gathering */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            ALUMNI GATHERINGS
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Annual Alumni Dinner & Gala 2026
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Victoria Island, Lagos • Dec 12
                          </AppText>
                        </View>
                      </View>
                    )}
                  </ScrollView>

                  {/* FLOATING LIQUID GLASS TAB BAR INSIDE SIMULATOR */}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 12,
                      right: 12,
                      height: 46,
                      borderRadius: 23,
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.90)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      borderWidth: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      paddingHorizontal: 8,
                      ...(Platform.OS === 'web'
                        ? {
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
                          }
                        : {}),
                    }}
                  >
                    {previewRole === 'student' ? (
                      <>
                        {/* Student Floating Nav: Home, Forum, Events, Resources */}
                        <View style={{ alignItems: 'center', backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14 }}>
                          <Ionicons name="home" size={16} color="#FFFFFF" />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="chatbubbles-outline" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="calendar-outline" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="folder-outline" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                      </>
                    ) : (
                      <>
                        {/* Alumni Floating Nav: Home, Careers, Forum, Events, Mentorship */}
                        <View style={{ alignItems: 'center', backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 }}>
                          <Ionicons name="home" size={15} color="#FFFFFF" />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="briefcase-outline" size={15} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="chatbubbles-outline" size={15} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="calendar-outline" size={15} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                        <View style={{ alignItems: 'center', padding: 4 }}>
                          <Ionicons name="ribbon-outline" size={15} color={isDark ? '#94A3B8' : '#64748B'} />
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>

              {/* Right Side Highlight (Desktop) - Clean, No Shape Around Emojis */}
              {isDesktop && (
                <View
                  style={[
                    glassStyle(20, isDark ? 0.55 : 0.75),
                    {
                      width: 250,
                      padding: 20,
                      gap: 10,
                      transform: [{ rotate: '2.5deg' }],
                    },
                  ]}
                >
                  <Ionicons name="people" size={24} color="#3B82F6" />
                  <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                    Alumni-Student Bridge
                  </AppText>
                  <AppText variant="caption" tone="secondary" style={{ lineHeight: 18 }}>
                    Connect current students with graduated mentors working at top companies for guidance and hiring pipelines.
                  </AppText>
                </View>
              )}
            </View>
          </View>

          {/* =========================================================================
              4. CORE PILLARS OF CAMPUS LIFE: Focused on Main Navigations
             ========================================================================= */}
          <View
            // @ts-ignore
            id="pillars"
            style={{ marginVertical: 40 }}
          >
            {/* Clean Section Header (No pill badge) */}
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1.2, marginBottom: 6 }}>
                CORE CAMPUS PILLARS
              </AppText>
              <AppText variant="h2" weight="bold" style={{ textAlign: 'center', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                Designed Around Real University Life
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', marginTop: 4, maxWidth: 540 }}>
                Essential academic, career, and community tools unified into a secure institutional ecosystem.
              </AppText>
            </View>

            {/* Bento Grid: Main Navigations (Forum, Resources, Events, Mentorship, Careers, Study Groups) */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 16,
                justifyContent: 'space-between',
              }}
            >
              {[
                {
                  icon: 'chatbubbles',
                  accent: '#1A3DFF',
                  title: 'Campus Community Forum',
                  desc: 'Verified peer-to-peer discourse, departmental discussion channels, and course threads without outside noise or anonymous trolls.',
                },
                {
                  icon: 'folder',
                  accent: '#3B82F6',
                  title: 'Academic Resources Vault',
                  desc: 'Crowdsourced past questions archive, course outlines, and solution sheets organized strictly by university, faculty, and code.',
                },
                {
                  icon: 'calendar',
                  accent: '#10B981',
                  title: 'Campus Events & Calendar',
                  desc: 'Academic symposiums, student elections, tech hackathons, and departmental gatherings with verified digital attendance.',
                },
                {
                  icon: 'ribbon',
                  accent: '#8B5CF6',
                  title: 'Alumni Mentorship Circle',
                  desc: 'Direct 1-on-1 career guidance between enrolled students and graduated professionals across technology, healthcare, and finance.',
                },
                {
                  icon: 'briefcase',
                  accent: '#F59E0B',
                  title: 'Career & Internship Pipelines',
                  desc: 'Curated job opportunities, graduate trainee postings, and exclusive alumni referrals dedicated to your institution.',
                },
                {
                  icon: 'people',
                  accent: '#EC4899',
                  title: 'Collaborative Study Cohorts',
                  desc: 'Find classmates, organize study groups, and collaborate on assignments in dedicated course-specific learning rooms.',
                },
              ].map((pillar) => (
                <View
                  key={pillar.title}
                  style={[
                    glassStyle(24, isDark ? 0.45 : 0.65),
                    {
                      width: isDesktop ? '31.8%' : isTablet ? '48%' : '100%',
                      padding: isDesktop ? 24 : 18,
                      gap: 12,
                    },
                  ]}
                >
                  {/* Clean Icon (No shape box around emoji/icon) */}
                  <Ionicons name={pillar.icon as any} size={28} color={pillar.accent} />

                  <AppText
                    variant="h3"
                    weight="bold"
                    style={{ fontSize: 18, lineHeight: 24, color: isDark ? '#FFFFFF' : '#0F172A' }}
                  >
                    {pillar.title}
                  </AppText>

                  <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                    {pillar.desc}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* =========================================================================
              5. THE LIORIS STANDARD: Metrics Strip
             ========================================================================= */}
          <View
            style={[
              glassStyle(28, isDark ? 0.5 : 0.7),
              {
                padding: isDesktop ? 36 : 24,
                marginVertical: 36,
              },
            ]}
          >
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 28,
              }}
            >
              {[
                { number: '100%', label: 'Campus ID Verified', subtext: 'Zero unauthorized outsiders' },
                { number: '< 3 Min', label: 'Instant Domain Verification', subtext: 'Automatic school email validation' },
                { number: '7+', label: 'Launch Universities', subtext: 'UI, UNILAG, FUNAAB + 18 expanding' },
                { number: '₦0', label: 'Student Fees', subtext: 'Built freely for verified learners' },
              ].map((stat, idx) => (
                <View
                  key={stat.label}
                  style={{
                    alignItems: isDesktop ? 'flex-start' : 'center',
                    flex: 1,
                    width: '100%',
                    borderRightWidth: isDesktop && idx < 3 ? 1 : 0,
                    borderRightColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    paddingRight: isDesktop ? 20 : 0,
                  }}
                >
                  <AppText
                    variant="h1"
                    weight="bold"
                    style={{ fontSize: 36, lineHeight: 42, color: colors.brandPrimary }}
                  >
                    {stat.number}
                  </AppText>
                  <AppText
                    variant="bodySmall"
                    weight="bold"
                    style={{ color: isDark ? '#FFFFFF' : '#0F172A', marginTop: 4 }}
                  >
                    {stat.label}
                  </AppText>
                  <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                    {stat.subtext}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* =========================================================================
              6. SUPPORTED CAMPUSES & WAITLIST NOMINATION
             ========================================================================= */}
          <View
            // @ts-ignore
            id="campuses"
            style={{ marginVertical: 36 }}
          >
            <View
              style={[
                glassStyle(28, isDark ? 0.55 : 0.75),
                {
                  padding: isDesktop ? 36 : 24,
                  position: 'relative',
                },
              ]}
            >
              <View
                style={{
                  flexDirection: isDesktop ? 'row' : 'column',
                  gap: 32,
                  justifyContent: 'space-between',
                }}
              >
                {/* Left: Campuses List */}
                <View style={{ flex: 1, gap: 14 }}>
                  <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1.2 }}>
                    CAMPUS NETWORK
                  </AppText>

                  <AppText variant="h2" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                    Live at Premier Institutions
                  </AppText>
                  <AppText tone="secondary" style={{ maxWidth: 440 }}>
                    Lioris is deployed across Nigeria's top tertiary institutions with automated institutional email authentication.
                  </AppText>

                  {/* Campus Names */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                    {LAUNCH_INSTITUTIONS.filter(i => i.code !== 'GLOBAL').map((inst) => (
                      <View
                        key={inst.code}
                        style={[
                          glassStyle(radius.pill, isDark ? 0.4 : 0.6),
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: inst.primaryColor || '#10B981',
                          }}
                        />
                        <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                          {inst.name} ({inst.shortName})
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Right: Fast-Track Waitlist Form */}
                <View
                  style={[
                    glassStyle(20, isDark ? 0.6 : 0.8),
                    {
                      width: isDesktop ? 400 : '100%',
                      padding: 24,
                      gap: 14,
                    },
                  ]}
                >
                  <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                    Don't see your school?
                  </AppText>
                  <AppText variant="bodySmall" tone="secondary">
                    Nominate your university to fast-track launch priority for your campus.
                  </AppText>

                  {waitlistSubmitted ? (
                    <View
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        borderColor: '#10B981',
                        borderWidth: 1,
                        gap: 6,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <AppText variant="bodySmall" weight="bold" style={{ color: '#10B981' }}>
                          Priority Nomination Received!
                        </AppText>
                      </View>
                      <AppText variant="caption" tone="secondary">
                        We'll notify you as soon as your university's campus server goes live.
                      </AppText>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <AppTextField
                        label=""
                        placeholder="Campus Email (e.g. name@student.edu.ng)"
                        value={waitlistEmail}
                        onChangeText={setWaitlistEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                      <AppTextField
                        label=""
                        placeholder="University Name"
                        value={waitlistSchool}
                        onChangeText={setWaitlistSchool}
                      />
                      <AppButton
                        label="Nominate My Campus"
                        variant="accent"
                        onPress={handleJoinWaitlist}
                        loading={waitlistSubmitting}
                        disabled={!waitlistEmail.trim() || !waitlistSchool.trim()}
                        fullWidth
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* =========================================================================
              7. BOTTOM CALL TO ACTION
             ========================================================================= */}
          <View
            style={[
              glassStyle(32, isDark ? 0.65 : 0.85),
              {
                padding: isDesktop ? 48 : 28,
                alignItems: 'center',
                marginVertical: 40,
                position: 'relative',
              },
            ]}
          >
            <LiorisLogo size={48} variant="symbol" />
            <AppText
              variant="h2"
              weight="bold"
              style={{
                fontSize: isDesktop ? 36 : 26,
                marginTop: 16,
                marginBottom: 8,
                textAlign: 'center',
                color: isDark ? '#FFFFFF' : '#0F172A',
              }}
            >
              Step Into Your Campus Ecosystem
            </AppText>
            <AppText
              variant="body"
              tone="secondary"
              style={{ textAlign: 'center', maxWidth: 520, marginBottom: 24 }}
            >
              Join thousands of students and alumni experiencing university life with verified privacy and institutional trust.
            </AppText>

            <View
              style={{
                flexDirection: width < 520 ? 'column' : 'row',
                gap: 12,
                width: width < 520 ? '100%' : 'auto',
                maxWidth: width < 520 ? 340 : undefined,
                alignSelf: 'center',
              }}
            >
              <Pressable
                onPress={() => router.push('/(auth)/register')}
                style={{
                  backgroundColor: colors.brandPrimary,
                  paddingHorizontal: 28,
                  paddingVertical: 14,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: width < 520 ? '100%' : 'auto',
                  ...(Platform.OS === 'web'
                    ? {
                        boxShadow: '0 8px 24px -2px rgba(26, 61, 255, 0.45)',
                      }
                    : {}),
                }}
              >
                <AppText variant="bodySmall" weight="bold" tone="inverse" style={{ fontSize: 15 }}>
                  Create Student Account
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={[
                  glassStyle(radius.pill, isDark ? 0.5 : 0.7),
                  {
                    paddingHorizontal: 24,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: width < 520 ? '100%' : 'auto',
                  },
                ]}
              >
                <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 15 }}>
                  Sign In to Campus ID
                </AppText>
              </Pressable>
            </View>
          </View>

          {/* =========================================================================
              8. COMPREHENSIVE PROPER FOOTER & LEGAL LINKS
             ========================================================================= */}
          <View
            style={[
              glassStyle(28, isDark ? 0.55 : 0.75),
              {
                padding: isDesktop ? 40 : 24,
                marginTop: 20,
                marginBottom: 20,
                gap: 32,
              },
            ]}
          >
            {/* 4 Footer Columns */}
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                justifyContent: 'space-between',
                gap: isDesktop ? 40 : 28,
              }}
            >
              {/* Column 1: Brand & Contact Info */}
              <View style={{ flex: 1.3, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LiorisLogo size={32} variant="symbol" />
                  <LiorisLogo size={20} variant="wordmark" tintColor={isDark ? '#FFFFFF' : colors.textPrimary} />
                </View>
                <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 22, maxWidth: 320 }}>
                  The unified university platform connecting verified students and alumni through departmental forums,
                  curated academic resource vaults, campus events, and career mentorship.
                </AppText>

                {/* Direct Contact Details */}
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${DATA_CONTROLLER.contactEmail}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Ionicons name="mail-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="bodySmall" weight="semiBold" style={{ color: isDark ? '#E2E8F0' : '#1E293B' }}>
                      {DATA_CONTROLLER.contactEmail}
                    </AppText>
                  </Pressable>

                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${DPO_EMAIL}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="bodySmall" weight="semiBold" style={{ color: isDark ? '#E2E8F0' : '#1E293B' }}>
                      {DPO_EMAIL}
                    </AppText>
                  </Pressable>
                </View>
              </View>

              {/* Column 2: Platform Links */}
              <View style={{ flex: 1, gap: 10 }}>
                <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1 }}>
                  PLATFORM
                </AppText>
                {[
                  { label: 'Student Portal', href: '/(auth)/login' },
                  { label: 'Alumni Circle', href: '/(auth)/login' },
                  { label: 'Academic Resources', href: '/(auth)/register' },
                  { label: 'Campus Forum', href: '/(auth)/register' },
                  { label: 'Career Board', href: '/(auth)/login' },
                ].map((item) => (
                  <Pressable key={item.label} onPress={() => router.push(item.href as any)}>
                    <AppText variant="bodySmall" tone="secondary" style={{ paddingVertical: 2 }}>
                      {item.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Column 3: Active Campuses */}
              <View style={{ flex: 1, gap: 10 }}>
                <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1 }}>
                  CAMPUS HUBS
                </AppText>
                {[
                  'University of Ibadan (UI)',
                  'University of Lagos (UNILAG)',
                  'FUNAAB (Abeokuta)',
                  'University of Nigeria (UNN)',
                  'Obafemi Awolowo Univ (OAU)',
                  'Covenant University (CU)',
                ].map((campus) => (
                  <AppText key={campus} variant="bodySmall" tone="secondary" style={{ paddingVertical: 2 }}>
                    {campus}
                  </AppText>
                ))}
              </View>

              {/* Column 4: Real Legal Pages */}
              <View style={{ flex: 1, gap: 10 }}>
                <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1 }}>
                  LEGAL & PRIVACY
                </AppText>
                {[
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Community Guidelines', href: '/community-rules' },
                ].map((legal) => (
                  <Pressable key={legal.label} onPress={() => router.push(legal.href as any)}>
                    <AppText variant="bodySmall" weight="medium" style={{ color: colors.brandPrimary, paddingVertical: 2 }}>
                      {legal.label} →
                    </AppText>
                  </Pressable>
                ))}
                <AppText variant="caption" tone="secondary" style={{ marginTop: 6, lineHeight: 18 }}>
                  Zero commercial advertisements. Institutional domain verification enforced.
                </AppText>
              </View>
            </View>

            {/* Sub-Footer Divider & Copyright */}
            <View
              style={{
                height: 1,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              }}
            />

            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                justifyContent: 'space-between',
                alignItems: isDesktop ? 'center' : 'flex-start',
                gap: 12,
              }}
            >
              <AppText variant="caption" tone="secondary">
                © 2026 Lioris Campus Inc. All rights reserved. Registered Educational Platform.
              </AppText>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Pressable onPress={() => router.push('/privacy' as any)}>
                  <AppText variant="caption" tone="secondary">
                    Privacy
                  </AppText>
                </Pressable>
                <Pressable onPress={() => router.push('/terms' as any)}>
                  <AppText variant="caption" tone="secondary">
                    Terms
                  </AppText>
                </Pressable>
                <Pressable onPress={() => router.push('/community-rules' as any)}>
                  <AppText variant="caption" tone="secondary">
                    Guidelines
                  </AppText>
                </Pressable>
                <Pressable onPress={() => scrollToSection('hero')}>
                  <AppText variant="caption" tone="brand" weight="bold">
                    Back to Top ↑
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
