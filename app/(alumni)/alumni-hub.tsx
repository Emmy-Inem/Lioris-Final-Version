import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AppTextField } from '@/components/AppTextField';
import { ChipSelect } from '@/components/ChipSelect';
import { Avatar } from '@/components/Avatar';
import { UserTypeBadge } from '@/components/UserTypeBadge';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { searchAlumniDirectory } from '@/api/connections';
import { getMyProfile } from '@/api/profile';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const TABS = ['Overview Hub 📺', 'Member Search 🔍', 'Legacy & Giving 🏆'] as const;
const DEPARTMENTS = ['All Departments', 'Computer Science', 'Mathematics', 'Electrical Engineering'];
const GRAD_YEARS = ['All Years', '2012', '2015', '2018', '2020', '2022'];

export default function AlumniHubScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview Hub 📺');
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.lg, marginBottom: spacing.lg }}>
        <View>
          <AppText variant="h1" weight="bold">
            Alumni Hub
          </AppText>
          <AppText tone="secondary">Welcome, {user?.fullName?.split(' ')[0] ?? 'there'} 👋</AppText>
        </View>
        {profile?.verificationStatus === 'verified' ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#FDF0DA',
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 6,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color="#D97706" />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.lg }}>
        {TABS.map((t) => {
          const selected = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t}
              style={{ paddingBottom: spacing.sm }}
            >
              <AppText
                variant="bodySmall"
                weight={selected ? 'bold' : 'medium'}
                style={{ color: selected ? colors.brandPrimary : colors.textSecondary }}
              >
                {t}
              </AppText>
              {selected ? (
                <View style={{ height: 2, backgroundColor: colors.brandPrimary, marginTop: spacing.sm, borderRadius: 1 }} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'Overview Hub 📺' ? <OverviewHubTab /> : null}
      {tab === 'Member Search 🔍' ? <MemberSearchTab /> : null}
      {tab === 'Legacy & Giving 🏆' ? <LegacyGivingTab /> : null}
    </ScreenContainer>
  );
}

function OverviewHubTab() {
  const { colors, spacing, radius } = useTheme();
  const utilities = [
    {
      icon: 'chatbubbles-outline' as const,
      bg: colors.lavenderBg,
      iconColor: colors.lavenderText,
      title: 'Public Academic Forum',
      description: "Answering student queries & posting career tips",
      onPress: () => router.push('/(alumni)/forum'),
    },
    {
      icon: 'briefcase-outline' as const,
      bg: colors.roseBg,
      iconColor: colors.roseText,
      title: 'External Job Board & Links',
      description: 'Access listings, post jobs, and share internships',
      onPress: () => router.push('/(alumni)/jobs'),
    },
    {
      icon: 'calendar-outline' as const,
      bg: colors.mintBg,
      iconColor: colors.mintText,
      title: 'Alumni Private Events Calendar',
      description: 'Explore private masterclasses & networking calendars',
      onPress: () => router.push('/(alumni)/events'),
    },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SolidCard style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Ionicons name="calendar" size={28} color={colors.brandPrimary} style={{ marginBottom: spacing.sm }} />
        <AppText weight="bold" style={{ marginBottom: 4 }}>
          No Live Sessions Scheduled 📅
        </AppText>
        <AppText tone="secondary" style={{ textAlign: 'center' }}>
          There are no alumni live masterclasses scheduled at this time. Enable 'Sandbox Mock
          Data' toggle under Super Admin configurations if you want to view the interactive
          webinar demo.
        </AppText>
      </SolidCard>

      <AppText variant="h2" weight="bold" style={{ marginBottom: spacing.md }}>
        Simplified Alumni Utilities
      </AppText>
      {utilities.map((u) => (
        <Pressable
          key={u.title}
          onPress={u.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${u.title}. ${u.description}`}
        >
          <SolidCard style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: u.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={u.icon} size={18} color={u.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" variant="bodySmall">
                  {u.title}
                </AppText>
                <AppText tone="secondary" variant="caption">
                  {u.description}
                </AppText>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            </View>
          </SolidCard>
        </Pressable>
      ))}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function MemberSearchTab() {
  const { spacing } = useTheme();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [department, setDepartment] = useState('All Departments');
  const [gradYear, setGradYear] = useState('All Years');

  const { data: members } = useQuery({
    queryKey: ['directory', 'alumni-hub', debouncedQuery, department, gradYear],
    queryFn: () =>
      searchAlumniDirectory({
        q: debouncedQuery || undefined,
        department: department === 'All Departments' ? undefined : department,
        graduationYear: gradYear === 'All Years' ? undefined : Number(gradYear),
      }),
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <AppTextField label="" placeholder="Search members by name or username..." value={query} onChangeText={setQuery} />

      <AppText variant="bodySmall" weight="bold" style={{ marginBottom: spacing.sm }}>
        Select Department:
      </AppText>
      <View style={{ marginBottom: spacing.lg }}>
        <ChipSelect options={DEPARTMENTS} selected={[department]} onToggle={setDepartment} />
      </View>

      <AppText variant="bodySmall" weight="bold" style={{ marginBottom: spacing.sm }}>
        Select Graduation Class:
      </AppText>
      <View style={{ marginBottom: spacing.lg }}>
        <ChipSelect options={GRAD_YEARS} selected={[gradYear]} onToggle={setGradYear} />
      </View>

      {members?.map((member) => (
        <MemberRow key={member.id} name={member.fullName} username={member.id} department={member.industry} gradYear={member.graduationYear} />
      ))}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function MemberRow({
  name,
  username,
  department,
  gradYear,
}: {
  name: string;
  username: string;
  department?: string | null;
  gradYear?: number | null;
}) {
  const { spacing } = useTheme();
  const [connected, setConnected] = useState(false);

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
          <Avatar name={name} size={40} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText weight="bold" variant="bodySmall">
                {name}
              </AppText>
              <UserTypeBadge role="alumni" />
            </View>
            <AppText tone="secondary" variant="caption">
              @{username}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {department ?? 'General'} {'\u00b7'} Class of {gradYear ?? '\u2014'}
            </AppText>
          </View>
        </View>
        <AppButton
          label={connected ? 'Connected' : '+ Connect'}
          variant={connected ? 'secondary' : 'accent'}
          onPress={() => setConnected(true)}
          disabled={connected}
        />
      </View>
    </SolidCard>
  );
}

function LegacyGivingTab() {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SolidCard style={{ marginBottom: spacing.xl }}>
        <AppText weight="bold" style={{ marginBottom: 4 }}>
          Alumni Legacy & Giving Back 🌟
        </AppText>
        <AppText tone="secondary">
          Your participation drives change. Mentor aspiring graduates, sponsor research setups,
          or post placements to unlock verified 'Legacy Sponsor' badges on your profile card.
        </AppText>
      </SolidCard>

      <SolidCard style={{ alignItems: 'center' }}>
        <Ionicons name="trophy" size={28} color={colors.brandPrimary} style={{ marginBottom: spacing.sm }} />
        <AppText weight="bold" style={{ marginBottom: 4 }}>
          No Active Legacy Projects Yet 🏆
        </AppText>
        <AppText tone="secondary" style={{ textAlign: 'center' }}>
          Turn on the 'Sandbox Mock Data' toggle under Super Admin configurations to populate
          active sponsorships and legacy campaigns.
        </AppText>
      </SolidCard>
    </ScrollView>
  );
}
