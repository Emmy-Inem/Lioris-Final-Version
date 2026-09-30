import React, { useState } from 'react';
import { Alert, View } from 'react-native';
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
      await updateGivingCampaignTotal(campaign.id, num);
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
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<'pending' | 'approved'>('pending');
  const [actingId, setActingId] = useState<string | null>(null);

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
        action: 'report_resolved',
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

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppButton
            label={`Pending (${pending.length})`}
            variant={section === 'pending' ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            onPress={() => setSection('pending')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton
            label="Approved & Live"
            variant={section === 'approved' ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            onPress={() => setSection('approved')}
          />
        </View>
      </View>

      {list.map((c) => (
        <SolidCard key={c.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
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
