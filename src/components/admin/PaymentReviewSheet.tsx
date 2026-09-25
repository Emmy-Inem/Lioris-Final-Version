import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { Badge } from '../Badge';
import { FormSheet } from '../common/FormSheet';
import { MfaStepUpModal } from './MfaStepUpModal';
import { useTheme } from '@/theme/ThemeProvider';
import { MFA_REQUIRED_CODE } from '@/api/auth';
import {
  LinkCheckResult,
  adminCheckPaymentLink,
  adminListPaidEvents,
  adminReviewPayment,
} from '@/api/paidEvents';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { formatNaira, paymentMethodLabel } from '@/utils/paidEvents';
import { haptics } from '@/utils/haptics';

function checkTone(status?: string): 'success' | 'warning' | 'critical' | 'neutral' {
  return status === 'ok' ? 'success' : status === 'warning' ? 'warning' : status === 'failed' ? 'critical' : 'neutral';
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const { spacing } = useTheme();
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: 4 }}>
      <AppText variant="caption" tone="secondary" style={{ width: 96 }}>{label}</AppText>
      <AppText variant="caption" weight="semiBold" style={{ flex: 1 }} selectable>{value}</AppText>
    </View>
  );
}

/**
 * An administrator's decision about one paid event's price and payment details. Lioris does not take the payment, but it
 * does choose what students are shown, so nothing about a paid event is visible to students until this is approved.
 * The link check (server side) looks at the organiser's payment link; approving an online payment needs a passing check
 * of the CURRENT link, or an override with a written reason.
 */
