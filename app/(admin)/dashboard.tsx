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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getPlatformHealthSummary } from '@/api/analytics';
import { listReports } from '@/api/moderation';
import { ManageCoursesModal } from '@/components/admin/ManageCoursesModal';
import { ManageResourcesModal } from '@/components/admin/ManageResourcesModal';
import { ManageDirectoryModal } from '@/components/admin/ManageDirectoryModal';
import { haptics } from '@/utils/haptics';

export default function AdminDashboard() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const { data: health } = useQuery({ queryKey: ['analytics', 'health'], queryFn: getPlatformHealthSummary });
 const { data: openReports } = useQuery({ queryKey: ['reports', 'open'], queryFn: () => listReports({ status: 'open' }) });

 // Admin Management Modals
 const [coursesModalOpen, setCoursesModalOpen] = useState(false);
 const [resourcesModalOpen, setResourcesModalOpen] = useState(false);
 const [directoryModalOpen, setDirectoryModalOpen] = useState(false);

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0 }}
      >
        <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
          {/* Main Left/Center Column */}
          <View style={isDesktop ? { flex: 1 } : undefined}>
            {/* Admin Control Tower Banner Header */}
            <View style={{ marginBottom: spacing.md, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface }}>
              <View style={{ width: '100%', height: isDesktop ? 160 : 145, position: 'relative' }}>
                <Image
                  source={require('../../assets/images/hero_student_3d.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 19, 38, 0.82)' }} />

                <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11, letterSpacing: 0.5, color: '#FCA5A5' }}>
                        ROOT ADMIN
                      </AppText>
                      <AppText variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
                        • Multi-Campus Hub
                      </AppText>
                    </View>
                    <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22 }}>
                      Welcome, {user?.fullName?.split(' ')[0] ?? 'Admin'}
                    </AppText>
                    <AppText variant="caption" tone="inverse" style={{ opacity: 0.85, marginTop: 2 }}>
                      System Health 99.98% | All services operational
                    </AppText>
                  </View>

                  <Avatar name={user?.fullName ?? 'Root Administrator'} size={56} role="admin" />
                </View>
              </View>
            </View>

            {/* Live Multi-Campus Nodes Status Bar */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md }}>
              {[
                { code: 'UI', label: 'Ibadan', status: 'Healthy' },
                { code: 'UNILAG', label: 'Lagos', status: 'Healthy' },
                { code: 'OAU', label: 'Ife', status: 'Healthy' },
                { code: 'FUNAAB', label: 'Abeokuta', status: 'Healthy' },
              ].map((node) => (
                <SolidCard
                  key={node.code}
                  frosted
                  padded={false}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: 'center',
                    borderRadius: 14,
                  }}
                >
                  <AppText variant="caption" weight="bold">
                    {node.code}
                  </AppText>
                  <AppText tone="secondary" style={{ fontSize: 9, marginTop: 1 }}>
                    {node.status}
                  </AppText>
                </SolidCard>
              ))}
            </View>

            {/* Official Campus Announcements & Broadcasts */}
            <AnnouncementsWidget scope="global" />

            {/* Academic & Platform Entity Management Hub */}
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
              Content & Entity Management
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
              Manage courses, resources, directory profiles and cover media
            </AppText>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md, justifyContent: 'space-between' }}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setCoursesModalOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 200 : 140 }}
              >
                <SolidCard
                  frosted
                  style={{
                    borderRadius: 18,
                    padding: 12,
                    backgroundColor: colors.surface,
                    height: 115,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="book-outline" size={20} color={colors.brandPrimary} />
                  <View>
                    <AppText weight="bold" variant="bodySmall">
                      Courses
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2, fontSize: 10 }}>
                      Curriculum & covers
                    </AppText>
                  </View>
                </SolidCard>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setResourcesModalOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 200 : 140 }}
              >
                <SolidCard
                  frosted
                  style={{
                    borderRadius: 18,
                    padding: 12,
                    backgroundColor: colors.surface,
                    height: 115,
                    justifyContent: 'space-between',
                  }}
                >
                  <Ionicons name="folder-open-outline" size={20} color={colors.brandAccent} />
                  <View>
                    <AppText weight="bold" variant="bodySmall">
                      Resources
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2, fontSize: 10 }}>
                      Files & past exams
                    </AppText>
                  </View>
                </SolidCard>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setDirectoryModalOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : ('100%' as any), minWidth: isDesktop ? 200 : undefined }}
              >
                <SolidCard
                  frosted
                  style={{
                    borderRadius: 18,
                    padding: 12,
                    backgroundColor: colors.surface,
                    height: isDesktop ? 115 : 70,
                    flexDirection: isDesktop ? 'column' : 'row',
                    alignItems: isDesktop ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="people-outline" size={20} color="#38BDF8" />
                    <View>
                      <AppText weight="bold" variant="bodySmall">
                        User Directory
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 1, fontSize: 10 }}>
                        Manage campus accounts, roles & avatars
                      </AppText>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </SolidCard>
              </Pressable>
            </View>

            {/* Platform Health Matrix */}
            <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm, marginTop: spacing.sm }}>
              Campus Platform Metrics
            </AppText>
            {health ? (
              <SolidCard frosted style={{ marginBottom: spacing.lg, borderRadius: 20 }}>
                <HealthMetricBar label="Student MAU (target: 60% @ 6mo)" valuePct={health.studentMauPct} greenMin={60} amberMin={40} />
                <HealthMetricBar label="Alumni MAU (target: 30% @ 9mo)" valuePct={health.alumniMauPct} greenMin={30} amberMin={20} />
                <HealthMetricBar label="Event participation" valuePct={health.eventParticipationPct} greenMin={40} amberMin={20} />
                <HealthMetricBar label="Connection activation" valuePct={health.connectionActivationPct} greenMin={25} amberMin={15} />
                <HealthMetricBar label="Notification read rate" valuePct={health.notificationReadRatePct} greenMin={90} amberMin={70} />
                <HealthMetricBar
                  label="Moderation false-positive rate"
                  valuePct={health.moderationFalsePositivePct}
                  greenMin={2}
                  amberMin={5}
                  invert
                />
              </SolidCard>
            ) : null}
          </View>

          {/* Right Sticky Column on Desktop */}
          {isDesktop ? (
            <View style={{ width: 360, gap: spacing.md }}>
              {/* Primary Admin Workdesk Actions */}
              <SolidCard radius={20} style={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Executive Workdesk
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  <Pressable
                    onPress={() => {
                      haptics.light();
                      router.push('/(admin)/platform-config');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, borderWidth: 1, borderColor: `${colors.brandPrimary}40` }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="settings" size={20} color={colors.brandPrimary} />
                      <View>
                        <AppText weight="bold" variant="bodySmall" tone="brand">Admin Desk & Broadcast</AppText>
                        <AppText tone="secondary" variant="caption">System params & alerts</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.brandPrimary} />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      haptics.light();
                      router.push('/(admin)/moderation-queue');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="shield-half" size={20} color={colors.critical} />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Moderation Queue</AppText>
                        <AppText tone="secondary" variant="caption">Content review & reports</AppText>
                      </View>
                    </View>
                    {(openReports?.length ?? 0) > 0 ? (
                      <View style={{ backgroundColor: colors.critical, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                        <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                          {openReports?.length} new
                        </AppText>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    )}
                  </Pressable>
                </View>
              </SolidCard>

              {/* Quick Admin Tools */}
              <SolidCard radius={20} style={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Administration Tools
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  {[
                    { icon: 'people-outline' as const, label: 'User Directory', desc: 'Browse all campus members', route: '/(admin)/user-directory' },
                    { icon: 'checkmark-done-circle-outline' as const, label: 'Student Verifications', desc: 'Review pending ID submissions', route: '/(admin)/verification-requests' },
                    { icon: 'list-outline' as const, label: 'Security Audit Logs', desc: 'Immutable compliance trail', route: '/(admin)/audit-logs' },
                    { icon: 'toggle-outline' as const, label: 'Feature Flags', desc: 'Toggle modules & features', route: '/(admin)/feature-controls' },
                    { icon: 'analytics-outline' as const, label: 'Pulse Analytics', desc: 'Engagement & cohort retention', route: '/(admin)/pulse-analytics' },
                  ].map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={() => {
                        haptics.light();
                        router.push(item.route as any);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Ionicons name={item.icon} size={18} color={colors.textPrimary} />
                        <View>
                          <AppText weight="bold" variant="bodySmall">{item.label}</AppText>
                          <AppText tone="secondary" variant="caption">{item.desc}</AppText>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </Pressable>
                  ))}
                </View>
              </SolidCard>
            </View>
          ) : (
            /* Mobile Quick Action Section */
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md }}>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    router.push('/(admin)/platform-config');
                  }}
                  style={{ flex: 1 }}
                >
                  <SolidCard
                    frosted
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      borderColor: `${colors.brandPrimary}40`,
                      borderRadius: 18,
                    }}
                  >
                    <Ionicons name="settings" size={22} color={colors.brandPrimary} style={{ marginBottom: 4 }} />
                    <AppText weight="bold" variant="bodySmall" tone="brand">
                      Workdesk & Alerts
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Broadcast alerts & system params
                    </AppText>
                  </SolidCard>
                </Pressable>

                <Pressable
                  onPress={() => {
                    haptics.light();
                    router.push('/(admin)/moderation-queue');
                  }}
                  style={{ flex: 1 }}
                >
                  <SolidCard
                    frosted
                    style={{
                      borderRadius: 18,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Ionicons name="shield-half" size={22} color={colors.critical} />
                      {(openReports?.length ?? 0) > 0 && (
                        <View style={{ backgroundColor: colors.critical, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                          <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                            {openReports?.length} pending
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText weight="bold" variant="bodySmall">
                      Moderation Queue
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Content review & reports
                    </AppText>
                  </SolidCard>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                {[
                  { icon: 'people-outline' as const, label: 'Directory', route: '/(admin)/user-directory' },
                  { icon: 'checkmark-done-circle-outline' as const, label: 'Verify IDs', route: '/(admin)/verification-requests' },
                  { icon: 'list-outline' as const, label: 'Audit Logs', route: '/(admin)/audit-logs' },
                  { icon: 'toggle-outline' as const, label: 'Features', route: '/(admin)/feature-controls' },
                ].map((item) => (
                  <Pressable
                    key={item.label}
                    onPress={() => {
                      haptics.light();
                      router.push(item.route as any);
                    }}
                    style={{ flex: 1 }}
                  >
                    <SolidCard
                      frosted
                      padded={false}
                      style={{
                        paddingVertical: 10,
                        borderRadius: 14,
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name={item.icon} size={18} color={colors.textPrimary} style={{ marginBottom: 2 }} />
                      <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
                        {item.label}
                      </AppText>
                    </SolidCard>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Admin Entities Modals */}
      <ManageCoursesModal visible={coursesModalOpen} onClose={() => setCoursesModalOpen(false)} />
      <ManageResourcesModal visible={resourcesModalOpen} onClose={() => setResourcesModalOpen(false)} />
      <ManageDirectoryModal visible={directoryModalOpen} onClose={() => setDirectoryModalOpen(false)} />
    </ScreenContainer>
  );
}
