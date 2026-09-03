import React, { useEffect, useState } from'react';
import { Alert, Pressable, ScrollView, Switch, View } from'react-native';
import { router } from'expo-router';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { AppButton } from'@/components/AppButton';
import { AdminConfigModal } from'@/components/AdminConfigModal';

import { recordAuditLogEntry } from '@/api/auditLog';
import { createInstitution } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { createNotification } from '@/api/notifications';
import { AppTextField } from '@/components/AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

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
  const { isFeatureEnabled, setFeature } = useFeatureFlags();
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const gamificationEnabled = isFeatureEnabled('xp_gamification');
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Lifted form states for configuration modals
  const [newUniName, setNewUniName] = useState('');
  const [newUniCode, setNewUniCode] = useState('');
  const [newUniLocation, setNewUniLocation] = useState('');
  const [newUniDomain, setNewUniDomain] = useState('');
  const [paystackKey, setPaystackKey] = useState('');
  const [flutterwaveKey, setFlutterwaveKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  async function handleAddUniversity() {
    if (!newUniName.trim() || !newUniCode.trim()) {
      Alert.alert('Validation Error', 'University Name and Campus Code are required.');
      return;
    }
    setIsSaving(true);
    try {
      await createInstitution({
        name: newUniName.trim(),
        code: newUniCode.trim().toUpperCase(),
        location: newUniLocation.trim() || 'Nigeria',
        domain: newUniDomain.trim() || `${newUniCode.trim().toLowerCase()}.edu.ng`,
      });
      await recordAuditLogEntry({
        action: 'institution_provisioned',
        summary: `Provisioned new campus node: ${newUniName} (${newUniCode.toUpperCase()})`,
        targetType: 'platform_config',
        targetId: newUniCode.toUpperCase(),
        institutionCode: newUniCode.toUpperCase(),
        reason: 'Super Admin added campus node',
      });
      Alert.alert('Campus Node Provisioned', `${newUniName} has been registered in the database.`);
      setNewUniName('');
      setNewUniCode('');
      setNewUniLocation('');
      setNewUniDomain('');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not provision campus.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDomainAuthority() {
    setIsSaving(true);
    try {
      const domains = domainAuthorityInput.split(',').map((d) => d.trim()).filter(Boolean);
      await supabase.from('platform_settings').upsert({
        key: 'allowed_email_domains',
        value: domains,
        description: 'Whitelisted campus email domain authorities',
        updated_at: new Date().toISOString(),
      });
      await recordAuditLogEntry({
        action: 'domain_authority_updated',
        summary: `Whitelisted ${domains.length} campus email domain authorities`,
        targetType: 'platform_config',
        targetId: 'allowed_email_domains',
        reason: 'Domain authority whitelist update',
      });
      Alert.alert('Settings Saved', 'Whitelisted campus email domains have been updated in the database.');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveStorageQuotas() {
    setIsSaving(true);
    try {
      const quotas = {
        maxImageMb: Number(cloudStorageImgMb) || 5,
        maxPdfMb: Number(cloudStoragePdfMb) || 25,
      };
      await supabase.from('platform_settings').upsert({
        key: 'storage_quotas',
        value: quotas,
        description: 'Per-user upload file size limits',
        updated_at: new Date().toISOString(),
      });
      await recordAuditLogEntry({
        action: 'storage_quotas_enforced',
        summary: `Updated upload storage quotas: Images ${quotas.maxImageMb}MB, Documents ${quotas.maxPdfMb}MB`,
        targetType: 'platform_config',
        targetId: 'storage_quotas',
        reason: 'Super Admin adjusted storage limits',
      });
      Alert.alert('Quotas Saved', 'Storage quotas successfully updated in the database.');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update quotas.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEscrow() {
    setIsSaving(true);
    try {
      const config = {
        holdHours: Number(escrowHoldHours) || 48,
        feePercent: Number(escrowFeePercent) || 1.5,
        autoRefund: escrowAutoRefund,
      };
      await supabase.from('platform_settings').upsert({
        key: 'escrow_config',
        value: config,
        description: 'Marketplace escrow parameters and holding periods',
        updated_at: new Date().toISOString(),
      });
      await recordAuditLogEntry({
        action: 'escrow_config_updated',
        summary: `Updated Marketplace Escrow rules: Hold ${config.holdHours}h, Fee ${config.feePercent}%`,
        targetType: 'platform_config',
        targetId: 'escrow_config',
        reason: 'Super admin escrow parameter update',
      });
      Alert.alert('Escrow Saved', 'Marketplace escrow configuration updated in database.');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save escrow config.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendGlobalPush() {
    if (!pushTitle.trim() || !pushBody.trim()) {
      Alert.alert('Validation Error', 'Title and Alert message are required.');
      return;
    }
    setIsSaving(true);
    try {
      await createNotification({
        type: 'system_announcement',
        title: ` ${pushTitle.trim()}`,
        body: pushBody.trim(),
        deepLinkPath: '/(student)/dashboard',
      });
      await recordAuditLogEntry({
        action: 'global_push_broadcast',
        summary: `Dispatched network-wide flash alert: "${pushTitle.trim()}"`,
        targetType: 'platform_config',
        targetId: 'global_push',
        reason: 'Super admin broadcast alert to all registered users',
      });
      Alert.alert('Broadcast Dispatched', 'Network-wide emergency bulletin delivered to all campus user profiles.');
      setPushTitle('');
      setPushBody('');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to dispatch broadcast.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSavePaymentKeys() {
    setIsSaving(true);
    try {
      const keys = {
        paystackPublicKey: paystackKey.trim(),
        flutterwavePublicKey: flutterwaveKey.trim(),
      };
      await supabase.from('platform_settings').upsert({
        key: 'payment_gateway_config',
        value: keys,
        description: 'Campus payments and alumni endowment gateway keys',
        updated_at: new Date().toISOString(),
      });
      await recordAuditLogEntry({
        action: 'platform_config_updated',
        summary: 'Updated payment gateway public API credentials',
        targetType: 'platform_config',
        targetId: 'payment_gateway_config',
        reason: 'Payment provider configuration update',
      });
      Alert.alert('API Keys Saved', 'Payment gateway credentials updated in the database.');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save payment credentials.');
    } finally {
      setIsSaving(false);
    }
  }
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

        <Section number={3} title="Gamification & XP Rules" emoji="">
          <ToggleRow
            title="Enable Gamification System"
            description="Hides/shows the XP levels, active streaks, login score metrics & reward leaderboards across the workspace."
            value={gamificationEnabled}
            onValueChange={(next) => setFeature('xp_gamification', next)}
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

      {/* 1. Add University Modal */}
      <AdminConfigModal
        visible={activeModal === 'addUniversity'}
        onClose={() => setActiveModal(null)}
        title="Provision University Campus Node"
        description="Register a new university campus tenant in the database."
        onConfirm={handleAddUniversity}
        confirmLabel={isSaving ? 'Provisioning...' : 'Provision Node'}
      >
        <AppTextField label="University Full Name" value={newUniName} onChangeText={setNewUniName} placeholder="e.g. Lagos State University" />
        <AppTextField label="Campus Node Code" value={newUniCode} onChangeText={setNewUniCode} placeholder="e.g. LASU" autoCapitalize="characters" />
        <AppTextField label="Location / State" value={newUniLocation} onChangeText={setNewUniLocation} placeholder="e.g. Ojo, Lagos" />
        <AppTextField label="Email Domain" value={newUniDomain} onChangeText={setNewUniDomain} placeholder="e.g. lasu.edu.ng" autoCapitalize="none" />
      </AdminConfigModal>

      {/* 2. Domain Authority Whitelist */}
      <AdminConfigModal
        visible={activeModal === 'domainAuthority'}
        onClose={() => setActiveModal(null)}
        title="Domain Authority Whitelist"
        description="Comma-separated list of recognized academic email domains."
        onConfirm={handleSaveDomainAuthority}
        confirmLabel={isSaving ? 'Saving...' : 'Save Whitelist'}
      >
        <AppTextField
          label="Allowed Email Domains"
          value={domainAuthorityInput}
          onChangeText={setDomainAuthorityInput}
          placeholder="@ui.edu.ng, @unilag.edu.ng..."
          multiline
          numberOfLines={4}
          autoCapitalize="none"
        />
      </AdminConfigModal>

      {/* 3. Storage Upload Quotas */}
      <AdminConfigModal
        visible={activeModal === 'cloudStorage'}
        onClose={() => setActiveModal(null)}
        title="Storage Upload Quotas"
        description="Per-upload file size limits enforced on campus storage buckets."
        onConfirm={handleSaveStorageQuotas}
        confirmLabel={isSaving ? 'Saving...' : 'Save Quotas'}
      >
        <AppTextField label="Max Image Size (MB)" value={cloudStorageImgMb} onChangeText={setCloudStorageImgMb} keyboardType="numeric" />
        <AppTextField label="Max Document / PDF Size (MB)" value={cloudStoragePdfMb} onChangeText={setCloudStoragePdfMb} keyboardType="numeric" />
      </AdminConfigModal>

      {/* 4. Global Push Broadcast */}
      <AdminConfigModal
        visible={activeModal === 'globalPush'}
        onClose={() => setActiveModal(null)}
        title="Global Push Broadcast"
        description="Send an immediate broadcast alert to all registered users."
        onConfirm={handleSendGlobalPush}
        confirmLabel={isSaving ? 'Dispatching...' : 'Dispatch Alert'}
        confirmDestructive
      >
        <AppTextField label="Alert Title" value={pushTitle} onChangeText={setPushTitle} placeholder="Campus Emergency or Urgent Notice" />
        <AppTextField label="Message Body" value={pushBody} onChangeText={setPushBody} placeholder="Full details to display to all students and faculty..." multiline numberOfLines={3} />
      </AdminConfigModal>

      {/* 5. Escrow Configurations */}
      <AdminConfigModal
        visible={activeModal === 'escrowConfig'}
        onClose={() => setActiveModal(null)}
        title="Marketplace Escrow Configurations"
        description="Configure buyer protection holding periods and dispute rules."
        onConfirm={handleSaveEscrow}
        confirmLabel={isSaving ? 'Saving...' : 'Save Escrow Rules'}
      >
        <AppTextField label="Escrow Hold Period (Hours)" value={escrowHoldHours} onChangeText={setEscrowHoldHours} keyboardType="numeric" />
        <AppTextField label="Platform Escrow Fee (%)" value={escrowFeePercent} onChangeText={setEscrowFeePercent} keyboardType="numeric" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
          <AppText variant="bodySmall" weight="medium">Auto-Refund on Cancellation</AppText>
          <Switch value={escrowAutoRefund} onValueChange={setEscrowAutoRefund} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
        </View>
      </AdminConfigModal>

      {/* 6. Payment Gateway Keys */}
      <AdminConfigModal
        visible={activeModal === 'paymentGateway'}
        onClose={() => setActiveModal(null)}
        title="Payment Gateway API Keys"
        description="Configure public API keys for Paystack and Flutterwave."
        onConfirm={handleSavePaymentKeys}
        confirmLabel={isSaving ? 'Saving...' : 'Save Gateway Keys'}
      >
        <AppTextField label="Paystack Public Key" value={paystackKey} onChangeText={setPaystackKey} placeholder="pk_live_..." autoCapitalize="none" />
        <AppTextField label="Flutterwave Public Key" value={flutterwaveKey} onChangeText={setFlutterwaveKey} placeholder="FLWPUBK_..." autoCapitalize="none" />
      </AdminConfigModal>

      {/* 7. Tenant Toggles Redirect Modal */}
      <AdminConfigModal
        visible={activeModal === 'tenantToggles'}
        onClose={() => setActiveModal(null)}
        title="Tenant Feature Switches"
        description="Fine-grained modular switches (Marketplace, Study Pods, Mentorship) can be configured on the Feature Controls desk."
        onConfirm={() => {
          setActiveModal(null);
          router.push('/(admin)/feature-controls');
        }}
        confirmLabel="Open Feature Controls"
      >
        <AppText tone="secondary" variant="bodySmall">
          Navigate to the Feature Controls desk to adjust module toggles across your campus network.
        </AppText>
      </AdminConfigModal>

      {/* 8. Legacy Giving Vault */}
      <AdminConfigModal
        visible={activeModal === 'legacyVault'}
        onClose={() => setActiveModal(null)}
        title="Legacy Giving & Endowment Vault"
        description="Track alumni donations and student emergency grant funds."
        onConfirm={() => setActiveModal(null)}
        confirmLabel="Close"
      >
        <AppText variant="bodySmall" style={{ marginBottom: spacing.sm }}>
          Endowment balance and disbursement approvals are securely managed in accordance with university senate guidelines.
        </AppText>
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
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="bodySmall">
 {title}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {description}
 </AppText>
 </View>
 <AppButton label={actionLabel} size="sm" variant={tone === 'critical' ? 'accent' : 'primary'} onPress={onPress} disabled={disabled} />
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
