import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { SolidCard } from'@/components/SolidCard';
import { GlassCard } from'@/components/GlassCard';
import { Badge } from'@/components/Badge';
import { ModerationQueue } from'@/components/ModerationQueue';
import { ForumsModerationTab } from'@/components/admin/ForumsModerationTab';
import { EventsModerationTab } from'@/components/admin/EventsModerationTab';
import { UserProfilesTab } from'@/components/admin/UserProfilesTab';
import { ResourcesModerationTab } from'@/components/admin/ResourcesModerationTab';
import { ApprovalsModerationTab } from'@/components/admin/ApprovalsModerationTab';
import { FeatureFlagsTab } from '@/components/admin/FeatureFlagsTab';
import { ManagePortalLinksModal } from '@/components/admin/ManagePortalLinksModal';
import { LiquidGlassCustomizerModal } from '@/components/admin/LiquidGlassCustomizerModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';
import { createNotification } from '@/api/notifications';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

const WORKDESK_TABS = ['Feature Flags', 'User Profiles', 'Forums', 'Events', 'Resources', 'Approvals'] as const;
const SCOPE_OPTIONS = ['All Campuses', ...LAUNCH_INSTITUTIONS.filter((inst) => inst.code !== 'GLOBAL').map((inst) => inst.name)];

