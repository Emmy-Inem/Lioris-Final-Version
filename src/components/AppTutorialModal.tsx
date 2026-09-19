import React, { useState, useEffect } from 'react';
import { View, Modal, Pressable, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

const STORAGE_KEY_PREFIX = 'lioris_bottom_nav_tour_';

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

interface NavStep {
  tabName: string;
  badge: string;
  title: string;
  emoji: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  color: string;
  simpleText: string;
  points: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}

const STUDENT_STEPS: NavStep[] = [
  {
    tabName: 'Home',
    badge: 'TAB 1 OF 4',
    title: 'Home: Your Main Screen',
    emoji: '🏠',
    iconActive: 'home',
    iconInactive: 'home-outline',
    color: '#1A3DFF',
    simpleText: 'This is your starting point! Check fresh campus updates, see announcements, and tap handy shortcuts.',
    points: [
      { icon: 'flash', text: 'Quick links to student portals' },
      { icon: 'megaphone', text: 'Important school news & alerts' },
    ],
  },
  {
    tabName: 'Forum',
    badge: 'TAB 2 OF 4',
    title: 'Forum: The Campus Chat Room',
    emoji: '💬',
    iconActive: 'chatbubbles',
    iconInactive: 'chatbubbles-outline',
    color: '#8B5CF6',
    simpleText: 'Talk with other students in your school! Ask course questions, share study tips, and make friends.',
    points: [
      { icon: 'help-circle', text: 'Ask questions about your courses' },
      { icon: 'people', text: 'Meet students in your department' },
    ],
  },
  {
    tabName: 'Events',
    badge: 'TAB 3 OF 4',
    title: 'Events: Fun & Meetups',
    emoji: '📅',
    iconActive: 'calendar',
    iconInactive: 'calendar-outline',
    color: '#F59E0B',
    simpleText: 'Find fun activities happening on campus! See sports, workshops, parties, and club hangouts.',
    points: [
      { icon: 'ticket', text: 'Save your spot in one tap' },
      { icon: 'location', text: 'See exactly where & when to go' },
    ],
  },
  {
    tabName: 'Resources',
    badge: 'TAB 4 OF 4',
    title: 'Resources: Your Study Backpack',
    emoji: '📚',
    iconActive: 'folder',
    iconInactive: 'folder-outline',
    color: '#10B981',
    simpleText: 'Everything you need to pass your exams! Download past test papers, class handouts, and revision notes.',
    points: [
      { icon: 'document-text', text: 'Real past exam papers to practice' },
      { icon: 'download', text: 'Download notes to study anytime' },
    ],
  },
];

const ALUMNI_STEPS: NavStep[] = [
  {
    tabName: 'Home',
    badge: 'TAB 1 OF 4',
    title: 'Home: Your Alumni Desk',
    emoji: '🏠',
    iconActive: 'home',
    iconInactive: 'home-outline',
    color: '#1A3DFF',
    simpleText: 'Your main dashboard to stay connected with your university and see top network highlights.',
    points: [
      { icon: 'school', text: 'University news & projects' },
      { icon: 'flash', text: 'Quick shortcuts for alumni' },
    ],
  },
  {
    tabName: 'Careers',
    badge: 'TAB 2 OF 4',
    title: 'Careers: Job Board & Hiring',
    emoji: '💼',
    iconActive: 'briefcase',
    iconInactive: 'briefcase-outline',
    color: '#0284C7',
    simpleText: 'Share open job vacancies, find new career opportunities, or hire smart students from your school.',
    points: [
      { icon: 'briefcase', text: 'Browse & post job vacancies' },
      { icon: 'ribbon', text: 'Help junior graduates get hired' },
    ],
  },
  {
    tabName: 'Forum',
    badge: 'TAB 3 OF 4',
    title: 'Forum: Alumni Discussions',
    emoji: '💬',
    iconActive: 'chatbubbles',
    iconInactive: 'chatbubbles-outline',
    color: '#8B5CF6',
    simpleText: 'Catch up with old classmates, exchange industry news, and answer questions from students.',
    points: [
      { icon: 'chatbubbles', text: 'Connect with fellow alumni' },
      { icon: 'bulb', text: 'Share career advice & wisdom' },
    ],
  },
  {
    tabName: 'Events',
    badge: 'TAB 4 OF 4',
    title: 'Events: Reunions & Talks',
    emoji: '📅',
    iconActive: 'calendar',
    iconInactive: 'calendar-outline',
    color: '#F59E0B',
    simpleText: 'Join alumni homecomings, industry workshops, and guest lectures hosted by your school.',
    points: [
      { icon: 'people', text: 'Alumni reunions & dinners' },
      { icon: 'mic', text: 'Live webinars & tech talks' },
    ],
  },
];

export function AppTutorialModal({ userId, forceOpen = false, onClose }: AppTutorialModalProps) {
  const { colors, spacing, isDark } = useTheme();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = user?.role === 'alumni' ? ALUMNI_STEPS : STUDENT_STEPS;

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
    if (currentStep < steps.length - 1) {
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

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

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
          radius={26}
          padded={false}
          style={{
            width: '100%',
            maxWidth: 440,
            overflow: 'hidden',
            backgroundColor: isDark ? '#0F1A30' : '#FFFFFF',
            borderWidth: 1.5,
            borderColor: colors.border,
          }}
        >
          {/* Top Banner with Close Button */}
          <View
            style={{
              paddingTop: spacing.lg,
              paddingBottom: spacing.sm,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Badge label={step.badge} tone="brand" />

            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              style={{
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
          </View>

          {/* Body Content */}
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            {/* Visual Interactive Bottom Bar Mockup */}
            <View
              style={{
                marginTop: spacing.xs,
                marginBottom: spacing.md,
                padding: spacing.xs,
                borderRadius: 20,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <AppText
                variant="caption"
                tone="secondary"
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: '600',
                  marginBottom: 6,
                  letterSpacing: 0.5,
                }}
              >
                👇 BOTTOM NAVIGATION BAR
              </AppText>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  backgroundColor: isDark ? '#0A1326' : '#F1F5F9',
                  borderRadius: 16,
                  paddingVertical: 7,
                  paddingHorizontal: 6,
                }}
              >
                {steps.map((s, idx) => {
                  const isActive = idx === currentStep;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        haptics.light();
                        setCurrentStep(idx);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingVertical: 6,
                        paddingHorizontal: isActive ? 12 : 8,
                        borderRadius: 12,
                        backgroundColor: isActive ? s.color : 'transparent',
                      }}
                    >
                      <Ionicons
                        name={isActive ? s.iconActive : s.iconInactive}
                        size={18}
                        color={isActive ? '#FFFFFF' : colors.textSecondary}
                      />
                      {isActive && (
                        <AppText
                          weight="bold"
                          tone="inverse"
                          style={{ fontSize: 12 }}
                        >
                          {s.tabName}
                        </AppText>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Big Friendly Hero Icon */}
            <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: `${step.color}18`,
                  borderWidth: 2,
                  borderColor: `${step.color}45`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={step.iconActive} size={36} color={step.color} />
              </View>
            </View>

            {/* Title & Short Kid-Friendly Description */}
            <AppText
              variant="h2"
              weight="bold"
              style={{
                textAlign: 'center',
                marginBottom: 6,
                fontSize: 19,
                lineHeight: 25,
              }}
            >
              {step.title}
            </AppText>

            <AppText
              tone="secondary"
              style={{
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
                marginBottom: spacing.md,
              }}
            >
              {step.simpleText}
            </AppText>

            {/* 2 Simple Feature Badges */}
            <View style={{ gap: 8, marginBottom: spacing.md }}>
              {step.points.map((pt, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  }}
                >
                  <Ionicons name={pt.icon} size={18} color={step.color} />
                  <AppText weight="medium" style={{ fontSize: 13, flex: 1 }}>
                    {pt.text}
                  </AppText>
                </View>
              ))}
            </View>

            {/* Dots Indicator */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
                marginBottom: spacing.md,
              }}
            >
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === currentStep ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === currentStep ? step.color : colors.border,
                  }}
                />
              ))}
            </View>

            {/* Buttons */}
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

              <View style={{ flex: 1.6 }}>
                <AppButton
                  label={isLast ? 'Got it! 🎉' : 'Next Tab 👉'}
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
