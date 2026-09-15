import React, { useState } from'react';
import { ScrollView, View, Pressable, Alert } from'react-native';
import { router } from'expo-router';
import { useQuery } from'@tanstack/react-query';
import { Image } from'expo-image';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { SolidCard } from'@/components/SolidCard';
import { GlassCard } from'@/components/GlassCard';
import { AppText } from'@/components/AppText';
import { AppButton } from'@/components/AppButton';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { HealthMetricBar } from'@/components/HealthMetricBar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { CampusWeatherWidget } from '@/components/CampusWeatherWidget';
import { CampusRadioPlayer } from '@/components/CampusRadioPlayer';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';
import { getMyProfile } from '@/api/profile';
import { ManageResourcesModal } from '@/components/admin/ManageResourcesModal';
import { haptics } from '@/utils/haptics';

export default function AdminDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop, isWideDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const { data: profile } = useQuery({ queryKey: ['profile', 'me', user?.id], queryFn: () => getMyProfile(user!), enabled: !!user });
  const { data: openReports } = useQuery({ queryKey: ['reports', 'open'], queryFn: () => listReports({ status: 'open' }) });
  const { data: pendingVerifications } = useQuery({ queryKey: ['verifications', 'pending'], queryFn: listVerificationRequests });

  const pendingVerificationsCount = pendingVerifications?.length ?? 0;
  const openReportsCount = openReports?.length ?? 0;

 // Admin Management Modals
 const [resourcesModalOpen, setResourcesModalOpen] = useState(false);

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={isDesktop ? true : false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0 }}
      >
        <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
          {/* Main Left/Center Column */}
          <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
            {/* Admin Control Tower Banner Header */}
            <GlassCard
              radius={24}
              padded={false}
              style={{ marginBottom: spacing.md, overflow: 'hidden' }}
            >
              <View style={{ width: '100%', height: isDesktop ? 160 : 145, position: 'relative' }}>
                <Image
                  source={require('../../assets/images/hero_student_3d.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: isDark ? 'rgba(10, 19, 38, 0.78)' : 'rgba(15, 23, 42, 0.70)' }} />

                <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          flexShrink: 1,
                        }}
                      >
                        <Ionicons name="shield" size={13} color="#FCA5A5" style={heroTextShadowStyle} />
                        <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11, letterSpacing: 0.5, color: '#FCA5A5' }, heroTextShadowStyle]}>
                          ROOT ADMIN
                        </AppText>
                        <AppText variant="caption" tone="inverse" style={[{ opacity: 0.9 }, heroTextShadowStyle]}>
                          • Multi-Campus Hub
                        </AppText>
                      </View>
                    </View>
                    <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22, marginTop: 4 }}>
                      Welcome, {user?.fullName?.split(' ')[0] ?? 'Admin'}
                    </AppText>
                  </View>

                  <Avatar name={user?.fullName ?? 'Root Administrator'} uri={profile?.avatarUrl} size={56} role="admin" />
                </View>
              </View>
            </GlassCard>

            {/* Urgent Administrative Alerts */}
            {(pendingVerificationsCount > 0 || openReportsCount > 0) && (
              <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
                {pendingVerificationsCount > 0 && (
                  <Pressable onPress={() => router.push('/(admin)/verification-requests')}>
                    <GlassCard
                      radius={16}
                      padded={false}
                      contentStyle={{
                        padding: 12,
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.3)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Ionicons name="shield-checkmark" size={20} color="#10B981" />
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodySmall" weight="bold" style={{ color: '#10B981' }}>
                            {pendingVerificationsCount} ID Verification Request{pendingVerificationsCount > 1 ? 's' : ''} Pending
                          </AppText>
                          <AppText variant="caption" tone="secondary" numberOfLines={1}>
                            Review matric credentials and grant verified badges
                          </AppText>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#10B981" />
                    </GlassCard>
                  </Pressable>
                )}

                {openReportsCount > 0 && (
                  <Pressable onPress={() => router.push('/(admin)/moderation-queue')}>
                    <GlassCard
                      radius={16}
                      padded={false}
                      contentStyle={{
                        padding: 12,
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.3)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Ionicons name="flag" size={20} color="#EF4444" />
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodySmall" weight="bold" style={{ color: '#EF4444' }}>
                            {openReportsCount} Content Moderation Flag{openReportsCount > 1 ? 's' : ''} Open
                          </AppText>
                          <AppText variant="caption" tone="secondary" numberOfLines={1}>
                            Review reported student submissions and forum posts
                          </AppText>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#EF4444" />
                    </GlassCard>
                  </Pressable>
                )}
              </View>
            )}

            {/* Multi-Campus Live Weather */}
            {isFeatureEnabled('live_weather') && <CampusWeatherWidget />}

            {/* Live Campus Radio Stream */}
            {isFeatureEnabled('campus_radio') && <CampusRadioPlayer />}

            {/* Official Campus Announcements & Broadcasts */}
            <AnnouncementsWidget scope="global" />

            {/* Administrative Operations & Control Desk */}
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
              Administrative Operations & Controls
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
              Campus verifications, content safety, feature switches, and audit logs
            </AppText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md }}>
              {/* Direct Messages Desk */}
              {isFeatureEnabled('e2ee_messaging') && (
                <Pressable
                  onPress={() => {
                    haptics.light();
                    router.push('/(admin)/messages');
                  }}
                  style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
                >
                  <GlassCard
                    radius={18}
                    padded={false}
                    contentStyle={{
                      padding: 12,
                      height: 118,
                      justifyContent: 'space-between',
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textSecondary} />
                    <View style={{ minWidth: 0 }}>
                      <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                        Direct Messages
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                        Student & staff chat
                      </AppText>
                    </View>
                  </GlassCard>
                </Pressable>
              )}

              {/* 1. ID Verifications */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/verification-requests');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
                    {pendingVerificationsCount > 0 ? (
                      <Badge label={`${pendingVerificationsCount} pending`} tone="warning" />
                    ) : (
                      <Badge label="Cleared" tone="success" />
                    )}
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      ID Verifications
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Matric & alumni IDs
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 2. Moderation Queue */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/moderation-queue');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={22} color="#EF4444" />
                    {openReportsCount > 0 ? (
                      <Badge label={`${openReportsCount} flags`} tone="critical" />
                    ) : (
                      <Badge label="Safe" tone="success" />
                    )}
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Moderation Queue
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Reported campus content
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 3. Feature Switches */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/feature-controls');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="options-outline" size={22} color={colors.textSecondary} />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Feature Switches
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Toggle campus modules
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 4. User Directory */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/user-directory');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="people-outline" size={22} color="#8B5CF6" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      User Directory
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Manage all accounts
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 5. Command Desk & Alerts */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/platform-config');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Command Desk
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      System params & alerts
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 6. Security Audit Logs */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/audit-logs');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="key-outline" size={22} color="#F59E0B" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Security Audit
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Forensic activity logs
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 7. Academic Resources */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  setResourcesModalOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="folder-open-outline" size={22} color={colors.brandAccent} />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Academic Resources
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Past papers & notes
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 8. Events Hub & Gatherings */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/events-list' as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="calendar-outline" size={22} color="#EC4899" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Events Hub
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Campus events & summits
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 9. Super Admin System Configuration */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/super-admin-config');
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="construct-outline" size={22} color="#3B82F6" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      System Config
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Multi-tenant & security
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 9. Support & Ticket Desk */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/support-desk' as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="help-buoy-outline" size={22} color="#06B6D4" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Support Desk
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Triage & 1-click remedies
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 10. Unified Content Desk */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/content-desk' as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="layers-outline" size={22} color="#8B5CF6" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Content Desk
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Global posts & media
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 11. Forum Hub & Official Threads */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/forum' as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Ionicons name="chatbubbles-outline" size={22} color={colors.textSecondary} />
                    <Badge label="+ New Thread" tone="neutral" />
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      Forum
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Post official threads & polls
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>

              {/* 11. System Health Console */}
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push('/(admin)/system-health' as any);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 160 : '47%' }}
              >
                <GlassCard
                  radius={18}
                  padded={false}
                  contentStyle={{
                    padding: 12,
                    height: 118,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="pulse-outline" size={22} color="#10B981" />
                  <View style={{ minWidth: 0 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                      System Health
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                      Live ping & sync cleanup
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            </View>
          </View>

          {/* Right Sticky Column on Desktop */}
          {isDesktop && (
            <View style={{ width: isWideDesktop ? 340 : 280, flexShrink: 0, gap: spacing.md }}>
              {/* Primary Admin Workdesk Actions */}
              <GlassCard radius={20} padded={false} contentStyle={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Executive Workdesk
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  <Pressable
                    onPress={() => {
                      haptics.light();
                      router.push('/(admin)/platform-config');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, borderWidth: 1, borderColor: `${colors.brandPrimary}40`, gap: 8 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                      <Ionicons name="settings" size={20} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" variant="bodySmall" tone="brand" numberOfLines={1}>Admin Desk & Broadcast</AppText>
                        <AppText tone="secondary" variant="caption" numberOfLines={1}>System params & alerts</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      haptics.light();
                      router.push('/(admin)/moderation-queue');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', borderWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)', gap: 8 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                      <Ionicons name="shield-half" size={20} color={colors.critical} style={{ flexShrink: 0 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" variant="bodySmall" numberOfLines={1}>Moderation Queue</AppText>
                        <AppText tone="secondary" variant="caption" numberOfLines={1}>Content review & reports</AppText>
                      </View>
                    </View>
                    {(openReports?.length ?? 0) > 0 ? (
                      <View style={{ backgroundColor: colors.critical, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, flexShrink: 0 }}>
                        <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                          {openReports?.length} new
                        </AppText>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                    )}
                  </Pressable>
                </View>
              </GlassCard>

              {/* Quick Admin Tools */}
              <GlassCard radius={20} padded={false} contentStyle={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Administration Tools
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  {[
                    { icon: 'help-buoy-outline' as const, label: 'Support & Ticket Desk', desc: '1-click user issue remediation', route: '/(admin)/support-desk' },
                    { icon: 'layers-outline' as const, label: 'Unified Content Desk', desc: 'Manage discussions & resources', route: '/(admin)/content-desk' },
                    { icon: 'pulse-outline' as const, label: 'Database & System Health', desc: 'Live ping & integrity sync', route: '/(admin)/system-health' },
                    { icon: 'people-outline' as const, label: 'User Directory', desc: 'Browse and edit campus members', route: '/(admin)/user-directory' },
                    { icon: 'checkmark-done-circle-outline' as const, label: 'Student Verifications', desc: 'Review pending ID submissions', route: '/(admin)/verification-requests' },
                    { icon: 'list-outline' as const, label: 'Security Audit Logs', desc: 'Immutable compliance trail', route: '/(admin)/audit-logs' },
                    { icon: 'toggle-outline' as const, label: 'Feature Flags', desc: 'Toggle modules & features', route: '/(admin)/feature-controls' },
                  ].map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={() => {
                        haptics.light();
                        router.push(item.route as any);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', borderWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)', gap: 8 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                        <Ionicons name={item.icon} size={18} color={colors.textPrimary} style={{ flexShrink: 0 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText weight="bold" variant="bodySmall" numberOfLines={1}>{item.label}</AppText>
                          <AppText tone="secondary" variant="caption" numberOfLines={1}>{item.desc}</AppText>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                    </Pressable>
                  ))}
                </View>
              </GlassCard>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Admin Entities Modals */}
      <ManageResourcesModal visible={resourcesModalOpen} onClose={() => setResourcesModalOpen(false)} />
    </ScreenContainer>
  );
}
