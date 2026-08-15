import React, { useState } from'react';
import { Alert, Pressable, ScrollView, Switch, View } from'react-native';
import { router } from'expo-router';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { AppButton } from'@/components/AppButton';
import { AdminConfigModal } from'@/components/AdminConfigModal';
import {
  AddUniversityWizardContent,
  DomainAuthorityModalContent,
  XpMultiplierModalContent,
  LevelBadgesModalContent,
  SeasonalLeaderboardsModalContent,
  EscrowConfigModalContent,
  CloudStorageModalContent,
  ToxicityThresholdsModalContent,
  GlobalPushNotificationModalContent,
} from'@/components/admin/ConfigModals';
import { PaymentGatewayModalContent, WebrtcKeysModalContent, AiKeysModalContent } from'@/components/admin/SecureConfigModals';
import { LegacyVaultModalContent, ImpersonatorModalContent } from'@/components/admin/HighRiskModals';
import { recordAuditLogEntry } from'@/api/auditLog';
import { useTheme } from'@/theme/ThemeProvider';

type ModalKey =
  | 'addUniversity'
  | 'domainAuthority'
  | 'tenantToggles'
  | 'xpMultiplier'
  | 'levelBadges'
  | 'seasonalLeaderboards'
  | 'paymentGateway'
  | 'escrowConfig'
  | 'legacyVault'
  | 'webrtcKeys'
  | 'aiKeys'
  | 'toxicityThresholds'
  | 'cloudStorage'
  | 'globalPush'
  | 'impersonator'
  | null;

