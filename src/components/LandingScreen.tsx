import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { useAuth } from '@/auth/AuthContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { joinWaitlist, LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { haptics } from '@/utils/haptics';

// Demo quick-logins
const DEMO_ACCOUNTS = [
  { role: 'student', label: 'Student', name: 'Diana Prince', email: 'diana.prince@ui.edu.ng', icon: 'school' as const, badge: 'UI • CSC 400L' },
  { role: 'alumni', label: 'Alumni', name: 'Adeola M.', email: 'alumni.adeola@ui.edu.ng', icon: 'ribbon' as const, badge: 'UI Alum • Paystack' },
  { role: 'staff', label: 'Faculty', name: 'Dr. Adeyemi', email: 'dr.adeyemi@ui.edu.ng', icon: 'briefcase' as const, badge: 'Faculty of Science' },
  { role: 'admin', label: 'Admin', name: 'Campus Desk', email: 'admin@ui.edu.ng', icon: 'shield-checkmark' as const, badge: 'Platform Admin' },
];

export function LandingScreen() {
  const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const { isDesktop, isTablet } = useResponsive();
  const { settings, getGlassBorderColor, getBackdropFilterString } = useLiquidGlass();
  const { login } = useAuth();

  // Interactive phone preview role state
  const [previewRole, setPreviewRole] = useState<'student' | 'alumni' | 'staff' | 'admin'>('student');
  
  // Fast 1-click demo signing-in state
  const [signingInEmail, setSigningInEmail] = useState<string | null>(null);

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

  const handleDemoLogin = async (email: string) => {
    haptics.medium();
    setSigningInEmail(email);
    try {
      await login(email, 'password123');
      router.replace('/');
    } catch (err: any) {
      haptics.error();
      Alert.alert('Demo Sign In', err?.message || 'Unable to connect to demo account.');
    } finally {
      setSigningInEmail(null);
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
      {/* Dynamic Background Refraction Glow Blobs */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120,
          left: '15%',
          width: Math.min(width * 0.7, 650),
          height: 480,
          borderRadius: 300,
          backgroundColor: isDark ? 'rgba(11, 122, 117, 0.18)' : 'rgba(11, 122, 117, 0.12)',
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
          backgroundColor: isDark ? 'rgba(30, 64, 175, 0.14)' : 'rgba(59, 130, 246, 0.10)',
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
          {/* Meniscus specular highlight */}
          {!isDark && (
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.05)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
              pointerEvents="none"
            />
          )}

          {/* Logo & Badge */}
          <Pressable
            onPress={() => scrollToSection('hero')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <LiorisLogo size={32} variant="symbol" />
            <LiorisLogo size={20} variant="wordmark" tintColor={isDark ? '#FFFFFF' : colors.textPrimary} />
            <View
              style={{
                backgroundColor: isDark ? 'rgba(11, 122, 117, 0.25)' : 'rgba(11, 122, 117, 0.12)',
                borderColor: colors.brandPrimary,
                borderWidth: 1,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radius.pill,
                display: width < 420 ? 'none' : 'flex',
              }}
            >
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                CAMPUS OS
              </AppText>
            </View>
          </Pressable>

          {/* Desktop Nav Links */}
          {isDesktop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
              {[
                { label: 'Ecosystem', id: 'ecosystem' },
                { label: 'Live Preview', id: 'preview' },
                { label: 'Pillars', id: 'pillars' },
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={toggleTheme}
              accessibilityLabel="Toggle Theme"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={17} color={isDark ? '#F8FAFC' : '#1E293B'} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
              }}
            >
              <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFFFFF' : colors.textPrimary }}>
                Log In
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/register')}
              style={{
                backgroundColor: colors.brandPrimary,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                ...(Platform.OS === 'web'
                  ? {
                      boxShadow: '0 4px 14px rgba(11, 122, 117, 0.40)',
                    }
                  : {}),
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone="inverse">
                Get Started
              </AppText>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Page Scroll Container */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 100 : 110,
          paddingBottom: 80,
        }}
      >
        <View style={{ width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: 16 }}>
          
          {/* =========================================================================
              1. HERO SECTION: Concise, Punchy, Creative Liquid Glass Centerpiece
             ========================================================================= */}
          <View
            // @ts-ignore
            id="hero"
            style={{
              paddingTop: isDesktop ? 36 : 18,
              paddingBottom: 40,
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Status Live Indicator Badge */}
            <View
              style={[
                glassStyle(radius.pill, isDark ? 0.5 : 0.7),
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  marginBottom: 20,
                },
              ]}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#10B981',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 0 10px #10B981' } : {}),
                }}
              />
              <AppText variant="caption" weight="bold" style={{ color: isDark ? '#E2E8F0' : '#334155', letterSpacing: 0.5 }}>
                THE ALL-IN-ONE UNIVERSITY PLATFORM
              </AppText>
            </View>

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
                Refined into Liquid Glass.
              </AppText>
            </AppText>

            {/* Sub-headline: Bite-sized & Informative */}
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
              Connect with verified classmates, track live lecture changes, trade on student escrow, 
              access past exam vaults, and bridge directly to alumni career mentorship.
            </AppText>

            {/* Primary Hero Actions */}
            <View
              style={{
                flexDirection: width < 480 ? 'column' : 'row',
                alignItems: 'center',
                gap: 12,
                width: width < 480 ? '100%' : 'auto',
                marginBottom: 32,
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
                  width: width < 480 ? '100%' : 'auto',
                  ...(Platform.OS === 'web'
                    ? {
                        boxShadow: '0 8px 24px -2px rgba(11, 122, 117, 0.45)',
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
                onPress={() => scrollToSection('preview')}
                style={[
                  glassStyle(radius.pill, isDark ? 0.55 : 0.75),
                  {
                    paddingHorizontal: 24,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: width < 480 ? '100%' : 'auto',
                  },
                ]}
              >
                <Ionicons name="play-circle-outline" size={20} color={isDark ? '#E2E8F0' : '#1E293B'} />
                <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 15 }}>
                  Explore Interactive Preview
                </AppText>
              </Pressable>
            </View>

            {/* Fast Proof Verification Pills */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 10,
                maxWidth: 780,
              }}
            >
              {[
                { icon: 'shield-checkmark', text: '100% .edu Verified IDs', color: '#10B981' },
                { icon: 'lock-closed', text: 'End-to-End Escrow Protection', color: '#3B82F6' },
                { icon: 'flash', text: 'Real-Time Class Radars', color: '#F59E0B' },
                { icon: 'ribbon', text: 'Direct Alumni Mentorship', color: '#8B5CF6' },
              ].map((item) => (
                <View
                  key={item.text}
                  style={[
                    glassStyle(radius.pill, isDark ? 0.35 : 0.55),
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    },
                  ]}
                >
                  <Ionicons name={item.icon as any} size={14} color={item.color} />
                  <AppText variant="caption" weight="semiBold" tone="secondary" style={{ fontSize: 12 }}>
                    {item.text}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* =========================================================================
              2. 1-CLICK INSTANT DEMO LAUNCH STRIP (Instant Reviewer / Evaluator Access)
             ========================================================================= */}
          <View
            style={[
              glassStyle(20, isDark ? 0.5 : 0.7),
              {
                padding: 16,
                marginVertical: 20,
                borderLeftWidth: 3,
                borderLeftColor: colors.brandPrimary,
              },
            ]}
          >
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                alignItems: isDesktop ? 'center' : 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flash" size={16} color={colors.brandPrimary} />
                  <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8 }}>
                    1-CLICK INSTANT EVALUATION DEMO
                  </AppText>
                </View>
                <AppText variant="bodySmall" tone="secondary">
                  Tap any persona below to immediately enter the live app without signing up.
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DEMO_ACCOUNTS.map((demo) => {
                  const isLoading = signingInEmail === demo.email;
                  return (
                    <Pressable
                      key={demo.role}
                      onPress={() => handleDemoLogin(demo.email)}
                      disabled={!!signingInEmail}
                      style={({ hovered }: any) => [
                        glassStyle(radius.pill, isDark ? 0.6 : 0.85),
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          backgroundColor: hovered
                            ? isDark
                              ? 'rgba(255,255,255,0.15)'
                              : 'rgba(0,0,0,0.06)'
                            : isDark
                            ? 'rgba(15, 23, 42, 0.65)'
                            : 'rgba(255,255,255,0.85)',
                          opacity: signingInEmail && !isLoading ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Ionicons name={demo.icon} size={14} color={colors.brandPrimary} />
                      <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                        {isLoading ? 'Entering...' : demo.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* =========================================================================
              3. CREATIVE CENTERPIECE: The Liquid Glass iPhone Device Simulator
             ========================================================================= */}
          <View
            // @ts-ignore
            id="preview"
            style={{
              marginTop: 36,
              marginBottom: 54,
              alignItems: 'center',
            }}
          >
            {/* Section Tag & Title */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(11, 122, 117, 0.22)' : 'rgba(11, 122, 117, 0.10)',
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  marginBottom: 8,
                }}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  INTERACTIVE DEVICE SIMULATOR
                </AppText>
              </View>
              <AppText variant="h2" weight="bold" style={{ textAlign: 'center', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                Experience Lioris on iPhone
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', marginTop: 4, maxWidth: 520 }}>
                Select a role to preview the actual liquid glass interface students, alumni, faculty, and admins use daily.
              </AppText>
            </View>

            {/* Role Tab Switcher (Floating Liquid Glass Pill) */}
            <View
              style={[
                glassStyle(radius.pill, isDark ? 0.6 : 0.8),
                {
                  flexDirection: 'row',
                  padding: 4,
                  marginBottom: 32,
                  maxWidth: 500,
                  width: '100%',
                },
              ]}
            >
              {[
                { id: 'student', label: 'Student', icon: 'school' as const },
                { id: 'alumni', label: 'Alumni', icon: 'ribbon' as const },
                { id: 'staff', label: 'Faculty', icon: 'briefcase' as const },
                { id: 'admin', label: 'Admin', icon: 'shield-checkmark' as const },
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
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      backgroundColor: isSelected ? colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={14}
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

            {/* The iPhone Showcase Container (with Flanking Floating Badges on Desktop) */}
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
              {/* Left Flanking Glass Badge (Desktop) */}
              {isDesktop && (
                <View
                  style={[
                    glassStyle(20, isDark ? 0.55 : 0.75),
                    {
                      width: 240,
                      padding: 18,
                      gap: 12,
                      transform: [{ rotate: '-3deg' }],
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: 'rgba(16, 185, 129, 0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="shield-checkmark" size={20} color="#10B981" />
                    </View>
                    <View>
                      <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                        Verified ID
                      </AppText>
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                        UI • CSC Class of '26
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="caption" tone="secondary">
                    Cryptographically stamped student profile guaranteed through institutional domain match.
                  </AppText>
                </View>
              )}

              {/* iPhone Hardware Outer Frame */}
              <View
                style={{
                  width: Math.min(width - 32, 330),
                  height: 640,
                  borderRadius: 50,
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
                    borderRadius: 42,
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
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0B7A75' }} />
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E293B' }} />
                  </View>

                  {/* Simulated Screen Content based on Preview Role */}
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 46, paddingBottom: 24, paddingHorizontal: 12 }}
                  >
                    {/* Mini Header */}
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
                      <View
                        style={{
                          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: radius.pill,
                        }}
                      >
                        <AppText variant="caption" weight="semiBold" style={{ fontSize: 10, color: colors.brandPrimary }}>
                          {previewRole.toUpperCase()}
                        </AppText>
                      </View>
                    </View>

                    {/* ROLE-SPECIFIC SCREEN UI */}
                    {previewRole === 'student' && (
                      <View style={{ gap: 10 }}>
                        {/* Live Lecture Card */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                              <AppText variant="caption" weight="bold" style={{ color: '#EF4444', fontSize: 10 }}>
                                LIVE NOW • TIMETABLE
                              </AppText>
                            </View>
                            <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                              LT-2
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            CSC 401: Distributed Systems
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Prof. Adeyemi • 10:00 AM - 12:00 PM
                          </AppText>
                        </View>

                        {/* Marketplace Escrow Spotlight */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                              STUDENT ESCROW MARKET
                            </AppText>
                            <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <AppText variant="caption" weight="bold" style={{ color: '#10B981', fontSize: 9 }}>
                                🛡️ SECURED
                              </AppText>
                            </View>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Apple iPad Air M1 + Pencil
                          </AppText>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary }}>
                              ₦240,000
                            </AppText>
                            <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                              Seller: Kemi (UNILAG)
                            </AppText>
                          </View>
                        </View>

                        {/* Past Exam Vault */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            REVISION VAULT
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            CSC 401 Past Exam & Marking 2024
                          </AppText>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <Ionicons name="cloud-download-outline" size={12} color={colors.brandPrimary} />
                            <AppText variant="caption" tone="brand" weight="semiBold" style={{ fontSize: 10 }}>
                              312 Cohort Downloads
                            </AppText>
                          </View>
                        </View>
                      </View>
                    )}

                    {previewRole === 'alumni' && (
                      <View style={{ gap: 10 }}>
                        {/* Mentorship Requests */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                              MENTORSHIP CIRCLE
                            </AppText>
                            <AppText variant="caption" style={{ color: '#10B981', fontSize: 10, fontWeight: 'bold' }}>
                              2 Active
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            1-on-1 Session: Career in Fintech
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Mentee: Chinedu E. (Yr 3 CS) • Tomorrow 4:00 PM
                          </AppText>
                        </View>

                        {/* Job & Referral Board */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            POSTED HIRING PIPELINE
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Software Engineering Intern • Paystack
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Exclusive to verified campus graduates
                          </AppText>
                        </View>

                        {/* Alumni Annual Gala */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            UPCOMING REUNION
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Annual Alumni Gala 2026
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Victoria Island, Lagos • Dec 12
                          </AppText>
                        </View>
                      </View>
                    )}

                    {previewRole === 'staff' && (
                      <View style={{ gap: 10 }}>
                        {/* Hall Allocation Radar */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            LECTURE RADAR
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            CSC 401 Hall Allocation Confirmed
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Large Lecture Hall 2 • Capacity 250 • Live Roster: 142
                          </AppText>
                        </View>

                        {/* Broadcast Notice */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            DEPARTMENT ANNOUNCEMENTS
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Mid-Semester Lab Project Due Date
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Broadcast sent to 184 registered students
                          </AppText>
                        </View>

                        {/* Office Hours */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            OFFICE HOURS SLOTS
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Wednesday: 2:00 PM - 4:00 PM
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Faculty Building, Room 314
                          </AppText>
                        </View>
                      </View>
                    )}

                    {previewRole === 'admin' && (
                      <View style={{ gap: 10 }}>
                        {/* System Health */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                              CAMPUS SYSTEM HEALTH
                            </AppText>
                            <View style={{ backgroundColor: 'rgba(16,185,129,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <AppText variant="caption" weight="bold" style={{ color: '#10B981', fontSize: 9 }}>
                                99.9% UPTIME
                              </AppText>
                            </View>
                          </View>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            Active Campus Connections: 1,842
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            UNILAG & UI Gateways Operational
                          </AppText>
                        </View>

                        {/* ID Verification Desk */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 10 }}>
                            STUDENT VERIFICATION QUEUE
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            4 Requests Pending Review
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Automated domain checks cleared 128 today
                          </AppText>
                        </View>

                        {/* Moderation Logs */}
                        <View style={[glassStyle(16, isDark ? 0.6 : 0.8), { padding: 12, gap: 6 }]}>
                          <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
                            CONTENT AUDIT DESK
                          </AppText>
                          <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                            0 Flagged Policy Violations
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                            Escrow transactions settled: ₦1.8M
                          </AppText>
                        </View>
                      </View>
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* Right Flanking Glass Badge (Desktop) */}
              {isDesktop && (
                <View
                  style={[
                    glassStyle(20, isDark ? 0.55 : 0.75),
                    {
                      width: 240,
                      padding: 18,
                      gap: 12,
                      transform: [{ rotate: '3deg' }],
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: 'rgba(59, 130, 246, 0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="cart" size={20} color="#3B82F6" />
                    </View>
                    <View>
                      <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                        Escrow Trade
                      </AppText>
                      <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                        100% Peer Protected
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="caption" tone="secondary">
                    Funds are secured by Lioris Escrow and only released after hands-on verification on campus.
                  </AppText>
                </View>
              )}
            </View>
          </View>

          {/* =========================================================================
              4. CORE PILLARS BENTO GRID: Informative, Creative, Not Wordy
             ========================================================================= */}
          <View
            // @ts-ignore
            id="pillars"
            style={{ marginVertical: 40 }}
          >
            {/* Section Tag */}
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(11, 122, 117, 0.22)' : 'rgba(11, 122, 117, 0.10)',
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  marginBottom: 8,
                }}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  SIX PILLARS OF CAMPUS LIFE
                </AppText>
              </View>
              <AppText variant="h2" weight="bold" style={{ textAlign: 'center', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                Everything You Need, Built for Your School
              </AppText>
              <AppText tone="secondary" style={{ textAlign: 'center', marginTop: 4, maxWidth: 540 }}>
                High-utility modules integrated into a single high-performance liquid glass architecture.
              </AppText>
            </View>

            {/* Bento Grid (Responsive 2 / 3 columns) */}
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
                  icon: 'shield-checkmark',
                  accent: '#10B981',
                  tag: 'TRUST & SAFETY',
                  title: 'Verified Academic Identity',
                  desc: 'Cryptographic .edu verification ensures only authentic students, faculty, and alumni enter. No strangers, no outside spam.',
                },
                {
                  icon: 'time',
                  accent: '#F59E0B',
                  tag: 'SCHEDULES & RADAR',
                  title: 'Smart Timetable & Lecture Alerts',
                  desc: 'Class schedules, venue adjustments, and assignment deadlines mapped automatically to your course and level.',
                },
                {
                  icon: 'cart',
                  accent: '#3B82F6',
                  tag: 'COMMERCE & ESCROW',
                  title: 'Peer-to-Peer Escrow Marketplace',
                  desc: 'Safely buy and sell textbooks, electronics, and dorm essentials with campus escrow protection that holds funds until handoff.',
                },
                {
                  icon: 'library',
                  accent: '#8B5CF6',
                  tag: 'ACADEMIC ARCHIVE',
                  title: 'Past Questions & Study Groups',
                  desc: 'Searchable university past questions vault, lecture notes, and active study groups organized strictly by faculty and code.',
                },
                {
                  icon: 'ribbon',
                  accent: '#EC4899',
                  tag: 'CAREER ACCELERATOR',
                  title: 'Alumni Network & Mentorship',
                  desc: 'Connect with established alumni at top technology and finance firms for 1-on-1 career guidance and hiring referrals.',
                },
                {
                  icon: 'radio',
                  accent: '#06B6D4',
                  tag: 'CULTURE & PULSE',
                  title: 'Campus Events & Live Radio',
                  desc: 'Faculty symposiums, tech hackathons, student association elections, and official university radio streaming directly in-app.',
                },
              ].map((pillar) => (
                <View
                  key={pillar.title}
                  style={[
                    glassStyle(24, isDark ? 0.45 : 0.65),
                    {
                      width: isDesktop ? '31.8%' : isTablet ? '48%' : '100%',
                      padding: 24,
                      gap: 12,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: isDark ? `${pillar.accent}25` : `${pillar.accent}18`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderColor: `${pillar.accent}40`,
                      borderWidth: 1,
                    }}
                  >
                    <Ionicons name={pillar.icon as any} size={22} color={pillar.accent} />
                  </View>

                  <View>
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: pillar.accent, letterSpacing: 0.8, fontSize: 10 }}
                    >
                      {pillar.tag}
                    </AppText>
                    <AppText
                      variant="h3"
                      weight="bold"
                      style={{ fontSize: 18, lineHeight: 24, marginTop: 4, color: isDark ? '#FFFFFF' : '#0F172A' }}
                    >
                      {pillar.title}
                    </AppText>
                  </View>

                  <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                    {pillar.desc}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* =========================================================================
              5. THE LIORIS STANDARD: Refractive Metrics Strip
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
                { number: '< 3 Min', label: 'Instant Academic Verification', subtext: 'Seamless domain matching' },
                { number: '7+', label: 'Launch Universities', subtext: 'UI, UNILAG, FUNAAB + 18 expanding' },
                { number: '₦0', label: 'Student Fees to Join', subtext: 'Built freely for academic spaces' },
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
              6. SUPPORTED CAMPUSES & WAITLIST CARD
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
                  <View
                    style={{
                      backgroundColor: isDark ? 'rgba(11, 122, 117, 0.22)' : 'rgba(11, 122, 117, 0.10)',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone="brand">
                      CAMPUS NETWORK
                    </AppText>
                  </View>

                  <AppText variant="h2" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                    Live at Premier Institutions
                  </AppText>
                  <AppText tone="secondary" style={{ maxWidth: 440 }}>
                    Lioris is deployed across Nigeria's top tertiary institutions with automated institutional email authentication.
                  </AppText>

                  {/* Campus Badges */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {LAUNCH_INSTITUTIONS.filter(i => i.code !== 'GLOBAL').map((inst) => (
                      <View
                        key={inst.code}
                        style={[
                          glassStyle(radius.pill, isDark ? 0.4 : 0.6),
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
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
                          Priority Waitlist Confirmed!
                        </AppText>
                      </View>
                      <AppText variant="caption" tone="secondary">
                        We'll notify you as soon as your university's verification server goes live.
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
                        label="Fast-Track My Campus"
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
              Join thousands of students and faculty experiencing university life with verified privacy and pure liquid glass speed.
            </AppText>

            <View style={{ flexDirection: width < 420 ? 'column' : 'row', gap: 12, width: width < 420 ? '100%' : 'auto' }}>
              <Pressable
                onPress={() => router.push('/(auth)/register')}
                style={{
                  backgroundColor: colors.brandPrimary,
                  paddingHorizontal: 28,
                  paddingVertical: 14,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: width < 420 ? '100%' : 'auto',
                }}
              >
                <AppText variant="bodySmall" weight="bold" tone="inverse" style={{ fontSize: 15 }}>
                  Create Free Student Account
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
                    width: width < 420 ? '100%' : 'auto',
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
              8. REFINED LIQUID GLASS FOOTER
             ========================================================================= */}
          <View
            style={[
              glassStyle(20, isDark ? 0.35 : 0.55),
              {
                padding: 20,
                marginTop: 20,
                flexDirection: isDesktop ? 'row' : 'column',
                justifyContent: 'space-between',
                alignItems: isDesktop ? 'center' : 'flex-start',
                gap: 16,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LiorisLogo size={24} variant="symbol" />
              <AppText variant="caption" weight="bold" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                LIORIS CAMPUS TECHNOLOGIES
              </AppText>
              <AppText variant="caption" tone="secondary">
                • © 2026 All Rights Reserved
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <Pressable onPress={() => router.push('/(auth)/login')}>
                <AppText variant="caption" tone="secondary" weight="semiBold">
                  Sign In
                </AppText>
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/register')}>
                <AppText variant="caption" tone="secondary" weight="semiBold">
                  Registration
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
      </ScrollView>
    </View>
  );
}
