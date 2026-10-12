import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { SolidCard } from '@/components/SolidCard';
import { AdminConfigModal } from '@/components/AdminConfigModal';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { SuperAdminGate } from '@/auth/SuperAdminGate';
import { recordAuditLogEntry } from '@/api/auditLog';
import { CampusManager } from '@/components/admin/CampusManager';
import { CampusActivityFeed } from '@/components/admin/CampusActivityFeed';
import { getInstitutionForEmail } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import {
  clearPlatformSettingsCache,
  DEFAULT_STORAGE_QUOTAS,
  getStorageQuotas,
  isMaintenanceModeOn,
} from '@/api/platformSettings';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

/**
 * Platform > Campuses & Security. Only settings that actually do something live here:
 *   - Campuses: the universities on the platform, adding one, and requests from new universities
 *   - Domain & Auto-Verification Tester: checks which campus an institutional email resolves to
 *   - Uploads: the file-size limits every upload checks (see src/api/platformSettings.ts)
 *   - Maintenance mode: shows members a maintenance screen (see <MaintenanceGate/>)
 *   - Campus activity: live audit trail of campus provisioning, edits, toggles, and deletions
 * Broadcasts and portal links are on the Console; feature switches have their own tab.
 */
export default function CampusesAndSecurityScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [imageMb, setImageMb] = useState(String(DEFAULT_STORAGE_QUOTAS.maxImageMb));
  const [docMb, setDocMb] = useState(String(DEFAULT_STORAGE_QUOTAS.maxPdfMb));
  const [quotas, setQuotas] = useState(DEFAULT_STORAGE_QUOTAS);

  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  const matchedInstitution = testEmail.includes('@') ? getInstitutionForEmail(testEmail) : null;

  useEffect(() => {
    getStorageQuotas().then((q) => {
      setQuotas(q);
      setImageMb(String(q.maxImageMb));
      setDocMb(String(q.maxPdfMb));
    });
    isMaintenanceModeOn(true).then(setMaintenance);
  }, []);

  /** Writes a platform setting to the database; throws with a readable message on failure. */
  async function persistSetting(key: string, value: unknown, description: string) {
    const { error } = await supabase.from('platform_settings').upsert({
      key,
      value,
      description,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      throw new Error(`Could not save "${key}" to the platform database (${error.message}). Nothing was changed.`);
    }
    clearPlatformSettingsCache();
  }

  async function handleSaveQuotas() {
    const nextImage = Number(imageMb);
    const nextDoc = Number(docMb);
    if (!Number.isFinite(nextImage) || nextImage <= 0 || !Number.isFinite(nextDoc) || nextDoc <= 0) {
      Alert.alert('Invalid limits', 'Enter a size in megabytes greater than zero for both limits.');
      return;
    }
    if (nextImage > 50 || nextDoc > 50) {
      Alert.alert('Limit too high', 'Storage buckets accept files up to 50 MB. Choose 50 or less.');
      return;
    }
    setSaving(true);
    try {
      const next = { maxImageMb: nextImage, maxPdfMb: nextDoc };
      await persistSetting('storage_quotas', next, 'Per-upload file size limits');
      await recordAuditLogEntry({
        action: 'storage_quotas_enforced',
        summary: `Upload limits set: images ${nextImage} MB, documents ${nextDoc} MB`,
        targetType: 'platform_config',
        targetId: 'storage_quotas',
        reason: 'Admin adjusted upload limits',
      });
      setQuotas(next);
      setQuotaOpen(false);
      Alert.alert('Limits saved', 'New uploads are checked against these limits straight away.');
    } catch (err: any) {
      Alert.alert('Not saved', err?.message || 'Could not save the limits.');
    } finally {
      setSaving(false);
    }
  }

  async function applyMaintenance(next: boolean) {
    setMaintenanceBusy(true);
    try {
      await persistSetting('maintenance_mode', next, 'Show members a maintenance screen');
      await recordAuditLogEntry({
        action: 'maintenance_mode_toggled',
        summary: next ? 'Maintenance mode ACTIVATED' : 'Maintenance mode deactivated',
        targetType: 'platform_config',
        targetId: 'maintenance_mode',
      }).catch(() => {});
      setMaintenance(next);
      await queryClient.invalidateQueries({ queryKey: ['platform', 'maintenance-mode'] });
    } catch (err: any) {
      Alert.alert('Maintenance mode not changed', err?.message || 'Could not reach the platform database.');
    } finally {
      setMaintenanceBusy(false);
    }
  }

  function toggleMaintenance(next: boolean) {
    if (!next) {
      void applyMaintenance(false);
      return;
    }
    Alert.alert(
      'Turn on maintenance mode?',
      'Every signed-in member will see a "being updated" screen and cannot use the app until you turn this off. Admins keep full access.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn on', style: 'destructive', onPress: () => void applyMaintenance(true) },
      ],
    );
  }

  return (
    <SuperAdminGate>
      <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="platform" />
      </View>
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.lg }}
      >
        <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm }}>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            Campuses & Security
          </AppText>
          <AppText tone="secondary" variant="caption">
            The universities on Lioris, domain auto-verification, upload limits and maintenance mode
          </AppText>
        </View>

        {/* Campuses */}
        <CampusManager />

        {/* Domain & Auto-Verification Tester */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h3" weight="bold">Domain & Verification Check</AppText>
          <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
            <AppText tone="secondary" variant="caption">
              Test any student or staff email address to confirm which active campus it routes to and whether it qualifies for automatic institutional verification.
            </AppText>
            <AppTextField
              label=""
              value={testEmail}
              onChangeText={setTestEmail}
              placeholder="e.g. student@jspict.edu.ng"
              autoCapitalize="none"
              keyboardType="email-address"
              leftIcon="mail-outline"
            />
            {testEmail.trim().includes('@') ? (
              matchedInstitution ? (
                <View style={{ padding: spacing.sm, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, gap: 2 }}>
                  <AppText variant="bodySmall" weight="bold" tone="brand">
                    Auto-verifies into {matchedInstitution.name} ({matchedInstitution.code})
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    Matched institutional domain @{matchedInstitution.domain}{matchedInstitution.location ? ` · ${matchedInstitution.location}` : ''}
                  </AppText>
                </View>
              ) : (
                <View style={{ padding: spacing.sm, borderRadius: 12, borderWidth: 1, borderColor: colors.warning, gap: 2 }}>
                  <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.warning }}>
                    No active campus domain match
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    Signups with this address will not auto-verify and must submit a student ID or admission letter for review.
                  </AppText>
                </View>
              )
            ) : null}
          </SolidCard>
        </View>

        {/* Uploads */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h3" weight="bold">Uploads</AppText>
          <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" variant="bodySmall">File size limits</AppText>
                <AppText tone="secondary" variant="caption">
                  Images (photos, covers): {quotas.maxImageMb} MB · Documents (notes, slides, PDFs): {quotas.maxPdfMb} MB
                </AppText>
              </View>
              <AppButton label="Change" size="sm" variant="secondary" onPress={() => setQuotaOpen(true)} />
            </View>
          </SolidCard>
        </View>

        {/* Maintenance */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h3" weight="bold">Maintenance</AppText>
          <SolidCard radius={18} style={{ borderWidth: 1, borderColor: maintenance ? colors.critical : colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" variant="bodySmall" style={{ color: colors.critical }}>
                  Maintenance mode
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Members see a &quot;being updated&quot; screen; admins keep full access. It does not block the database, so use it
                  for planned updates rather than as a security control.
                </AppText>
              </View>
              <Switch
                value={maintenance}
                disabled={maintenanceBusy}
                onValueChange={toggleMaintenance}
                trackColor={{ false: colors.divider, true: colors.critical }}
              />
            </View>
          </SolidCard>
        </View>

        {/* Campus Audit Trail */}
        <CampusActivityFeed />
      </ScrollView>

      <AdminConfigModal
        visible={quotaOpen}
        onClose={() => setQuotaOpen(false)}
        title="Upload limits"
        description="The largest single file a member can upload. Applies to new uploads straight away."
        onConfirm={handleSaveQuotas}
        confirmLabel={saving ? 'Saving…' : 'Save limits'}
      >
        <AppTextField label="Images (MB)" value={imageMb} onChangeText={setImageMb} keyboardType="numeric" />
        <AppTextField label="Documents (MB)" value={docMb} onChangeText={setDocMb} keyboardType="numeric" />
      </AdminConfigModal>
    </ScreenContainer>
  </SuperAdminGate>
  );
}
