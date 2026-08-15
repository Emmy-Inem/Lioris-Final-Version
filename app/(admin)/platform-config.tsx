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
import { AnalyticsTab } from'@/components/admin/AnalyticsTab';
import { ForumsModerationTab } from'@/components/admin/ForumsModerationTab';
import { EventsModerationTab } from'@/components/admin/EventsModerationTab';
import { LocalHubControlTab } from'@/components/admin/LocalHubControlTab';
import { UserProfilesTab } from'@/components/admin/UserProfilesTab';
import { ResourcesModerationTab } from'@/components/admin/ResourcesModerationTab';
import { ApprovalsModerationTab } from'@/components/admin/ApprovalsModerationTab';
import { ManagePortalLinksModal } from'@/components/admin/ManagePortalLinksModal';
import { useTheme } from'@/theme/ThemeProvider';
import { LAUNCH_INSTITUTIONS } from'@/api/institutions';
import { listReports } from'@/api/moderation';
import { listVerificationRequests } from'@/api/verification';
import { createNotification } from'@/api/notifications';
import { recordAuditLogEntry } from'@/api/auditLog';
import { haptics } from'@/utils/haptics';

const WORKDESK_TABS = ['Analytics', 'Flags', 'User Profiles', 'Utility Hub', 'Forums', 'Events', 'Resources', 'Approvals'] as const;
const PREVIEW_ROLES = ['Default (Admin)', 'Student', 'Staff', 'Alumni', 'Admin'];
const SCOPE_OPTIONS = ['All Campuses', ...LAUNCH_INSTITUTIONS.map((inst) => inst.name)];

export default function PlatformConfigScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof WORKDESK_TABS)[number]>('Analytics');
  const [institution, setInstitution] = useState(SCOPE_OPTIONS[0]);
  const [institutionPickerOpen, setInstitutionPickerOpen] = useState(false);
  const [portalLinksModalOpen, setPortalLinksModalOpen] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);

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
      title: ` ${broadcastTitle.trim()}`,
      body: broadcastBody.trim(),
      deepLinkPath: '/(student)/dashboard',
    });

    recordAuditLogEntry({
      action: 'escrow_funds_released',
      summary: `Broadcast Flash Alert sent: "${broadcastTitle}"to ${broadcastTarget.toUpperCase()}`,
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
    <ScreenContainer glow={true}>
      <AppHeader />

      {/* Unified Main ScrollView for entire Admin Desk */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        {/* Page Title & Badges */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppText variant="h1"weight="bold">
              Staff & Admin Workdesk
            </AppText>
            <AppText tone="secondary">Centralized university moderation, live nodes & control tower</AppText>
          </View>
          <Badge label="Lioris Root Admin"tone="critical" />
        </View>

        {/* Active Workspace Scope Frosted Card */}
        <SolidCard
          frosted
          style={{
            marginBottom: spacing.lg,
            backgroundColor: colors.pastelPrimaryBg,
            borderColor: `${colors.brandPrimary}30`,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="school-outline"size={16} color={colors.brandPrimary} />
            <AppText weight="bold"tone="brand">
              Active Campus Workspace Scope
            </AppText>
          </View>
          <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
            Configures which university network data you view, edit, and moderate globally.
          </AppText>
          <Pressable
            onPress={() => setInstitutionPickerOpen((v) => !v)}
            accessibilityRole="button"accessibilityLabel={`Campus workspace scope: ${institution}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary }} />
              <AppText weight="semiBold">{institution}</AppText>
            </View>
            <Ionicons name="chevron-down"size={16} color={colors.textSecondary} />
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
                  accessibilityRole="radio"accessibilityState={{ checked: inst === institution }}
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
        </SolidCard>

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
            icon="checkmark-circle-outline"label="Verify Credentials"description="Review uploaded files"badge={String(pendingVerifications?.length ?? 0)}
            onPress={() => router.push('/(admin)/verification-requests')}
          />
        </View>

        {/* Super Admin Config Banner */}
        <Pressable
          onPress={() => {
            haptics.light();
            router.push('/(admin)/super-admin-config');
          }}
          accessibilityRole="button"accessibilityLabel="Open Super Admin Configuration"
        >
          <GlassCard
            style={{ marginBottom: spacing.lg }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.pastelPrimaryBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="construct"size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold"variant="bodySmall">Super Admin Configuration</AppText>
                <AppText tone="secondary"variant="caption">
                  Multi-tenant federation, escrow payouts, biometrics & root settings
                </AppText>
              </View>
              <Ionicons name="chevron-forward"size={18} color={colors.textSecondary} />
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
                accessibilityRole="tab"accessibilityState={{ selected }}
                accessibilityLabel={t}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.brandPrimary : colors.pastelPrimaryBg,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption"weight="bold"tone={selected ? 'inverse' : 'brand'}>
                  {t}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Active Tab Content (Rendered directly in unified scroll flow) */}
        <View style={{ minHeight: 200 }}>
          {tab === 'Analytics' ? <AnalyticsTab /> : null}
          {tab === 'Flags' ? (
            <ModerationQueue
              institutionCode={institution === 'All Campuses' ? undefined : LAUNCH_INSTITUTIONS.find((i) => i.name === institution)?.code}
              emptyTitle={institution === 'All Campuses' ? 'Queue is clear' : `${institution} queue is clear`}
            />
          ) : null}
          {tab === 'User Profiles' ? <UserProfilesTab /> : null}
          {tab === 'Utility Hub' ? <LocalHubControlTab /> : null}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="megaphone-outline"size={20} color={colors.critical} />
                <AppText variant="h3"weight="bold">
                  Broadcast Flash Alert
                </AppText>
              </View>
              <Pressable onPress={() => setBroadcastModalOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
              Immediately delivers a high-priority push notification and sticky banner across the selected student network.
            </AppText>

            <ScrollView showsVerticalScrollIndicator={false}>
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
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"accessibilityLabel={`${label}. ${description}${badge ? `. ${badge}` : ''}`}
      style={{ flex: 1, minWidth: '47%' }}
    >
      <SolidCard radius={18} frosted style={{ minHeight: 110, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.pastelPrimaryBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={18} color={colors.brandPrimary} />
          </View>
          {badge ? (
            <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
              <AppText variant="caption"weight="bold"tone="brand"style={{ fontSize: 10 }}>
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <View>
          <AppText weight="bold"variant="bodySmall">
            {label}
          </AppText>
          <AppText tone="secondary"variant="caption"numberOfLines={1}>
            {description}
          </AppText>
        </View>
      </SolidCard>
    </Pressable>
  );
}
