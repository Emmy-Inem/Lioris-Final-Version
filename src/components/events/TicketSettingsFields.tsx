import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useAuth } from '@/auth/AuthContext';
import {
  PAYMENT_METHOD_OPTIONS,
  TicketFormValues,
  paymentHost,
  paymentUrlProblem,
} from '@/utils/paidEvents';
import { haptics } from '@/utils/haptics';

function Pill({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      aria-checked={selected}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1,
        opacity: disabled ? 0.45 : 1,
        borderColor: selected ? colors.brandPrimary : colors.border,
        backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
      }}
    >
      <AppText variant="caption" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-10-03 15:00" (local time) -> ISO, or null when it does not parse. */
function fromLocalInput(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  value: TicketFormValues;
  onChange: (next: TicketFormValues) => void;
  /** Start of the event, used for the booking-deadline shortcuts */
  eventStartAt?: Date | null;
  /** Show the review status of an already-saved event ("payment details sent back: ...") */
  reviewNote?: string | null;
  /** Editing a saved event whose price can no longer change (purchases were confirmed) */
  lockPrice?: boolean;
}

/**
 * The "Tickets" section of every event form. Free by default. Choosing Paid asks for the price, how students pay
 * and (for online payment) the organiser's own payment link. Lioris shows all of it, sends students to the
 * organiser to pay, and never takes the money; an administrator reviews it before students see any of it.
 */
export function TicketSettingsFields({ value, onChange, eventStartAt, reviewNote, lockPrice }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.actualRole === 'admin';
  const paidAllowed = isFeatureEnabled('paid_events') || isAdmin;
  const paid = value.ticketType === 'paid';
  const online = value.method === 'online' || value.method === 'both';
  const venue = value.method === 'at_venue' || value.method === 'both';
  const set = (patch: Partial<TicketFormValues>) => onChange({ ...value, ...patch });

  const urlProblem = value.paymentUrl.trim() ? paymentUrlProblem(value.paymentUrl) : null;
  const host = paymentHost(value.paymentUrl);
  const [customDeadline, setCustomDeadline] = React.useState(() => toLocalInput(value.bookingDeadline));
  const [customError, setCustomError] = React.useState<string | null>(null);

  const deadlineChips: { label: string; iso: string }[] = [];
  if (eventStartAt && !Number.isNaN(eventStartAt.getTime())) {
    for (const [label, ms] of [
      ['1 hour before', 3600_000],
      ['1 day before', 86_400_000],
      ['3 days before', 3 * 86_400_000],
    ] as const) {
      const at = new Date(eventStartAt.getTime() - ms);
      if (at.getTime() > Date.now()) deadlineChips.push({ label, iso: at.toISOString() });
    }
  }

  return (
    <View style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
      <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
        Tickets:
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
        <Pill label="Free" selected={!paid} onPress={() => set({ ticketType: 'free' })} disabled={lockPrice} />
        <Pill
          label="Paid"
          selected={paid}
          onPress={() => set({ ticketType: 'paid' })}
          disabled={!paidAllowed || lockPrice}
        />
      </View>
      {!paidAllowed && !paid ? (
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
          Paid events are not open yet. You can still host free events.
        </AppText>
      ) : null}
      {lockPrice ? (
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
          Purchases were already confirmed at the door, so the ticket type and price can no longer change.
        </AppText>
      ) : null}

      {paid ? (
        <View>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              backgroundColor: colors.divider,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
            <AppText variant="caption" style={{ flex: 1, lineHeight: 16 }}>
              Lioris lists your event and sends students to you. It does not collect the money or issue paid tickets. An
              administrator checks your price and payment details before students can see them, and any change you make sends
              them back for a check.
            </AppText>
          </View>

          {reviewNote ? (
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, padding: spacing.sm, marginBottom: spacing.sm }}>
              <AppText variant="caption" weight="bold" style={{ color: colors.warning }}>
                Sent back by an administrator
              </AppText>
              <AppText variant="caption">{reviewNote}</AppText>
            </View>
          ) : null}

          <AppTextField
            label="Ticket price (₦)"
            placeholder="e.g. 2000"
            value={value.price}
            onChangeText={(t) => set({ price: t })}
            keyboardType="numeric"
            editable={!lockPrice}
          />

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
            How do students pay?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <Pill
                key={o.value}
                label={o.label}
                selected={value.method === o.value}
                onPress={() => set({ method: o.value, reservationHeld: o.value === 'online' ? false : value.reservationHeld })}
              />
            ))}
          </View>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
            {PAYMENT_METHOD_OPTIONS.find((o) => o.value === value.method)?.hint}
          </AppText>

          {online ? (
            <View>
              <AppTextField
                label="Your payment link"
                placeholder="https://paystack.com/pay/your-event"
                value={value.paymentUrl}
                onChangeText={(t) => set({ paymentUrl: t })}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                error={urlProblem ?? undefined}
                helperText={
                  !urlProblem && host
                    ? `Students will see a notice that they are leaving Lioris and that ${host} is where you take payment.`
                    : 'Use your own payment page (Paystack, Flutterwave, Selar, your website...). It must start with https://.'
                }
              />
            </View>
          ) : null}

          <AppTextField
            label={venue ? 'How to pay at the venue' : 'Payment instructions (optional)'}
            placeholder={venue ? 'e.g. Pay at the entrance. Cash or transfer accepted.' : 'Anything students should know before paying'}
            value={value.instructions}
            onChangeText={(t) => set({ instructions: t })}
            multiline
            numberOfLines={2}
            maxLength={400}
          />

          {venue ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm }}>
              <Switch
                value={value.reservationHeld}
                onValueChange={(v) => set({ reservationHeld: v })}
                accessibilityLabel="I will hold a place for people who reserve"
              />
              <AppText variant="caption" style={{ flex: 1, lineHeight: 16 }}>
                I will hold a place for people who reserve here (their button says "Reserve a place"). Leave this off and it
                says "Register interest" instead, with no promise of a seat.
              </AppText>
            </View>
          ) : null}

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
            Booking deadline (optional)
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            <Pill
              label="No deadline"
              selected={!value.bookingDeadline}
              onPress={() => {
                setCustomDeadline('');
                setCustomError(null);
                set({ bookingDeadline: '' });
              }}
            />
            {deadlineChips.map((c) => (
              <Pill
                key={c.label}
                label={c.label}
                selected={value.bookingDeadline === c.iso}
                onPress={() => {
                  setCustomDeadline(toLocalInput(c.iso));
                  setCustomError(null);
                  set({ bookingDeadline: c.iso });
                }}
              />
            ))}
          </View>
          <AppTextField
            label="Or a date and time (YYYY-MM-DD HH:MM)"
            placeholder="2026-10-02 18:00"
            value={customDeadline}
            onChangeText={(t) => {
              setCustomDeadline(t);
              if (!t.trim()) {
                setCustomError(null);
                set({ bookingDeadline: '' });
                return;
              }
              const iso = fromLocalInput(t);
              setCustomError(iso ? null : 'Use the format 2026-10-02 18:00');
              if (iso) set({ bookingDeadline: iso });
            }}
            autoCapitalize="none"
            autoCorrect={false}
            error={customError ?? undefined}
          />

          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>
            Students who register share their name with you. They can choose to also share their matric number and
            department. Check people in at the door from the event page, and confirm who actually bought entry.
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
