import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { GlassCard } from '@/components/GlassCard';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { ADMIN_GROUPS } from '@/components/admin/adminNav';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { getMyProfile } from '@/api/profile';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

/**
 * Admin > Overview. A read-only summary: what needs attention right now, and one card for each of
 * the four working areas. It never repeats what those areas do - it just gets you into them.
 */
const HUB_DESCRIPTIONS: Record<string, string> = {
  people: 'Members, ID verification and support tickets',
  content: 'Threads, events, resources and comments',
  safety: 'Reports, copyright takedowns and the audit log',
  platform: 'Broadcasts, feature switches, campuses and health',
};

export default function AdminOverviewScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const badges = useAdminBadges();

  const { data: profile } = useQuery({ queryKey: ['profile', 'me', user?.id], queryFn: () => getMyProfile(user!), enabled: !!user });
  const { data: memberCount } = useQuery({
    queryKey: ['admin', 'member-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const attention = [
    { key: 'verification', label: 'ID verifications to review', count: badges.verification, icon: 'checkmark-circle-outline' as const, tint: '#10B981', route: '/(admin)/verification-requests' },
    { key: 'reports', label: 'Open reports', count: badges.reports, icon: 'flag-outline' as const, tint: colors.critical, route: '/(admin)/moderation-queue' },
    { key: 'takedowns', label: 'Copyright takedown requests', count: badges.takedowns, icon: 'document-lock-outline' as const, tint: '#F59E0B', route: '/(admin)/takedown-requests' },
    { key: 'support', label: 'Open support tickets', count: badges.support, icon: 'help-buoy-outline' as const, tint: '#06B6D4', route: '/(admin)/support-desk' },
  ].filter((row) => row.count > 0);

  const hubs = ADMIN_GROUPS.filter((group) => group.key !== 'overview');

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={isDesktop}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0, gap: spacing.lg }}
      >
        {/* Welcome */}
        <GlassCard radius={24} padded={false} style={{ overflow: 'hidden' }}>
          <View style={{ width: '100%', height: isDesktop ? 150 : 130, position: 'relative' }}>
            <Image source={require('../../assets/images/hero_student_3d.jpg')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: isDark ? 'rgba(10, 19, 38, 0.78)' : 'rgba(15, 23, 42, 0.70)' }} />
            <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield" size={13} color="#FCA5A5" style={heroTextShadowStyle} />
                  <AppText variant="caption" weight="bold" style={[{ fontSize: 11, letterSpacing: 0.5, color: '#FCA5A5' }, heroTextShadowStyle]}>
                    ROOT ADMIN
                  </AppText>
                </View>
                <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22, marginTop: 4 }}>
                  Welcome, {user?.fullName?.split(' ')[0] ?? 'Admin'}
                </AppText>
                <AppText variant="caption" tone="inverse" style={[{ opacity: 0.9, marginTop: 2 }, heroTextShadowStyle]}>
                  {memberCount != null ? `${memberCount.toLocaleString()} members across all campuses` : 'Multi-campus hub'}
                </AppText>
              </View>
              <Avatar name={user?.fullName ?? 'Root Administrator'} uri={profile?.avatarUrl} size={56} role="admin" />
            </View>
          </View>
        </GlassCard>

        {/* Needs attention */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h3" weight="bold">Needs attention</AppText>
          {attention.length === 0 ? (
            <SolidCard radius={18} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <AppText tone="secondary" style={{ flex: 1 }}>
                All clear - no verifications, reports, takedowns or tickets are waiting.
              </AppText>
            </SolidCard>
          ) : (
            attention.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={`${row.count} ${row.label}`}
                onPress={() => {
                  haptics.light();
                  router.push(row.route as any);
                }}
              >
                <SolidCard
                  radius={18}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: `${row.tint}55` }}
                >
                  <View
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${row.tint}22`, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={row.icon} size={20} color={row.tint} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold">{row.count} {row.label}</AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </SolidCard>
              </Pressable>
            ))
          )}
        </View>

        {/* The four working areas */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h3" weight="bold">Manage</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {hubs.map((group) => (
              <Pressable
                key={group.key}
                accessibilityRole="button"
                accessibilityLabel={`${group.label}. ${HUB_DESCRIPTIONS[group.key]}`}
                onPress={() => {
                  haptics.light();
                  router.push(group.sections[0].route as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 200 : '47%' }}
              >
                <GlassCard radius={18} padded={false} contentStyle={{ padding: spacing.md, minHeight: 128, justifyContent: 'space-between', gap: spacing.sm }}>
                  <View
                    style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={group.icon} size={20} color={colors.brandPrimary} />
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold">{group.label}</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2, lineHeight: 15 }}>
                      {HUB_DESCRIPTIONS[group.key]}
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Bulletins the platform is showing to members */}
        {isFeatureEnabled('campus_announcements') ? <AnnouncementsWidget scope="global" /> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
