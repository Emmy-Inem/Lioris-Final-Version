import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '../SolidCard';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { FormSheet } from '../common/FormSheet';
import { SegmentedTabs } from '../common/SegmentedTabs';
import { EventDoorDesk } from '../events/EventDoorDesk';
import { MfaStepUpModal } from './MfaStepUpModal';
import { PaymentReviewSheet } from './PaymentReviewSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { MFA_REQUIRED_CODE } from '@/api/auth';
import { PaidEventOverview, PartnershipStatus, adminListPaidEvents, adminSavePartnership } from '@/api/paidEvents';
import { formatNaira, paymentMethodLabel, ratio } from '@/utils/paidEvents';
import { haptics } from '@/utils/haptics';

type Filter = 'review' | 'live' | 'past' | 'all';

const PARTNERSHIP_LABEL: Record<PartnershipStatus, string> = {
  none: 'No agreement (reach only)',
  proposed: 'Proposed',
  agreed: 'Agreed',
  ended: 'Ended',
};

function isPast(row: PaidEventOverview): boolean {
  return new Date(row.endTime).getTime() < Date.now();
}

function PartnershipSheet({ row, onClose }: { row: PaidEventOverview | null; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<PartnershipStatus>('none');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [fee, setFee] = useState('');
  const [days, setDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ retry: () => void } | null>(null);

  useEffect(() => {
    if (row) {
      setStatus(row.partnershipStatus);
      setName(row.organiserLegalName ?? row.organiserName ?? '');
      setContact(row.organiserContact ?? '');
      setFee(row.feePerPayingAttendee != null ? String(row.feePerPayingAttendee) : '');
      setDays(String(row.disputeWindowDays ?? 7));
      setNotes(row.partnershipNotes ?? '');
      setError(null);
    }
  }, [row]);

  async function save() {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      await adminSavePartnership({
        eventId: row.eventId,
        status,
        organiserName: name,
        organiserContact: contact,
        fee: fee.trim() ? Number(fee.replace(/[₦,\s]/g, '')) : null,
        disputeWindowDays: Number(days) || 7,
        notes,
      });
      haptics.success();
      toast.success('Partnership saved.');
      await queryClient.invalidateQueries({ queryKey: ['admin-paid-events'] });
      onClose();
    } catch (err: any) {
      haptics.error();
      if (err?.code === MFA_REQUIRED_CODE) setMfa({ retry: () => void save() });
      else setError(err?.message || 'Could not save the partnership.');
    } finally {
      setSaving(false);
    }
  }

  const estimate = row && status === 'agreed' && fee ? Number(fee.replace(/[₦,\s]/g, '')) * row.purchasesConfirmed : null;

  return (
    <>
      <FormSheet
        visible={!!row}
        onClose={onClose}
        title="Revenue arrangement"
        subtitle={row?.title}
        footer={
          <View style={{ gap: spacing.sm }}>
            {error ? <AppText variant="caption" style={{ color: colors.critical }}>{error}</AppText> : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} />
              <AppButton label="Save" loading={saving} onPress={save} />
            </View>
          </View>
        }
      >
        <AppText variant="caption" tone="secondary" style={{ lineHeight: 16, marginBottom: spacing.sm }}>
          Record what was agreed with the organiser before the event: for example a fixed amount per verified, paying attendee that
          Lioris referred, a shared attendance report and a period to dispute errors. Without an agreement and confirmed purchases,
          check-ins only show Lioris's reach; they do not establish money owed.
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm }}>
          {(Object.keys(PARTNERSHIP_LABEL) as PartnershipStatus[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                haptics.light();
                setStatus(s);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: status === s ? colors.brandPrimary : colors.border,
                backgroundColor: status === s ? colors.pastelPrimaryBg : 'transparent',
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: status === s }}
              aria-checked={status === s}
            >
              <AppText variant="caption" weight="semiBold" tone={status === s ? 'brand' : 'secondary'}>{PARTNERSHIP_LABEL[s]}</AppText>
            </Pressable>
          ))}
        </View>
        <AppTextField label="Organiser's legal / trading name" value={name} onChangeText={setName} />
        <AppTextField label="Contact (email or phone)" value={contact} onChangeText={setContact} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1.3 }}>
            <AppTextField label="Fee per confirmed paying attendee (₦)" value={fee} onChangeText={setFee} keyboardType="numeric" placeholder="e.g. 300" />
          </View>
          <View style={{ flex: 1 }}>
            <AppTextField label="Dispute window (days)" value={days} onChangeText={setDays} keyboardType="numeric" />
          </View>
        </View>
        <AppTextField label="Notes (how it was agreed, where the agreement is kept)" value={notes} onChangeText={setNotes} multiline numberOfLines={3} maxLength={1000} />
        {row ? (
          <AppText variant="caption" tone="secondary" style={{ lineHeight: 16 }}>
            So far: {row.purchasesConfirmed} confirmed as bought entry, {row.checkedIn} checked in, {row.rsvps} registered.
            {estimate !== null && Number.isFinite(estimate) ? ` Estimate at this fee: ${formatNaira(estimate)}.` : ''}
          </AppText>
        ) : null}
      </FormSheet>
      <MfaStepUpModal
        visible={!!mfa}
        title="Verify to save the arrangement"
        onCancel={() => setMfa(null)}
        onVerified={async () => {
          const retry = mfa?.retry;
          setMfa(null);
          if (retry) await retry();
        }}
      />
    </>
  );
}

