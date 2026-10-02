import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import {
  GivingCampaign,
  getCampaignClickCount,
  listPendingGivingCampaigns,
  reviewGivingCampaign,
  updateGivingCampaignTotal,
  listGivingCampaigns,
} from '@/api/donations';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function ClickCount({ campaignId }: { campaignId: string }) {
  const { data: clickCount } = useQuery({
    queryKey: ['giving-campaign-clicks', campaignId],
    queryFn: () => getCampaignClickCount(campaignId),
  });
  if (typeof clickCount !== 'number') return null;
  return (
    <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
      {clickCount} click{clickCount === 1 ? '' : 's'} on the giving link
    </AppText>
  );
}

function TotalEditor({ campaign, onSaved }: { campaign: GivingCampaign; onSaved: () => void }) {
  const { spacing } = useTheme();
  const [value, setValue] = useState(String(campaign.confirmedTotal));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = Number(value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num) || num < 0) return;
    setSaving(true);
    try {
      const previousTotal = campaign.confirmedTotal;
      await updateGivingCampaignTotal(campaign.id, num);
      recordAuditLogEntry({
        action: 'giving_campaign_total_updated',
        summary: `Updated confirmed total for giving campaign: "${campaign.title}" (${formatNaira(previousTotal)} -> ${formatNaira(num)})`,
        targetType: 'giving_campaign',
        targetId: campaign.id,
        reason: `Confirmed total changed from ${formatNaira(previousTotal)} to ${formatNaira(num)}`,
      });
      onSaved();
    } catch (err: any) {
      Alert.alert('Could not update total', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, marginTop: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <AppTextField label="Confirmed Total (₦)" value={value} onChangeText={(t) => setValue(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" />
      </View>
      <AppButton label="Save" variant="secondary" size="sm" loading={saving} onPress={save} />
    </View>
  );
}

export function DonationsModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<'pending' | 'approved'>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data: pending = [], isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['giving-campaigns', 'admin-pending'],
    queryFn: listPendingGivingCampaigns,
    enabled: section === 'pending',
  });
  const { data: approved = [], isLoading: approvedLoading, refetch: refetchApproved } = useQuery({
    queryKey: ['giving-campaigns', 'admin-approved'],
    queryFn: listGivingCampaigns,
    enabled: section === 'approved',
  });

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ['giving-campaigns'] });
    refetchPending();
    refetchApproved();
  }

  async function handleApprove(c: GivingCampaign) {
    haptics.medium();
    setActingId(c.id);
    try {
      await reviewGivingCampaign(c.id, 'approve');
      recordAuditLogEntry({
        action: 'giving_campaign_approved',
        summary: `Approved giving campaign: "${c.title}"`,
        targetType: 'giving_campaign',
        targetId: c.id,
        reason: 'Giving page reviewed and approved',
      });
      refreshAll();
      Alert.alert('Campaign Approved', `"${c.title}" is now visible to alumni.`);
    } catch (err: any) {
      Alert.alert('Could not approve', err?.message || 'Please try again.');
    } finally {
      setActingId(null);
    }
  }

  function handleRejectConfirm(c: GivingCampaign) {
    haptics.error();
    const doReject = async (reason?: string) => {
      if (!reason || reason.trim().length < 5) {
        Alert.alert('Reason required', 'Please provide a reason of at least 5 characters.');
        return;
      }
      setActingId(c.id);
      try {
        await reviewGivingCampaign(c.id, 'reject', reason);
        recordAuditLogEntry({
          action: 'giving_campaign_rejected',
          summary: `Rejected giving campaign: "${c.title}"`,
          targetType: 'giving_campaign',
          targetId: c.id,
          reason,
        });
        refreshAll();
        Alert.alert('Campaign Rejected', 'The creator will see this was declined.');
      } catch (err: any) {
        Alert.alert('Could not reject', err?.message || 'Please try again.');
      } finally {
        setActingId(null);
      }
    };
    if (Alert.prompt) {
      Alert.prompt(
        'Reject Campaign',
        `Provide a reason for declining "${c.title}":`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (reason?: string) => doReject(reason) },
        ],
        'plain-text',
        'The giving link does not look legitimate.',
      );
    } else {
      Alert.alert('Reject Campaign?', `Decline "${c.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => doReject('Did not meet campaign standards.') },
      ]);
    }
  }

  const list = section === 'pending' ? pending : approved;
  const isLoading = section === 'pending' ? pendingLoading : approvedLoading;

  function toggleSelected(id: string) {
    haptics.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function changeSection(next: 'pending' | 'approved') {
    clearSelection();
    setSection(next);
  }

  function getSelectedCampaigns(): GivingCampaign[] {
    return pending.filter((c) => selectedIds.has(c.id));
  }

  async function handleBulkApprove() {
    const targets = getSelectedCampaigns();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.medium();
    setBulkProcessing(true);
    let succeeded = 0;
    let failed = 0;
    for (const campaign of targets) {
      try {
        await reviewGivingCampaign(campaign.id, 'approve');
        recordAuditLogEntry({
          action: 'giving_campaign_approved',
          summary: `Approved giving campaign: "${campaign.title}" (bulk action)`,
          targetType: 'giving_campaign',
          targetId: campaign.id,
          reason: 'Giving page reviewed and approved',
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    refreshAll();
    setBulkProcessing(false);
    clearSelection();
    if (failed > 0) haptics.error();
    else haptics.success();
    Alert.alert('Bulk Approve Complete', failed > 0 ? `${succeeded} approved, ${failed} failed. Retry the failed ones individually.` : `${succeeded} campaign${succeeded === 1 ? '' : 's'} approved.`);
  }

  function handleBulkReject() {
    const targets = getSelectedCampaigns();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.error();
    const doReject = async (reason?: string) => {
      if (!reason || reason.trim().length < 5) {
        Alert.alert('Reason required', 'Please provide a reason of at least 5 characters.');
        return;
      }
      setBulkProcessing(true);
      let succeeded = 0;
      let failed = 0;
      for (const campaign of targets) {
        try {
          await reviewGivingCampaign(campaign.id, 'reject', reason);
          recordAuditLogEntry({
            action: 'giving_campaign_rejected',
            summary: `Rejected giving campaign: "${campaign.title}" (bulk action)`,
            targetType: 'giving_campaign',
            targetId: campaign.id,
            reason,
          });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      refreshAll();
      setBulkProcessing(false);
      clearSelection();
      if (failed > 0) haptics.error();
      else haptics.success();
      Alert.alert('Bulk Reject Complete', failed > 0 ? `${succeeded} rejected, ${failed} failed. Retry the failed ones individually.` : `${succeeded} campaign${succeeded === 1 ? '' : 's'} rejected.`);
    };
    if (Alert.prompt) {
      Alert.prompt(
        'Reject Campaigns',
        `Provide a reason for declining ${targets.length} campaign${targets.length === 1 ? '' : 's'}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (reason?: string) => doReject(reason) },
        ],
        'plain-text',
        'The giving link does not look legitimate.',
      );
    } else {
      Alert.alert('Reject Campaigns?', `Decline ${targets.length} campaign${targets.length === 1 ? '' : 's'}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => doReject('Did not meet campaign standards.') },
      ]);
    }
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppButton
            label={`Pending (${pending.length})`}
            variant={section === 'pending' ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            onPress={() => changeSection('pending')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton
            label="Approved & Live"
            variant={section === 'approved' ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            onPress={() => changeSection('approved')}
          />
        </View>
      </View>

      {section === 'pending' && selectedIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 110 }}>
              <AppButton label="Bulk Reject" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkReject} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 130 }}>
              <AppButton label="Bulk Approve" size="sm" loading={bulkProcessing} onPress={handleBulkApprove} />
            </View>
          </View>
        </SolidCard>
      )}

      {list.map((c) => (
        <SolidCard key={c.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, flex: 1, minWidth: 0 }}>
              {section === 'pending' ? (
                <Pressable
                  onPress={() => toggleSelected(c.id)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedIds.has(c.id) }}
                  accessibilityLabel={`Select ${c.title}`}
                  style={{ paddingTop: 2 }}
                >
                  <Ionicons
                    name={selectedIds.has(c.id) ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={selectedIds.has(c.id) ? colors.brandPrimary : colors.textSecondary}
                  />
                </Pressable>
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="body" weight="bold">
                  {c.title}
                </AppText>
                {c.creatorName && (
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Started by {c.creatorName}
                  </AppText>
                )}
                <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                  {c.givingUrl}
                </AppText>
              </View>
            </View>
            <Badge label={section === 'pending' ? 'Pending' : 'Live'} tone={section === 'pending' ? 'warning' : 'success'} />
          </View>

          {c.description && (
            <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginTop: spacing.sm }}>
              {c.description}
            </AppText>
          )}

          <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
            {formatNaira(c.confirmedTotal)} confirmed{c.goalAmount ? ` of ${formatNaira(c.goalAmount)} goal` : ''}
          </AppText>
          <ClickCount campaignId={c.id} />

          {section === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Reject" variant="ghost" onPress={() => handleRejectConfirm(c)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Approve" variant="primary" loading={actingId === c.id} onPress={() => handleApprove(c)} />
              </View>
            </View>
          ) : (
            <TotalEditor campaign={c} onSaved={refreshAll} />
          )}
        </SolidCard>
      ))}

      {!isLoading && list.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title={section === 'pending' ? 'No pending campaigns' : 'No live campaigns'}
          description={section === 'pending' ? 'New alumni giving campaigns will appear here.' : 'Approved campaigns will appear here.'}
        />
      ) : null}
    </View>
  );
}
