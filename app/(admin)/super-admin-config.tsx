import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { AdminConfigModal } from '@/components/AdminConfigModal';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { recordAuditLogEntry } from '@/api/auditLog';
import {
  createInstitution,
  listCampuses,
  listWaitlist,
  respondToWaitlistEntry,
  WaitlistEntry,
} from '@/api/institutions';
import { supabase } from '@/api/supabase';
import {
  clearPlatformSettingsCache,
  DEFAULT_STORAGE_QUOTAS,
  getStorageQuotas,
  isMaintenanceModeOn,
} from '@/api/platformSettings';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

/**
 * Platform > Campuses & Security. Only settings that actually do something live here:
 *   - Campuses: the universities on the platform, adding one, and requests from new universities
 *   - Uploads: the file-size limits every upload checks (see src/api/platformSettings.ts)
 *   - Maintenance mode: shows members a maintenance screen (see <MaintenanceGate/>)
 * Broadcasts and portal links are on the Console; feature switches have their own tab.
 */
export default function CampusesAndSecurityScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();

  const { data: campuses = [], isLoading: loadingCampuses } = useQuery({ queryKey: ['campuses'], queryFn: listCampuses });
  const { data: requests = [] } = useQuery({ queryKey: ['waitlist'], queryFn: listWaitlist });

  const [addOpen, setAddOpen] = useState(false);
  const [fromRequest, setFromRequest] = useState<WaitlistEntry | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);

  const [quotaOpen, setQuotaOpen] = useState(false);
  const [imageMb, setImageMb] = useState(String(DEFAULT_STORAGE_QUOTAS.maxImageMb));
  const [docMb, setDocMb] = useState(String(DEFAULT_STORAGE_QUOTAS.maxPdfMb));
  const [quotas, setQuotas] = useState(DEFAULT_STORAGE_QUOTAS);

  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);

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

  function openAdd(request?: WaitlistEntry) {
    setFromRequest(request ?? null);
    setName(request?.universityName ?? '');
    setCode('');
    setLocation('');
    const emailDomain = request?.email?.split('@')[1];
    setDomain(emailDomain ?? '');
    setAddOpen(true);
  }

  async function handleAddCampus() {
    if (!name.trim() || !code.trim()) {
      Alert.alert('Missing details', 'Both the university name and its campus code are required.');
      return;
    }
    setSaving(true);
    try {
      const cleanCode = code.trim().toUpperCase();
      await createInstitution({
        name: name.trim(),
        code: cleanCode,
        location: location.trim() || 'Nigeria',
        domain: domain.trim().replace(/^@/, '') || `${cleanCode.toLowerCase()}.edu.ng`,
      });
      if (fromRequest) await respondToWaitlistEntry(fromRequest.id, 'approved');
      await recordAuditLogEntry({
        action: 'institution_provisioned',
        summary: `Provisioned new campus: ${name.trim()} (${cleanCode})`,
        targetType: 'institution',
        targetId: cleanCode,
        institutionCode: cleanCode,
        reason: fromRequest ? 'Approved a university request' : 'Admin added a campus',
      });
      haptics.success();
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['campuses'] });
      await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      Alert.alert('Campus added', `${name.trim()} is now on the platform.`);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not add the campus', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function declineRequest(request: WaitlistEntry) {
    haptics.medium();
    try {
      await respondToWaitlistEntry(request.id, 'rejected');
      await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    } catch (err: any) {
      Alert.alert('Could not decline', err?.message || 'Please try again.');
    }
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
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="platform" />
      </View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Campuses & Security
        </AppText>
        <AppText tone="secondary" variant="caption">
          The universities on Lioris, upload limits and maintenance mode
        </AppText>
      </View>

      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.lg }}
      >
        {/* Campuses */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <AppText variant="h3" weight="bold">Campuses</AppText>
            <AppButton label="+ Add campus" size="sm" onPress={() => openAdd()} />
          </View>

          {requests.length > 0 ? (
            <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.brandPrimary, gap: spacing.sm }}>
              <AppText weight="bold" variant="bodySmall">
                {requests.length} university request{requests.length === 1 ? '' : 's'} waiting
              </AppText>
              {requests.map((request) => (
                <View
                  key={request.id}
                  style={{ gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider }}
                >
                  <AppText weight="semiBold">{request.universityName}</AppText>
                  <AppText tone="secondary" variant="caption">Contact: {request.email}</AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <AppButton label="Set up campus" size="sm" onPress={() => openAdd(request)} fullWidth />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppButton label="Decline" size="sm" variant="secondary" onPress={() => declineRequest(request)} fullWidth />
                    </View>
                  </View>
                </View>
              ))}
            </SolidCard>
          ) : null}

          <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border }}>
            {loadingCampuses ? (
              <AppText tone="secondary" variant="caption">Loading campuses…</AppText>
            ) : campuses.length === 0 ? (
              <EmptyState title="No campuses yet" description="Add the first university to get started." />
            ) : (
              campuses.map((campus, index) => (
                <View
                  key={campus.code}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.sm,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.divider,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="semiBold" numberOfLines={1}>{campus.name}</AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1}>
                      {campus.code}
                      {campus.domain ? ` · @${campus.domain}` : ''}
                      {campus.location ? ` · ${campus.location}` : ''}
                    </AppText>
                  </View>
                  {campus.isActive === false ? <Badge label="Inactive" tone="neutral" /> : <Badge label="Live" tone="success" />}
                </View>
              ))
            )}
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
      </ScrollView>

      <AdminConfigModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={fromRequest ? 'Set up requested campus' : 'Add a campus'}
        description="Registers the university so members can join it and its content stays separate."
        onConfirm={handleAddCampus}
        confirmLabel={saving ? 'Saving…' : 'Add campus'}
      >
        <AppTextField label="University name" value={name} onChangeText={setName} placeholder="e.g. Lagos State University" />
        <AppTextField label="Campus code" value={code} onChangeText={setCode} placeholder="e.g. LASU" autoCapitalize="characters" />
        <AppTextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Ojo, Lagos" />
        <AppTextField label="Email domain" value={domain} onChangeText={setDomain} placeholder="e.g. lasu.edu.ng" autoCapitalize="none" />
      </AdminConfigModal>

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
  );
}