/**
 * Administrator desk for paid events: review each organiser's payment details before students see them, keep the
 * revenue arrangement, and watch the funnel (opened the payment page > registered > checked in > confirmed as bought
 * entry). The master switch is the `paid_events` feature flag.
 */
export function PaidEventsDesk({ focusEventId, onFocusHandled }: { focusEventId?: string | null; onFocusHandled?: () => void }) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const { isFeatureEnabled, setFeature } = useFeatureFlags();
  const enabled = isFeatureEnabled('paid_events');
  const [filter, setFilter] = useState<Filter>('review');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [partnershipRow, setPartnershipRow] = useState<PaidEventOverview | null>(null);
  const [doorRow, setDoorRow] = useState<PaidEventOverview | null>(null);
  const [togglingFlag, setTogglingFlag] = useState(false);

  const { data: rows = [], isLoading, error, refetch } = useQuery({ queryKey: ['admin-paid-events'], queryFn: adminListPaidEvents });

  useEffect(() => {
    if (focusEventId) {
      setReviewId(focusEventId);
      setFilter('review');
      onFocusHandled?.();
    }
  }, [focusEventId, onFocusHandled]);

  const needsReview = rows.filter((r) => r.reviewStatus === 'pending');
  const live = rows.filter((r) => r.reviewStatus === 'approved' && !isPast(r) && ['upcoming', 'ongoing'].includes(r.status));
  const past = rows.filter((r) => isPast(r));
  const shown = filter === 'review' ? needsReview : filter === 'live' ? live : filter === 'past' ? past : rows;

  const totals = useMemo(
    () => ({
      clicks: rows.reduce((n, r) => n + r.linkClicks, 0),
      rsvps: rows.reduce((n, r) => n + r.rsvps, 0),
      checkedIn: rows.reduce((n, r) => n + r.checkedIn, 0),
      bought: rows.reduce((n, r) => n + r.purchasesConfirmed, 0),
    }),
    [rows],
  );

  async function toggleFlag(next: boolean) {
    haptics.medium();
    setTogglingFlag(true);
    try {
      await setFeature('paid_events', next);
      toast.success(next ? 'Paid events are open to organisers.' : 'Paid events are paused: no new paid events, payment pages or bookings.');
    } catch (err: any) {
      toast.warning(err?.message || 'The switch could not be synced to the platform.');
    } finally {
      setTogglingFlag(false);
    }
  }

  return (
    <View>
      <SolidCard radius={18} frosted style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold">Paid events {enabled ? 'are open' : 'are paused'}</AppText>
            <AppText variant="caption" tone="secondary" style={{ lineHeight: 16 }}>
              Lioris lists paid events and sends students to the organiser; it never takes the payment. Off means organisers cannot
              create paid events, and existing ones show no payment page and take no bookings.
            </AppText>
          </View>
          <Switch value={enabled} onValueChange={toggleFlag} disabled={togglingFlag} accessibilityLabel="Paid events master switch" />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
          {[
            ['Waiting for review', needsReview.length],
            ['Live', live.length],
            ['Opened payment page', totals.clicks],
            ['Registered', totals.rsvps],
            ['Checked in', totals.checkedIn],
            ['Confirmed bought entry', totals.bought],
          ].map(([label, value]) => (
            <View key={label as string} style={{ minWidth: 90 }}>
              <AppText weight="bold" style={{ fontSize: 20 }}>{value}</AppText>
              <AppText variant="caption" tone="secondary">{label}</AppText>
            </View>
          ))}
        </View>
      </SolidCard>

      <View style={{ marginBottom: spacing.sm }}>
        <SegmentedTabs
          tabs={[
            { key: 'review', label: 'Needs review', badge: needsReview.length },
            { key: 'live', label: 'Live', badge: live.length },
            { key: 'past', label: 'Past', badge: past.length },
            { key: 'all', label: 'All', badge: rows.length },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as Filter)}
        />
      </View>

      {isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} /> : null}
      {error ? (
        <EmptyState title="Could not load paid events" description={(error as Error).message} actionLabel="Try again" onAction={() => refetch()} />
      ) : null}
      {!isLoading && !error && shown.length === 0 ? (
        <EmptyState
          title={filter === 'review' ? 'Nothing waiting for review' : 'No paid events here'}
          description={filter === 'review' ? 'When an organiser submits or changes a paid event, it appears here first.' : 'Paid events appear once organisers create them.'}
        />
      ) : null}

      {shown.map((row) => {
        const linkStatus = row.paymentMethod === 'at_venue' ? null : row.linkCheck && !row.linkCheckStale ? row.linkCheck.status : row.paymentUrl ? 'unchecked' : 'missing';
        return (
          <SolidCard
            key={row.eventId}
            radius={18}
            frosted
            style={{ marginBottom: spacing.md, borderWidth: row.reviewStatus === 'pending' ? 1 : 0, borderColor: `${colors.brandPrimary}50` }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <AppText weight="bold" style={{ flex: 1 }}>{row.title}</AppText>
              <Badge
                label={row.reviewStatus === 'approved' ? 'Payment approved' : row.reviewStatus === 'rejected' ? 'Sent back' : 'Needs review'}
                tone={row.reviewStatus === 'approved' ? 'success' : row.reviewStatus === 'rejected' ? 'critical' : 'warning'}
              />
            </View>
            <AppText variant="caption" tone="brand" weight="bold" style={{ marginTop: 2 }}>
              {formatNaira(row.price)} · {paymentMethodLabel(row.paymentMethod)} · {row.campusCode} · {new Date(row.startTime).toLocaleDateString()}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              Organiser: <AppText weight="bold" variant="caption">{row.organiserName}</AppText> · Event {row.status.replace('_', ' ')}
            </AppText>

            {linkStatus ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
                <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>{row.linkHost ?? 'No payment link yet'}</AppText>
                <Badge
                  label={linkStatus === 'ok' ? 'Link OK' : linkStatus === 'warning' ? 'Link: warnings' : linkStatus === 'failed' ? 'Link failed' : linkStatus === 'unchecked' ? 'Not checked' : 'No link'}
                  tone={linkStatus === 'ok' ? 'success' : linkStatus === 'warning' ? 'warning' : linkStatus === 'failed' ? 'critical' : 'neutral'}
                />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm }}>
              <AppText variant="caption">Opened page: <AppText weight="bold" variant="caption">{row.linkClicks}</AppText></AppText>
              <AppText variant="caption">Registered: <AppText weight="bold" variant="caption">{row.rsvps}</AppText></AppText>
              <AppText variant="caption">Checked in: <AppText weight="bold" variant="caption">{row.rsvps ? ratio(row.checkedIn, row.rsvps) : row.checkedIn}</AppText></AppText>
              <AppText variant="caption">Bought entry: <AppText weight="bold" variant="caption">{row.purchasesConfirmed}</AppText></AppText>
            </View>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 4 }}>
              {PARTNERSHIP_LABEL[row.partnershipStatus]}
              {row.partnershipStatus === 'agreed' && row.feePerPayingAttendee != null
                ? ` · ${formatNaira(row.feePerPayingAttendee)} each · est. ${formatNaira(row.feePerPayingAttendee * row.purchasesConfirmed)}`
                : ''}
            </AppText>

            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              <AppButton label={row.reviewStatus === 'pending' ? 'Review payment' : 'Payment details'} size="sm" variant={row.reviewStatus === 'pending' ? 'primary' : 'secondary'} onPress={() => setReviewId(row.eventId)} />
              <AppButton label="Arrangement" size="sm" variant="secondary" onPress={() => setPartnershipRow(row)} />
              <AppButton label="Attendance report" size="sm" variant="secondary" icon="people-outline" onPress={() => setDoorRow(row)} />
            </View>
          </SolidCard>
        );
      })}

      <PaymentReviewSheet eventId={reviewId} onClose={() => setReviewId(null)} />
      <PartnershipSheet row={partnershipRow} onClose={() => setPartnershipRow(null)} />
      <EventDoorDesk
        visible={!!doorRow}
        onClose={() => setDoorRow(null)}
        event={doorRow ? { id: doorRow.eventId, title: doorRow.title, ticketType: 'paid', ticketPrice: doorRow.price } : null}
        initialTab="report"
        isAdmin
      />
    </View>
  );
}
