import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { AppText } from '../AppText';
import { AppButton } from '../AppButton';
import { Badge } from '../Badge';
import { FormSheet } from '../common/FormSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { CampusEvent } from '@/api/types';
import { rsvpToEvent } from '@/api/events';
import { getEventPaymentInfo, getMyTicket, openEventPaymentPage } from '@/api/paidEvents';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { haptics } from '@/utils/haptics';
import {
  bookingState,
  bookingStateMessage,
  formatNaira,
  formatTicketCode,
  paidLabel,
  paymentMethodLabel,
  qrPayload,
  registeredBadge,
  registerLabel,
} from '@/utils/paidEvents';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.brandPrimary : colors.textSecondary} />
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/**
 * Everything a student needs to act on an event's ticket, in one block: the price and how to pay, the payment
 * button (with a "you are leaving Lioris" notice), registering (with what the organiser will see) and, once
 * registered, the reference code and QR the organiser scans at the door.
 *
 * Lioris never takes the payment, so nothing here says "paid" or "confirmed ticket" because a student clicked a link
 * or registered. Only the organiser can confirm, at the door.
 */
export function EventTicketPanel({
  event,
  isRestrictedGuest,
  onNeedVerification,
}: {
  event: CampusEvent;
  isRestrictedGuest?: boolean;
  onNeedVerification?: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const paidEventsEnabled = isFeatureEnabled('paid_events');

  const paid = event.ticketType === 'paid';
  const isOnline = paid && (event.paymentMethod === 'online' || event.paymentMethod === 'both');

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ['events', 'ticket', event.id, user?.id],
    queryFn: () => getMyTicket(event.id, user!.id),
    enabled: !!user?.id,
  });
  const registered = !!ticket || !!event.isRsvpd;

  const { data: payInfo } = useQuery({
    queryKey: ['events', 'payment-info', event.id],
    queryFn: () => getEventPaymentInfo(event.id),
    enabled: paid,
  });

  const state = bookingState(
    {
      ticketType: event.ticketType,
      paymentReviewStatus: event.paymentReviewStatus,
      reservationHeld: event.reservationHeld,
      capacity: event.capacity,
      rsvpCount: event.rsvpCount,
      bookingDeadline: event.bookingDeadline,
      endAt: event.endAt,
    },
    { paidEventsEnabled },
  );

  const [registerOpen, setRegisterOpen] = useState(false);
  const [shareDetails, setShareDetails] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] }),
    ]);
  }

  function handleRegisterPress() {
    if (isRestrictedGuest) {
      haptics.light();
      onNeedVerification?.();
      return;
    }
    haptics.light();
    setAcknowledged(false);
    setRegisterOpen(true);
  }

  async function confirmRegister() {
    if (paid && !acknowledged) return;
    haptics.medium();
    setBusy(true);
    try {
      await rsvpToEvent(event.id, 'rsvp', { shareDetails, acknowledged: paid ? acknowledged : false });
      setRegisterOpen(false);
      await refresh();
      haptics.success();
      toast.success(paid ? 'Registered. Your reference is ready below.' : `Seat secured for "${event.title}"! Added to your schedule.`);
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not register you. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRegistration() {
    haptics.medium();
    setBusy(true);
    try {
      await rsvpToEvent(event.id, 'cancel');
      await refresh();
      toast.success('Your registration has been cancelled.');
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not cancel your registration.');
    } finally {
      setBusy(false);
    }
  }

  async function continueToPayment() {
    setPaying(true);
    try {
      const page = await openEventPaymentPage(event.id);
      const opened = await openExternalUrl(page.url);
      setPayOpen(false);
      if (!opened) toast.error(`Could not open ${page.host}. Copy the address from the organiser instead.`);
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not open the payment page.');
    } finally {
      setPaying(false);
    }
  }

  const checkedIn = !!ticket?.checkedInAt;
  const canRegister = state === 'open' && !registered;
  const message = bookingStateMessage(state);
  const showPayBlock = paid && !!payInfo?.available && state !== 'ended';

  return (
    <View>
      {paid ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.md,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <AppText weight="bold" variant="bodySmall">
              {paidLabel(event.ticketPrice)}
            </AppText>
            <Badge label={paymentMethodLabel(event.paymentMethod)} tone="neutral" />
          </View>
          <AppText variant="caption" tone="secondary" style={{ marginTop: 4, lineHeight: 16 }}>
            {event.organizerName || 'The organiser'} collects the payment, not Lioris. Registering here does not mean you have
            paid.
          </AppText>

          {showPayBlock ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {isOnline && payInfo?.hasOnlineLink ? (
                <AppButton
                  label="Continue to organiser's payment page"
                  icon="open-outline"
                  variant="secondary"
                  onPress={() => {
                    haptics.light();
                    setPayOpen(true);
                  }}
                  fullWidth
                />
              ) : null}
              {payInfo?.instructions ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="cash-outline" size={16} color={colors.textSecondary} style={{ marginTop: 1 }} />
                  <AppText variant="caption" style={{ flex: 1, lineHeight: 16 }}>
                    {payInfo.instructions}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : paid && payInfo && !payInfo.available && state !== 'ended' ? (
            <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
              {payInfo.reason === 'paused'
                ? 'Paid events are paused on Lioris right now.'
                : 'The organiser’s payment details are being checked. They will appear here once approved.'}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {registered ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.brandPrimary,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.md,
            alignItems: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
            <Ionicons name={checkedIn ? 'checkmark-circle' : 'ticket-outline'} size={18} color={checkedIn ? colors.success : colors.brandPrimary} />
            <AppText weight="bold" variant="bodySmall">
              {checkedIn ? 'Checked in' : registeredBadge(event)}
            </AppText>
          </View>
          {ticketLoading && !ticket ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : ticket ? (
            <>
              <View style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12 }} accessibilityLabel={`QR pass for ${event.title}`}>
                <QRCode value={qrPayload(ticket.ticketCode)} size={150} color="#000000" backgroundColor="#FFFFFF" />
              </View>
              <AppText weight="bold" selectable style={{ marginTop: spacing.sm, fontSize: 18, letterSpacing: 2 }}>
                {formatTicketCode(ticket.ticketCode)}
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2, textAlign: 'center', lineHeight: 16 }}>
                Show this to the organiser at the entrance. It identifies your Lioris registration for {event.title}.
              </AppText>
              {checkedIn ? (
                <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }}>
                  Checked in {timeLabel(ticket.checkedInAt!)}
                  {ticket.purchaseConfirmedAt ? ' · the organiser confirmed your entry' : ''}
                </AppText>
              ) : null}
            </>
          ) : null}
          {!checkedIn ? (
            <View style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}>
              <AppButton label={registerLabel(event, true)} variant="secondary" size="sm" loading={busy} onPress={cancelRegistration} />
            </View>
          ) : null}
        </View>
      ) : null}

      {!registered ? (
        <View>
          <AppButton
            label={isRestrictedGuest ? 'Verify Student ID to register' : registerLabel(event, false)}
            variant="primary"
            disabled={!canRegister && !isRestrictedGuest}
            loading={busy && !registerOpen}
            onPress={handleRegisterPress}
            fullWidth
          />
          {!canRegister && message && !isRestrictedGuest ? (
            <AppText variant="caption" tone="secondary" style={{ marginTop: 6, textAlign: 'center' }}>
              {message}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* Registration: what the organiser will see */}
      <FormSheet
        visible={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title={registerLabel(event, false)}
        subtitle={event.title}
        footer={
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Not now" variant="ghost" onPress={() => setRegisterOpen(false)} />
            <AppButton
              label={paid ? registerLabel(event, false) : 'Confirm'}
              loading={busy}
              disabled={paid && !acknowledged}
              onPress={confirmRegister}
            />
          </View>
        }
      >
        {paid ? (
          <View style={{ marginBottom: spacing.md }}>
            <AppText weight="bold">{paidLabel(event.ticketPrice)}</AppText>
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4, lineHeight: 19 }}>
              Lioris does not collect payments and cannot confirm that you paid. You pay {event.organizerName || 'the organiser'}
              {event.paymentMethod === 'at_venue' ? ' at the venue' : event.paymentMethod === 'online' ? " on their own website" : ' online or at the venue'}.
              {event.reservationHeld && event.paymentMethod !== 'online'
                ? ' The organiser has said they will hold a place for people who reserve.'
                : ' Registering shows interest but does not guarantee a place.'}
            </AppText>
          </View>
        ) : null}

        <AppText weight="bold" variant="bodySmall" style={{ marginBottom: 4 }}>
          What the organiser will see
        </AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginBottom: spacing.sm, lineHeight: 19 }}>
          Your name and profile photo, your registration reference, and whether you checked in{paid ? ' and were confirmed as having bought entry' : ''}.
          Nothing else from your profile is shared unless you choose to below.
        </AppText>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md }}>
          <Switch value={shareDetails} onValueChange={setShareDetails} accessibilityLabel="Also share my matric number and department" />
          <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 19 }}>
            Also share my matric number and department (helps the organiser find me at the door).
          </AppText>
        </View>

        {paid ? (
          <CheckRow checked={acknowledged} onToggle={() => setAcknowledged((v) => !v)}>
            <AppText variant="bodySmall" style={{ lineHeight: 19 }}>
              I understand that registering does not mean I have paid, and that I pay the organiser directly.
            </AppText>
          </CheckRow>
        ) : null}
      </FormSheet>

      {/* Leaving Lioris */}
      <FormSheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title="You are leaving Lioris"
        subtitle={event.title}
        footer={
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Stay on Lioris" variant="ghost" onPress={() => setPayOpen(false)} />
            <AppButton label={payInfo?.linkHost ? `Continue to ${payInfo.linkHost}` : 'Continue'} loading={paying} onPress={continueToPayment} />
          </View>
        }
      >
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: spacing.sm }}>
          <Ionicons name="open-outline" size={20} color={colors.textSecondary} />
          <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 19 }}>
            <AppText weight="bold" variant="bodySmall">{event.organizerName || 'The organiser'}</AppText> takes payment for this event
            on <AppText weight="bold" variant="bodySmall">{payInfo?.linkHost ?? 'their own website'}</AppText>. That page is run by the organiser,
            not by Lioris, and Lioris never sees your payment or your card details.
          </AppText>
        </View>
        <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 19, marginBottom: spacing.sm }}>
          Ticket price: {formatNaira(event.ticketPrice)}. Only pay if the amount and the organiser look right. Lioris will not ask for
          your card PIN or password, and neither should the organiser.
        </AppText>
        <AppText variant="caption" tone="secondary">
          Opening the payment page is counted so the organiser and Lioris know how many students came from Lioris. It is not a payment.
        </AppText>
      </FormSheet>
    </View>
  );
}
