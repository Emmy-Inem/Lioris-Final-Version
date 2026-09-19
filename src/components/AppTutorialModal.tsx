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

const STORAGE_KEY_PREFIX = 'lioris_nav_walkthrough_';

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
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  simpleText: string;
  points: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}

const STUDENT_STEPS: NavStep[] = [
  {
    tabName: 'Home',
    badge: 'Tab 1 of 4',
    title: 'Home Dashboard',
    iconActive: 'home',
    iconInactive: 'home-outline',
    simpleText: 'Your main screen for daily updates, campus announcements, and quick access to student portals.',
    points: [
      { icon: 'megaphone-outline', text: 'Campus news and announcements' },
      { icon: 'link-outline', text: 'Quick shortcuts to academic portals' },
    ],
  },
  {
    tabName: 'Forum',
    badge: 'Tab 2 of 4',
    title: 'Campus Forum',
    iconActive: 'chatbubbles',
    iconInactive: 'chatbubbles-outline',
    simpleText: 'Discuss academic topics, ask course questions, and connect with students in your department.',
    points: [
      { icon: 'help-circle-outline', text: 'Ask and answer course questions' },
      { icon: 'people-outline', text: 'Department and campus discussions' },
    ],
  },
  {
    tabName: 'Events',
    badge: 'Tab 3 of 4',
    title: 'Campus Events',
    iconActive: 'calendar',
    iconInactive: 'calendar-outline',
    simpleText: 'Discover academic seminars, faculty workshops, and campus activities happening around your school.',
    points: [
      { icon: 'calendar-outline', text: 'Upcoming event dates and schedules' },
      { icon: 'location-outline', text: 'Venues, halls, and session links' },
    ],
  },
  {
    tabName: 'Resources',
    badge: 'Tab 4 of 4',
    title: 'Academic Resources',
    iconActive: 'folder',
    iconInactive: 'folder-outline',
    simpleText: 'Access study materials including past examination papers, lecture modules, and course syllabus notes.',
    points: [
      { icon: 'document-text-outline', text: 'Past examination question archives' },
      { icon: 'download-outline', text: 'Lecture handouts and study notes' },
    ],
  },
];

const ALUMNI_STEPS: NavStep[] = [
  {
    tabName: 'Home',
    badge: 'Tab 1 of 4',
    title: 'Alumni Dashboard',
    iconActive: 'home',
    iconInactive: 'home-outline',
    simpleText: 'Your main dashboard to stay connected with your university, campus initiatives, and alumni news.',
    points: [
      { icon: 'school-outline', text: 'University news and initiatives' },
      { icon: 'apps-outline', text: 'Quick alumni workspace tools' },
    ],
  },
  {
    tabName: 'Careers',
    badge: 'Tab 2 of 4',
    title: 'Career Board',
    iconActive: 'briefcase',
    iconInactive: 'briefcase-outline',
    simpleText: 'Browse open opportunities, share job vacancies, and recruit graduates from your alma mater.',
    points: [
      { icon: 'briefcase-outline', text: 'Browse and post job vacancies' },
      { icon: 'ribbon-outline', text: 'Support fresh graduates with employment' },
    ],
  },
  {
    tabName: 'Forum',
    badge: 'Tab 3 of 4',
    title: 'Alumni Forum',
    iconActive: 'chatbubbles',
    iconInactive: 'chatbubbles-outline',
    simpleText: 'Network with fellow graduates, discuss industry trends, and share professional guidance.',
    points: [
      { icon: 'chatbubbles-outline', text: 'Professional alumni discussions' },
      { icon: 'bulb-outline', text: 'Industry experience and guidance' },
    ],
  },
  {
    tabName: 'Events',
    badge: 'Tab 4 of 4',
    title: 'Alumni Events',
    iconActive: 'calendar',
    iconInactive: 'calendar-outline',
    simpleText: 'Attend alumni reunions, homecoming gatherings, and professional development sessions.',
    points: [
      { icon: 'people-outline', text: 'Reunions and networking dinners' },
      { icon: 'mic-outline', text: 'Webinars and keynote lectures' },
    ],
  },
];

export function AppTutorialModal({ userId, forceOpen = false, onClose }: AppTutorialModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
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
          radius={24}
          padded={false}
          style={{
            width: '100%',
            maxWidth: 420,
            overflow: 'hidden',
            backgroundColor: isDark ? '#0F1A30' : '#FFFFFF',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Header Row with Badge & Close */}
          <View
            style={{
              paddingTop: spacing.md,
              paddingBottom: spacing.xs,
              paddingHorizontal: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Badge label={step.badge} tone="brand" />

            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close navigation guide"
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Body Content */}
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
            {/* Standard Bottom Bar Replica */}
            <View
              style={{
                marginTop: spacing.xs,
                marginBottom: spacing.md,
                padding: spacing.xs,
                borderRadius: 18,
                backgroundColor: isDark ? '#0A1326' : '#F1F5F9',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <AppText
                variant="caption"
                tone="secondary"
                style={{
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: '600',
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                BOTTOM NAVIGATION
              </AppText>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                  borderRadius: 14,
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={s.tabName}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingVertical: 6,
                        paddingHorizontal: isActive ? 10 : 7,
                        borderRadius: 10,
                        backgroundColor: isActive ? colors.brandPrimary : 'transparent',
                      }}
                    >
                      <Ionicons
                        name={isActive ? s.iconActive : s.iconInactive}
                        size={17}
                        color={isActive ? '#FFFFFF' : colors.textSecondary}
                      />
                      {isActive && (
                        <AppText
                          variant="caption"
                          weight="bold"
                          tone="inverse"
                          style={{ fontSize: 11 }}
                        >
                          {s.tabName}
                        </AppText>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Clean Standard Icon */}
            <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={step.iconActive} size={26} color={colors.brandPrimary} />
              </View>
            </View>

            {/* Title & Concise Description */}
            <AppText
              variant="h3"
              weight="bold"
              style={{
                textAlign: 'center',
                marginBottom: 4,
              }}
            >
              {step.title}
            </AppText>

            <AppText
              variant="bodySmall"
              tone="secondary"
              style={{
                textAlign: 'center',
                lineHeight: 19,
                marginBottom: spacing.md,
              }}
            >
              {step.simpleText}
            </AppText>

            {/* Feature Bullet Rows */}
            <View style={{ gap: 6, marginBottom: spacing.md }}>
              {step.points.map((pt, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons name={pt.icon} size={16} color={colors.brandPrimary} />
                  <AppText variant="bodySmall" weight="medium" style={{ flex: 1 }}>
                    {pt.text}
                  </AppText>
                </View>
              ))}
            </View>

            {/* Pagination Dots */}
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
                    width: i === currentStep ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
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

              <View style={{ flex: 1.5 }}>
                <AppButton
                  label={isLast ? 'Done' : 'Next'}
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
