import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { CampaignCardSkeletonList } from '@/components/Skeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import {
  GivingCampaign,
  closeMyCampaign,
  createGivingCampaign,
  getCampaignClickCount,
  listGivingCampaigns,
  listMyGivingCampaigns,
  openGivingPage,
  updateMyCampaignTotal,
} from '@/api/donations';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { haptics } from '@/utils/haptics';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function CampaignCard({ campaign, onGive }: { campaign: GivingCampaign; onGive: (c: GivingCampaign) => void }) {
  const { colors, spacing } = useTheme();
  const progress = campaign.goalAmount ? Math.min(1, campaign.confirmedTotal / campaign.goalAmount) : null;

  return (
    <SolidCard radius={18} style={{ padding: spacing.md }}>
      <AppText variant="h3" weight="bold">
        {campaign.title}
      </AppText>
      {campaign.creatorName && (
        <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
          Started by {campaign.creatorName}
        </AppText>
      )}
      {campaign.description && (
        <AppText tone="secondary" variant="bodySmall" numberOfLines={3} style={{ marginTop: spacing.xs }}>
          {campaign.description}
        </AppText>
      )}

      <View style={{ marginTop: spacing.sm }}>
        <AppText weight="bold" tone="brand" variant="bodySmall">
          {formatNaira(campaign.confirmedTotal)} raised{campaign.goalAmount ? ` of ${formatNaira(campaign.goalAmount)} goal` : ''}
        </AppText>
        {progress !== null && (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.divider, marginTop: 6, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: colors.brandPrimary }} />
          </View>
        )}
      </View>

      <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
        The organiser collects gifts on their own giving page - Lioris never processes payments and cannot confirm you gave.
      </AppText>

      <View style={{ marginTop: spacing.sm }}>
        <AppButton label="Give ↗" variant="primary" onPress={() => onGive(campaign)} fullWidth />
      </View>
    </SolidCard>
  );
}

/** Owner-only controls shown under "My Campaigns": update the confirmed
 * total, close the campaign, and see how many people clicked through. */
