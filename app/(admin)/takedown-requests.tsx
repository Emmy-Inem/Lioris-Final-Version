import React, { useState } from 'react';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { FlatList, Linking, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ShimmerCardList } from '@/components/ShimmerSkeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import {
  listTakedownRequests,
  resolveTakedownRequest,
  TAKEDOWN_CLAIM_OPTIONS,
  TakedownRequest,
} from '@/api/takedown';

function claimLabel(type: TakedownRequest['claimType']) {
  return TAKEDOWN_CLAIM_OPTIONS.find((o) => o.type === type)?.title ?? type;
}

export default function TakedownRequestsScreen() {
  const adminBadges = useAdminBadges();
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [deciding, setDeciding] = useState<{ request: TakedownRequest; decision: 'uphold' | 'reject' } | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeciding, setBulkDeciding] = useState<'uphold' | 'reject' | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['takedown-requests', tab],
    queryFn: () => listTakedownRequests(tab),
  });

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

  function changeTab(next: 'pending' | 'decided') {
    clearSelection();
    setTab(next);
  }

  function getSelectedRequests(): TakedownRequest[] {
    return (data ?? []).filter((r) => selectedIds.has(r.id));
  }

  async function confirmBulkDecision() {
    if (!bulkDeciding) return;
    const targets = getSelectedRequests();
    if (targets.length === 0) {
      setBulkDeciding(null);
      return;
    }
    setBulkProcessing(true);
    let succeeded = 0;
    let failed = 0;
    for (const request of targets) {
      try {
        await resolveTakedownRequest(request, bulkDeciding, notes);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkProcessing(false);
    setBulkDeciding(null);
    setNotes('');
    clearSelection();
    await queryClient.invalidateQueries({ queryKey: ['takedown-requests'] });
    await queryClient.invalidateQueries({ queryKey: ['resources'] });
    if (failed > 0) {
      haptics.error();
      toast.error(`${succeeded} ${bulkDeciding === 'uphold' ? 'removed' : 'declined'}, ${failed} failed. Retry the failed ones individually.`);
    } else {
      haptics.success();
      toast.success(bulkDeciding === 'uphold' ? `${succeeded} removed. Resources and their files are deleted.` : `${succeeded} declined and restored.`);
    }
  }

  async function confirmDecision() {
    if (!deciding) return;
    setSaving(true);
    try {
      await resolveTakedownRequest(deciding.request, deciding.decision, notes);
      haptics.success();
      toast.success(deciding.decision === 'uphold' ? 'Removed. The resource and its file are deleted.' : 'Declined. The resource is back online.');
    } catch (err: any) {
      // The decision itself may still have been saved (e.g. only the stored file could not be deleted).
      haptics.error();
      toast.error(err?.message || 'Could not record the decision.');
    } finally {
      setSaving(false);
      setDeciding(null);
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: ['takedown-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
    }
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="safety" badges={{ reports: adminBadges.reports, takedowns: adminBadges.takedowns }} />
      </View>

      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Takedown Requests
        </AppText>
        <AppText tone="secondary" variant="caption">
          Copyright and content reports on shared resources. Rights-holder requests hide the file until you decide.
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        {(['pending', 'decided'] as const).map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => changeTab(t)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} tone={selected ? 'inverse' : 'secondary'}>
                {t === 'pending' ? 'Needs a decision' : 'Decided'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {tab === 'pending' && selectedIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 110 }}>
              <AppButton
                label="Decline"
                variant="secondary"
                size="sm"
                loading={bulkProcessing}
                onPress={() => {
                  setNotes('');
                  setBulkDeciding('reject');
                }}
              />
            </View>
            <View style={{ flexShrink: 0, minWidth: 140 }}>
              <AppButton
                label="Remove permanently"
                size="sm"
                loading={bulkProcessing}
                onPress={() => {
                  setNotes('');
                  setBulkDeciding('uphold');
                }}
              />
            </View>
          </View>
        </SolidCard>
      )}

      {isLoading ? (
        <ShimmerCardList count={3} />
      ) : error ? (
        <SolidCard radius={16} style={{ borderWidth: 1, borderColor: `${colors.critical}55` }}>
          <AppText weight="bold" variant="bodySmall">Could not load requests</AppText>
          <AppText tone="secondary" variant="caption" style={{ marginVertical: spacing.xs }}>
            {(error as Error).message} - if this says the table does not exist, the takedown migration has not been applied yet.
          </AppText>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => refetch()} />
        </SolidCard>
      ) : (
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={data ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 150, gap: spacing.sm }}
          ListEmptyComponent={
            <EmptyState
              title={tab === 'pending' ? 'No requests waiting' : 'Nothing decided yet'}
              description={tab === 'pending' ? 'New copyright and content reports on resources appear here.' : 'Upheld and declined requests are kept here as a record.'}
            />
          }
          renderItem={({ item }) => (
            <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' }}>
                {item.status === 'pending' ? (
                  <Pressable
                    onPress={() => toggleSelected(item.id)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selectedIds.has(item.id) }}
                    accessibilityLabel={`Select ${item.resourceTitle}`}
                    style={{ paddingTop: 2 }}
                  >
                    <Ionicons
                      name={selectedIds.has(item.id) ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={selectedIds.has(item.id) ? colors.brandPrimary : colors.textSecondary}
                    />
                  </Pressable>
                ) : null}
                <View style={{ flex: 1, minWidth: 180 }}>
                  <AppText weight="bold">{item.resourceTitle}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {item.resourceCourse ? `${item.resourceCourse} · ` : ''}
                    {new Date(item.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {item.autoHidden ? <Badge label="Hidden" tone="warning" /> : null}
                  {item.status !== 'pending' ? (
                    <Badge label={item.status === 'upheld' ? 'Removed' : 'Declined'} tone={item.status === 'upheld' ? 'critical' : 'success'} />
                  ) : null}
                  {!item.resourceId && item.status === 'pending' ? <Badge label="Resource gone" tone="neutral" /> : null}
                </View>
              </View>

              <AppText variant="bodySmall" weight="semiBold" tone="brand" style={{ marginTop: spacing.sm }}>
                {claimLabel(item.claimType)}
              </AppText>
              <AppText variant="bodySmall" style={{ marginTop: 2, lineHeight: 20 }}>
                {item.details}
              </AppText>

              <View style={{ marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider, gap: 2 }}>
                <AppText variant="caption" weight="bold">
                  {item.claimantName}
                  {item.claimantRole ? ` · ${item.claimantRole}` : ''}
                </AppText>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(`mailto:${item.claimantEmail}`).catch(() => {})}
                >
                  <AppText variant="caption" tone="brand">
                    {item.claimantEmail}
                  </AppText>
                </Pressable>
                {item.goodFaith ? (
                  <AppText variant="caption" tone="secondary">
                    Good-faith / accuracy statement confirmed
                  </AppText>
                ) : null}
              </View>

              {item.adminNotes ? (
                <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                  Decision notes: {item.adminNotes}
                </AppText>
              ) : null}

              {item.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <AppButton
                      label="Remove permanently"
                      icon="trash-outline"
                      onPress={() => {
                        setNotes('');
                        setDeciding({ request: item, decision: 'uphold' });
                      }}
                      fullWidth
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <AppButton
                      label={item.autoHidden ? 'Decline & restore' : 'Decline'}
                      variant="secondary"
                      icon="refresh-outline"
                      onPress={() => {
                        setNotes('');
                        setDeciding({ request: item, decision: 'reject' });
                      }}
                      fullWidth
                    />
                  </View>
                </View>
              ) : null}
            </SolidCard>
          )}
        />
      )}

      <Modal visible={!!deciding} transparent animationType="fade" onRequestClose={() => !saving && setDeciding(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
              <Ionicons
                name={deciding?.decision === 'uphold' ? 'trash-outline' : 'refresh-outline'}
                size={20}
                color={deciding?.decision === 'uphold' ? colors.critical : colors.brandPrimary}
              />
              <AppText variant="h3" weight="bold">
                {deciding?.decision === 'uphold' ? 'Remove this resource?' : 'Decline this request?'}
              </AppText>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              {deciding?.decision === 'uphold'
                ? `"${deciding.request.resourceTitle}" and its stored file are permanently deleted. This cannot be undone. The requester is notified.`
                : `"${deciding?.request.resourceTitle}" ${deciding?.request.autoHidden ? 'goes back online and the uploader is told.' : 'stays as it is.'} The requester is notified.`}
            </AppText>
            <AppTextField
              label="Notes for the record (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="e.g. Confirmed with Dept. of Chemistry by email"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setDeciding(null)} disabled={saving} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={deciding?.decision === 'uphold' ? 'Remove' : 'Decline'}
                  onPress={confirmDecision}
                  loading={saving}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!bulkDeciding} transparent animationType="fade" onRequestClose={() => !bulkProcessing && setBulkDeciding(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
              <Ionicons
                name={bulkDeciding === 'uphold' ? 'trash-outline' : 'refresh-outline'}
                size={20}
                color={bulkDeciding === 'uphold' ? colors.critical : colors.brandPrimary}
              />
              <AppText variant="h3" weight="bold">
                {bulkDeciding === 'uphold' ? `Remove ${selectedIds.size} resource${selectedIds.size === 1 ? '' : 's'}?` : `Decline ${selectedIds.size} request${selectedIds.size === 1 ? '' : 's'}?`}
              </AppText>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              {bulkDeciding === 'uphold'
                ? 'Each selected resource and its stored file are permanently deleted. This cannot be undone. Requesters are notified.'
                : 'Each selected resource goes back online if it was auto-hidden. Requesters are notified.'}
            </AppText>
            <AppTextField
              label="Notes for the record (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="e.g. Confirmed with Dept. of Chemistry by email"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setBulkDeciding(null)} disabled={bulkProcessing} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={bulkDeciding === 'uphold' ? 'Remove' : 'Decline'}
                  onPress={confirmBulkDecision}
                  loading={bulkProcessing}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
