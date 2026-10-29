import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/GlassCard';
import { SolidCard } from '@/components/SolidCard';
import { AmbassadorBadge } from '@/components/AmbassadorBadge';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile } from '@/api/profile';
import { listCommunities } from '@/api/communities';
import { listEvents } from '@/api/events';

export default function AmbassadorDashboard() {
  const { user } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { campusCode } = useCampusScope();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: profile } = useQuery({ queryKey: ['profile', 'me', user?.id], queryFn: () => getMyProfile(user!), enabled: !!user });
  const { data: communities = [] } = useQuery({ queryKey: ['communities', 'ambassador', campusCode], queryFn: () => listCommunities(campusCode || undefined) });
  const { data: events = [] } = useQuery({ queryKey: ['events', 'ambassador', campusCode], queryFn: () => listEvents({ scope: 'student', campusCode: campusCode || undefined }) });
  const mySpaceProposals = communities.filter((item) => item.createdBy === user?.id);
  const myEvents = events.filter((item) => item.organizerId === user?.id);

  const refresh = async () => {
    setRefreshing(true);
    try { await queryClient.invalidateQueries(); } finally { setRefreshing(false); }
  };

  const quickActions = [
    { label: 'Create discussion space', detail: 'Propose a useful campus community', icon: 'add-circle-outline' as const, href: '/(ambassador)/forum/explore' },
    { label: 'Host a campus event', detail: 'Publish an event for your university', icon: 'calendar-outline' as const, href: '/(ambassador)/events-list' },
    { label: 'Support discussions', detail: 'Welcome students and guide conversations', icon: 'chatbubbles-outline' as const, href: '/(ambassador)/discussions' },
  ];

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: isDesktop ? spacing.lg : spacing.sm, paddingBottom: isDesktop ? 60 : 120, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandPrimary} colors={[colors.brandPrimary]} />}
      >
        <GlassCard radius={22}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 7 }}>
              <AmbassadorBadge label="Campus Ambassador Console" size={13} />
              <AppText weight="bold" style={{ fontSize: isDesktop ? 27 : 22, lineHeight: isDesktop ? 34 : 28 }}>
                Welcome, {profile?.fullName?.split(' ')[0] || user?.fullName?.split(' ')[0] || 'Ambassador'}
              </AppText>
              <AppText tone="secondary" style={{ lineHeight: 21 }}>
                Build useful discussion spaces and campus events for {profile?.institutionName || 'your university'} while keeping your normal student account.
              </AppText>
            </View>
            <Pressable
              onPress={() => router.push('/(ambassador)/student-portal' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surface }}
            >
              <Ionicons name="swap-horizontal" size={17} color={colors.brandPrimary} />
              <AppText weight="bold" variant="bodySmall">Student Portal</AppText>
            </Pressable>
          </View>
        </GlassCard>

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Metric label="My space proposals" value={mySpaceProposals.length} icon="chatbubbles-outline" />
          <Metric label="My campus events" value={myEvents.length} icon="calendar-outline" />
          <Metric label="Approved spaces" value={mySpaceProposals.filter((item) => item.approvalStatus === 'approved').length} icon="checkmark-circle-outline" />
        </View>

        <View style={{ gap: spacing.sm }}>
          <View>
            <AppText weight="bold" style={{ fontSize: 18 }}>Ambassador tools</AppText>
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 3 }}>Campus-scoped tools for student engagement—not Campus Admin controls.</AppText>
          </View>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.sm }}>
            {quickActions.map((action) => (
              <Pressable key={action.label} onPress={() => router.push(action.href as any)} style={{ flex: 1 }}>
                <SolidCard style={{ height: '100%' }}>
                  <View style={{ gap: 9 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={action.icon} size={20} color={colors.brandPrimary} />
                    </View>
                    <AppText weight="bold">{action.label}</AppText>
                    <AppText variant="bodySmall" tone="secondary">{action.detail}</AppText>
                  </View>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        <SolidCard>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText weight="bold">Your access boundary</AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 19 }}>
                You can propose discussion spaces and host campus events. Student verification, account management, moderation queues, role changes and platform settings remain with authorised administrators.
              </AppText>
            </View>
          </View>
        </SolidCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, spacing } = useTheme();
  return (
    <SolidCard style={{ flexGrow: 1, flexBasis: 170 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name={icon} size={21} color={colors.brandPrimary} />
        <View>
          <AppText weight="bold" style={{ fontSize: 22 }}>{value}</AppText>
          <AppText variant="caption" tone="secondary">{label}</AppText>
        </View>
      </View>
    </SolidCard>
  );
}
