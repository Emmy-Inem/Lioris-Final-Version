import React, { useEffect, useState } from'react';
import { Alert, ScrollView, Switch, View } from'react-native';
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

type ModalKey =
  | 'addUniversity'
  | 'domainAuthority'
  | 'tenantToggles'
  | 'seasonalLeaderboards'
  | 'serverSecrets'
  | 'toxicityThresholds'
  | 'cloudStorage'
  | 'globalPush'
  | null;

export default function SuperAdminConfigScreen() {
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Lifted form states for configuration modals
  const [newUniName, setNewUniName] = useState('');
  const [newUniCode, setNewUniCode] = useState('');
  const [newUniLocation, setNewUniLocation] = useState('');
  const [newUniDomain, setNewUniDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [domainAuthorityInput, setDomainAuthorityInput] = useState('@ui.edu.ng, @student.ui.edu.ng, @unilag.edu.ng, @oau.edu.ng, @funaab.edu.ng');
  const [toxicityScoreLimit, setToxicityScoreLimit] = useState(80);
  const [cloudStorageImgMb, setCloudStorageImgMb] = useState('5');
  const [cloudStoragePdfMb, setCloudStoragePdfMb] = useState('25');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');

  // Hydrate settings on mount from local storage / remote cache
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const cachedDomains = localStorage.getItem('lioris_setting_allowed_email_domains');
        if (cachedDomains) {
          const parsed = JSON.parse(cachedDomains);
          if (Array.isArray(parsed)) setDomainAuthorityInput(parsed.join(', '));
        }

        const cachedQuotas = localStorage.getItem('lioris_setting_storage_quotas');
        if (cachedQuotas) {
          const parsed = JSON.parse(cachedQuotas);
          if (parsed.maxImageMb) setCloudStorageImgMb(String(parsed.maxImageMb));
          if (parsed.maxPdfMb) setCloudStoragePdfMb(String(parsed.maxPdfMb));
        }

        const cachedMaintenance = localStorage.getItem('lioris_setting_maintenance_mode');
        if (cachedMaintenance) {
          setMaintenanceMode(JSON.parse(cachedMaintenance) === true);
        }

        const cachedToxicity = localStorage.getItem('lioris_setting_toxicity_thresholds');
        if (cachedToxicity) {
          const parsed = JSON.parse(cachedToxicity);
          if (typeof parsed.scoreLimit === 'number') setToxicityScoreLimit(parsed.scoreLimit);
        }

        // Server secrets (AI / video SDK) are never stored in the app. Purge any
        // copy an older build may have cached in this browser.
        localStorage.removeItem('lioris_setting_webrtc_keys');
        localStorage.removeItem('lioris_setting_ai_service_keys');
      } catch {}
    }
  }, []);

  /**
   * Writes a platform setting to this browser and to platform_settings.
   *
   * Throws when the database write fails. It used to swallow the failure
   * two ways over - `catch {}`, plus ignoring the `{ error }` that
   * supabase-js resolves with instead of throwing - so every caller went
   * on to announce "updated in the database" for a setting that only ever
   * reached the admin's own localStorage. Callers already surface thrown
   * errors, so failing loudly here is all that's needed.
   */
  async function persistSetting(key: string, value: any, description: string) {
    let cachedLocally = false;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`lioris_setting_${key}`, JSON.stringify(value));
        cachedLocally = true;
      } catch {
        // Private mode / quota - non-fatal, the database write below is
        // the one that actually matters.
      }
    }
    try {
      const { error } = await supabase.from('platform_settings').upsert({
        key,
        value,
        description,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (err: any) {
      throw new Error(
        `Couldn’t sync "${key}" to the platform database (${err?.message ?? 'unknown error'}). ` +
          (cachedLocally
            ? 'It is applied on this device only, so other admins and devices will not see it.'
            : 'The change was not saved.'),
      );
    }
  }

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
      await persistSetting('allowed_email_domains', domains, 'Whitelisted campus email domain authorities');
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
      await persistSetting('storage_quotas', quotas, 'Per-user upload file size limits');
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

  async function handleSendGlobalPush() {
    if (!pushTitle.trim() || !pushBody.trim()) {
      Alert.alert('Validation Error', 'Title and Alert message are required.');
      return;
    }
    setIsSaving(true);
    try {
      await createNotification({
        type: 'system_announcement',
        title: `📢 ${pushTitle.trim()}`,
        body: pushBody.trim(),
        deepLinkPath: '/dashboard',
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

  async function handleSaveToxicityThresholds() {
    setIsSaving(true);
    try {
      const config = { scoreLimit: toxicityScoreLimit };
      await persistSetting('toxicity_thresholds', config, 'AI moderation toxicity sensitivity threshold');
      await recordAuditLogEntry({
        action: 'toxicity_thresholds_deployed',
        summary: `Updated automated toxicity threshold to ${toxicityScoreLimit}/100`,
        targetType: 'platform_config',
        targetId: 'toxicity_thresholds',
        reason: 'Super admin adjusted AI moderation sensitivity',
      });
      Alert.alert('Thresholds Saved', 'Toxicity scoring threshold updated in the database.');
      setActiveModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save toxicity thresholds.');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Maintenance mode is platform-wide, so a failed write has to be
   * reported - the toggle flipping on screen is not evidence it stuck.
   * The switch is reverted so the UI keeps matching the real state.
   */
  function applyMaintenanceMode(next: boolean, summary: string) {
    setMaintenanceMode(next);
    persistSetting('maintenance_mode', next, summary).catch((err: any) => {
      setMaintenanceMode(!next);
      Alert.alert('Maintenance mode not applied', err?.message || 'Could not reach the platform database.');
    });
    recordAuditLogEntry({
      action: 'maintenance_mode_toggled',
      summary,
      targetType: 'platform_config',
      targetId: 'maintenance_mode',
    }).catch(() => {});
  }

  function confirmMaintenanceMode(next: boolean) {
    if (!next) {
      applyMaintenanceMode(false, 'Maintenance mode deactivated - platform online');
      return;
    }
    Alert.alert(
      'Enable Maintenance Mode?',
      'This forces the entire platform offline and disables all database writes for every user, immediately. This is not reversible without another manual toggle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable',
          style: 'destructive',
          onPress: () => {
            applyMaintenanceMode(true, 'Maintenance mode ACTIVATED by super admin');
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ marginTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.xs }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Super Admin Configuration
        </AppText>
      </View>
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

        {/* "Gamification & XP Rules" was removed with the XP feature itself.
            Its two rows opened 'xpMultiplier' and 'levelBadges' modals that
            were never implemented, so they were dead buttons on top of a
            feature with no backing tables. */}

 <Section number={4} title="Third-Party API & Integration"emoji="">
 <Row
 title="Server Secrets (AI, Video SDK)"description="How provider secrets are managed - never stored in the app."actionLabel="Info"onPress={() => setActiveModal('serverSecrets')}
 last
 />
 </Section>

 <Section number={5} title="Cybersecurity & Ecosystem Safety"emoji="">
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

  <Section number={6} title="Storage, Media, & Data Analytics"emoji="">
 <Row
 title="Cloud Storage Limits"description="Limits for AWS/GCP to prevent ballooning server costs."actionLabel="Storage"onPress={() => setActiveModal('cloudStorage')}
 last
 />
 </Section>

 <Section number={7} title="Developer, QA, & Maintenance" emoji="">
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
 <ToggleRow
 title="Maintenance Mode Kill Switch"description="Force offline mode & disable DB writes."value={maintenanceMode}
 onValueChange={confirmMaintenanceMode}
 titleTone="critical"
 last
 />
 </Section>

 <Section number={8} title="Global Communications"emoji="">
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

      {/* 9. Server secrets (informational only) */}
      <AdminConfigModal
        visible={activeModal === 'serverSecrets'}
        onClose={() => setActiveModal(null)}
        title="Server Secrets"
        description="AI and video SDK provider secrets are not configured here."
        onConfirm={() => setActiveModal(null)}
        confirmLabel="Close"
      >
        <AppText variant="bodySmall" style={{ marginBottom: spacing.sm }}>
          Secrets such as the Gemini/OpenAI API keys and the Zego server secret are managed on the server with
          {'"supabase secrets set"'} and are read only by edge functions. They are never stored in the app or in
          the platform database.
        </AppText>
      </AdminConfigModal>

      {/* 11. Automated Toxicity Thresholds */}
      <AdminConfigModal
        visible={activeModal === 'toxicityThresholds'}
        onClose={() => setActiveModal(null)}
        title="Automated Toxicity Thresholds"
        description="AI moderation sensitivity scoring metrics."
        onConfirm={handleSaveToxicityThresholds}
        confirmLabel={isSaving ? 'Saving...' : 'Save Threshold'}
      >
        <AppTextField
          label="Toxicity Score Limit (0-100)"
          value={String(toxicityScoreLimit)}
          onChangeText={(v) => setToxicityScoreLimit(Math.max(0, Math.min(100, Number(v.replace(/[^0-9]/g, '')) || 0)))}
          keyboardType="numeric"
          placeholder="80"
        />
        <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
          Content scoring at or above this value is automatically flagged for review.
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
 <View style={{ flex: 1, minWidth: 0, marginRight: spacing.sm }}>
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
 <View style={{ flex: 1, minWidth: 0, marginRight: spacing.md }}>
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