export default function PlatformConfigScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user, switchRole } = useAuth();
  const isSuperAdmin = user?.actualRole === 'admin';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof WORKDESK_TABS)[number]>('Feature Flags');
  const [institution, setInstitution] = useState(SCOPE_OPTIONS[0]);
  const [institutionPickerOpen, setInstitutionPickerOpen] = useState(false);
  const [portalLinksModalOpen, setPortalLinksModalOpen] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [liquidGlassModalOpen, setLiquidGlassModalOpen] = useState(false);

  // Broadcast Alert Form State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'ui' | 'unilag' | 'cs_department'>('all');
  const [broadcastPriority, setBroadcastPriority] = useState<'high' | 'critical' | 'normal'>('high');

  const { data: openReports } = useQuery({ queryKey: ['reports', 'open', 'all'], queryFn: () => listReports({ status: 'open' }) });
  const { data: pendingVerifications } = useQuery({ queryKey: ['verification-requests'], queryFn: listVerificationRequests });

  function handleSendBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    haptics.medium();

    createNotification({
      type: 'announcement',
      title: broadcastTitle.trim(),
      body: broadcastBody.trim(),
      deepLinkPath: '/(student)/dashboard',
    });

    recordAuditLogEntry({
      action: 'global_push_broadcast',
      summary: `Broadcast Flash Alert sent: "${broadcastTitle}" to ${broadcastTarget.toUpperCase()}`,
      targetType: 'user',
      targetId: 'broadcast-flash',
      reason: `Audience: ${broadcastTarget}, Priority: ${broadcastPriority}`,
    });

    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setBroadcastModalOpen(false);
    setBroadcastTitle('');
    setBroadcastBody('');
    Alert.alert('Broadcast Dispatched', 'Push notification and in-app flash banner delivered to campus network.');
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      {/* Unified Main ScrollView for entire Admin Desk */}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        {/* Page Title & Badges */}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'flex-start' : 'flex-start', marginTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.md, gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, flexWrap: 'wrap' }}>
              <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                Staff & Admin Workdesk
              </AppText>
              <Badge label="Lioris Root Admin" tone="critical" />
            </View>
            <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>
              Centralized university moderation, live nodes & control tower
            </AppText>
          </View>
        </View>

        {/* Preview Workspace As Role Switcher - Root Admins only, see isSuperAdmin above */}
        {isSuperAdmin && (
        <GlassCard
          radius={20}
          padded={false}
          contentStyle={{
            padding: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="eye-outline" size={16} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand">
                Preview Workspace As Role
              </AppText>
            </View>
            <Badge label={`Current: ${user?.role?.toUpperCase() || 'ADMIN'}`} tone="brand" />
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Jump into any user perspective to inspect features, student workflows, and faculty desks.
          </AppText>

          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {[
              { role: 'student', label: 'Student Portal', path: '/(student)/dashboard' },
              { role: 'staff', label: 'Faculty Staff', path: '/(staff)/dashboard' },
              { role: 'alumni', label: 'Alumni Fellow', path: '/(alumni)/dashboard' },
              { role: 'admin', label: 'Root Admin', path: '/(admin)/platform-config' },
            ].map((r) => {
              const active = user?.role === r.role;
              return (
                <Pressable
                  key={r.role}
                  onPress={async () => {
                    haptics.medium();
                    await switchRole(r.role as any);
                    queryClient.clear();
                    router.replace(r.path as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${r.label}`}
                  style={{
                    flex: 1,
                    minWidth: '47%',
                    backgroundColor: active ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.70)',
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.sm,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: active ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                    marginBottom: 4,
                  }}
                >
                  <AppText variant="bodySmall" weight="bold" tone={active ? 'inverse' : 'brand'}>
                    {r.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>
        )}

        {/* Active Workspace Scope Frosted Card */}
        <GlassCard
          radius={20}
          padded={false}
          contentStyle={{
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="school-outline" size={16} color={colors.brandPrimary} />
            <AppText weight="bold" tone="brand">
              Active Campus Workspace Scope
            </AppText>
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            Configures which university network data you view, edit, and moderate globally.
          </AppText>
          <Pressable
            onPress={() => setInstitutionPickerOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Campus workspace scope: ${institution}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.70)',
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary }} />
              <AppText weight="semiBold">{institution}</AppText>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
          {institutionPickerOpen ? (
            <View style={{ marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
              {SCOPE_OPTIONS.map((inst) => (
                <Pressable
                  key={inst}
                  onPress={() => {
                    setInstitution(inst);
                    setInstitutionPickerOpen(false);
                    haptics.light();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: inst === institution }}
                  accessibilityLabel={inst}
                  style={{
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radius.sm,
                    backgroundColor: inst === institution ? colors.pastelPrimaryBg : 'transparent',
                  }}
                >
                  <AppText weight={inst === institution ? 'bold' : 'regular'} tone={inst === institution ? 'brand' : 'primary'}>
                    {inst}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </GlassCard>

 {/* Quick Ecosystem Action Tiles */}
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
 <EcosystemTile
 icon="megaphone-outline"label="Broadcast Flash Alert"description="Push alert to students"badge="Live Push"onPress={() => setBroadcastModalOpen(true)}
 />
 <EcosystemTile
 icon="link-outline"label="Manage Portal Links"description="Configure UI & bookmarks"onPress={() => setPortalLinksModalOpen(true)}
 />
 <EcosystemTile
 icon="people-outline"label="Ecosystem Nodes"description="Registered accounts"badge="7"onPress={() => router.push('/(admin)/user-directory')}
 />
 <EcosystemTile
 icon="shield-outline"label="Ecosystem Safety"description="Moderation & Reports"badge={`${openReports?.length ?? 0} Pending`}
 onPress={() => router.push('/(admin)/moderation-queue')}
 />
 <EcosystemTile
 icon="color-wand-outline"
 label="Liquid Glass Studio"
 description="iOS 26 glass refraction"
 badge="Live Tuning"
 onPress={() => setLiquidGlassModalOpen(true)}
 />
 <EcosystemTile
 icon="checkmark-circle-outline"label="Verify Credentials"description="Review uploaded files"badge={String(pendingVerifications?.length ?? 0)}
 onPress={() => router.push('/(admin)/verification-requests')}
 />
 </View>

  {/* Feature Controls & Kill Switches Banner */}
  <Pressable
    onPress={() => {
      haptics.light();
      router.push('/(admin)/feature-controls');
    }}
    accessibilityRole="button"
    accessibilityLabel="Open Feature Controls and Kill Switches"
  >
    <GlassCard
      radius={18}
      padded={false}
      contentStyle={{
        padding: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${colors.brandPrimary}20`,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: `${colors.brandPrimary}40`,
          }}
        >
          <Ionicons name="options-outline" size={22} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText weight="bold" variant="bodySmall">Feature Controls & Kill Switches</AppText>
            <Badge label="Runtime Modular" tone="brand" />
          </View>
          <AppText tone="secondary" variant="caption">
            Temporarily toggle XP gamification, career page, marketplace, utility cards & more
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.brandPrimary} />
      </View>
    </GlassCard>
  </Pressable>

  {/* Super Admin Config Banner */}
  <Pressable
    onPress={() => {
      haptics.light();
      router.push('/(admin)/super-admin-config');
    }}
    accessibilityRole="button"
    accessibilityLabel="Open Super Admin Configuration"
  >
    <GlassCard
      radius={18}
      padded={false}
      contentStyle={{
        padding: spacing.md,
        marginBottom: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${colors.brandPrimary}20`,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: `${colors.brandPrimary}40`,
          }}
        >
          <Ionicons name="construct" size={22} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" variant="bodySmall">Super Admin Configuration</AppText>
          <AppText tone="secondary" variant="caption">
            Multi-tenant federation, escrow payouts, biometrics & root settings
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </GlassCard>
  </Pressable>

  {/* Workdesk Tabs Horizontal Selector */}
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ gap: spacing.md, paddingHorizontal: 2 }}
    style={{ marginBottom: spacing.lg }}
  >
    {WORKDESK_TABS.map((t) => {
      const selected = tab === t;
      return (
        <Pressable
          key={t}
          onPress={() => {
            haptics.light();
            setTab(t);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          accessibilityLabel={t}
          style={{
            paddingVertical: 8,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.70)',
            borderWidth: 1,
            borderColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.85)',
          }}
        >
          <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'brand'}>
            {t}
          </AppText>
        </Pressable>
      );
    })}
  </ScrollView>

        <View style={{ minHeight: 200 }}>
          {tab === 'Feature Flags' ? <FeatureFlagsTab /> : null}
          {tab === 'User Profiles' ? <UserProfilesTab /> : null}
 {tab === 'Forums' ? <ForumsModerationTab /> : null}
 {tab === 'Events' ? <EventsModerationTab /> : null}
 {tab === 'Resources' ? <ResourcesModerationTab /> : null}
 {tab === 'Approvals' ? <ApprovalsModerationTab /> : null}
 </View>
 </ScrollView>

 {/* Portal Links Modal */}
 <ManagePortalLinksModal
 visible={portalLinksModalOpen}
 onClose={() => setPortalLinksModalOpen(false)}
 />

 {/* Broadcast Flash Alert Modal */}
 <Modal visible={broadcastModalOpen} transparent animationType="slide"onRequestClose={() => setBroadcastModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setBroadcastModalOpen(false)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
 <View style={{ flexShrink: 0 }}>
 <Ionicons name="megaphone-outline"size={20} color={colors.critical} />
 </View>
 <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
 Broadcast Flash Alert
 </AppText>
 </View>
 <Pressable onPress={() => setBroadcastModalOpen(false)} hitSlop={8} style={{ flexShrink: 0 }}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Immediately delivers a high-priority push notification and sticky banner across the selected student network.
 </AppText>

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
 TARGET AUDIENCE
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
 {[
 { key: 'all', label: 'All Campuses' },
 { key: 'ui', label: 'University of Ibadan (UI)' },
 { key: 'unilag', label: 'UNILAG Node' },
 { key: 'cs_department', label: 'Computer Science Dept' },
 ].map((item) => (
 <Pressable
 key={item.key}
 onPress={() => setBroadcastTarget(item.key as any)}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 7,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: broadcastTarget === item.key ? colors.brandPrimary : colors.border,
 backgroundColor: broadcastTarget === item.key ? colors.pastelPrimaryBg : colors.surface,
 }}
 >
 <AppText variant="caption"weight="bold"tone={broadcastTarget === item.key ? 'brand' : 'secondary'}>
 {item.label}
 </AppText>
 </Pressable>
 ))}
 </View>

 <AppTextField
 label="Alert Headline / Title"placeholder="e.g. Senate Exam Timetable Revision or Campus Clinic Advisory"value={broadcastTitle}
 onChangeText={setBroadcastTitle}
 />

 <AppTextField
 label="Message Body"placeholder="Provide details, action required, or venue updates..."value={broadcastBody}
 onChangeText={setBroadcastBody}
 multiline
 numberOfLines={4}
 />
 </ScrollView>

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setBroadcastModalOpen(false)} />
 <AppButton
 label="Dispatch Flash Alert"onPress={handleSendBroadcast}
 disabled={!broadcastTitle.trim() || !broadcastBody.trim()}
 />
 </View>
 </View>
 </View>
 </Modal>

      <LiquidGlassCustomizerModal
        visible={liquidGlassModalOpen}
        onClose={() => setLiquidGlassModalOpen(false)}
      />
 </ScreenContainer>
 );
}

function EcosystemTile({
 icon,
 label,
 description,
 badge,
 onPress,
}: {
 icon: keyof typeof Ionicons.glyphMap;
 label: string;
 description: string;
 badge?: string;
 onPress: () => void;
}) {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 return (
 <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}${badge ? `. ${badge}` : ''}`}
      style={{ flexGrow: 1, flexBasis: isDesktop ? 0 : '47%', minWidth: isDesktop ? 220 : '47%' }}
    >
      <GlassCard
        radius={18}
        padded={false}
        contentStyle={{
          minHeight: isDesktop ? 110 : 100,
          justifyContent: 'space-between',
          padding: isDesktop ? spacing.lg : 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.xs }}>
          <Ionicons name={icon} size={22} color={colors.brandPrimary} />
          {badge ? (
            <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0, maxWidth: 90 }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 9.5 }} numberOfLines={1}>
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ fontSize: 13 }}>
            {label}
          </AppText>
          <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 11, marginTop: 1 }}>
            {description}
          </AppText>
        </View>
      </GlassCard>
    </Pressable>
  );
}
