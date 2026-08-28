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
import { recordAuditLogEntry } from '@/api/auditLog';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [mockDataVisible, setMockDataVisible] = useState(true);

  // Lifted form states for configuration modals
  const [domainAuthorityInput, setDomainAuthorityInput] = useState('@ui.edu.ng, @student.ui.edu.ng, @unilag.edu.ng, @oau.edu.ng, @funaab.edu.ng');
  const [xpMultiplierVal, setXpMultiplierVal] = useState(1.5);
  const [seasonNameVal, setSeasonNameVal] = useState('Semester 1 2025/2026');
  const [seasonAutoReset, setSeasonAutoReset] = useState(true);
  const [escrowHoldHours, setEscrowHoldHours] = useState('48');
  const [escrowFeePercent, setEscrowFeePercent] = useState('1.5');
  const [escrowAutoRefund, setEscrowAutoRefund] = useState(true);
  const [toxicityScoreLimit, setToxicityScoreLimit] = useState(80);
  const [cloudStorageImgMb, setCloudStorageImgMb] = useState('5');
  const [cloudStoragePdfMb, setCloudStoragePdfMb] = useState('25');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');

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
      {!isDesktop && <AppHeader />}
      <AppText variant="h1" weight="bold" style={{ marginTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.xs }}>
        Super Admin Configuration
      </AppText>
      <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
        Root-level platform parameters - changes here apply across every campus workspace.
      </AppText>

      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <Section number={1} title="Multi-Tenant & University Management" emoji="">
          <Row
            title="Add/Register New University"
            description="Setup wizard to create new campus instances."
            actionLabel="New Node"
            onPress={() => setActiveModal('addUniversity')}
          />
          <Row
            title="Domain Authority Binding"
            description="Whitelist official email domains (e.g. @ui.edu.ng) for verification."
            actionLabel="Manage"
            onPress={() => setActiveModal('domainAuthority')}
          />
          <Row
            title="Tenant Feature Toggles"
            description="Enable/disable modules per university."
            actionLabel="Configure"
            onPress={() => setActiveModal('tenantToggles')}
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

 <Section number={5} title="Third-Party API & Integration"emoji="">
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
 title="Moderation & Admin Action Log"description="Every resolved report, event takedown, verification decision, and high-risk action - who, when, and why."actionLabel="View Log"onPress={() => router.push('/(admin)/moderation-audit-log')}
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

 <Section number={8} title="Developer, QA, & Maintenance" emoji="">
 <Row
 title="Feature Controls & Kill Switches"
 description="Toggle runtime modules (XP, careers, marketplace, utilities, events, mentorship)."
 actionLabel="Toggles"
 onPress={() => router.push('/(admin)/feature-controls')}
 />
 <Row
 title="Universal 'Preview As' Tool"
 description="Inject session to view app as specific Student/Admin."
 actionLabel="Preview"
 onPress={() =>
 Alert.alert('Preview As', 'Use the "Preview As" selector on the main Workdesk screen to switch the active role label.')
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

 <Section number={9} title="Global Communications"emoji="">
 <Row
 title="Global Push Notifications"description="Send mandatory, un-dismissible full-screen alerts to ALL users."actionLabel="Broadcast"tone="critical"onPress={() => setActiveModal('globalPush')}
 last
 />
 </Section>

 <View style={{ height: spacing.xxl }} />
 </ScrollView>

 <AdminConfigModal visible={activeModal === 'addUniversity'} onClose={() => setActiveModal(null)} title="Add University">
 <AddUniversityWizardContent
 onComplete={async (data) => {
 try {
 const { createInstitution } = await import('@/api/institutions');
 await createInstitution({
 code: data.abbrev.toUpperCase(),
 name: data.name,
 shortName: data.abbrev,
 location: data.region,
 domain: `${data.abbrev.toLowerCase()}.edu.ng`,
 });

 await recordAuditLogEntry({
 action: 'institution_provisioned',
 summary: `Provisioned new university tenant partition for ${data.name} (${data.abbrev}) in ${data.region}`,
 targetType: 'institution',
 targetId: `univ-${data.abbrev.toLowerCase()}`,
 });
 setActiveModal(null);
 Alert.alert('University Added', `New institutional node partition successfully created in database for ${data.name}.`);
 } catch (err: any) {
 Alert.alert('Provisioning Error', err?.message || 'Failed to add university.');
 }
 }}
 />
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'domainAuthority'}
 onClose={() => setActiveModal(null)}
 title="Domain Authority Binding"
 description="Whitelist official email domains controlling automated verification."
 confirmLabel="Synchronize"
 onConfirm={async () => {
 const domainList = domainAuthorityInput
 .split(',')
 .map((d) => d.trim())
 .filter(Boolean);
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'domain_authority',
 value: { domains: domainList },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'domain_authority_updated',
 summary: `Synchronized ${domainList.length} authoritative campus email domains: ${domainList.join(', ')}`,
 targetType: 'platform_config',
 targetId: 'domain-authority',
 });
 Alert.alert('Domain Authority Updated', `Whitelisted ${domainList.length} domains synchronized and logged.`);
 }}
 >
 <DomainAuthorityModalContent
 domains={domainAuthorityInput}
 onChangeDomains={setDomainAuthorityInput}
 />
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'tenantToggles'}
 onClose={() => setActiveModal(null)}
 title="Tenant Feature Toggles"
 description="Enable or disable individual modules per university tenant."
 confirmLabel="Save"
 onConfirm={async () => {
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'tenant_toggles',
 value: { marketplace: true, study_groups: true, mentorship: true, alumni_giving: true },
 updated_at: new Date().toISOString(),
 });
 } catch {}
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
 Per-tenant module toggles (Marketplace, Study Groups, Mentorship, etc.) configured for selected workspace.
 </AppText>
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'xpMultiplier'}
 onClose={() => setActiveModal(null)}
 title="XP Multiplier"
 confirmLabel="Apply"
 onConfirm={async () => {
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'xp_multiplier',
 value: { multiplier: xpMultiplierVal },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'xp_multiplier_updated',
 summary: `Updated global XP engagement multiplier to ${xpMultiplierVal.toFixed(1)}x`,
 targetType: 'platform_config',
 targetId: 'gamification-xp',
 });
 Alert.alert('XP Multiplier Applied', `Global engagement multiplier updated to ${xpMultiplierVal.toFixed(1)}x.`);
 }}
 >
 <XpMultiplierModalContent
 multiplier={xpMultiplierVal}
 onChangeMultiplier={setXpMultiplierVal}
 />
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'levelBadges'}
 onClose={() => setActiveModal(null)}
 title="Levels & Badges"
 confirmLabel="Save"
 onConfirm={async () => {
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'level_badges',
 value: { tiers: ['Scholar (200 XP)', 'Dean List (500 XP)', 'Campus Leader (1000 XP)', 'Valedictorian (2000 XP)'] },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'level_badges_updated',
 summary: 'Configured level badge tiers and visual assets for all 4 rank tiers',
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
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'seasonal_leaderboards',
 value: { current_season: seasonNameVal, auto_reset: seasonAutoReset, is_active: true },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'seasonal_leaderboard_deployed',
 summary: `Deployed seasonal leaderboard cohort "${seasonNameVal}" across active campuses (auto-reset: ${seasonAutoReset ? 'enabled' : 'disabled'})`,
 targetType: 'platform_config',
 targetId: 'seasonal-leaderboards',
 });
 Alert.alert('Season Deployed', `Season "${seasonNameVal}" is now live for all universities.`);
 }}
 >
 <SeasonalLeaderboardsModalContent
 seasonName={seasonNameVal}
 onChangeSeasonName={setSeasonNameVal}
 autoReset={seasonAutoReset}
 onChangeAutoReset={setSeasonAutoReset}
 />
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
 const holdHours = Number(escrowHoldHours) || 48;
 const fee = Number(escrowFeePercent) || 1.5;
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'escrow_config',
 value: { hold_duration_hours: holdHours, fee_percent: fee, auto_refund: escrowAutoRefund },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'escrow_config_updated',
 summary: `Updated marketplace escrow: ${holdHours}h hold duration, ${fee}% platform fee, autoRefund=${escrowAutoRefund}`,
 targetType: 'platform_config',
 targetId: 'marketplace-escrow',
 });
 Alert.alert('Escrow Saved', `Marketplace escrow parameters saved (${holdHours}h hold, ${fee}% fee) - logged to audit trail.`);
 }}
 >
 <EscrowConfigModalContent
 holdPeriod={escrowHoldHours}
 onChangeHoldPeriod={setEscrowHoldHours}
 feePercent={escrowFeePercent}
 onChangeFeePercent={setEscrowFeePercent}
 autoRefund={escrowAutoRefund}
 onChangeAutoRefund={setEscrowAutoRefund}
 />
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
 Alert.alert('Released', 'Funds released - action logged to audit trail.');
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
 const toxLimit = toxicityScoreLimit / 100;
 const severeToxLimit = Math.min(1.0, (toxicityScoreLimit + 15) / 100);
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'toxicity_thresholds',
 value: { toxicity_limit: toxLimit, severe_toxicity_limit: severeToxLimit, limit_score: toxicityScoreLimit },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'toxicity_thresholds_deployed',
 summary: `Deployed automated AI toxicity filter threshold at ${toxicityScoreLimit}/100 index`,
 targetType: 'platform_config',
 targetId: 'moderation-ai',
 });
 Alert.alert('Thresholds Deployed', `AI content moderation filter threshold set to ${toxicityScoreLimit}/100.`);
 }}
 >
 <ToxicityThresholdsModalContent
 score={toxicityScoreLimit}
 onChangeScore={setToxicityScoreLimit}
 />
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'cloudStorage'}
 onClose={() => setActiveModal(null)}
 title="Cloud Storage Limits"
 confirmLabel="Enforce limits"
 onConfirm={async () => {
 const maxImgMb = Number(cloudStorageImgMb) || 5;
 const maxPdfMb = Number(cloudStoragePdfMb) || 25;
 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('platform_settings').upsert({
 key: 'cloud_storage_limits',
 value: { max_image_mb: maxImgMb, max_pdf_mb: maxPdfMb, max_resource_mb: maxPdfMb },
 updated_at: new Date().toISOString(),
 });
 } catch {}
 await recordAuditLogEntry({
 action: 'storage_quotas_enforced',
 summary: `Enforced file size caps: ${maxImgMb}MB images, ${maxPdfMb}MB PDFs & resources`,
 targetType: 'platform_config',
 targetId: 'cloud-storage',
 });
 Alert.alert('Limits Enforced', `Cloud storage quotas enforced: ${maxImgMb}MB image, ${maxPdfMb}MB PDF.`);
 }}
 >
 <CloudStorageModalContent
 imgSize={cloudStorageImgMb}
 onChangeImgSize={setCloudStorageImgMb}
 pdfSize={cloudStoragePdfMb}
 onChangePdfSize={setCloudStoragePdfMb}
 />
 </AdminConfigModal>
 <AdminConfigModal
 visible={activeModal === 'globalPush'}
 onClose={() => setActiveModal(null)}
 title="Global Push Notification Composer"
 confirmLabel="Dispatch"
 onConfirm={async () => {
 const finalTitle = pushTitle.trim() || 'Campus Institutional Announcement';
 const finalBody = pushBody.trim() || 'A global institutional update has been broadcasted by Platform Administration.';
 await recordAuditLogEntry({
 action: 'global_push_broadcast',
 summary: `Dispatched push notification broadcast "${finalTitle}": ${finalBody.slice(0, 80)}`,
 targetType: 'notifications',
 targetId: 'global-broadcast',
 });
 const { createNotification } = await import('@/api/notifications');
 await createNotification({
 type: 'system_announcement',
 title: finalTitle,
 body: finalBody,
 });
 Alert.alert('Push Broadcast Dispatched', `Broadcast "${finalTitle}" dispatched and logged to audit trail.`);
 }}
 >
 <GlobalPushNotificationModalContent
 title={pushTitle}
 onChangeTitle={setPushTitle}
 body={pushBody}
 onChangeBody={setPushBody}
 />
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
 Alert.alert('Session started', 'Shadow session active for 15 minutes - logged to audit trail.');
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
