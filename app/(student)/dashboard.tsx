import React from 'react';
import { ScrollView, View, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';
import { listEvents } from '@/api/events';
import { listDashboardShortcuts, DashboardShortcut } from '@/api/adminShortcuts';

export default function StudentDashboard() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [alertDismissed, setAlertDismissed] = React.useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });
  const { data: events } = useQuery({ queryKey: ['events', 'student'], queryFn: () => listEvents({ scope: 'student' }) });
  const { data: shortcuts } = useQuery({
    queryKey: ['dashboard-shortcuts', 'student'],
    queryFn: () => listDashboardShortcuts('student'),
  });

  const displayName = profile?.username ?? user?.fullName ?? 'there';

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg }}>
        {/* Welcome card — CAMPUS CORE / Student badge / greeting / avatar */}
        <View style={{ marginBottom: spacing.xl, borderRadius: radius.glass, overflow: 'hidden' }}>
          <AuthHeroBackground height={128} radius={radius.glass}>
            <View style={{ flex: 1, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="inverse" style={{ letterSpacing: 1, opacity: 0.85 }}>
                    CAMPUS CORE 🏛️
                  </AppText>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
                    <AppText variant="caption" weight="bold" tone="inverse">
                      Student
                    </AppText>
                  </View>
                </View>
                <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1}>
                  Welcome, {displayName} 👋
                </AppText>
              </View>
              <Avatar name={user?.fullName ?? 'You'} size={64} />
            </View>
          </AuthHeroBackground>
        </View>

        {/* Action Center — Campus Alert */}
        <AppText variant="bodySmall" weight="bold" style={{ color: colors.sectionLabel, letterSpacing: 1, marginBottom: spacing.md }}>
          ACTION CENTER 🎯
        </AppText>
        {!alertDismissed ? (
          <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="megaphone-outline" size={16} color={colors.sectionLabel} />
                <AppText variant="caption" weight="bold" style={{ color: colors.sectionLabel, letterSpacing: 1 }}>
                  CAMPUS ALERT
                </AppText>
              </View>
              <Pressable
                onPress={() => setAlertDismissed(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss campus alert"
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <AppText variant="h3" weight="bold" style={{ color: colors.sectionLabel, marginBottom: 4 }}>
              Lioris Beta Launch
            </AppText>
            <AppText tone="secondary" variant="bodySmall">
              Welcome! Explore the unified student workspace and academic channels.
            </AppText>
          </SolidCard>
        ) : null}        {/* Academic & Comfort Hub — Shortcuts grid */}
        <AppText variant="h2" weight="bold" style={{ marginBottom: spacing.md }}>
          My Shortcuts 🎓
        </AppText>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
          {(shortcuts ?? []).filter((s) => s.active).map((shortcut) => {
            const colorKeys = SHORTCUT_COLOR_MAP[shortcut.iconColor];
            return (
              <ShortcutTile
                key={shortcut.id}
                icon={shortcut.icon as keyof typeof Ionicons.glyphMap}
                bg={colors[colorKeys.bgKey]}
                iconColor={colors[colorKeys.textKey]}
                title={shortcut.title}
                subtitle={shortcut.description}
                subtitleColor={colors[colorKeys.textKey]}
                onPress={() => {
                  const route = resolveShortcutRoute(shortcut.internalAction);
                  if (route) {
                    router.push(route as any);
                  } else {
                    Alert.alert('Not available yet', `${shortcut.title} isn\u2019t built in this preview.`);
                  }
                }}
              />
            );
          })}
        </View>

        {/* Up Next Today */}
        <AppText variant="bodySmall" weight="bold" style={{ color: colors.sectionLabel, letterSpacing: 1, marginBottom: spacing.md }}>
          UP NEXT TODAY 📅
        </AppText>
        <SolidCard style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="calendar-outline" size={20} color={colors.brandPrimary} />
            <AppText weight="bold">No Live Broadcasts Scheduled Today</AppText>
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            There are no live broadcasts or cohort seminars mapped for today on your academic
            line. Check out the Events tab to discover upcoming workshops, hackathons, and
            webinars!
          </AppText>
          <AppButton label="Browse Campus Events 📅" onPress={() => router.push('/(student)/events-list')} />
        </SolidCard>

        {/* Trending Discussions */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <AppText variant="h2" weight="bold">
            Trending Discussions 🔥
          </AppText>
          <AppText weight="bold" style={{ color: colors.brandPrimary }} onPress={() => router.push('/(student)/feed')}>
            Top 3
          </AppText>
        </View>
        <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.brandPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="compass-outline" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="bold" style={{ color: colors.sectionLabel, marginBottom: 4 }}>
                Welcome to Lioris Space 🚀
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Your consolidated campus workspace is currently quiet. Follow these tasks to
                kickstart your academic lifecycle.
              </AppText>
            </View>
          </View>
        </SolidCard>

        {/* Getting Started Tasks */}
        <AppText variant="bodySmall" weight="bold" style={{ color: colors.sectionLabel, letterSpacing: 1, marginBottom: spacing.md }}>
          GETTING STARTED TASKS ✨
        </AppText>
        <SolidCard style={{ marginBottom: spacing.lg }}>
          <GettingStartedRow
            icon="person-outline"
            bg={colors.mintBg}
            iconColor={colors.mintText}
            title="Complete your profile"
            description="Configure your cohort, major and bios to match with campus peers."
            onPress={() => router.push('/(student)/profile' as any)}
          />
          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.md }} />
          <GettingStartedRow
            icon="chatbubbles-outline"
            bg={colors.lavenderBg}
            iconColor={colors.lavenderText}
            title="Join a class forum"
            description="Find your course rooms and introduce yourself to classmates."
            onPress={() => router.push('/(student)/feed' as any)}
          />
        </SolidCard>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function GettingStartedRow({
  icon,
  bg,
  iconColor,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${description}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" variant="bodySmall">
            {title}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {description}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.brandPrimary} />
      </View>
    </Pressable>
  );
}

// Maps admin's `internalAction` (src/api/adminShortcuts.ts) to a real
// screen. Previously this whole connection didn't exist at all — the
// dashboard rendered 4 hardcoded tiles regardless of anything an admin
// configured in the Local Hub Control panel. Some of admin's seeded
// actions ("Fees Portal", a course catalog) don't correspond to any
// screen actually built in Lioris — those get honest "not available
// yet" feedback rather than a silent dead tap.
function resolveShortcutRoute(internalAction: string): string | null {
  switch (internalAction) {
    case 'library':
    case 'courses':
    case 'past_questions':
      return '/(student)/resources';
    case 'timetable':
      return '/(student)/calendar';
    case 'upload_events':
      return '/(student)/events-list';
    default:
      return null;
  }
}

const SHORTCUT_COLOR_MAP: Record<
  DashboardShortcut['iconColor'],
  { bgKey: 'sageBg' | 'roseBg' | 'mintBg' | 'lavenderBg'; textKey: 'sageText' | 'roseText' | 'mintText' | 'lavenderText' }
> = {
  sage: { bgKey: 'sageBg', textKey: 'sageText' },
  rose: { bgKey: 'roseBg', textKey: 'roseText' },
  mint: { bgKey: 'mintBg', textKey: 'mintText' },
  lavender: { bgKey: 'lavenderBg', textKey: 'lavenderText' },
};

function ShortcutTile({
  icon,
  bg,
  iconColor,
  title,
  subtitle,
  subtitleColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  subtitleColor: string;
  onPress: () => void;
}) {
  const { spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      style={{ width: '47%' }}
    >
      <SolidCard backgroundColor={bg} radius={18}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.sm,
            backgroundColor: 'rgba(255,255,255,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.md,
          }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <AppText weight="bold" style={{ marginBottom: 2 }}>
          {title}
        </AppText>
        <AppText variant="caption" weight="semiBold" style={{ color: subtitleColor }}>
          {subtitle}
        </AppText>
      </SolidCard>
    </Pressable>
  );
}
