import React, { useState } from 'react';
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
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [deciding, setDeciding] = useState<{ request: TakedownRequest; decision: 'uphold' | 'reject' } | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['takedown-requests', tab],
    queryFn: () => listTakedownRequests(tab),
  });

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
              onPress={() => setTab(t)}
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
    </ScreenContainer>
  );
}