export default function SuperAdminConfigScreen() {
  const { colors, spacing } = useTheme();
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [mockDataVisible, setMockDataVisible] = useState(true);

  function confirmMaintenanceMode(next: boolean) {
    if (!next) {
      setMaintenanceMode(false);
      return;
    }
    Alert.alert(
      'Enable Maintenance Mode?',
      'This forces the entire platform offline and disables all database writes for every user, immediately. This is not reversible without another manual toggle.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable', style: 'destructive', onPress: () => setMaintenanceMode(true) },
      ],
    );
  }

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <AppText variant="h1"weight="bold"style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
        Super Admin Configuration 
      </AppText>
      <AppText tone="secondary"style={{ marginBottom: spacing.md }}>
        Root-level platform parameters — changes here apply across every campus workspace.
      </AppText>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        <Section number={1} title="Multi-Tenant & University Management"emoji="">
          <Row
            title="Add/Register New University"description="Setup wizard to create new campus instances."actionLabel="New Node"onPress={() => setActiveModal('addUniversity')}
          />
          <Row
            title="Domain Authority Binding"description="Whitelist official email domains (e.g. @ui.edu.ng) for verification."actionLabel="Manage"onPress={() => setActiveModal('domainAuthority')}
          />
          <Row
            title="Tenant Feature Toggles"description="Enable/disable modules per university."actionLabel="Configure"onPress={() => setActiveModal('tenantToggles')}
            last
          />
        </Section>

        <Section number={2} title="Global Identity & Role Access"emoji="">
          <Row
            title="Global User Directory"description="Master database of all users across nodes."actionLabel="View"onPress={() => router.push('/(admin)/user-directory')}
            last
          />
        </Section>

        <Section number={3} title="Gamification & XP Rules"emoji="">
          <ToggleRow
            title="Enable Gamification System"description="Hides/shows the XP levels, active streaks, login score metrics & reward leaderboards across the workspace."value={gamificationEnabled}
            onValueChange={setGamificationEnabled}
          />
          <Row
            title="Global XP Multiplier"description="Set system-wide XP multipliers for active engagement."actionLabel="Configure"onPress={() => setActiveModal('xpMultiplier')}
            disabled={!gamificationEnabled}
          />
          <Row
            title="Manage Level Badges"description="Upload or configure level-up badge designs."actionLabel="Manage"onPress={() => setActiveModal('levelBadges')}
            disabled={!gamificationEnabled}
            last
          />
        </Section>

        <Section number={4} title="Financial Infrastructure & Escrow"emoji="">
          <Row
            title="Payment Gateway API Manager"description="Secure Live/Test keys for Paystack/Flutterwave."actionLabel="Keys"onPress={() => setActiveModal('paymentGateway')}
          />
          <Row
            title="Marketplace Escrow Configurations"description="Holding periods and refund processors."actionLabel="Escrow"onPress={() => setActiveModal('escrowConfig')}
          />
          <Row
            title="Legacy Giving Vault"description="Monitor alumni donations & authorize disbursements."actionLabel="Vault"tone="critical"onPress={() => setActiveModal('legacyVault')}
            last
          />
        </Section>

        <Section number={5} title="Third-Party API & Integration"emoji="🔌">
          <Row
            title="WebRTC/Video SDK Keys"description="ZegoCloud/Agora Audio/Video Call provider keys."actionLabel="Manage"onPress={() => setActiveModal('webrtcKeys')}
          />
          <Row
            title="AI Service Keys"description="OpenAI / Gemini integration keys."actionLabel="Manage"onPress={() => setActiveModal('aiKeys')}
            last
          />
        </Section>

        <Section number={6} title="Cybersecurity & Ecosystem Safety"emoji="">
          <Row
            title="Moderation & Admin Action Log"description="Every resolved report, event takedown, verification decision, and high-risk action — who, when, and why."actionLabel="View Log"onPress={() => router.push('/(admin)/moderation-audit-log')}
          />
          <Row
            title="E2EE Cryptography Audit Logs"description="Track Web Crypto API key rotation and flag handshake failures."actionLabel="Audits"onPress={() => router.push('/(admin)/audit-logs')}
          />
          <Row
            title="Automated Toxicity Thresholds"description="AI moderation sensitivity scoring metrics."actionLabel="Metrics"onPress={() => setActiveModal('toxicityThresholds')}
            last
          />
        </Section>

        <Section number={7} title="Storage, Media, & Data Analytics"emoji="">
          <Row
            title="Cloud Storage Limits"description="Limits for AWS/GCP to prevent ballooning server costs."actionLabel="Storage"onPress={() => setActiveModal('cloudStorage')}
          />
          <Row
            title="University Pulse Analytics"description="Global DAU/MAU and Marketplace volume."actionLabel="Pulse"tone="critical"onPress={() => router.push('/(admin)/pulse-analytics')}
            last
          />
        </Section>

        <Section number={8} title="Developer, QA, & Maintenance"emoji="🔧">
          <Row
            title="Universal'Preview As'Tool"description="Inject session to view app as specific Student/Admin."actionLabel="Preview"onPress={() =>
              Alert.alert('Preview As', 'Use the"Preview As"selector on the main Workdesk screen to switch the active role label.')
            }
          />
          <Row
            title="Role Impersonator"description="Support shadow-login into a real user session, time-boxed and audit-logged."actionLabel="Impersonate"tone="critical"onPress={() => setActiveModal('impersonator')}
          />
          <ToggleRow
            title="Maintenance Mode Kill Switch"description="Force offline mode & disable DB writes."value={maintenanceMode}
            onValueChange={confirmMaintenanceMode}
            titleTone="critical"
          />
          <ToggleRow
            title="Mock Data Visibility & Setup"description="Toggle the visibility of seed datasets across the platform for testing."value={mockDataVisible}
            onValueChange={setMockDataVisible}
            last
          />
        </Section>

        <Section number={9} title="Global Communications"emoji="🎙️">
          <Row
            title="Global Push Notifications"description="Send mandatory, un-dismissible full-screen alerts to ALL users."actionLabel="Broadcast"tone="critical"onPress={() => setActiveModal('globalPush')}
            last
          />
        </Section>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <AdminConfigModal visible={activeModal === 'addUniversity'} onClose={() => setActiveModal(null)} title="Add University">
        <AddUniversityWizardContent onComplete={() => setActiveModal(null)} />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'domainAuthority'}
        onClose={() => setActiveModal(null)}
        title="Domain Authority Binding"
        description="Whitelist official email domains controlling automated verification."
        confirmLabel="Synchronize"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'domain_authority_updated',
            summary: 'Synchronized campus email domain authority rules',
            targetType: 'platform_config',
            targetId: 'domain-authority',
          });
          Alert.alert('Domain Authority Updated', 'Whitelisted university domains synchronized and logged.');
        }}
      >
        <DomainAuthorityModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'tenantToggles'}
        onClose={() => setActiveModal(null)}
        title="Tenant Feature Toggles"
        description="Enable or disable individual modules per university tenant."
        confirmLabel="Save"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'tenant_toggles_updated',
            summary: 'Updated per-tenant feature modules and access controls',
            targetType: 'platform_config',
            targetId: 'tenant-modules',
          });
          Alert.alert('Tenant Modules Saved', 'University module toggles updated.');
        }}
      >
        <AppText tone="secondary" variant="bodySmall">
          Per-tenant module toggles (Marketplace, Study Groups, Mentorship, etc.) would list here
          once a specific university is selected in the Workspace Scope card above.
        </AppText>
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'xpMultiplier'}
        onClose={() => setActiveModal(null)}
        title="XP Multiplier"
        confirmLabel="Apply"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'xp_multiplier_updated',
            summary: 'Updated global XP engagement multipliers',
            targetType: 'platform_config',
            targetId: 'gamification-xp',
          });
          Alert.alert('XP Multiplier Applied', 'Global engagement multipliers updated.');
        }}
      >
        <XpMultiplierModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'levelBadges'}
        onClose={() => setActiveModal(null)}
        title="Levels & Badges"
        confirmLabel="Save"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'level_badges_updated',
            summary: 'Configured level badge tiers and visual assets',
            targetType: 'platform_config',
            targetId: 'level-badges',
          });
          Alert.alert('Badges Saved', 'Level milestones and badge criteria updated.');
        }}
      >
        <LevelBadgesModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'seasonalLeaderboards'}
        onClose={() => setActiveModal(null)}
        title="Seasonal Leaderboards"
        confirmLabel="Deploy season"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'seasonal_leaderboard_deployed',
            summary: 'Deployed new seasonal leaderboard cohort across active campuses',
            targetType: 'platform_config',
            targetId: 'seasonal-leaderboards',
          });
          Alert.alert('Season Deployed', 'New leaderboard season is now live for all universities.');
        }}
      >
        <SeasonalLeaderboardsModalContent />
      </AdminConfigModal>
      <AdminConfigModal visible={activeModal === 'paymentGateway'} onClose={() => setActiveModal(null)} title="Payment Gateway">
        <PaymentGatewayModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'escrowConfig'}
        onClose={() => setActiveModal(null)}
        title="Marketplace Escrow Configuration"
        confirmLabel="Save escrow logic"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'escrow_config_updated',
            summary: 'Updated marketplace escrow hold durations and fee rules',
            targetType: 'platform_config',
            targetId: 'marketplace-escrow',
          });
          Alert.alert('Escrow Saved', 'Marketplace escrow parameters saved — logged to audit trail.');
        }}
      >
        <EscrowConfigModalContent />
      </AdminConfigModal>
      <AdminConfigModal visible={activeModal === 'legacyVault'} onClose={() => setActiveModal(null)} title="Legacy Giving Vault">
        <LegacyVaultModalContent
          onReleased={async (amount) => {
            await recordAuditLogEntry({
              action: 'escrow_funds_released',
              summary: `Force-released $${amount.toFixed(2)} in escrowed funds to cold storage`,
              targetType: 'escrow',
              targetId: 'global-escrow',
              reason: 'Typed CONFIRM in Legacy Giving Vault',
            });
            Alert.alert('Released', 'Funds released — action logged to audit trail.');
          }}
        />
      </AdminConfigModal>
      <AdminConfigModal visible={activeModal === 'webrtcKeys'} onClose={() => setActiveModal(null)} title="Video SDK Keys">
        <WebrtcKeysModalContent />
      </AdminConfigModal>
      <AdminConfigModal visible={activeModal === 'aiKeys'} onClose={() => setActiveModal(null)} title="AI Service Routing">
        <AiKeysModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'toxicityThresholds'}
        onClose={() => setActiveModal(null)}
        title="Automated Toxicity Thresholds"
        confirmLabel="Deploy"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'toxicity_thresholds_deployed',
            summary: 'Deployed updated automated toxicity & profanity moderation thresholds',
            targetType: 'platform_config',
            targetId: 'moderation-ai',
          });
          Alert.alert('Thresholds Deployed', 'AI content moderation filter thresholds deployed.');
        }}
      >
        <ToxicityThresholdsModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'cloudStorage'}
        onClose={() => setActiveModal(null)}
        title="Cloud Storage Limits"
        confirmLabel="Enforce limits"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'storage_quotas_enforced',
            summary: 'Enforced file size and cloud storage quotas per student tier',
            targetType: 'platform_config',
            targetId: 'cloud-storage',
          });
          Alert.alert('Limits Enforced', 'Cloud storage quotas and bandwidth limits enforced.');
        }}
      >
        <CloudStorageModalContent />
      </AdminConfigModal>
      <AdminConfigModal
        visible={activeModal === 'globalPush'}
        onClose={() => setActiveModal(null)}
        title="Global Push Notification Composer"
        confirmLabel="Dispatch"
        onConfirm={async () => {
          await recordAuditLogEntry({
            action: 'global_push_broadcast',
            summary: 'Dispatched emergency global push notification broadcast to all registered devices',
            targetType: 'notifications',
            targetId: 'global-broadcast',
          });
          const { createNotification } = await import('@/api/notifications');
          createNotification({
            type: 'system_announcement',
            title: 'Campus Announcement',
            body: 'A global institutional update has been broadcasted by Platform Administration.',
          });
          Alert.alert('Push Broadcast Dispatched', 'Push notification dispatched and logged to audit trail.');
        }}
      >
        <GlobalPushNotificationModalContent />
      </AdminConfigModal>
      <AdminConfigModal visible={activeModal === 'impersonator'} onClose={() => setActiveModal(null)} title="Role Impersonator">
        <ImpersonatorModalContent
          onStart={async (targetUid, reason) => {
            await recordAuditLogEntry({
              action: 'impersonation_started',
              summary: `Started a shadow session as user ${targetUid}`,
              targetType: 'user',
              targetId: targetUid,
              reason,
            });
            Alert.alert('Session started', 'Shadow session active for 15 minutes — logged to audit trail.');
          }}
        />
      </AdminConfigModal>
    </ScreenContainer>
  );
}

function Section({ number, title, emoji, children }: { number: number; title: string; emoji: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.md }}>
        {number}. {title} {emoji}
      </AppText>
      <SolidCard>{children}</SolidCard>
    </View>
  );
}

function Row({
  title,
  description,
  actionLabel,
  onPress,
  tone,
  disabled,
  last,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
  tone?: 'critical';
  disabled?: boolean;
  last?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <AppText weight="bold"variant="bodySmall">
          {title}
        </AppText>
        <AppText tone="secondary"variant="caption">
          {description}
        </AppText>
      </View>
      <AppButton label={actionLabel} variant={tone === 'critical' ? 'accent' : 'primary'} onPress={onPress} disabled={disabled} />
    </View>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  titleTone,
  last,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  titleTone?: 'critical';
  last?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <AppText weight="bold"variant="bodySmall"style={titleTone === 'critical' ? { color: colors.critical } : undefined}>
          {title}
        </AppText>
        <AppText tone="secondary"variant="caption">
          {description}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
    </View>
  );
}
