import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { haptics } from '@/utils/haptics';

interface FeatureHighlight {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}

const MAJOR_FEATURES: FeatureHighlight[] = [
  {
    title: 'Academic Library & Past Questions',
    description: 'Verified past questions, curated course notes, and departmental study materials with real campus solutions.',
    icon: 'library-outline',
    accent: '#2563EB',
  },
  {
    title: 'Campus Discussion Spaces',
    description: 'Course-specific forums and peer communities to ask questions, share announcements, and engage with classmates.',
    icon: 'chatbubbles-outline',
    accent: '#10B981',
  },
  {
    title: 'Campus Events & Student Network',
    description: 'Academic workshops, campus seminars, student gatherings, and direct connections to alumni and campus peers.',
    icon: 'calendar-outline',
    accent: '#F59E0B',
  },
];

export default function GetStartedScreen() {
  const { spacing, colors, radius } = useTheme();
  const { user, refreshUser } = useAuth();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/get-started');
  const { completeOnboarding } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const isAlumni = user?.role === 'alumni';
  const firstName = user?.fullName?.split(' ')[0] || 'Campus Member';

  async function handleFinish() {
    haptics.medium();
    const isAcademic = user?.role === 'student' || user?.role === 'alumni';
    let currentCampus = user?.campusCode;
    let currentDept = user?.department;

    if (isAcademic && (!currentCampus || currentCampus === 'GLOBAL' || !currentDept)) {
      // Re-check database directly before bouncing to prevent false infinite loops
      const refreshed = await refreshUser();
      currentCampus = refreshed?.campusCode;
      currentDept = refreshed?.department;
    }

    if (isAcademic && (!currentCampus || currentCampus === 'GLOBAL' || !currentDept)) {
      router.replace('/(auth)/onboarding/build-profile');
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding();
      const dest = user?.role === 'alumni' ? '/(alumni)/dashboard' : '/(student)/dashboard';
      router.replace(dest as any);
    } catch {
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/get-started"
      title={`Welcome aboard, ${firstName}!`}
      subtitle={
        isAlumni
          ? 'Your verified alumni profile is ready. Here are the core pillars of the Lioris network:'
          : 'Your verified campus account is ready. Explore the 3 major features that power your campus life:'
      }
      footer={
        <AppButton
          label="Enter Campus Dashboard"
          onPress={handleFinish}
          loading={submitting}
          fullWidth
        />
      }
    >
      <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
        {MAJOR_FEATURES.map((feature) => (
          <SolidCard
            key={feature.title}
            frosted
            radius={16}
            style={{
              padding: spacing.md,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Direct, clean vector icon with no shaped wrapper box around it */}
            <View style={{ paddingTop: 2 }}>
              <Ionicons name={feature.icon} size={26} color={feature.accent} />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <AppText weight="bold" variant="body">
                {feature.title}
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                {feature.description}
              </AppText>
            </View>
          </SolidCard>
        ))}
      </View>
    </OnboardingShell>
  );
}