function MyCampaignOwnerPanel({ campaign, onGive, onChanged }: { campaign: GivingCampaign; onGive: (c: GivingCampaign) => void; onChanged: () => void }) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [totalInput, setTotalInput] = useState(String(campaign.confirmedTotal));
  const [savingTotal, setSavingTotal] = useState(false);
  const [closing, setClosing] = useState(false);

  const { data: clickCount } = useQuery({
    queryKey: ['giving-campaign-clicks', campaign.id],
    queryFn: () => getCampaignClickCount(campaign.id),
  });

  async function saveTotal() {
    const num = Number(totalInput.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num) || num < 0) {
      toast.error('Enter a valid confirmed total (0 or more).');
      return;
    }
    haptics.light();
    setSavingTotal(true);
    try {
      await updateMyCampaignTotal(campaign.id, num);
      haptics.success();
      toast.success('Confirmed total updated.');
      onChanged();
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not update the confirmed total.');
    } finally {
      setSavingTotal(false);
    }
  }

  async function doClose() {
    setClosing(true);
    try {
      await closeMyCampaign(campaign.id);
      haptics.success();
      toast.success('Campaign closed.');
      onChanged();
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not close this campaign.');
    } finally {
      setClosing(false);
    }
  }

  function confirmClose() {
    haptics.medium();
    Alert.alert(
      'Close This Campaign?',
      `"${campaign.title}" will stop accepting new gifts. You can still see it under My Campaigns afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close Campaign', style: 'destructive', onPress: doClose },
      ],
    );
  }

  return (
    <View>
      <CampaignCard campaign={campaign} onGive={onGive} />
      <SolidCard radius={18} style={{ padding: spacing.md, marginTop: spacing.xs }}>
        <AppText variant="caption" tone="secondary">
          {typeof clickCount === 'number' ? `${clickCount} click${clickCount === 1 ? '' : 's'}` : '…'} {'→'} {formatNaira(campaign.confirmedTotal)} confirmed
        </AppText>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
              Update Confirmed Total (₦)
            </AppText>
            <TextInput
              value={totalInput}
              onChangeText={(t) => setTotalInput(t.replace(/[^0-9.]/g, ''))}
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
            />
          </View>
          <AppButton label="Save" variant="secondary" size="sm" loading={savingTotal} onPress={saveTotal} />
        </View>

        {campaign.isClosed ? (
          <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
            This campaign is closed and no longer accepting gifts.
          </AppText>
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            <AppButton label="Close Campaign" variant="ghost" size="sm" loading={closing} onPress={confirmClose} fullWidth />
          </View>
        )}
      </SolidCard>
    </View>
  );
}

export default function AlumniGivingScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const isEnabled = isFeatureEnabled('donations');

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [givingUrl, setGivingUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['giving-campaigns', 'approved'],
    queryFn: listGivingCampaigns,
    enabled: isEnabled && tab === 'browse',
  });

  const { data: myCampaigns = [], isLoading: myLoading } = useQuery({
    queryKey: ['giving-campaigns', 'mine'],
    queryFn: listMyGivingCampaigns,
    enabled: isEnabled && tab === 'mine',
  });

  async function handleGive(campaign: GivingCampaign) {
    haptics.light();
    try {
      const url = await openGivingPage(campaign.id);
      const opened = await openExternalUrl(url);
      if (!opened) toast.error('Could not open the giving page. Please try again.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not open the giving page.');
    }
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setGoalAmount('');
    setGivingUrl('');
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('Please give your campaign a title.');
      return;
    }
    if (!isSafeHttpUrl(givingUrl.trim()) || !givingUrl.trim().startsWith('https://')) {
      toast.error('Please provide a valid https:// link to your giving page.');
      return;
    }
    setSubmitting(true);
    try {
      await createGivingCampaign({
        title: title.trim(),
        description: description.trim() || undefined,
        goalAmount: goalAmount.trim() ? Number(goalAmount.trim()) : undefined,
        givingUrl: givingUrl.trim(),
      });
      setCreateOpen(false);
      resetForm();
      haptics.success();
      toast.success('Campaign submitted for review. It will appear once approved.');
      await queryClient.invalidateQueries({ queryKey: ['giving-campaigns'] });
      setTab('mine');
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not start this campaign. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isEnabled) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <EmptyState
            icon="heart-outline"
            title="Giving Unavailable"
            description="Alumni giving campaigns are currently disabled by university administration."
          />
        </View>
      </ScreenContainer>
    );
  }

  const list = tab === 'browse' ? campaigns : myCampaigns;
  const loading = tab === 'browse' ? isLoading : myLoading;

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
            Give Back
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
            Support scholarship funds and alumni-led campaigns
          </AppText>
        </View>
        <AppButton
          label="Start a Campaign"
          icon="add"
          variant="primary"
          size="sm"
          onPress={() => {
            haptics.light();
            setCreateOpen(true);
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => setTab('browse')}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999, backgroundColor: tab === 'browse' ? colors.brandPrimary : colors.divider }}
        >
          <AppText variant="caption" weight="bold" tone={tab === 'browse' ? 'inverse' : 'secondary'}>
            Browse Campaigns
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => setTab('mine')}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999, backgroundColor: tab === 'mine' ? colors.brandPrimary : colors.divider }}
        >
          <AppText variant="caption" weight="bold" tone={tab === 'mine' ? 'inverse' : 'secondary'}>
            My Campaigns
          </AppText>
        </Pressable>
      </View>

      {loading ? (
        <CampaignCardSkeletonList count={3} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title={tab === 'browse' ? 'No active campaigns' : "You haven't started a campaign yet"}
          description={tab === 'browse' ? 'Check back soon, or start your own.' : 'Campaigns you start appear here, including ones still under review.'}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: isDesktop ? 60 : 130 }}>
          {list.map((c) => (
            <View key={c.id}>
              {tab === 'mine' && c.reviewStatus !== 'approved' && (
                <View style={{ marginBottom: 6 }}>
                  <Badge
                    label={c.reviewStatus === 'pending' ? 'Pending Review' : `Rejected${c.reviewNote ? `: ${c.reviewNote}` : ''}`}
                    tone={c.reviewStatus === 'pending' ? 'warning' : 'critical'}
                  />
                </View>
              )}
              {tab === 'mine' ? (
                <MyCampaignOwnerPanel
                  campaign={c}
                  onGive={handleGive}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['giving-campaigns'] })}
                />
              ) : (
                <CampaignCard campaign={c} onGive={handleGive} />
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView accessibilityViewIsModal behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: Math.max(insets.bottom, 12) }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <AppText variant="h3" weight="bold">
                  Start a Giving Campaign
                </AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCreateOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ backgroundColor: colors.divider, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md }}>
                <AppText variant="caption" tone="secondary">
                  Lioris never processes gifts. Point this at your own giving page (GoFundMe, a bank's giving portal, etc.) - donors are
                  sent there directly. Every new campaign is reviewed before it appears publicly.
                </AppText>
              </View>

              <View style={{ gap: spacing.sm }}>
                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Campaign Title
                  </AppText>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Class of 2015 Scholarship Fund"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                  />
                </View>
                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Description (Optional)
                  </AppText>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What is this campaign for?"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                    style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background, minHeight: 80, textAlignVertical: 'top' }]}
                  />
                </View>
                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Goal Amount in ₦ (Optional)
                  </AppText>
                  <TextInput
                    value={goalAmount}
                    onChangeText={(t) => setGoalAmount(t.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 500000"
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                  />
                </View>
                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Giving Page Link (https://)
                  </AppText>
                  <TextInput
                    value={givingUrl}
                    onChangeText={setGivingUrl}
                    placeholder="https://gofundme.com/your-campaign"
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Cancel" variant="ghost" fullWidth onPress={() => setCreateOpen(false)} />
                </View>
                <View style={{ flex: 2 }}>
                  <AppButton label="Submit for Review" variant="primary" fullWidth loading={submitting} onPress={handleSubmit} />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
});