export function PaymentReviewSheet({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['admin-paid-events'], queryFn: adminListPaidEvents, enabled: !!eventId });
  const row = rows.find((r) => r.eventId === eventId) ?? null;

  const [note, setNote] = useState('');
  const [publish, setPublish] = useState(true);
  const [checking, setChecking] = useState(false);
  const [acting, setActing] = useState<'approve' | 'override' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<LinkCheckResult | null>(null);
  const [mfa, setMfa] = useState<{ title: string; retry: () => void } | null>(null);

  useEffect(() => {
    if (eventId) {
      setNote('');
      setPublish(true);
      setError(null);
      setCheckResult(null);
    }
  }, [eventId]);

  const online = row?.paymentMethod === 'online' || row?.paymentMethod === 'both';
  const check: LinkCheckResult | null = checkResult ?? (row && !row.linkCheckStale ? row.linkCheck : null);
  const checkPassed = !!check && check.status !== 'failed';
  const canApprove = !!row && (!online || checkPassed);
  const waitingApproval = row?.status === 'pending_approval';

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-paid-events'] });
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  }

  async function runCheck() {
    if (!row) return;
    setChecking(true);
    setError(null);
    try {
      const result = await adminCheckPaymentLink(row.eventId);
      setCheckResult(result);
      haptics.success();
      await refresh();
    } catch (err: any) {
      haptics.error();
      if (err?.code === MFA_REQUIRED_CODE) setMfa({ title: 'Verify to check the link', retry: () => void runCheck() });
      else setError(err?.message || 'The link check could not run.');
    } finally {
      setChecking(false);
    }
  }

  async function decide(kind: 'approve' | 'override' | 'reject') {
    if (!row) return;
    setActing(kind);
    setError(null);
    try {
      await adminReviewPayment({
        eventId: row.eventId,
        decision: kind === 'reject' ? 'reject' : 'approve',
        note: note.trim() || undefined,
        overrideLinkCheck: kind === 'override',
        publish: kind !== 'reject' && waitingApproval && publish,
      });
      haptics.success();
      await refresh();
      onClose();
    } catch (err: any) {
      haptics.error();
      if (err?.code === MFA_REQUIRED_CODE) setMfa({ title: 'Verify to review payment details', retry: () => void decide(kind) });
      else setError(err?.message || 'The decision could not be saved.');
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      <FormSheet
        visible={!!eventId}
        onClose={onClose}
        title="Review payment details"
        subtitle={row?.title}
        maxWidth={640}
        footer={
          row ? (
            <View style={{ gap: spacing.sm }}>
              {error ? <AppText variant="caption" style={{ color: colors.critical }}>{error}</AppText> : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <AppButton label="Send back" variant="ghost" loading={acting === 'reject'} disabled={!!acting || note.trim().length < 5} onPress={() => decide('reject')} />
                {online && !checkPassed ? (
                  <AppButton label="Approve anyway" variant="secondary" loading={acting === 'override'} disabled={!!acting || note.trim().length < 5} onPress={() => decide('override')} />
                ) : null}
                <AppButton
                  label={waitingApproval && publish ? 'Approve & publish' : 'Approve'}
                  loading={acting === 'approve'}
                  disabled={!!acting || !canApprove}
                  onPress={() => decide('approve')}
                />
              </View>
            </View>
          ) : undefined
        }
      >
        {isLoading || !row ? (
          <AppText tone="secondary" variant="bodySmall">{isLoading ? 'Loading...' : 'This paid event could not be found.'}</AppText>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
              <Badge label={row.reviewStatus === 'approved' ? 'Payment approved' : row.reviewStatus === 'rejected' ? 'Sent back' : 'Waiting for review'} tone={row.reviewStatus === 'approved' ? 'success' : row.reviewStatus === 'rejected' ? 'critical' : 'warning'} />
              <Badge label={waitingApproval ? 'Event not published yet' : `Event ${row.status}`} tone="neutral" />
            </View>

            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: 4 }}>The offer</AppText>
            <Row label="Organiser" value={row.organiserName} />
            <Row label="Campus" value={row.campusCode} />
            <Row label="Price" value={`${formatNaira(row.price)} (paid to the organiser, not to Lioris)`} />
            <Row label="How to pay" value={paymentMethodLabel(row.paymentMethod)} />
            <Row label="Places" value={row.capacity ? `${row.capacity}${row.reservationHeld ? ', held for people who reserve' : ', interest only (not held)'}` : row.reservationHeld ? 'Held for people who reserve' : 'No limit'} />
            <Row label="Booking closes" value={row.bookingDeadline ? new Date(row.bookingDeadline).toLocaleString() : 'When the event ends'} />
            <Row label="Starts" value={new Date(row.startTime).toLocaleString()} />
            {row.reviewNote ? <Row label="Last note" value={row.reviewNote} /> : null}

            <AppText weight="bold" variant="bodySmall" style={{ marginTop: spacing.sm, marginBottom: 4 }}>How students pay</AppText>
            {row.instructions ? <Row label="Instructions" value={row.instructions} /> : <AppText variant="caption" tone="secondary" style={{ marginBottom: 4 }}>No venue instructions.</AppText>}

            {online ? (
              <View style={{ marginTop: spacing.xs }}>
                {row.paymentUrl ? (
                  <>
                    <Row label="Payment link" value={row.paymentUrl} />
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
                      <AppButton label="Open link yourself" icon="open-outline" variant="secondary" size="sm" onPress={() => void openExternalUrl(row.paymentUrl!)} />
                      <AppButton label={check ? 'Check again' : 'Run link check'} icon="shield-checkmark-outline" size="sm" loading={checking} onPress={runCheck} />
                    </View>
                    {check ? (
                      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <Badge label={check.status === 'ok' ? 'Link check passed' : check.status === 'warning' ? 'Check passed with warnings' : 'Link check failed'} tone={checkTone(check.status)} />
                          <AppText variant="caption" tone="secondary">{new Date(check.checked_at).toLocaleString()}</AppText>
                        </View>
                        {check.problem ? <AppText variant="caption" style={{ color: colors.critical }}>{check.problem}</AppText> : null}
                        <Row label="Lands on" value={check.final_host} />
                        <Row label="HTTP status" value={check.http_status ? String(check.http_status) : null} />
                        <Row label="Redirects via" value={check.redirects?.length ? check.redirects.join(' → ') : null} />
                        <Row label="Provider" value={check.known_provider ? 'Recognised payment / ticketing provider' : 'Not a provider Lioris recognises'} />
                        {(check.warnings ?? []).map((w) => (
                          <View key={w} style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                            <Ionicons name="warning-outline" size={14} color={colors.warning} style={{ marginTop: 1 }} />
                            <AppText variant="caption" style={{ flex: 1 }}>{w}</AppText>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                        {row.linkCheckStale ? 'The organiser changed the link since it was last checked.' : 'The link has not been checked yet.'} Run the link check before approving.
                      </AppText>
                    )}
                    <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs, lineHeight: 16 }}>
                      The check looks at DNS, https, redirects and the HTTP answer. It does not read the page, so open the link yourself
                      and make sure it is the organiser's payment page for this event and the amount matches.
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" style={{ color: colors.warning }}>The organiser has not added a payment link.</AppText>
                )}
              </View>
            ) : null}

            {waitingApproval ? (
              <Pressable
                onPress={() => setPublish((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: publish }}
                aria-checked={publish}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: spacing.md }}
              >
                <Ionicons name={publish ? 'checkbox' : 'square-outline'} size={22} color={publish ? colors.brandPrimary : colors.textSecondary} />
                <AppText variant="bodySmall" style={{ flex: 1 }}>Also publish the event (it is still waiting for approval)</AppText>
              </Pressable>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              <AppTextField
                label="Note to the organiser (required to send back or to approve anyway)"
                placeholder="e.g. The link opens a personal page, please use the event's own payment page."
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
                maxLength={500}
              />
            </View>
          </View>
        )}
      </FormSheet>
      <MfaStepUpModal
        visible={!!mfa}
        title={mfa?.title}
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
