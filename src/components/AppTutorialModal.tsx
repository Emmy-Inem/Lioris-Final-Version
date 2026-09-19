import React, { useState, useEffect } from 'react';
import { View, Modal, Pressable, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

const STORAGE_KEY_PREFIX = 'lioris_tutorial_completed_';

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return await SecureStore.getItemAsync(key).catch(() => null);
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value).catch(() => {});
}

export interface AppTutorialModalProps {
  userId?: string;
  forceOpen?: boolean;
  onClose?: () => void;
}

interface TutorialStep {
  tag: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
  highlights: string[];
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    tag: 'WELCOME TO LIORIS',
    title: 'Your All-in-One Campus Workspace',
    icon: 'school-outline',
    color: '#1A3DFF',
    description: 'A modern, integrated academic environment built specifically for Nigerian university students and alumni.',
    highlights: [
      'Tailored to your university, faculty, and department',
      'Real-time academic alerts, deadlines, and portals',
      'Unified directory connecting students and alumni',
    ],
  },
  {
    tag: 'ACADEMIC RESOURCES',
    title: 'Past Questions & Study Materials',
    icon: 'book-outline',
    color: '#059669',
    description: 'Ace your exams with vetted previous question papers, lecture modules, and course outlines.',
    highlights: [
      'Instant access to filtered past question archives',
      'Download, preview, and bookmark key notes for offline revision',
      'Crowdsourced solutions vetted by top department scholars',
    ],
  },
  {
    tag: 'CAMPUS FORUM & GROUPS',
    title: 'Collaborative Study & Discussions',
    icon: 'chatbubbles-outline',
    color: '#7C3AED',
    description: 'Learn together in private course groups or discuss campus topics in the public feed.',
    highlights: [
      'Join active study circles specifically for your courses',
      'Ask academic questions and share verified campus news',
      'Stay updated with official departmental announcements',
    ],
  },
  {
    tag: 'ALUMNI & MENTORSHIP',
    title: 'Connect with Industry Mentors',
    icon: 'ribbon-outline',
    color: '#D97706',
    description: 'Bridge the gap between campus and career with direct mentorship from verified alumni.',
    highlights: [
      'Discover alumni mentors in software engineering, finance, science & more',
      'Request 1-on-1 career guidance and CV reviews',
      'Discover internships and graduate job opportunities',
    ],
  },
  {
    tag: 'MAPS & CAMPUS SCOPE',
    title: 'Campus Navigation & Workspace Scopes',
    icon: 'navigate-outline',
    color: '#0284C7',
    description: 'Find lecture halls with the campus map and switch between your local campus and the nationwide network.',
    highlights: [
      'Interactive Campus Map locates faculties, auditoriums, and libraries',
      'Floating quick-actions let you create posts or ask questions in one tap',
      'Switch between your Campus Node and Global Community anytime',
    ],
  },
];

export function AppTutorialModal({ userId, forceOpen = false, onClose }: AppTutorialModalProps) {
  const { colors, spacing, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setCurrentStep(0);
      setVisible(true);
      return;
    }

    if (!userId) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    getStorageItem(storageKey).then((val) => {
      if (val !== 'true') {
        setCurrentStep(0);
        setVisible(true);
      }
    });
  }, [userId, forceOpen]);

  async function handleDismiss() {
    haptics.light();
    setVisible(false);
    if (userId) {
      const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
      await setStorageItem(storageKey, 'true');
    }
    onClose?.();
  }

  function handleNext() {
    haptics.light();
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  }

  function handleBack() {
    haptics.light();
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  if (!visible) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.72)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.md,
        }}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          style={{ position: 'absolute', inset: 0 }}
          onPress={handleDismiss}
        />

        <GlassCard
          radius={24}
          padded={false}
          style={{
            width: '100%',
            maxWidth: 480,
            overflow: 'hidden',
            backgroundColor: isDark ? '#0F1A30' : '#FFFFFF',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Header Banner with Icon */}
          <View
            style={{
              paddingTop: spacing.xl,
              paddingBottom: spacing.lg,
              paddingHorizontal: spacing.lg,
              backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              position: 'relative',
            }}
          >
            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>

            {/* Glowing Icon Container */}
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                backgroundColor: `${step.color}15`,
                borderWidth: 1.5,
                borderColor: `${step.color}40`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name={step.icon} size={34} color={step.color} />
            </View>

            <Badge label={step.tag} tone="brand" />

            <AppText
              variant="h2"
              weight="bold"
              style={{
                textAlign: 'center',
                marginTop: spacing.sm,
                lineHeight: 28,
              }}
            >
              {step.title}
            </AppText>
          </View>

          {/* Body Content */}
          <View style={{ padding: spacing.lg }}>
            <AppText
              tone="secondary"
              style={{
                fontSize: 14,
                lineHeight: 22,
                textAlign: 'center',
                marginBottom: spacing.lg,
              }}
            >
              {step.description}
            </AppText>

            {/* Feature Bullet Points */}
            <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
              {step.highlights.map((highlight, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  }}
                >
                  <Ionicons name="checkmark-circle" size={17} color={step.color} />
                  <AppText style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                    {highlight}
                  </AppText>
                </View>
              ))}
            </View>

            {/* Step Pagination Dots */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
                marginBottom: spacing.lg,
              }}
            >
              {TUTORIAL_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === currentStep ? 22 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i === currentStep ? colors.brandPrimary : colors.border,
                  }}
                />
              ))}
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                {currentStep > 0 ? (
                  <AppButton
                    label="Back"
                    variant="secondary"
                    onPress={handleBack}
                    fullWidth
                  />
                ) : (
                  <AppButton
                    label="Skip"
                    variant="ghost"
                    onPress={handleDismiss}
                    fullWidth
                  />
                )}
              </View>

              <View style={{ flex: 2 }}>
                <AppButton
                  label={isLast ? 'Get Started' : 'Next'}
                  variant="primary"
                  onPress={handleNext}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}
